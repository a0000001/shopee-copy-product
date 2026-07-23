# 028 — Plan: content.js 拆分重構方案（Claude Web 諮詢專用版）

> 本文件為 Chrome Extension `content.js`（72KB / 1734 行）的模組化拆分方案，
> 專為直接提供給第三方 LLM（如 Claude Web）進行審核、意見諮詢設計。
> 所有路徑皆為絕對路徑，關鍵代碼附原文片段，無須 LLM 讀取本地檔案。

---

## 一、問題現狀

`file:///S:/projects/shopee-copy-product/extension/content.js` — **72KB，1734 行**，單一 IIFE。

```
(function () {
  // ... 全部 1734 行擠在這裡
})()
```

**核心問題**：這個檔案涵蓋兩個**完全獨立的執行領域**，但全部寫在一起：

| 領域 | 執行位置 | 約當行數 | 說明 |
|------|----------|----------|------|
| Product Page 商品爬取 | `shopee.tw` 商品詳情頁 | ~470 行 | 從 __INITIAL_STATE__ / DOM / API 爬標題、價格、描述、圖片、影片 |
| Seller Page 賣家表單填寫 | `seller.shopee.tw` 編輯頁 | ~570 行 | 自動填入類別、品牌、名稱、價格、描述、庫存、上傳圖片影片 |
| Seller Page 賣場商品列表 | `seller.shopee.tw` 商品列表 | ~150 行 | 爬取已上架商品清單（含 SPA 自動翻頁） |
| Media 下載/上傳 | seller.shopee.tw | ~200 行 | 透過 background.js fetch → DataTransfer 注入 file input |
| Message Handlers | 兩者共用 | ~100 行 | chrome.runtime.onMessage + window.postMessage |
| 自動執行 | 兩者共用 | ~20 行 | `isProductPage() && !isSellerEditPage()` 自動觸發 carousel |

**兩個領域不會同時執行**：`shopee.tw` 跟 `seller.shopee.tw` 是不同的 hostname，content script 只會在其中一個執行。

---

## 二、現有建置環境

```
file:///S:/projects/shopee-copy-product/extension/manifest.json
```

**沒有任何 build tool**（無 package.json、webpack、rollup、esbuild、vite）。

Manifest V3 content_scripts 目前為單一檔案：

```json
"content_scripts": [{
  "matches": [
    "https://shopee.tw/*",
    "https://www.shopee.tw/*",
    "https://seller.shopee.tw/*"
  ],
  "js": ["content.js"],
  "run_at": "document_idle"
}]
```

**無 TypeScript、無 bundler、無 npm**。這是最簡 Chrome Extension 結構。

---

## 三、建議拆分方案

### 3.1 總體架構

```
extension/
  manifest.json                 ← js: ["lib/_shared.js", "lib/extractor.js", "lib/seller-list.js", "lib/media.js", "lib/seller-fill.js", "content-boot.js"]
  content-boot.js               ← Chrome runtime message handlers + window.postMessage + IIFE entry
  lib/
    _shared.js                  ← SGC 共享 namespace + 工具函式
    extractor.js                ← 商品頁爬取（isProductPage → extractProductData）
    seller-fill.js              ← 賣家表單填寫（fillAll / fillFieldAsync / fillBrandAsync / fillCategoryAsync）
    seller-list.js              ← 賣家商品列表爬取（extractSellerProductList / readPageInfo）
    media.js                    ← 媒體下載與上傳（downloadMediaAsFile / uploadMediaAsync）
```

> **注意**：manifest `js` array 中的檔案**全部注入同一全域 scope**，不支援 ES module `import/export`。
> 解決方案：使用一個全域 namespace 物件（`window.__SGC`）作為模組間的橋樑。

### 3.2 模組依賴圖

```
content-boot.js
  ├── chrome.runtime.onMessage → 分派給 extractor / seller-fill / seller-list / media
  └── window.postMessage       → 同上（CDP 觸發路徑）

_shared.js (無依賴)
  └── __SGC namespace, dedupe(), cleanDescription(), SHOPEE_IMG_DOMAIN

extractor.js (依賴 _shared)
  └── isProductPage, extractItemShopIds, extractFromMeta, extractFromScripts,
      extractFromDOM, extractFromJSONLD, extractFromAPI, triggerCarouselFullRender,
      waitForCarouselStable, extractProductData

seller-fill.js (依賴 _shared)
  └── isSellerEditPage, setNativeValue, waitForElement, findFieldByLabel,
      fillFieldAsync, fillBrandAsync, fillCategoryAsync, fillAll, findMainSaveButton

media.js (依賴 _shared)
  └── downloadMediaAsFile, uploadMediaAsync

seller-list.js (依賴 _shared)
  └── extractSellerProductList, readPageInfo
```

