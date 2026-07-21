# 022 — 批量自動上傳、多帳號切換、擴充 Extension 功能

## 目標
1. 實作 `extractSellerProductList()` — 從我的商品列表頁爬取已上架 SKU，用於去重
2. 新增 `window.postMessage` handler — 讓 CDP 可直接觸發 extension 的填入/擷取功能
3. 實作擷取時同時保留原始資料（JSON + 圖片 + 影片）到本地資料夾
4. 建立全自動批量上傳流程（CDP + Extension + 本地目錄）
5. 支援多帳號切換（Chrome Multi Profile）

## 已實現功能（現有）

### Extension 已支援
- `fillAll(data)` — 填入商品名稱、價格、庫存、描述、類別、運費、設定期數
- `uploadMediaAsync(data)` — 下載圖片/影片後注入 file input 上傳到蝦皮
- `fillCategoryAsync()` — 自動選取類別
- `extractProductData()` — 從商品頁擷取資料

### 本地目錄伺服器
- `localhost:9801` — 接收商品資料、去重/合併、儲存 JSON
- `localhost:9802` — 測試專用

### 大量上傳 Excel
- `scripts/test-convert-catalog-to-xlsx.py` — 196 筆測試通過
- 模板：`上傳模板` 工作表，Row 7+ 資料列，47 欄

## 新增功能

### 1. extractSellerProductList()

在 `content.js` 新增函數，從我的商品列表頁 DOM 爬取已上架 SKU：

```javascript
function extractSellerProductList() {
  const items = []
  const rows = document.querySelectorAll('.eds-table__row.valign-top')
  for (const row of rows) {
    const nameLink = row.querySelector('a[href*="/portal/product/"]')
    if (!nameLink) continue
    const text = row.textContent
    const skuMatch = text.match(/主商品貨號:\s*(\S+)/)
    const idMatch = text.match(/商品 ID:\s*(\d+)/)
    const priceMatch = text.match(/NT\$(\d+)/)
    items.push({
      name: nameLink.textContent.trim(),
      productId: idMatch ? idMatch[1] : '',
      sku: skuMatch && skuMatch[1] !== '-' ? skuMatch[1] : '',
      url: nameLink.href,
      price: priceMatch ? priceMatch[1] : '',
    })
  }
  return items
}
```

觸發方式：`window.postMessage({ action: 'extractSellerProductList' }, '*')` 或 extension popup 按鈕。

### 2. window.postMessage Handler

讓 CDP 可以直接對頁面 inject script 觸發 extension 功能，不需透過 extension popup。

```javascript
window.addEventListener('message', async (event) => {
  if (event.source !== window) return
  const msg = event.data
  if (msg.action === 'fillProductData') {
    const result = await fillAll(msg.data || {})
    window.postMessage({ action: 'fillProductDataResult', result }, '*')
  }
  if (msg.action === 'extractSellerProductList') {
    const items = extractSellerProductList()
    window.postMessage({ action: 'extractSellerProductListResult', items }, '*')
  }
  if (msg.action === 'getProductData') {
    const data = await extractProductData()
    window.postMessage({ action: 'getProductDataResult', data }, '*')
  }
})
```

### 3. 擷取時保留原始資料

在 `extractProductData()` 成功後，多一步驟：

1. 透過 `chrome.runtime.sendMessage({ action: 'saveRawProductData', data })` 到 background.js
2. background.js 用 `chrome.downloads.download` 把 JSON 存到 `{basePath}/{商品標題}/data.json`
3. 同時下載所有圖片（JPG）到 `{basePath}/{商品標題}/images/`
4. 同時下載影片到 `{basePath}/{商品標題}/videos/`

`basePath` 可在 popup 設定頁中設定，預設為 `E:\proj\shopee\mazz68\`。

### 4. 批量自動上傳流程

```
[CDP Script]
  │
  ├─ 1. 讀取 product-catalog-tw.json（196 筆商品）
  │
  ├─ 2. 連線到已登入的瀏覽器（CDP）
  │
  ├─ 3. 導航到 seller.shopee.tw/portal/product/list/live/all
  │     └─ window.postMessage({ action: 'extractSellerProductList' })
  │     └─ 取得已上架 SKU 列表 → 比對排除
  │
  ├─ 4. 對每筆未上架商品：
  │     ├─ 導航到 seller.shopee.tw/portal/product/new?from=sidebar
  │     ├─ 等待頁面載入完成
  │     ├─ window.postMessage({ action: 'fillProductData', data: {...} })
  │     ├─ 等待填寫完成（含圖片/影片上傳）
  │     ├─ 點擊「儲存」按鈕
  │     └─ 等待提交成功
  │
  └─ 5. 回報結果（成功/失敗筆數）
```

### 5. 多帳號切換

使用 Chrome Multi Profile 機制：

```powershell
# 啟動 michaelchen977 Profile
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="C:\Users\micha\Chrome Profiles\michaelchen977"

# 啟動 nicola1982 Profile
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9223 `
  --user-data-dir="C:\Users\micha\Chrome Profiles\nicola1982"
```

CDP 連線時指定 port：
- `9222` → michaelchen977
- `9223` → nicola1982

## 優先順序

1. `window.postMessage` handler（CDP 觸發基礎）
2. `extractSellerProductList()`（去重必需）
3. 擷取時保留原始資料（本地存檔）
4. 批量自動上傳腳本
5. 去重測試