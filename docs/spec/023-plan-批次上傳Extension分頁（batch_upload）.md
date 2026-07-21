# 023 — 批次上傳 Extension 分頁（batch_upload）

## 目標

在賣家頁面點擊 extension icon 時，彈出一個獨立的分頁介面，讓使用者：
1. 選取 `product-catalog-tw.json` 檔案
2. 自動取得目前已上架商品清單（去重）
3. 逐筆自動填入新商品頁並儲存
4. 顯示即時進度

## 使用流程

```
使用者在 seller.shopee.tw 任一頁面
  │
  ├─ 點擊 extension icon
  │
  ├─ popup 顯示「批次上傳」按鈕
  │     └─ 點擊後開啟 chrome.tabs.create('batch-upload.html')
  │
  ├─ batch-upload.html（獨立分頁，不會被關閉）
  │     ├─ 步驟 1：選擇檔案
  │     │     └─ <input type="file"> 選取 product-catalog-tw.json
  │     │
  │     ├─ 步驟 2：取得已上架商品
  │     │     ├─ 在目前分頁的 seller 列表頁執行 extractSellerProductList()
  │     │     └─ 比對排除，算出「待上傳 N 筆」
  │     │
  │     ├─ 步驟 3：逐筆上傳
  │     │     ├─ 對每筆待上傳商品：
  │     │     │   ├─ chrome.tabs.create({ url: 'seller.shopee.tw/portal/product/new' })
  │     │     │   ├─ 等待頁面載入完成
  │     │     │   ├─ chrome.tabs.sendMessage({ action: 'fillProductData', data })
  │     │     │   ├─ 等待 fillAll() 完成（含圖片/影片上傳）
  │     │     │   ├─ 點擊「儲存」按鈕
  │     │     │   ├─ 等待提交成功或超時
  │     │     │   ├─ 關閉該分頁
  │     │     │   └─ 更新進度條
  │     │     └─ 重複直到全部完成
  │     │
  │     └─ 步驟 4：完成頁面
  │           └─ 顯示成功/失敗筆數、失敗原因
```

## 去重策略

### 不需要額外紀錄中斷進度

每次重新開始批次上傳時，都會重新執行 `extractSellerProductList()` 取得目前已上架商品清單。已成功儲存的商品自然會出現在該清單中，因此會被排除，不會重複上傳。

**為什麼不需要「上傳完成」標示：**

`fillAll()` 的執行順序是：

```
uploadMediaAsync()  ← 先上傳圖片/影片
填入其他欄位（名稱、價格、描述...）
fillAll() 回傳成功
                    ← 到此為止，商品尚未被建立
按「儲存」按鈕        ← 此時商品才真正建立
```

圖片/影片上傳是在按儲存「之前」就完成的。如果 `fillAll()` 回傳成功，代表媒體已上傳完畢；如果 `fillAll()` 失敗，按鈕根本不會被點擊，商品不會被建立。

**中斷情境分析：**

| 中斷點 | 發生什麼 | 重啟後 |
|--------|---------|--------|
| `fillAll()` 完成但未按儲存 | 商品未建立 | 不在已上架清單 → 會重試 |
| 按了儲存但未確認成功 | 可能已建立或未建立 | 若已建立則在已上架清單 → 跳過；若未建立 → 重試 |
| 圖片上傳中斷 | `fillAll()` 失敗 → 沒按儲存 | 商品未建立 → 重試時重新上傳圖片 |
| 分頁或瀏覽器 crash | 同上分類處理 | 同上邏輯 |

因此不需要額外紀錄，每次重新掃描已上架清單就足夠。

### 比對方式

以 `ps_product_name`（商品名稱）比對已上架清單的 `name` 欄位，完全匹配則跳過。

## 架構

### 新增檔案

| 檔案 | 說明 |
|------|------|
| `extension/batch-upload.html` | 批次上傳獨立分頁 UI |
| `extension/batch-upload.js` | 批次上傳邏輯 |

### 修改檔案

| 檔案 | 變更 |
|------|------|
| `extension/popup.html` | 新增「批次上傳」按鈕（僅在 seller 頁面顯示） |
| `extension/popup.js` | 按鈕 click → `chrome.tabs.create('batch-upload.html')` |
| `extension/manifest.json` | 加入 `batch-upload.html` 至 `web_accessible_resources`（若需要） |

### batch-upload.html UI 設計

