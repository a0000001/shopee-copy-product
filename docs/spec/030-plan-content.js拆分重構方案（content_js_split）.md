# 030 — Plan: content.js 拆分重構方案（Claude Web 諮詢專用版）

> 本文件為 Chrome Extension `content.js`（73.9KB / 1764 行）的模組化拆分方案，
> 專為直接提供給第三方 LLM（如 Claude Web）進行審核、意見諮詢設計。
> 所有路徑皆為絕對路徑，關鍵代碼附原文片段，無須 LLM 讀取本地檔案。

---

## 一、問題現狀

`file:///S:/projects/shopee-copy-product/extension/content.js` — **73.9KB，1764 行**，單一 IIFE。

```
(function () {
  // ... 全部 1764 行擠在這裡
})()
```

**核心問題**：這個檔案涵蓋兩個**完全獨立的執行領域**，但全部寫在一起：

| 領域 | 執行位置 | 約當行數 | 說明 |
|------|----------|----------|------|
| Product Page 商品爬取 | `shopee.tw` 商品詳情頁 | ~470 行 | 從 __INITIAL_STATE__ / DOM / API 爬標題、價格、描述、圖片、影片 |
| Seller Page 賣家表單填寫 | `seller.shopee.tw` 編輯頁 | ~600 行 | 自動填入品牌、類別、名稱、價格、描述、庫存、上傳圖片影片，含 `randomJitter()` 擬真停頓 |
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
    seller-fill.js              ← 賣家表單填寫（fillAll / fillFieldAsync / fillBrandAsync / fillCategoryAsync / randomJitter）
    seller-list.js              ← 賣家商品列表爬取（extractSellerProductList / readPageInfo）
    media.js                    ← 媒體下載與上傳（downloadMediaAsFile / uploadMediaAsync）
```

> **注意**：manifest `js` array 中的檔案**全部注入同一全域 scope**，不支援 ES module `import/export`。
> 解決方案：使用一個全域 namespace 物件（`window.__SGC`）作為模組間的橋樑。
>
> **每個 lib 檔案各自包自己的 IIFE**，內部函式維持裸名稱呼叫；只把「真正跨檔案被呼叫」的函式掛到 `window.__SGC`。
> 這樣可以在同一檔案內維持裸名稱（省去大量機械式前綴改寫），同時不汙染全域 scope。
> `_shared.js` 也比照辦理，不留裸露的全域綁定。

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
      fillFieldAsync, fillBrandAsync, fillCategoryAsync, randomJitter,
      fillAll, findMainSaveButton

media.js (依賴 _shared)
  └── downloadMediaAsFile, uploadMediaAsync

seller-list.js (依賴 _shared)
  └── extractSellerProductList, readPageInfo
```

### 3.3 跨檔案存取清單（精確列舉，共 9 函式呼叫 + 1 常數 = 10 處）

這是拆分後**唯一需要 `__SGC.` 前綴**的 10 個地方。其餘同一 IIFE 內部的函式呼叫全部維持裸名稱不動。

| 編號 | 呼叫方 | 被呼叫方 | 所在 module | 類型 |
|------|--------|----------|-------------|------|
| C-01 | `content-boot.js` | `__SGC.extractProductData()` | extractor.js | 函式呼叫 |
| C-02 | `content-boot.js` | `__SGC.fillAll()` | seller-fill.js | 函式呼叫 |
| C-03 | `content-boot.js` | `__SGC.extractSellerProductList()` | seller-list.js | 函式呼叫 |
| C-04 | `content-boot.js` | `__SGC.readPageInfo()` | seller-list.js | 函式呼叫 |
| C-05 | `content-boot.js` | `__SGC.findMainSaveButton()` | seller-fill.js | 函式呼叫 |
| C-06 | `seller-fill.js` | `__SGC.uploadMediaAsync()` | media.js | 函式呼叫 |
| C-07 | `extractor.js` | `__SGC.cleanDescription()` | _shared.js | 函式呼叫 |
| C-08 | `extractor.js` | `__SGC.dedupe()` | _shared.js | 函式呼叫 |
| C-09 | `extractor.js` | `__SGC.resolveImgUrl()` | _shared.js | 函式呼叫 |
| C-10 | `extractor.js` | `__SGC.SHOPEE_IMG_DOMAIN` | _shared.js | 常數讀取 |

> **注意**：C-06（`findMainSaveButton`）在原 content.js 中是巢狀在 `onMessage` callback 內部的區域函式（4 格縮排），不是 IIFE 頂層（2 格縮排）。拆分時必須將其提升為 `seller-fill.js` 的頂層函式，並在 `content-boot.js` 的 `checkSaveButton`/`clickSaveButton` 兩段中將 `findMainSaveButton()` 改為 `__SGC.findMainSaveButton()`。

