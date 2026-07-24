---
type: fix
status: completed
updated: 2026-07-24
domain: batch-upload
tags: [shopee, scan, executeScript, main-world, pagination, page_number, dedup]
author: Antigravity
---

# 048-fix-賣家中心全量商品主環境 API 掃描修復與雙軌防禦規範

> 本文件記錄「蝦皮賣家中心商品列表全量掃描 (200+ 筆)」之確切根因診斷、主環境 (Main World) `executeScript` API 跨頁輪詢規格、與自動校驗防護腳本之更新規範。

---

## 一、 問題診斷與確切根因分析

### 1.1 隔離環境 (Isolated World) vs 主環境 (Main World) 之 Fetch 權限差異

- **隔離環境 (Content Script / `seller-list.js`)**：
  Chrome Extension MV3 的 Content Script 運行於 Isolated World。在此環境下對蝦皮 API `/api/v3/opt/mpsku/list/v2/search_product_list` 發起 `fetch()`，由於無法完整取得頁面 DOM 上最新的 `SPC_CDS` Cookie 狀態，且受限於同源與憑證政策，API 請求容易被靜默攔截或回傳 0 筆。

- **主環境 (Main World / `executeScript`)**：
  透過 `chrome.scripting.executeScript` 將 `func` 注入至頁面主環境執行的腳本，能直接讀取 `document.cookie` 中的 `SPC_CDS`，發起 `fetch(..., { credentials: 'include' })` 可 100% 成功取得蝦皮 API 回傳資料。

### 1.2 代碼破口

在過去的修改中，[batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js) 的第二步（獨立主環境 `executeScript` API 爬取區塊）被意外刪除，導致掃描退化為僅由 `seller-list.js` 在隔離環境嘗試抓取，因而被攔截並退回僅抓取 DOM 首頁（48 ~ 60 筆）。

---

## 二、 確切修復規格

### #task-1-main-world-api-scan
### 2.1 Task 1: `batch-upload.js` 主環境 API 全頁籤分頁掃描

在 [batch-upload.js](file:///S:/projects/shopee-copy-product/extension/batch-upload.js) 的 `scanProducts()` 中，使用 `chrome.scripting.executeScript` 於主環境執行全頁籤與全分頁掃描：

1. **頁籤覆蓋**：包含 `['live_all', 'reviewing', 'unpublished', 'violation', 'banned']`。
2. **分頁輪詢**：對每個 `list_type`，執行 `page_number = 1..20` 迴圈：
   - 請求 URL：`/api/v3/opt/mpsku/list/v2/search_product_list?SPC_CDS=${encodeURIComponent(cds)}&SPC_CDS_VER=2&page_size=48&page_number=${pageNum}&list_type=${lt}&request_attribute=&operation_sort_by=recommend_v4&need_ads=false`
   - 若回傳筆數為 0 或小於 48，表示該頁籤已達最後一頁，終止該頁籤之 `pageNum` 迴圈並進入下一個頁籤。
3. **去重與分類**：
   - 收集所有商品名稱與 ID 至 `items` 陣列與 `nameSet`。
   - 分類統計 `liveCount`（架上商品）與 `reviewCount`（審核中/封鎖中商品）。
   - UI 顯示格式：`✅ 已掃描 207 筆 (204 筆已上架 + 3 筆審核中)`。

### #task-2-sync-seller-list
### 2.2 Task 2: `seller-list.js` 保持同步 API 分頁與 SPA DOM 備援

在 [extension/lib/seller-list.js](file:///S:/projects/shopee-copy-product/extension/lib/seller-list.js) 中同步維持 `page_number = 1..20` 迴圈與 SPA DOM 點擊下一頁備援。

---

## 三、 校驗防護機制更新

### #task-3-safeguard-verification
### 3.1 Task 3: 更新校驗腳本與 Agent 規範

1. **更新 [scripts/verify-scan-loop.js](file:///S:/projects/shopee-copy-product/scripts/verify-scan-loop.js)**：
   - 檢查 `batch-upload.js` 必須同時包含 `executeScript`、`live_all`、`page_number` 與 `pageNum` 輪詢關鍵字。
2. **更新 [AGENTS.md](file:///S:/projects/shopee-copy-product/AGENTS.md)**：
   - 明確記錄「主環境 executeScript 必須包含 `live_all` 與 `page_number=1..N` 輪詢」。
3. **檢查 [.git/hooks/pre-commit](file:///S:/projects/shopee-copy-product/.git/hooks/pre-commit)**：
   - 確保提交時自動觸發 `node scripts/verify-scan-loop.js`。

---

## 四、 Tasks 執行清單

- [x] **Task 1: `batch-upload.js` 實作主環境全頁籤 API 分頁掃描 (`live_all`, `page_number=1..N`)**
- [x] **Task 2: `seller-list.js` 同步分頁 API 與 SPA 備援**
- [x] **Task 3: 更新並驗證校驗腳本 (`verify-scan-loop.js`)、`AGENTS.md` 與 Git Hook**

---

## 五、 相關檔案清單

| 檔案 | 說明 | 絕對路徑 |
|------|------|----------|
| `048-fix-賣家中心全量商品主環境API掃描修復.md` | 本開發規格文件 | `file:///S:/projects/shopee-copy-product/docs/spec/048-fix-%E8%B3%A3%E5%AE%B6%E4%B8%AD%E5%BF%83%E5%85%A8%E9%87%8F%E5%95%86%E5%93%81%E4%B8%BB%E7%92%B0%E5%A2%83API%E6%8E%83%E6%8F%8F%E4%BF%AE%E5%BE%A9%EF%BC%88seller_product_list_main_world_scan%EF%BC%89.md` |
| `batch-upload.js` | 批次上傳與掃描邏輯 | `file:///S:/projects/shopee-copy-product/extension/batch-upload.js` |
| `seller-list.js` | 賣家商品列表 Content Script | `file:///S:/projects/shopee-copy-product/extension/lib/seller-list.js` |
| `verify-scan-loop.js` | 掃描迴圈校驗腳本 | `file:///S:/projects/shopee-copy-product/scripts/verify-scan-loop.js` |
| `AGENTS.md` | AI 規範文件 | `file:///S:/projects/shopee-copy-product/AGENTS.md` |