```
┌─────────────────────────────────────┐
│  📦 批次上傳至蝦皮                    │
│                                     │
│  ┌─ 步驟 1 ──────────────────────┐  │
│  │  [選擇檔案] product-catalog-tw.json │
│  │  ✓ 已載入 207 筆商品            │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ 步驟 2 ──────────────────────┐  │
│  │  [掃描已上架商品]                │  │
│  │  ✓ 已上架 98 筆                 │  │
│  │  ℹ 待上傳 109 筆               │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ 步驟 3 ──────────────────────┐  │
│  │  [開始上傳]                     │  │
│  │                                 │  │
│  │  ████████████░░░░░░ 45%        │  │
│  │  50 / 109 筆                    │  │
│  │  ✅ 目前：AI 變聲器 Voice Changer│  │
│  │  ⏳ 佇列：等待圖片上傳中...       │  │
│  │                                 │  │
│  │  ┌─ 即時日誌 ────────────────┐  │
│  │  │ ✅ 已上傳：AI變聲器          │  │
│  │  │ ❌ 失敗：XXX（原因）         │  │
│  │  │ ▶ 正在上傳：YYY             │  │
│  │  └───────────────────────────┘  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ 步驟 4 ──────────────────────┐  │
│  │  ✅ 完成！                      │  │
│  │  ✓ 成功：105 筆                 │  │
│  │  ✗ 失敗：4 筆                  │  │
│  │  [下載失敗報告]                  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### batch-upload.js 核心邏輯

```javascript
// 主要狀態
const state = {
  catalog: [],           // 完整目錄（從 JSON 讀取）
  existingProducts: [],  // 已上架商品（從 seller 頁面爬取）
  pending: [],          // 待上傳（排除已上架）
  currentIndex: 0,      // 目前處理到第幾筆
  results: [],          // 結果記錄
  isRunning: false,
  abortController: null,
}

// 步驟 1：選擇檔案
async function loadCatalog(file) {
  const text = await file.text()
  state.catalog = JSON.parse(text)
}

// 步驟 2：取得已上架商品
async function fetchExistingProducts() {
  // 在目前 seller 分頁執行 extractSellerProductList
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const resp = await chrome.tabs.sendMessage(tab.id, { action: 'extractSellerProductList' })
  state.existingProducts = resp || []
  // 比對排除
  const existingNames = new Set(state.existingProducts.map(p => p.name))
  state.pending = state.catalog.filter(item => !existingNames.has(item.ps_product_name))
}

// 步驟 3：逐筆上傳
async function runBatch() {
  state.isRunning = true
  for (let i = 0; i < state.pending.length; i++) {
    if (!state.isRunning) break  // 使用者取消

    const item = state.pending[i]
    updateProgress(i, state.pending.length, item.ps_product_name)

    try {
      // 開新分頁
      const tab = await chrome.tabs.create({
        url: 'https://seller.shopee.tw/portal/product/new',
        active: false
      })

      // 等待頁面載入 + DOM 就緒
      await waitForTabReady(tab.id)

      // 觸發填入
      const result = await chrome.tabs.sendMessage(tab.id, {
        action: 'fillProductData',
        data: convertToData(item)
      })

      if (result?.ok) {
        // 等待儲存按鈕
        const saveResult = await clickSaveButton(tab.id)
        if (saveResult) {
          state.results.push({ name: item.ps_product_name, ok: true })
        } else {
          state.results.push({ name: item.ps_product_name, ok: false, error: '儲存失敗' })
        }
      } else {
        state.results.push({ name: item.ps_product_name, ok: false, error: result?.error || '填入失敗' })
      }

      // 關分頁
      chrome.tabs.remove(tab.id)
    } catch (e) {
      state.results.push({ name: item.ps_product_name, ok: false, error: e.message })
    }
  }
  state.isRunning = false
  showComplete()
}
```

## 注意事項

### 蝦皮 WAF 限制
- 短時間大量新增商品可能觸發 WAF
- 每筆上傳之間建議加入 **3~5 秒延遲**
- 若連續失敗 3 次，自動暫停並提示使用者

### 分頁管理
- 上傳分頁設為 `active: false` 避免干擾使用者
- 每筆完成後關閉分頁，避免記憶體累積
- 若使用者關閉 batch-upload 分頁，應中止進行中的上傳

### 超時處理
- 頁面載入超時：15 秒
- `fillAll()` 完成超時：60 秒（含圖片上傳）
- 儲存按鈕等待超時：30 秒
- 超時後標記失敗，繼續下一筆

### 錯誤處理
- 記錄每筆失敗原因
- 完成後可下載失敗報告（JSON/CSV）
- 提供「重試失敗項目」按鈕

## 優先順序
1. batch-upload.html + batch-upload.js 基礎架構
2. 檔案選取 + 已上架掃描 + 去重比對
3. 逐筆開新分頁 + 填入 + 等待 + 關閉
4. 即時進度顯示 + 日誌
5. 超時處理 + 錯誤重試
6. 中斷/取消處理