---

## 四、關鍵代碼與絕對路徑

### 4.1 Shared Namespace 與工具

**檔案**：`file:///S:/projects/shopee-copy-product/extension/lib/_shared.js`

```javascript
(function () {
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

  function resolveImgUrl(img) {
    let val = ''
    if (typeof img === 'string') val = img
    else if (img && typeof img === 'object') val = img.url || img.image || img.image_url || img.image_id || ''
    if (!val || typeof val !== 'string') return null
    if (val.startsWith('http') || val.startsWith('//')) return val.startsWith('//') ? 'https:' + val : val
    if (!val.includes('/')) return `https://${SHOPEE_IMG_DOMAIN}/file/${val}`
    return val
  }

  window.__SGC.dedupe = dedupe
  window.__SGC.cleanDescription = cleanDescription
  window.__SGC.resolveImgUrl = resolveImgUrl
  window.__SGC.SHOPEE_IMG_DOMAIN = SHOPEE_IMG_DOMAIN
})()
```

> `resolveImgUrl()` 在此統一（原 content.js:61-77 與 content.js:401-409 各有獨立版本，前者有 `typeof val !== 'string'` guard，後者較寬鬆。此處採用嚴謹版本）。

### 4.2 Extractor（商品頁爬取核心）

**檔案**：`file:///S:/projects/shopee-copy-product/extension/lib/extractor.js`

```javascript
(function () {
  function isProductPage() {
    const p = window.location.pathname
    return p.includes('-i.') || p.startsWith('/product/')
  }

  function extractItemShopIds() { /* ... */ }
  function extractFromMeta() { /* ... */ }
  function extractFromScripts() {
    // 跨檔案：使用 __SGC.cleanDescription(__SGC.cleanDescription())
    // 跨檔案：使用 __SGC.resolveImgUrl()
  }
  function extractFromDOM() { /* ... */ }
  function extractFromJSONLD() { /* ... */ }
  function extractFromAPI() {
    // 跨檔案：使用 __SGC.resolveImgUrl()
  }
  async function extractProductData() {
    // 內部呼叫 extractFromScripts()、extractFromDOM() 等 — 維持裸名稱，不需 __SGC. 前綴
    // 跨檔案：__SGC.dedupe()
  }
  function triggerCarouselFullRender() { /* ... */ }

  // 對外暴露：僅 orchestator 入口
  window.__SGC.extractProductData = extractProductData
  // isProductPage / triggerCarouselFullRender 只在 extractProductData 內部使用，不單獨暴露
})()
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

**`fillCategoryAsync()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:795-1001`）
— 最複雜的函式（~206 行）。點擊類別選擇器 → 等待 Modal 出現 → 依 `categoryPath` 逐層點擊 → Fallback 到「電腦與周邊配件 > 軟體 > 其他」→ 反覆嘗試點「確定」直至 Modal 關閉。

**`randomJitter()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:1201-1204`）
— 隨機 150~350ms 擬真停頓，模擬真人操作間隔，避免被蝦皮 anti-bot 偵測。

**`fillAll()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:1206-1413`）
— 主 orchestrator，依**頁面由上至下**順序，每步驟間穿插 `await randomJitter()`：
商品名稱 → 類別（等待 1s DOM re-render）→ 品牌 → 尺寸（長x寬x高，選填）→ 商品描述 → 價格（`String()` 轉型 + 600ms 等待銷售資訊區塊啟用）→ 數量 → （最低數量 & 重量：跳過不填，保持蝦皮預設）→ 信用卡分期（選填）→ 媒體上傳

**`findMainSaveButton()`**（原 `content.js:1464`，但位於 `onMessage` callback 內部巢狀作用域）
> **⚠️ 巢狀陷阱**：
> `findMainSaveButton` 在原檔案中以 4 格縮排宣告在 `chrome.runtime.onMessage.addListener` 回呼內部（L1434-L1467），
> 不是 IIFE 頂層。因此它**不會**被「用 indent 抓頂層函式」的方式掃到，極易被遺漏。
>
> 拆分動作：將 `findMainSaveButton` 提升為 `seller-fill.js` 的 IIFE 頂層裸函式，掛到 `__SGC` 上。
> `checkSaveButton` 與 `clickSaveButton` 兩段 message 處理邏輯中的 `findMainSaveButton()` 改為 `__SGC.findMainSaveButton()`（見 C-05）。

### 4.4 Media（媒體下載與上傳）

**檔案**：`file:///S:/projects/shopee-copy-product/extension/lib/media.js`

