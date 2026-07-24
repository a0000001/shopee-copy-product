---
type: fix
status: completed
updated: 2026-07-24
domain: batch-upload
tags: [shopee, scan, executeScript, main-world, pagination, page_number, dedup, media-upload, schema-verification]
author: Antigravity
---

# 048-fix-賣家中心全量商品數量老是錯誤的修復與預防（seller_product_list_main_world_scan）

> 本文件記錄「蝦皮賣家中心商品列表全量掃描 (200+ 筆)」與「媒體圖片上傳失敗」之確切根因診斷、主環境 (Main World) `executeScript` API 跨頁輪詢規格、還原 `4414e88` 安定圖片傳送、與通用 Schema 自動校驗防護腳本之更新規範。

---

## 一、 問題診斷與確切根因分析

### 1.1 賣家商品掃描數不到 200 筆 (卡在 48/60 筆) 根因
1. **權限差異 (Main World vs Isolated World)**：
   Chrome Extension MV3 的 Content Script 運行於 Isolated World。在 Isolated World 下呼叫 `/api/v3/opt/mpsku/list/v2/search_product_list` 無法完整帶入 `SPC_CDS` Cookie，導致請求失敗或被靜默丟棄。
2. **SPA 早退中斷 (Premature Break)**：
   蝦皮 API 官方 `page_size=48` 上限無法單次拉回 200+ 筆商品。當 API 前置補充拉回首頁 48 筆後，`seller-list.js` 進入 SPA 翻頁迴圈時，開頭判定 `if (items.length >= t)` 被 DOM 的 `readTotal()` 誤判命中（`48 >= 48`），導致 SPA 翻頁 `clickNextPage()` 在第一行就被 `break` 攔截，後續 150+ 筆商品無法翻頁讀取。

### 1.2 媒體圖片上傳「缺少商品圖片」根因
1. **幻覺屬性出處**：
   經 `git log -S "ps_product_media"` 追蹤，該屬性是在 Commit `ee58dbc` (`047-fix`) 中被引入。AI 在未開啟並檢視 `docs/data/product-catalog-tw.json` 的情況下，憑記憶/幻覺假設圖片欄位為 `ps_product_media`。
2. **連鎖攔截**：
   真實 JSON 中的欄位為 `images` 與 `ps_item_cover_image`，由於 `item.ps_product_media` 為 `undefined`，`batch-upload.js` 判定「無媒體」，徹底跳過了 `uploadMedia` 圖片下載與注入指令。蝦皮表單因圖片空白顯示紅框錯誤警告，點擊發布時無法跳轉，報錯 `點擊上架後蝦皮未跳轉且無回應`。
3. **通訊名稱與結構 mismatch**：
   `batch-upload.js` 發送的 Action 名稱 (`clickSave`, `checkSaveStatus`) 與 `content-boot.js` 監聽的名 (`clickSaveButton`, `checkSaveButton`) 不相符。

---

## 二、 確切修復規格

### 2.1 主環境全頁籤 API 分頁掃描與 SPA 備援
1. **`batch-upload.js` 主環境 API 分頁**：
   在 `scanProducts()` 中，使用 `chrome.scripting.executeScript` (Main World) 針對 `['live_all', 'reviewing', 'unpublished', 'violation', 'banned']` 發起 `page_number=1..20` 跨頁輪詢，一次性將 200+ 筆商品完整抓回。
2. **`seller-list.js` SPA 點擊備援修復**：
   移除 SPA 迴圈開頭因 API 預載 48 筆造成的誤判 `break`，確保點擊下一頁 `clickNextPage()` 直至按鈕停用 (`disabled`) 或連續 3 頁無新商品才終止。

### 2.2 媒體上傳與訊息 Action 對齊 (還原 `4414e88`)
1. **還原原生 `data: item` 傳遞**：
   修復 `batch-upload.js` 媒體啟動條件，改回忠實傳遞整顆商品物件：
   ```javascript
   const mediaStart = await chrome.tabs.sendMessage(tabId, { action: 'uploadMedia', data: item })
   ```
   確保 `media.js` 能讀取真實的 `item.images` 與 `item.ps_item_cover_image` 並執行下載與多圖注入。
