# 023-02 — 批次上傳 Extension 分頁（實作與最新進度）

> 本文件為 Chrome Extension 批次上傳功能的技術實作與最新狀態對齊文件，專為可直接提供給第三方 LLM（如 Claude Web）閱讀設計，包含完整脈絡、絕對路徑關鍵程式碼、重大突破修復紀錄、實測診斷結果、待解決問題與 Tasks。
> 關聯文件：
> - 頁面 DOM 分析：`file:///S:/projects/shopee-copy-product/docs/data/mcp devtools 蒐集的蝦皮資料/001-賣家中心新增商品（seller-new-product-dom-analysis）.md`
> - 事前預防與事後檢查規範：`file:///S:/projects/share/AI技巧/023-改壞檔案-事前預防與事後檢查.md`

---

## 一、 專案架構與檔案清單

### 1. 檔案與絕對路徑

| 檔案 | 說明 | 絕對路徑 |
|------|------|----------|
| `content.js` | 注入蝦皮賣家中心頁面之 Content Script（表單填寫、媒體上傳、按鈕檢測、已上架爬取與診斷 Log） | `file:///S:/projects/shopee-copy-product/extension/content.js` |
| `batch-upload.js` | 批次上傳獨立分頁主邏輯（Landing 自動掃描、選檔去重、兩段式 Fire-and-Forget 輪詢） | `file:///S:/projects/shopee-copy-product/extension/batch-upload.js` |
| `batch-upload.html` | 批次上傳 UI 介面（步驟 1：掃描已上架 → 步驟 2：選擇 JSON → 步驟 3：開始上傳） | `file:///S:/projects/shopee-copy-product/extension/batch-upload.html` |
| `scan-test.html` | 獨立已上架商品掃描測試工具 HTML（含 Logo 返回按鈕） | `file:///S:/projects/shopee-copy-product/extension/scan-test.html` |
| `scan-test.js` | 獨立已上架商品掃描測試工具 JS（含 `scripting` 注入降級防禦與診斷 Log） | `file:///S:/projects/shopee-copy-product/extension/scan-test.js` |
| `batch-upload-test.html` | 獨立單件填寫發布測試套件 HTML（含 Logo 返回按鈕） | `file:///S:/projects/shopee-copy-product/extension/batch-upload-test.html` |
| `batch-upload-test.js` | 獨立單件填寫發布測試套件 JS（含 23 項單元/DOM 斷言） | `file:///S:/projects/shopee-copy-product/extension/batch-upload-test.js` |
| `manifest.json` | Extension 清單檔（含 `tabs`, `scripting`, `storage` 權限） | `file:///S:/projects/shopee-copy-product/extension/manifest.json` |

---

## 二、 當前架構與實測診斷結果 (2026-07-22 Console 實測)

### 1. 蝦皮賣家中心 (`seller.shopee.tw/portal/product/list`) Console 實測輸出

使用者於蝦皮賣家中心頁面直接執行診斷腳本，取得以下**100% 事實數據**：

```
=== SGC 診斷開始 ===
[診斷] DOM 商品連結數量: 12
[診斷] 分頁容器 outerHTML 前 500 字: <div data-v-cd68733c="" class="product-list-section product-and-pagination-wrap-v2 list"><div data-v-f21626d6="" data-v-cd68733c="" class="product-list-container" show-boost-info="true" style="width: 976px;"><div data-v-f2ae152c="" data-v-f21626d6="" class="eds-table eds-table-scrollX-left product-list-view mpsku-list">...
[診斷] window.__INITIAL_STATE__ 是否存在: false
[診斷] /api/v3/product/get_product_list?page_number=1&page_size=100&version=3.1.0 → status 503 (ERROR_SP_SERVICE_NOT_FOUND)
[診斷] /api/v2/product/get_item_list?page_number=1&page_size=100 → status 404
=== SGC 診斷結束 ===
```

### 2. 實測解讀與確立之事實
1. **DOM 筆數**：第 1 頁 DOM 中精確存在 **12 筆** 商品連結 (`/\/portal\/product\/\d+/`)，0 雜訊。第 13~26 筆在第 2、3 頁未渲染。
2. **全域 State**：`window.__INITIAL_STATE__` 為 `false`（確定為 Vue 3 純前端渲染）。
3. **猜測 API 結論**：`/api/v3/product/get_product_list` (503 Service Not Found) 與 `/api/v2/product/get_item_list` (404 Not Found) **確定皆非蝦皮實際使用之 API 端點**。
4. **分頁容器 HTML Class**：確定為 **`.product-and-pagination-wrap-v2`** 及 **`.product-list-section`**。

---

## 三、 關鍵程式碼片段

### 1. Landing 自動執行步驟 1 掃描 (`batch-upload.js`)
檔案路徑：`file:///S:/projects/shopee-copy-product/extension/batch-upload.js`