**`downloadMediaAsFile()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:1002-1041`）
— 透過 `chrome.runtime.sendMessage({ action: 'fetchBlob' })` 請 background.js 以 `fetch` 下載 → base64 回傳 → `atob` → `Uint8Array` → `Blob` → `File`。

**`uploadMediaAsync()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:1043-1198`）
— 先比對 `existingUrls`（已上傳圖片去重）→ 逐張 download → DataTransfer 注入 `<input type="file">`。支援 `multiple` 屬性（一次全注入）與單一 input（逐張注入，間隔 500ms）。

### 4.5 Seller List（賣家商品列表爬取）

**檔案**：`file:///S:/projects/shopee-copy-product/extension/lib/seller-list.js`

**`extractSellerProductList()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:1578-1721`）
— 三階段策略：
1. **DOM 收集**：從 `<a href="/portal/product/N">` 收集
2. **API 補充**：`fetch /api/v3/opt/mpsku/list/v2/search_product_list`（page_size=48），不會提前 return，DOM 優先
3. **SPA 翻頁**：`clickNextPage()` → `waitForRender()`（MutationObserver 監聽表格 innerHTML 變化）→ 最多 50 頁

**`readPageInfo()`**（`file:///S:/projects/shopee-copy-product/extension/content.js:1724-1750`）
— 從 `.tab-badge` / `.list-header-title` / bodyText 正則解析總數、目前頁碼、總頁數。

### 4.6 Boot（Entry Point + Message Handlers）

**檔案**：`file:///S:/projects/shopee-copy-product/extension/content-boot.js`

