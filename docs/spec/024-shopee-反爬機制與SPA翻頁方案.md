# Shopee 反爬機制與翻頁方案

## 緣由

蝦皮賣家中心「我的商品」頁面僅顯示 12 筆/頁，但擴充功能需一次抓取所有已上架商品（麥可 26 筆、nicola1982 98 筆），才能比對目錄、判斷哪些尚未上架。

## 真實 API（限制與防禦規範）

**端點**: `GET /api/v3/opt/mpsku/list/v2/search_product_list`

**參數限制與觀念**:
- `page_size=48`（**官方支援最高上限為 48**，傳入 `100` 等無效數值會被系統忽略或降為預設分頁筆數）
- `list_type=live_all`（只回已上架）
- `operation_sort_by=recommend_v4`
- `need_ads=false`
- `SPC_CDS=<cookie值>` & `SPC_CDS_VER=2`

> [!IMPORTANT]
> **關鍵防禦性規範（禁止 Early Return）**：
> 1. 蝦皮 API 即使回傳 200 OK，當賣場商品多於 48 筆（例如 98 筆）時，API 仍無法一次取回全量商品。
> 2. **程式嚴禁因為 API 回傳 200 或取得部分商品就提早 `return`**。
> 3. API 資料僅作為前置補充，後續必須無條件繼續執行 **SPA 點擊翻頁（方案 B）** 補齊全量商品，並透過 `Set` 自動去重。

## 頁面 DOM 商品數量結構解析

蝦皮賣家中心商品列表頁面會在以下兩個關鍵位置標示商品總數：

1. **頁籤 Badge 區塊**：
   ```html
   <div class="eds-tabs__nav-tab active">
     <div class="tabs__tab">架上商品<span class="tab-badge">(27)</span></div>
   </div>
   ```
   - Selector: `.tabs__tab`, `.tab-badge`
   - 特徵：`架上商品` 與 `(27)` 位於不同 DOM 節點。

2. **列表 Header 標題區塊**：
   ```html
   <div class="list-header-title">27  件商品</div>
   ```
   - Selector: `.list-header-title`
   - 特徵：數字與 `件商品` 中間可能包含多個連續空白（`\s+`）。

**防禦性正則與抓取策略**:
- 精確選取 `.tab-badge` 或 `.list-header-title` DOM 節點文字。
- 正則包含多重空白相容：`/架上商品\s*\(\s*(\d+)\s*\)/` | `/(\d+)\s*件\s*商品/` | `/總計\s*(\d+)\s*項/` | `/共\s*(\d+)\s*筆/`
- **備援機制**：即使 `readTotal()` 回傳 `0`（正則未命中），SPA 點擊翻頁迴圈**依然必須持續執行**，改為「點擊下一頁按鈕直至按鈕停用/消失或該頁無新商品」終止，防止因正則失效導致翻頁卡死。

## 最佳方案優先順序

### 方案 A：content script isolated world API（補充資料）
- 由 `content.js` 發起 fetch，最多取得首頁 48 筆
- 僅作 `nameSet` 前置補充，**不執行提早 return**

### 方案 B：SPA 點擊翻頁（主核心，confirmed working ✅）
- 直接操作 DOM，模擬使用者點擊分頁按鈕，翻遍所有分頁
- 不使用 `window.location.href`（被 Shopee Service Worker 攔截，無法翻頁）
- 不使用 `chrome.tabs.update`（也無法翻到正確位置）

#### 實作核心

```
collectDOM()       → 收集所有商品連結 a[href*="/portal/product/"]
clickNext()        → 多種 selector 嘗試點擊下一頁按鈕
waitTable()        → MutationObserver 監聽表格 DOM 變化，等頁面渲染完
readTotal()        → 正則從 .tab-badge / .list-header-title / body 讀取總數
```

**下一頁按鈕 selectors（依嘗試順序）**:
1. `.eds-pagination__next button`, `.eds-pagination__next`
2. `[class*="pagination"] [class*="next"] button`
3. `button[class*="next"]`, `a[class*="next"]`
4. `li.next a`, `li.next button`, `.ant-pagination-next`

**等待新頁渲染**: `MutationObserver` 監聽 `eds-table__body` / table tbody 的 `innerHTML` 變化，發現變化後等 400ms 讓 Vue 完成渲染。6 秒 timeout 防卡死。

### 方案 C：console 手動腳本（已驗證）
- `console-scanner.js` 是方案 B 的 standalone 版本
- 可直接貼到 Chrome DevTools Console 執行
- 已確認可完整翻頁抓取 26 筆

## 歷史：已廢棄的作法

| 作法 | 原因 |
|------|------|
| `window.location.href = ...` | 被 Shopee Service Worker 攔截，Vue SPA 不觸發導航 |
| `chrome.tabs.update(url)` | 同上，Service Worker 層級攔截 |
| fetch HTML 頁面 | Vue SPA 初始 HTML 不含商品資料，資料通過 API 動態載入 |

## 重要檔案

| 檔案 | 用途 |
|------|------|
| `extension/content.js` | 正式實作（可透過訊息呼叫） |
| `extension/console-scanner.js` | 獨立驗證腳本（貼到 Console 執行） |
| `extension/batch-upload.js` | scripting API fallback（含 SPA 翻頁備援） |
| `extension/scan-test.js` | 測試用 UI + scripting fallback |