```javascript
async function scanProducts() {
  $('btnScan').disabled = true
  $('btnScan').textContent = '掃描中...'
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true })
    const sellerTab = tabs.find(t => t.url && t.url.includes('seller.shopee.tw/portal/product/list'))
    if (!sellerTab) {
      throw new Error('請先開啟蝦皮「我的商品」列表分頁（seller.shopee.tw/portal/product/list）')
    }

    let products = null
    try {
      products = await chrome.tabs.sendMessage(sellerTab.id, { action: 'extractSellerProductList' })
    } catch (e) {
      console.warn('[SGC] sendMessage failed, using scripting fallback:', e.message)
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      const [scriptRes] = await chrome.scripting.executeScript({
        target: { tabId: sellerTab.id },
        func: async () => { /* DOM 連結精確抓取 */ }
      })
      if (scriptRes && scriptRes.result) products = scriptRes.result
    }

    log('掃描取得 ' + products.length + ' 筆已上架商品', products.length > 0 ? 'ok' : 'info')
    state.existingNames = new Set(products.map(p => p.name))
    $('scanInfo').textContent = '✅ 已掃描取得 ' + products.length + ' 筆已上架商品'
    $('scanInfo').className = 'step-info ok'
    $('scanInfo').style.display = 'block'
    $('step2').style.display = 'block'
  } catch (err) {
    $('scanInfo').textContent = '❌ 掃描失敗：' + err.message
    $('scanInfo').className = 'step-info fail'
    $('scanInfo').style.display = 'block'
  } finally {
    $('btnScan').disabled = false
    $('btnScan').textContent = '重新掃描'
  }
}

// 頁面載入自動執行步驟 1 掃描
scanProducts()
```

### 2. 已上架商品 DOM 採集函式 `extractSellerProductList()` (`content.js`)
檔案路徑：`file:///S:/projects/shopee-copy-product/extension/content.js`

```javascript
async function extractSellerProductList() {
  const items = []
  const nameSet = new Set()

  // DOM 精確匹配：包含商品 ID 的連結 (/portal/product/數字)
  const productLinks = Array.from(document.querySelectorAll('a[href*="/portal/product/"]')).filter(a => {
    const href = a.getAttribute('href') || a.href || ''
    return /\/portal\/product\/\d+/.test(href)
  })

  for (const link of productLinks) {
    const name = link.textContent.trim()
    if (!name || nameSet.has(name)) continue
    nameSet.add(name)

    const href = link.getAttribute('href') || link.href || ''
    const idMatch = href.match(/\/portal\/product\/(\d+)/)

    items.push({
      name,
      productId: idMatch ? idMatch[1] : '',
      sku: '',
      url: link.href || '',
      price: '',
    })
  }

  return items
}
```

---

## 四、 重大突破與目前懸而未決的開放問題 (Open Questions)

### 1. 歷史重大突破紀錄 (2026-07-22)
> [!IMPORTANT]
> **🔥 `checkSaveButton` 的 `isDisabled` 布林邏輯漏洞攻克**
> 團隊曾困擾數小時：按鈕精確定位到 `「儲存並上架」`，但 `checkSaveButton` 永遠回報 `ready: false` / `disabled`。
> 由 **Claude Sonnet 5 (reasoning effort: extra < max)** 拆解找出：舊程式中 `btn.getAttribute('disabled') !== 'true'` 在按鈕 Enabled 時 `getAttribute` 回傳 `null`，而 `null !== 'true'` 評估為 `true`，導致 `isDisabled` 被硬性算成 `true`！
> 改為 `hasAttribute('disabled')` 後，單元測試 23/23 項全過，實測成功發布！

---

### 2. 當前最新待解決問題 (Open Questions for Claude Web)

**背景：已確立分頁容器為 `.product-and-pagination-wrap-v2`，猜測 REST API 端點已證實無效**

* **已知數據**：
  - 分頁容器 class 為 `.product-and-pagination-wrap-v2`。
  - 當前頁 DOM 確實為 12 筆商品，無任何雜訊。

* **諮詢與待解答問題 (Open Questions)**：

  1. **問題 A：如何針對 `.product-and-pagination-wrap-v2` 容器內的「下一頁」或「每頁 100 筆」進行 DOM 操作？**
     - 請教在 `.product-and-pagination-wrap-v2` 結構下，如何精確取得下一頁按鈕或下拉選單的子元素 Selector？
     - 執行以下 Console 檢測指令可直接列出 `.product-and-pagination-wrap-v2` 內部所有按鈕：
       ```javascript
       const p = document.querySelector('.product-and-pagination-wrap-v2')
       console.log(Array.from(p.querySelectorAll('button, .eds-button, .eds-select')).map(el => ({ tag: el.tagName, cls: el.className, text: el.textContent.trim() })))
       ```

  2. **問題 B：DevTools Network 實測真 API 端點**
     - 手動在分頁點擊下一頁，於 Network 標籤過濾 `Fetch/XHR`，即可秒級取得真正的 URL 端點與 Response JSON。

---

## 五、 Tasks (開發與測試任務)

### Task 1: 依據 `.product-and-pagination-wrap-v2` 精確取得全量 26 筆商品

**目標**：透過 `.product-and-pagination-wrap-v2` 內部的分頁控制項或正確 API，精確回傳 26 筆商品。

**異動檔案**：
- `file:///S:/projects/shopee-copy-product/extension/content.js`
- `file:///S:/projects/shopee-copy-product/extension/batch-upload.js`
- `file:///S:/projects/shopee-copy-product/extension/scan-test.js`

**Smoke Test (冒煙測試)**：
1. 打開 `batch-upload.html` 或 `scan-test.html`。
2. **預期結果**：頁面 Landing 即自動完成掃描，印出 `✅ 成功掃描取得 26 筆商品`。

---

### Task 2: 批次上傳端到端發布與去重驗證（待 Task 1 掃描數確認 26 筆後執行）

**目標**：驗證 26 筆真實商品精確去重後，`pending` 上傳清單數量為 `總目錄筆數 - 26`，進行安全批次上傳。