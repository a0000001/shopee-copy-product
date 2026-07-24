---
type: fix
status: stable
updated: 2026-07-24
domain: batch-upload
tags: [dedup, filter, normalize, shopee, batch-upload, early-intercept, nfkc]
author: Antigravity
---

# 045-fix-重複商品過濾標準化與上傳早期預檢修復方案

> 本文件記錄修復「重複商品逃過前端過濾」與「浪費時間上架到快完成了才顯示已上架過」的精確根因分析與兩階段修復方案（維持 1800ms 輪詢最終定稿版）。

---

## 一、 問題診斷與確切程式碼破口

### 1.1 前端標題比對過於嚴格致使重複商品漏過過濾

在 [batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js) 的 `isExistingProduct()` 函式中，原先採用 JS 的嚴格全等 (`Set.has()` 與 `startsWith()`) 進行標題比對：

- **全半形標點符號不一致**：例如商品目錄 JSON 的名稱使用半形逗號 `,` (ASCII `0x2C`)，而蝦皮賣家中心或 `buildTitle()` 轉成全形逗號 `，` (Unicode `0xFF0C`)，導致 `"A,B" === "A，B"` 回傳 `false`。
- **不可見字元與 Hashtag 殘留**：描述或標題中的 `\u00A0` (Non-Breaking Space) 或 Hashtag 空格差異，導致 `stripHashtag()` 殘留字元，比對宣告失效。

這使得原本已存在的商品被誤判為「未上架」，進而放進 `state.pending`（待上傳佇列）中。

### 1.2 失敗反饋過晚導致圖片上傳時間浪費

在 [batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js) 的 `fillAndSaveSingle()` 中，執行順序為：

1. **Step 1**：`fillProductData`（填寫文字欄位）
2. **Step 2**：`uploadMedia`（輪詢上傳 9 張圖片，耗時 20~40 秒）
3. **Step 3**：`checkSaveButton` & `clickSaveButton`（點擊儲存並上架）

因為重複檢查只發生在 Step 3 發送 Submit 請求後，導致即使商品早已存在，系統仍會在 Step 2 浪費 30 秒執行 9 張圖片的上傳。

---

## 二、 擬定修復方案 (Proposed Solution - Final)

### #dedup-title-normalization
### 2.1 前端防護：`isExistingProduct()` 標題標準化比對修復

在 [batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js) 引入 `normalizeTitle()`。
**關鍵順序**：必須**先執行 `normalize('NFKC')` 再進行 Hashtag 剝離**，確保全形 `＃` (Unicode `0xFF03`) 先轉為半形 `#` 後能被 Regex 100% 匹配剔除：

```javascript
function normalizeTitle(str) {
  if (!str) return ''
  return str
    .normalize('NFKC')                          // 1. 先執行 NFKC (全形標點、全形井號＃、英數轉半形)
    .replace(/[\uFEFF\u00A0\u200B\u200C]/g, '') // 2. 移除 BOM 與不可見控制空白
    .replace(/\s*#.*/g, '')                      // 3. 剝離所有 Hashtag (包含原全形＃轉半形者)
    .replace(/\s+/g, ' ')                        // 4. 坍縮連續空白為單一空白 (保留型號空格，防誤判合併)
    .trim()
    .toLowerCase()
}
```

在 `isExistingProduct()` 中比對 `normalizeTitle(productName)` 與 `normalizedExistingSet`，兼顧防範「漏報重複」與避免「誤判合併」。

### #dedup-early-intercept
### 2.2 上傳中途預檢：`fillAll()` 填寫標題後即時 DOM 警告輪詢檢測

在 [seller-fill.js](file:///S:/projects/shopee-copy-product/extension/lib/seller-fill.js) 的 `fillAll()` 中，完成「商品名稱」填寫並發送 `blur` 事件後：
1. **零降級原則**：若標題 DOM 容器 `[data-product-edit-field-unique-id="name"]` 找不到，**直接拋出 Error 中斷流程**（禁止 `warn` 後靜默放行降級）。
2. **輪詢時間**：維持 **1800ms** (每 150ms 輪詢一次，最多 12 次)，確保慢速網路或機器環境皆能穩定捕捉即時警告。

```javascript
// 1. 檢查標題欄位容器是否存在 (若 Selector 改版找不到，依嚴格原則拋出 Error，禁止靜默降級放行)
const nameContainer = document.querySelector('[data-product-edit-field-unique-id="name"]')
if (!nameContainer) {
  throw new Error('【環境異常/Selector失效】無法找到標題欄位 DOM 容器 [data-product-edit-field-unique-id="name"]，請檢查蝦皮頁面')
}

// 2. 輪詢檢查標題欄位下方是否出現蝦皮即時重複警告 (維持 1800ms，每 150ms 檢查一次)
const pollStart = Date.now()
while (Date.now() - pollStart < 1800) {
  const titleErrorEl = nameContainer.querySelector('.eds-form-item__error-message, [class*="error"]')
  if (titleErrorEl) {
    const errorMsg = titleErrorEl.textContent.trim()
    if (/重複|已存在|已被使用|already exists/i.test(errorMsg)) {
      throw new Error('【即時預檢中斷】該商品名稱在蝦皮已存在：' + errorMsg)
    }
  }
  await new Promise(r => setTimeout(r, 150))
}
```

若在填寫標題後輪詢偵測到蝦皮即時重複警告，立即拋出錯誤中斷流程，**直接跳過 Step 2 長達 20~40 秒的圖片上傳步驟**。

---

## 三、 相關檔案清單

| 檔案 | 說明 | 絕對路徑 |
|------|------|----------|
| `batch-upload.js` | 批次上傳 UI 與待上傳篩選邏輯，使用 `normalizeTitle()` + `NFKC` 標準化。 | `file:///S:/projects/shopee-copy-product/extension/batch-upload.js` |
| `seller-fill.js` | 頁面表單填寫腳本，在 `fillAll()` 標題填寫後加入 1800ms 輪詢預檢與嚴格報錯。 | `file:///S:/projects/shopee-copy-product/extension/lib/seller-fill.js` |
| `product-catalog-tw.json` | 商品目錄資料庫。 | `file:///S:/projects/shopee-copy-product/docs/data/product-catalog-tw.json` |