---

## 四、關鍵代碼與絕對路徑

### 4.1 Shared Namespace 與工具

**檔案**：`file:///S:/projects/shopee-copy-product/extension/lib/_shared.js`

```javascript
// 跨模組共享 namespace
window.__SGC = window.__SGC || {}

const SHOPEE_IMG_DOMAIN = 'down-tw.img.susercontent.com'

function dedupe(arr) {
  return [...new Set(arr)]
}

function cleanDescription(text) {
  if (!text) return ''
  const trashKeywords = ['商品評價','全部5 星','客服中心','幫助中心','關於蝦皮','關注我們','下載蝦皮','版權所有','©']
  let cleaned = text
  for (const kw of trashKeywords) {
    const idx = cleaned.indexOf(kw)
    if (idx !== -1) cleaned = cleaned.substring(0, idx)
  }
  return cleaned.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

window.__SGC.dedupe = dedupe
window.__SGC.cleanDescription = cleanDescription
window.__SGC.SHOPEE_IMG_DOMAIN = SHOPEE_IMG_DOMAIN
```

### 4.2 Extractor（商品頁爬取核心）

**檔案**：`file:///S:/projects/shopee-copy-product/extension/lib/extractor.js`

```javascript
// 依賴 window.__SGC.dedupe, window.__SGC.cleanDescription

window.__SGC.isProductPage = function () {
  const p = window.location.pathname
  return p.includes('-i.') || p.startsWith('/product/')
}
```

約 10 個函式，總長度約 470 行。其中最複雜的是：

**`extractFromScripts()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:39-132`）
— 解析 `window.__INITIAL_STATE__`，從 productDetail / product / item 等多種鍵路徑取出資料，
並從 `images` / `image_list` / `img_list` / `album` / `models` / `tier_variations` 合併所有圖片來源。

**`extractFromDOM()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:134-343`）
— 含 `isProductImg()` (L200-236) 過濾 avatar/logo/recommend/comment 等非商品圖片，
從輪播容器 `.mdCA_C` / `.uRJsr5` 優先取圖，再掃全頁 `img` / `source` 補漏。

**`extractFromAPI()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:385-435`）
— 呼叫 Shopee 內部 API `/api/v4/item/get` 與 `/api/v2/item/get`，Image ID resolution 邏輯與 extractFromScripts 近似重複。

### 4.3 Seller Fill（賣家表單填寫核心）

**檔案**：`file:///S:/projects/shopee-copy-product/extension/lib/seller-fill.js`

**`setNativeValue()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:590-615`）
— 繞過 React/Vue 的 input value setter，先取 `HTMLInputElement.prototype` 的原始 descriptor，
set 後 dispatch `input`、`change`、`blur` 三個事件。

```javascript
window.__SGC.setNativeValue = function (input, value) {
  if (input.type === 'file') return
  if (input.classList.contains('ql-editor') || input.getAttribute('contenteditable') === 'true') {
    input.innerHTML = '<p>' + value.split('\n').join('</p><p>') + '</p>'
    // ... dispatch input/change/blur
    return
  }
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
  if (proto?.set) { try { proto.set.call(input, value) } catch (e) { input.value = value } }
  else { input.value = value }
  input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }))
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }))
  input.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }))
  input.focus()
}
```

**`findFieldByLabel()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:636-694`）
— 三層 fallback 尋找表單欄位：
1. `data-product-edit-field-unique-id` 屬性（最可靠）
2. `.edit-row` class 掃描（蝦皮賣家中心舊版結構）
3. Ant Design `.ant-form-item-label` / `<label for>` 標準 label 匹配

**`fillCategoryAsync()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:795-971`）
— 最複雜的函式（~176 行）。點擊類別選擇器 → 等待 Modal 出現 → 依 `categoryPath` 逐層點擊 → Fallback 到「電腦與周邊配件 > 軟體 > 其他」→ 反覆嘗試點「確定」直至 Modal 關閉。

**`fillAll()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:1171-1384`）
— 主 orchestrator，依序：類別（等待 1s DOM re-render）→ 商品名稱 → 描述 → 價格 → 數量 → 最低購買數量 → 重量 → 品牌 → 尺寸 → 信用卡分期 → 媒體上傳

### 4.4 Media（媒體下載與上傳）

**檔案**：`file:///S:/projects/shopee-copy-product/extension/lib/media.js`

**`downloadMediaAsFile()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:973-1012`）
— 透過 `chrome.runtime.sendMessage({ action: 'fetchBlob' })` 請 background.js 以 `fetch` 下載 → base64 回傳 → `atob` → `Uint8Array` → `Blob` → `File`。