```javascript
(function () {
  // 所有跨模組呼叫透過 __SGC.xxx 前綴（見 3.3 跨檔案存取清單）

  // ── Chrome runtime message handler ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'ping') { sendResponse({ ok: true }); return true }

    if (msg.action === 'getProductData') {
      __SGC.extractProductData()
        .then(data => sendResponse(data))
        .catch(e => sendResponse({ ok: false, error: e.message }))
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

    if (msg.action === 'checkFillStatus') {
      sendResponse(window._sgcFillState || { status: 'idle', result: null })
      return true
    }

    if (msg.action === 'uploadMedia') {
      window._sgcMediaState = { status: 'running', result: null }
      __SGC.uploadMediaAsync(msg.data || {}).then(results => {
        const ok = results.every(r => r.ok)
        window._sgcMediaState = { status: 'done', result: { ok, results } }
      }).catch(e => {
        window._sgcMediaState = { status: 'done', result: { ok: false, error: e.message } }
      })
      sendResponse({ ok: true, status: 'started' })
      return true
    }

    if (msg.action === 'checkMediaStatus') {
      sendResponse(window._sgcMediaState || { status: 'idle', result: null })
      return true
    }

    if (msg.action === 'extractSellerProductList') {
      Promise.resolve(__SGC.extractSellerProductList())
        .then(items => sendResponse(items))
        .catch(() => sendResponse([]))
      return true
    }

    if (msg.action === 'getPageInfo') {
      sendResponse(__SGC.readPageInfo())
      return true
    }

    if (msg.action === 'checkSaveButton') {
      const btn = __SGC.findMainSaveButton()
      if (!btn) {
        sendResponse({ ready: false, reason: '頁面上未找到「儲存並上架」按鈕' })
        return true
      }
      const isDisabled = !!btn.disabled || btn.classList?.contains('eds-button--disabled') || btn.hasAttribute('disabled')
      sendResponse({ ready: !isDisabled, btnText: btn.textContent.trim(), reason: isDisabled ? 'disabled' : 'OK' })
      return true
    }

    if (msg.action === 'clickSaveButton') {
      const btn = __SGC.findMainSaveButton()
      if (!btn || !!btn.disabled || btn.hasAttribute('disabled')) {
        sendResponse({ ok: false, error: '找不到按鈕或被停用' })
        return true
      }
      btn.click()
      ;(async () => {
        // 輪詢等待跳轉或 success toast（25s timeout）
        // ... 略
      })()
      return true
    }
  })

  // ── postMessage handler（CDP 觸發路徑）──
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return
    const msg = event.data
    if (msg.action === 'fillProductData') {
      const result = await __SGC.fillAll(msg.data || {})
      window.postMessage({ action: 'fillProductDataResult', result }, '*')
    }
    if (msg.action === 'extractSellerProductList') {
      const items = await __SGC.extractSellerProductList()
      window.postMessage({ action: 'extractSellerProductListResult', items }, '*')
    }
    if (msg.action === 'getPageInfo') {
      window.postMessage({ action: 'getPageInfoResult', pageInfo: __SGC.readPageInfo() }, '*')
    }
    if (msg.action === 'getProductData') {
      const data = await __SGC.extractProductData()
      window.postMessage({ action: 'getProductDataResult', data }, '*')
    }
  })

  // ── Auto-trigger carousel ──
  if (window.location.pathname.includes('-i.') || window.location.pathname.startsWith('/product/')) {
    if (window.location.hostname !== 'seller.shopee.tw') {
      setTimeout(() => { /* triggerCarouselFullRender — used internally by extractProductData */ }, 0)
    }
  }

  console.log('[SGC] content script ready')
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

### Q1（已定案）: `extractFromAPI` 與 `extractFromScripts` 的 Image ID resolution 邏輯

```javascript
// content.js:61-77 與 content.js:401-409 幾乎相同 — 已統一為 __SGC.resolveImgUrl()
```

> **結論**：提取為 `_shared.js` 的共用函式 `__SGC.resolveImgUrl()`，採用較嚴謹的 `typeof val !== 'string'` guard 版本。見 4.1 範例代碼。

### Q2: `fillAll()` → `uploadMediaAsync()` → `downloadMediaAsFile()` 的依賴鏈

`fillAll()` 在 `content.js:1206` 是 seller-fill 的 orchestrator，但內部呼叫 `uploadMediaAsync()`（media.js）。跨模組呼叫沒問題（都在 `__SGC` namespace 上），但邊界是否清楚？

> 建議方案：`fillAll()` 留在 seller-fill.js，透過 `__SGC.uploadMediaAsync()` 呼叫 media.js。

### Q3: `window.addEventListener('message', ...)` 是否應留在 content-boot.js？

CDP 觸發路徑（`postMessage`）與 Chrome runtime 觸發路徑（`chrome.runtime.onMessage`）在本質上是同一組 handler，只是通道不同。兩者都放在 content-boot.js 作為 entry point 是否合理？或者應抽出成獨立的 message-handler.js？

> 目前傾向保留在 content-boot.js，因為它們是「分派邏輯」而非「業務邏輯」。

### Q4（已定案）: 是否需要 bundler？

> **結論：不需要。** 既然 manifest `js` array 所有檔案共享同一個全域 scope，本身就足以讓拆分可行。
> 跨檔案呼叫只有精確 10 處（見 3.3），每個 lib 各自 IIFE 即可隔離作用域。
> 專案完全無 npm/build tool，引入 esbuild 只是為了讓程式碼「看起來像模組化」，卻要多維護一條建置流程，屬於過度工程化，不建議。

---

## 六、Tasks

### Task 1：建立 lib/ 目錄與 _shared.js

- 在 `file:///S:/projects/shopee-copy-product/extension/lib/` 建立：
  - `_shared.js`：`window.__SGC` namespace + `dedupe()` + `cleanDescription()` + `resolveImgUrl()` + `SHOPEE_IMG_DOMAIN`
- **`_shared.js` 也要包 IIFE**（`(function(){ ... })()`），比照其他 lib 檔案，不留裸露全域綁定。
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

### Task 3：建立 5 個 lib/ 檔案（各包 IIFE）與 content-boot.js

**核心原則：每個 lib 檔案各自包一層 IIFE，內部函式維持裸名稱呼叫。
僅下列 10 處跨檔案存取改用 `__SGC.` 前綴（對照 3.3 清單）：**

```
content-boot.js → __SGC.extractProductData()        [C-01]
content-boot.js → __SGC.fillAll()                     [C-02]
content-boot.js → __SGC.extractSellerProductList()    [C-03]
content-boot.js → __SGC.readPageInfo()                [C-04]
content-boot.js → __SGC.findMainSaveButton()          [C-05]  ← 巢狀提升，見注意事項
seller-fill.js  → __SGC.uploadMediaAsync()            [C-06]
extractor.js    → __SGC.cleanDescription()            [C-07]
extractor.js    → __SGC.dedupe()                       [C-08]
extractor.js    → __SGC.resolveImgUrl()                [C-09]
extractor.js    → __SGC.SHOPEE_IMG_DOMAIN              [C-10] 常數讀取
```

**步驟：**

1. **建立 `lib/_shared.js`**
   - 包 IIFE
   - 內容：`window.__SGC` namespace + `dedupe()` + `cleanDescription()` + `resolveImgUrl()` + `SHOPEE_IMG_DOMAIN`
   - 將這 4 個函式 + 1 常數掛到 `window.__SGC` 上（供 extractor.js 跨檔案呼叫）

