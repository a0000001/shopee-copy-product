---
type: fix
status: completed
updated: 2026-07-24
domain: batch-upload
tags: [setNativeValue, diagnostics, dynamic-timeout, ttfb, tasks, webrequest]
author: Antigravity
---

# 047-fix-setNativeValue防護與動態超時寬容機制 (工作指南與精確規格)

> 本文件記錄「`setNativeValue` 空值防禦保護」、「欄位填寫失敗時之頁面狀態診斷」、「TTFB 伺服器回應健康檢查 (Early Server Health Check & Fast-Fail)」與「雙軌動態進度超時寬容 (Dynamic Timeout)」之完整執行指南與 Tasks。

---

## 一、 問題診斷與確切修復規範

### #task-1-setnativevalue-guard
### 1.1 Task 1: `setNativeValue` 空值防禦保護

- **標的檔案**：[extension/lib/seller-fill.js](file:///S:/projects/shopee-copy-product/extension/lib/seller-fill.js)
- **問題**：`setNativeValue(input, value)` 函式開頭直接存取 `input.type` 與 `input.classList.contains(...)`，當傳入的 `input` 為 `undefined` 或 `null` 時拋出 `TypeError: Cannot read properties of undefined (reading 'contains')`。
- **修復方式**：於函式第一行加入防禦判斷，若無效直接 `return`（由呼叫端 `fillFieldAsync` 的既有邏輯判定為 `找不到欄位`）：
  ```javascript
  function setNativeValue(input, value) {
    if (!input || !input.classList) return
    if (input.type === 'file') return
    // ... 原有邏輯保持不變
  ```

### #task-2-diagnostics-url-title
### 1.2 Task 2: 欄位填寫失敗時之頁面狀態診斷

- **標的檔案**：[extension/lib/seller-fill.js](file:///S:/projects/shopee-copy-product/extension/lib/seller-fill.js)
- **問題**：原 `fillFieldAsync` 失敗時僅回傳 `找不到欄位`，無法釐清是頁面未渲染，抑或是跳轉至驗證碼 (Captcha)、WAF 阻擋或登入頁。
- **修復方式**：統一在 `fillFieldAsync` 回傳失敗的那一行附加頁面狀態：
  ```javascript
  return { ok: false, error: `找不到欄位 [頁面: ${location.pathname}, 標題: ${document.title}]` }
  ```
  `fillAll()` 拋出 Error 時會自動包含此診斷資訊，無需在每個呼叫點重複修改。

### #task-3-ttfb-health-check
### 1.3 Task 3: TTFB 伺服器回應健康檢查（Fast-Fail）

- **標的檔案**：[extension/manifest.json](file:///S:/projects/shopee-copy-product/extension/manifest.json) 與 [extension/batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js)
- **權限前置**：在 `manifest.json` 的 `permissions` 陣列加入 `"webRequest"`（依賴既有 `host_permissions`，不改動 host 範圍）。註：修改後需要重新載入擴充功能 (Reload unpacked extension)。
- **修復方式**：在 `processItemWithRetry()` 開啟分頁 (`chrome.tabs.create`) 後、呼叫 `waitForTabReady()` 前，使用 `chrome.webRequest.onResponseStarted` 監聽該 `tab.id` 且 `type === 'main_frame'` 的首個回應：
  - 設定 **5 秒逾時**（採用 `Promise.race` 結構）。
  - 若 5 秒內收到回應，代表伺服器正常存活，移除監聽器並放行進入既有的 `waitForTabReady` 流程。
  - 若 5 秒內無回應，立即拋出 `伺服器連線超時 (No TTFB, 5s)` **快速失敗 (Fast-Fail)**，避免白白硬等 30 秒。
  - 務必在成功與逾時兩種路徑皆呼叫 `chrome.webRequest.onResponseStarted.removeListener` 避免記憶體洩漏。

### #task-4-dynamic-progress-timeout
### 1.4 Task 4: 雙軌動態進度導向超時寬容機制 (Dynamic Timeout)

- **標的檔案**：[extension/batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js) 與 [extension/lib/seller-fill.js](file:///S:/projects/shopee-copy-product/extension/lib/seller-fill.js)
- **問題**：固定 60 秒死限 (`OVERALL_DEADLINE_MS = 60000`) 會在網路稍慢或圖片較多時，強制關閉眼看就要成功的分頁。
- **修復方式（雙軌制）**：
  1. **絕對上限**：保留 `OVERALL_DEADLINE_MS = 120000` (120 秒硬上限)，防範極端卡死。
  2. **無進度超時 (Inactivity Timeout)**：新增 30 秒無進度上限。只要有以下任一進度事件發生，立即刷新無進度計時點 `lastProgressAt = Date.now()`：
     - `checkFillStatus` 偵測到新欄位完成。
     - `navigationDetected` 觸發導航重試。
     - `uploadMedia` 媒體上傳開始與完成（及逐張上傳進度）。

---

## 二、 完整 Tasks 執行清單

- [x] **Task 1: `setNativeValue` 空值防禦保護** (`extension/lib/seller-fill.js`)
- [x] **Task 2: 欄位填寫失敗頁面狀態診斷** (`extension/lib/seller-fill.js`)
- [x] **Task 3: TTFB 伺服器回應健康檢查 (Fast-Fail)** (`manifest.json` + `extension/batch-upload.js`)
- [x] **Task 4: 雙軌動態進度超時寬容機制** (`extension/batch-upload.js` + `extension/lib/seller-fill.js`)

---

## 三、 相關檔案清單

| 檔案 | 說明 | 絕對路徑 |
|------|------|----------|
| `047-fix-setNativeValue防護與動態超時寬容機制.md` | 本開發規範與 Tasks 文件 | `file:///S:/projects/shopee-copy-product/docs/spec/047-fix-setNativeValue%E9%98%B2%E8%AD%B7%E8%88%87%E5%8B%95%E6%85%8B%E8%B6%85%E6%99%82%E5%AF%AC%E5%AE%B9%E6%A9%9F%E5%88%B6%EF%BC%88dynamic_timeout_fill_diagnostics%EF%BC%89.md` |
| `manifest.json` | 擴充功能設定檔 (需加入 webRequest) | `file:///S:/projects/shopee-copy-product/extension/manifest.json` |
| `seller-fill.js` | 頁面表單填寫腳本 | `file:///S:/projects/shopee-copy-product/extension/lib/seller-fill.js` |
| `batch-upload.js` | 批次上傳流程與分頁管理腳本 | `file:///S:/projects/shopee-copy-product/extension/batch-upload.js` |