**`uploadMediaAsync()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:1014-1169`）
— 先比對 `existingUrls`（已上傳圖片去重）→ 逐張 download → DataTransfer 注入 `<input type="file">`。支援 `multiple` 屬性（一次全注入）與單一 input（逐張注入，間隔 500ms）。

### 4.5 Seller List（賣家商品列表爬取）

**檔案**：`file:///S:/projects/shopee-copy-product/extension/lib/seller-list.js`

**`extractSellerProductList()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:1548-1691`）
— 三階段策略：
1. **DOM 收集**：從 `<a href="/portal/product/N">` 收集
2. **API 補充**：`fetch /api/v3/opt/mpsku/list/v2/search_product_list`（page_size=48），不會提前 return，DOM 優先
3. **SPA 翻頁**：`clickNextPage()` → `waitForRender()`（MutationObserver 監聽表格 innerHTML 變化）→ 最多 50 頁

**`readPageInfo()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:1694-1720`）
— 從 `.tab-badge` / `.list-header-title` / bodyText 正則解析總數、目前頁碼、總頁數。

### 4.6 Boot（Entry Point + Message Handlers）

**檔案**：`file:///S:/projects/shopee-copy-product/extension/content-boot.js`

```javascript
(function () {
  console.log('[SGC] content.js loaded, URL:', window.location.href)

  // ── Chrome runtime message handler ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'ping') { sendResponse({ ok: true }); return true }
    if (msg.action === 'getProductData') {
      __SGC.extractProductData().then(data => sendResponse(data)).catch(e => sendResponse({ ok: false, error: e.message }))
      return true
    }
    if (msg.action === 'fillProductData') {
      window._sgcFillState = { status: 'running', result: null }
      __SGC.fillAll(msg.data || {})
        .then(res => { window._sgcFillState = { status: 'done', result: res } })
        .catch(e => { window._sgcFillState = { status: 'done', result: { ok: false, error: e.message } } })
      sendResponse({ ok: true, status: 'started' })
      return true
    }
    // ... checkFillStatus, uploadMedia, checkMediaStatus, extractSellerProductList,
    //     getPageInfo, checkSaveButton, clickSaveButton
  })

  // ── postMessage handler（CDP 觸發路徑）──
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return
    const msg = event.data
    if (msg.action === 'fillProductData') {
      const result = await __SGC.fillAll(msg.data || {})
      window.postMessage({ action: 'fillProductDataResult', result }, '*')
    }
    // ... extractSellerProductList, getPageInfo, getProductData
  })

  // ── Auto-trigger carousel ──
  if (__SGC.isProductPage() && !__SGC.isSellerEditPage()) {
    setTimeout(() => { __SGC.triggerCarouselFullRender() }, 0)
  }

  console.log('[SGC] content script ready')
  if (__SGC.isSellerEditPage()) {
    console.log('[SGC] on seller page — fillProductData handler registered')
  }
})()
```

### 4.7 Manifest 修改

**檔案**：`file:///S:/projects/shopee-copy-product/extension/manifest.json`

```json
"content_scripts": [{
  "matches": [
    "https://shopee.tw/*",
    "https://www.shopee.tw/*",
    "https://seller.shopee.tw/*"
  ],
  "js": [
    "lib/_shared.js",
    "lib/extractor.js",
    "lib/seller-fill.js",
    "lib/seller-list.js",
    "lib/media.js",
    "content-boot.js"
  ],
  "run_at": "document_idle"
}]
```

> **載入順序**：由 Manifest 保證自上而下依序執行。`_shared.js` 必須在最前面（建立 `window.__SGC` namespace），`content-boot.js` 必須在最後面（依賴所有模組已註冊）。

---

## 五、不確定與問題（送 Claude Web 審查）

### Q1: `extractFromAPI` 與 `extractFromScripts` 的 Image ID resolution 邏輯高度重複