2. **建立 `lib/extractor.js`**
   - 包 IIFE
   - 內容：L5-L564 的所有函式（isProductPage → extractProductData → dedupe → cleanDescription）
   - 將 `window.__SGC` namespace 初始化移到 `_shared.js`，此處不再重複
   - 內部 `extractProductData()` 中：`__SGC.dedupe()`、`__SGC.cleanDescription()`、`__SGC.resolveImgUrl()`、`__SGC.SHOPEE_IMG_DOMAIN`
   - 其餘（`extractFromScripts`、`extractFromDOM`、`extractFromAPI` 等）維持裸名稱不動
   - 僅暴露 `window.__SGC.extractProductData = extractProductData`

3. **建立 `lib/seller-fill.js`**
   - 包 IIFE
   - 內容：L586-L1413 的所有函式（isSellerEditPage → fillAll，不含 downloadMediaAsFile / uploadMediaAsync）
   - 內部 `fillAll()` 中：`__SGC.uploadMediaAsync()`（跨檔案呼叫 media.js）
   - 其餘（`fillFieldAsync`、`fillCategoryAsync`、`fillBrandAsync` 等）維持裸名稱不動
   - 暴露：`window.__SGC.fillAll`、`window.__SGC.findMainSaveButton`（← 從巢狀 callback 提升至此）

4. **建立 `lib/media.js`**
   - 包 IIFE
   - 內容：L1002-L1198 的 `downloadMediaAsFile()` + `uploadMediaAsync()`
   - 內部 `downloadMediaAsFile` 呼叫 `chrome.runtime.sendMessage`，維持原樣
   - 暴露：`window.__SGC.uploadMediaAsync`（注意：不暴露 downloadMediaAsFile，它只在 media.js 內部被 uploadMediaAsync 呼叫）

5. **建立 `lib/seller-list.js`**
   - 包 IIFE
   - 內容：L1578-L1750 的 `extractSellerProductList()` + `readPageInfo()` 及其內部 helper
   - 所有內部 helper 維持裸名稱不動
   - 暴露：`window.__SGC.extractSellerProductList`、`window.__SGC.readPageInfo`

6. **重寫 `content-boot.js`**
   - 保留 `chrome.runtime.onMessage.addListener` + `window.addEventListener('message', ...)` + 自動觸發邏輯
   - IIFE 不包第二層（已在 boot 層級）
   - **全部 6 處跨模組呼叫**需加 `__SGC.` 前綴（C-01 到 C-05 + uploadMedia 的 `__SGC.uploadMediaAsync`）
   - `checkSaveButton` / `clickSaveButton` 兩段：`findMainSaveButton()` → `__SGC.findMainSaveButton()`
   - 注意：`findMainSaveButton` 在原檔案中是巢狀在 `onMessage` callback 內部的區域函式（4 格縮排），必須在 content-boot.js 中移除該區域函式，改為 `__SGC.findMainSaveButton()` 呼叫

### Task 4：Smoke Test（手動）

#### 基本路徑（全部 6 項都要過）

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

#### 選填分支（最容易有漏改 ReferenceError 的路徑）

1. 從 DevTools Console 輸入含尺寸的測試資料：
   ```javascript
   __SGC.fillAll({ ps_product_name: '尺寸測試', ps_price: '200', ps_stock: '10', ps_length: '20', ps_width: '15', ps_height: '5' })
   ```
   → 確認「包裝尺寸」欄位被填入 20x15x5，且不報 `ReferenceError`

2. 從 DevTools Console 輸入含信用卡分期的測試資料：
   ```javascript
   __SGC.fillAll({ ps_product_name: '分期測試', ps_price: '2000', ps_stock: '10', installment: true })
   ```
   → 確認信用卡分期啟用 + 24 期被選取，且不報 `ReferenceError`

3. 從 popup 執行完整「複製商品」流程（自動觸發 `checkSaveButton` + `clickSaveButton`）
   → 確認不報 `__SGC.findMainSaveButton is not defined`

### Task 5：驗證原 content.js 可安全刪除（optional）

- 確認所有功能正常執行至少 1 天後，刪除 `extension/content.js`
- 若擔心，可先重新命名為 `content.js.bak`

---

## 附錄：現有檔案結構

```
file:///S:/projects/shopee-copy-product/extension/
├── manifest.json              ← MV3, 無 bundler
├── content.js                 ← 目標檔案（73.9KB, 1764 行, IIFE）
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
