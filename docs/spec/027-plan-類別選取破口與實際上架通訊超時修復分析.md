# 027 — Plan: 類別選取與 SPA 導航 Context 銷毀修復計畫

> 本文件記錄二刷診斷後的真實根因、修復方案及驗證計畫。
> 已將 Claude Web 的最新審核與程式碼事實校對完畢，排除假修復與靜默選錯類別問題，並整合單件測試 23/23 項成功的黃金對照日誌。

---

## 一、 黃金對照日誌 (Golden Reference DOM Diagnostic)

在 2026-07-23 測試中，單件測試腳本 `batch-upload-test.js` 23 項 DOM 斷言與媒體/按鈕檢查**全部通過**。以下為實測成功時擷取之賣家中心黃金 DOM 結構映射：

### 1.1 成功測試步驟與時間序列
- **12:56:21** 啟動 `fillProductData` (文字與屬性填寫)
- **12:56:34** `fillProductData` 填寫完成 (耗時約 13 秒)
- **12:56:34** 啟動 `uploadMedia` (圖片與影片上傳)
- **12:56:36** `uploadMedia` 上傳完成 (圖片=6, 影片=1，耗時 2 秒)
- **12:56:36** `checkSaveButton` 檢查回傳：`{"ready":true, "btnText":"儲存並上架", "reason":"OK"}`

### 1.2 驗證成功之 DOM uniqueId 欄位對應表
| 欄位名稱 | UniqueId Selector (`data-product-edit-field-unique-id`) | 成功填入/讀取值 |
|---|---|---|
| 商品名稱 | `name` | `"測試商品專用請勿下單購買（10字以上）"` |
| 商品價格 | `price` | `"1999"` |
| 商品庫存 | `stock` | `"999"` |
| 最低購買數量 | `minpq` | `"1"` |
| 重量 | `weight` | `"0.5"` |
| 尺寸 (長x寬x高) | `brandAndAttributes` | `"10x10x4"` |
| 禁運品 | `dangersGoods` | `"0"` / `"1"` |
| 較長備貨 | `preOrder` | `"false"` |
| 信用卡分期 | `productInstallmentStatus` | `"false"` / `"true"` |

---

## 二、 確切根因與破口分析 (Root Cause Analysis)

### 根因 1 (主因)：`window._sgcFillState` 在 Vue SPA 導航後遺失

- **問題機制**：
  1. `fillProductData` 觸發 `fillAll()` 後，第一步執行 `fillCategoryAsync`。
  2. 蝦皮賣家中心在類別確定後，會發動 SPA 頁面導航（重新載入對應類別的動態屬性表單）。
  3. 頁面導航導致舊 Document 及掛在 Content Script `window` 上的 `_sgcFillState` 變數被銷毀。
  4. 新頁面重新注入新的 Content Script 實例，但新實例的 `window._sgcFillState` 為 `undefined` (`status: 'idle'`)。
  5. `batch-upload.js` 的 `checkFillStatus` 輪詢不斷存取到新實例的回傳 `{ status: 'idle' }`，導致耗滿 45 秒超時。舊頁面的 `fillAll()` 執行鏈已死亡，新頁面無人重新呼叫 `fillAll()`，故後續文字欄位完全空白。

---

### 根因 2 (硬傷)：ID 格式類別 (如 "100644,101937") 匹配機制與嚴格報錯

- **原設計漏洞**：
  - 若 ID 比對失敗直接 Fallback 至固定類別（如「電腦與周邊配件 > 軟體」），會導致非電腦軟體類商品被靜默選成錯誤類別，屬性欄位對不上，儲存按鈕永遠不會 Ready。
- **正解規則**：
  - 嚴格區分文字路徑 mode 與 ID 匹配 mode。
  - 當 ID 比對失敗時，**禁止靜默 fallback 至固定類別**，必須明確 `throw new Error(...)`，將錯誤記錄於批次報告中。

---

## 三、 精確修復方案 (Proposed Changes)

### Component 1: `batch-upload.js` 加入 Tab 導航監聽 (修復點 A)

#### [MODIFY] [batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js)
- 利用 `chrome.tabs.onUpdated` 監聽指定 `tabId` 的 `status === 'loading'`。
- 當在 `fillProductData` 執行期間（`sawRunning === true`）偵測到導航時，立即拋出 `偵測到分頁於文字填寫期間發生導航，content script 狀態已遺失`，避免死等 45 秒。