2. **Message Action 對齊**：
   將儲存按鈕發送指令修復還原為 `clickSaveButton` 與 `checkSaveButton`。
3. **超時上限調整**：
   將發布絕對超時上限調整為合理的 60 秒 (`OVERALL_DEADLINE_MS = 60000`)。

---

## 三、 通用防禦機制與校驗腳本規範

### 3.1 通用 Schema 屬性校驗腳本 (`scripts/verify-catalog-schema.js`)
建立獨立的通用的 JSON Schema 校驗器，不寫針對單一字串的黑名單：
1. **讀取真實 Schema**：自動解析 `docs/data/product-catalog-tw.json` 提取所有合法 Top-level Key。
2. **靜態分析**：正則掃描 `extension/*.js` 中 `item.XXX` 的屬性存取。
3. **攔截未知屬性**：比對不在 Schema 清單中的屬性，輸出檔名與行號並中斷 Git Commit。
4. **標註侷限性**：腳本開頭標註本工具涵蓋 `item.XXX` 顯式存取，動態 Key 仍需人工開啟資料檔對照。

### 3.2 `AGENTS.md` 方法論鐵律
在 [AGENTS.md](file:///S:/projects/shopee-copy-product/AGENTS.md) 寫入通用行為規範：
> **「資料 Schema 存取通用規範 (Mandatory Rule)」**：
> 修改或新增任何資料欄位存取前，必須先開啟 `docs/data/product-catalog-tw.json` 檢視真實 Key，確認欄位真實存在，嚴禁憑記憶或推測命名欄位。

---

## 四、 Tasks 執行清單

- [x] **Task 1: 整合並更新 Spec 048 規格檔，刪除重複舊檔**
- [x] **Task 2: 撰寫 `scripts/verify-catalog-schema.js` 通用 Schema 校驗腳本**
- [x] **Task 3: 修復 `batch-upload.js` 還原 `4414e88` `data: item` 媒體傳遞與 Message Action 對齊**
- [x] **Task 4: 更新 `AGENTS.md` 通用方法論鐵律與 `scripts/verify-scan-loop.js` / Git Pre-commit 鉤子**
- [x] **Task 5: 執行完整語法、Schema 校驗與端到端媒體上傳測試**

---

## 五、 相關檔案清單

| 檔案 | 說明 | 絕對路徑 |
|------|------|----------|
| `048-fix-賣家中心全量商品數量老是錯誤的修復與預防.md` | 本開發規格文件 | `file:///S:/projects/shopee-copy-product/docs/spec/048-fix-%E8%B3%A3%E5%AE%B6%E4%B8%AD%E5%BF%83%E5%85%A8%E9%87%8F%E5%95%86%E5%93%81%E6%95%B8%E9%87%8F%E8%80%81%E6%98%AF%E9%8C%AF%E8%AA%A4%E7%9A%84%E4%BF%AE%E5%BE%A9%E8%88%87%E9%A0%90%E9%98%B2%EF%BC%88seller_product_list_main_world_scan%EF%BC%89.md` |
| `batch-upload.js` | 批次上傳與掃描邏輯 | `file:///S:/projects/shopee-copy-product/extension/batch-upload.js` |
| `seller-list.js` | 賣家商品列表 Content Script | `file:///S:/projects/shopee-copy-product/extension/lib/seller-list.js` |
| `media.js` | 媒體下載與圖片注入模組 | `file:///S:/projects/shopee-copy-product/extension/lib/media.js` |
| `verify-catalog-schema.js` | 通用 Schema 欄位校驗腳本 | `file:///S:/projects/shopee-copy-product/scripts/verify-catalog-schema.js` |
| `AGENTS.md` | AI 規範文件 | `file:///S:/projects/shopee-copy-product/AGENTS.md` |