```javascript
// content.js:61-77 與 content.js:401-409 幾乎相同
function resolveImgUrl(img) {
  let val = ''
  if (typeof img === 'string') val = img
  else if (img && typeof img === 'object') val = img.url || img.image || img.image_url || img.image_id || ''
  if (!val || typeof val !== 'string') return null
  if (val.startsWith('http') || val.startsWith('//')) return val.startsWith('//') ? 'https:' + val : val
  if (!val.includes('/')) return `https://${SHOPEE_IMG_DOMAIN}/file/${val}`
  return val
}
```

> 是否應該提取為共用函式放 `_shared.js`？兩者微幅差異：
> - extractFromScripts 版本多做一層 `typeof val !== 'string'` guard
> - 後者只寫 `if (!val) return null`（較寬鬆）
>
> **建議**：統一放 `_shared.js`，採用較嚴謹的版本。

### Q2: `fillAll()` → `uploadMediaAsync()` → `downloadMediaAsFile()` 的依賴鏈

`fillAll()` 在 `content.js:1171` 是 seller-fill 的 orchestrator，但內部呼叫 `uploadMediaAsync()`（media.js）。跨模組呼叫沒問題（都在 `__SGC` namespace 上），但邊界是否清楚？

> 建議方案：`fillAll()` 留在 seller-fill.js，透過 `__SGC.uploadMediaAsync()` 呼叫 media.js。

### Q3: `window.addEventListener('message', ...)` 是否應留在 content-boot.js？

CDP 觸發路徑（`postMessage`）與 Chrome runtime 觸發路徑（`chrome.runtime.onMessage`）在本質上是同一組 handler，只是通道不同。兩者都放在 content-boot.js 作為 entry point 是否合理？或者應抽出成獨立的 message-handler.js？

> 目前傾向保留在 content-boot.js，因為它們是「分派邏輯」而非「業務邏輯」。

### Q4: 是否需要 bundler？

- 不同意見 A：**manifest `js` array 即可** — 零建置成本，Chrome 原生支援，載入順序由 manifest 保證。72KB 拆成 6 個檔案，每個 ~10-15KB，AI 編輯不會再撞到 context 上限。
- 不同意見 B：**引入 esbuild（或類似）** — 可以在開發時寫真正的 ES module `import/export`，編譯成單一 `content.js`。設定約 5 行，但需要 npm 與 build script。

> 你傾向哪種？目前專案完全無 build tool，引入 esbuild 是否算過度工程化？

---

## 六、Tasks

### Task 1：建立 lib/ 目錄與 _shared.js

- 在 `file:///S:/projects/shopee-copy-product/extension/lib/` 建立：
  - `_shared.js`：`window.__SGC` namespace + `dedupe()` + `cleanDescription()` + `SHOPEE_IMG_DOMAIN`
- 從 `content.js` 剪下對應函式到各檔案，掛到 `window.__SGC` 上

### Task 2：修改 manifest.json

- 將 `"js": ["content.js"]` 改為 [載入順序由上到下]：
  ```
  "lib/_shared.js",
  "lib/extractor.js",
  "lib/seller-fill.js",
  "lib/seller-list.js",
  "lib/media.js",
  "content-boot.js"
  ```

### Task 3：重寫 content-boot.js

- IIFE 保持不變
- 所有函式呼叫改為 `__SGC.xxx()`
- 保留 `chrome.runtime.onMessage.addListener` 與 `window.addEventListener('message', ...)`

### Task 4：Smoke Test（手動）

1. 重新載入 Extension（`chrome://extensions` → 重新整理）
2. 開啟 `https://shopee.tw/product/12345678/1234567890`（任意商品頁）
3. 點 Extension icon → 確認 popup 顯示商品資料（證明 extractor 正常）
4. 開啟 `https://seller.shopee.tw/portal/product/edit/123456`
5. 從 DevTools Console 輸入：
   ```javascript
   __SGC.fillAll({ ps_product_name: '測試商品', ps_price: '100', ps_stock: '999' })
   ```
   確認欄位被填入（證明 seller-fill 正常）
6. 從 DevTools Console 輸入：
   ```javascript
   __SGC.extractSellerProductList().then(console.log)
   ```
   確認回傳陣列（證明 seller-list 正常）

### Task 5：驗證原 content.js 可安全刪除（optional）

- 確認所有功能正常執行至少 1 天後，刪除 `extension/content.js`
- 若擔心，可先重新命名為 `content.js.bak`

---

## 附錄：現有檔案結構

```
file:///S:/projects/shopee-copy-product/extension/
├── manifest.json              ← MV3, 無 bundler
├── content.js                 ← 目標檔案（72KB, 1734 行, IIFE）
├── background.js              ← Service Worker（fetchBlob, checkPngMagic, catalog server）
├── popup.js / popup.html      ← Extension popup
├── batch-upload.js / .html    ← 批次上傳分頁
├── batch-upload-test.js / .html ← 批次上傳測試
├── options.js / options.html  ← 設定頁
├── console-scanner.js         ← 開發用 Scanner
├── scan-test.js / .html       ← Scanner 測試
├── diagnose-installment.js    ← 信用卡分期診斷工具
└── native-messaging-host/     ← 本地目錄伺服器（Python）
    ├── catalog-server-host.py
    ├── com.shopee.catalog_server.json
    └── run_host.bat
```