```javascript
// 修改 extension/batch-upload.js fillAndSaveSingle
async function fillAndSaveSingle(item, tabId) {
  let sawRunning = false
  let navigationDetected = false

  const onUpdated = (updatedTabId, info) => {
    if (updatedTabId === tabId && info.status === 'loading' && sawRunning) {
      navigationDetected = true
    }
  }
  chrome.tabs.onUpdated.addListener(onUpdated)

  try {
    const fillStart = await chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data: { ...item, skipMedia: true } })
    if (!fillStart || !fillStart.ok) throw new Error('無法啟動文字填寫')

    let fillDone = false
    for (let i = 0; i < 150; i++) {
      await sleep(300)
      if (navigationDetected) {
        throw new Error('偵測到分頁於文字填寫期間發生導航，content script 狀態已遺失')
      }
      try {
        const st = await chrome.tabs.sendMessage(tabId, { action: 'checkFillStatus' })
        if (st && st.status === 'running') sawRunning = true
        if (st && st.status === 'done') {
          if (st.result && st.result.ok) { fillDone = true; break }
          else throw new Error((st.result && st.result.error) || '文字填寫失敗')
        }
      } catch (e) {
        if (e.message.includes('文字填寫失敗') || e.message.includes('偵測到分頁')) throw e
      }
    }
    if (!fillDone) throw new Error('文字填寫超時 (45s)')
  } finally {
    chrome.tabs.onUpdated.removeListener(onUpdated)
  }
  // 後續邏輯保持不變...
}
```

---

### Component 2: `content.js` 類別 ID 結構化匹配與顯式報錯 (修復點 B)

#### [MODIFY] [content.js](file:///S:/projects/shopee-copy-product/extension/content.js)
- 在 `fillCategoryAsync` 解析 `categoryRaw` 時，區分 `{ mode: 'path', path: [...] }` 與 `{ mode: 'id', ids: [...] }`。
- 修改 `while (colIdx < maxLevels)` 迴圈，同步分支處理 ID 模式：

```javascript
// 修改 extension/content.js fillCategoryAsync
let categoryConfig = { mode: 'fallback', path: ['電腦與周邊配件', '軟體'] }
const categoryRaw = data.category || data.ps_category || ''
if (categoryRaw && typeof categoryRaw === 'string') {
  if (categoryRaw.includes('>')) {
    categoryConfig = { mode: 'path', path: categoryRaw.split('>').map(s => s.trim()) }
  } else if (/^[\d,]+$/.test(categoryRaw.trim())) {
    categoryConfig = { mode: 'id', ids: categoryRaw.split(',').map(s => s.trim()) }
  }
}

// 在迴圈中分支處理
while (colIdx < maxLevels) {
  // ...尋找列 DOM (col) 邏輯...
  const items = col.querySelectorAll('.category-item, [class*="category-item"], li')
  if (items.length === 0) break

  let targetItem = null
  if (categoryConfig.mode === 'id') {
    const targetId = categoryConfig.ids[colIdx]
    if (targetId) {
      targetItem = Array.from(items).find(el => {
        const idAttr = el.getAttribute('data-id') || el.getAttribute('data-category-id') || el.getAttribute('value') || el.dataset?.id || el.dataset?.categoryId
        return idAttr && String(idAttr).trim() === targetId
      })
    }
    if (!targetId && colIdx >= categoryConfig.ids.length) break // 到了葉節點
    if (!targetItem) {
      throw new Error(`類別 ID ${targetId} 在第 ${colIdx} 層選單中找不到對應 DOM 選項`)
    }
  } else {
    // 原本文字路徑/Fallback 選取邏輯...
  }

  // 點擊 targetItem...
  colIdx++
}
```

---

### Component 3: `batch-upload.html` / `batch-upload.js` 複製診斷紀錄增強 (體驗優化)

#### [MODIFY] [batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js)
- 按下「複製錯誤訊息」時，複製完整時間戳記、統計數據與 `logContainer` 文字。

---

## 四、 執行任務與驗證計畫 (Tasks & Verification Plan)

### Tasks
- [ ] **Task 1**: 修改 `batch-upload.js` 加入 `chrome.tabs.onUpdated` 導航偵測 (修復點 A)。
- [ ] **Task 2**: 修改 `content.js` 實現結構化類別 ID 匹配與顯式報錯機制 (修復點 B)。
- [ ] **Task 3**: 增強 `batch-upload.html` / `batch-upload.js` 之錯誤複製細節。

### Automated & Manual Verification
- **Smoke Test 1**: 執行 `batch-upload-test.js` 單件測試，確認 23 項斷言仍然全部通過。
- **Smoke Test 2**: 觸發 `batch-upload.js` 批次上傳，驗證若發生導航時能於數百毫秒內捕捉到明確錯誤，且不再耗滿 45 秒。
