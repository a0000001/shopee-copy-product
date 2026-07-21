# 023-02 — 批次上傳 Extension 分頁（實作）

> 本文件為實作文件，包含檔案清單、關鍵程式碼與開發 Tasks。
> 流程規劃與設計決策請見 [023-01 規格文件](023-01-plan-批次上傳Extension分頁規格（batch_upload_spec）.md)

## 總覽

新增一個獨立分頁 `batch-upload.html`，在賣家頁面點擊 extension icon 後可開啟此分頁，選取 `product-catalog-tw.json` 後自動逐筆上傳新商品至蝦皮，避免與已上架商品重複。

## 檔案清單

### 新增

| 檔案 | 說明 |
|------|------|
| `S:\projects\shopee-copy-product\extension\batch-upload.html` | 批次上傳分頁 UI |
| `S:\projects\shopee-copy-product\extension\batch-upload.js` | 批次上傳邏輯 |

### 修改

| 檔案 | 變更 |
|------|------|
| `S:\projects\shopee-copy-product\extension\popup.html` | 新增「批次上傳」按鈕（僅在 seller 頁面顯示） |
| `S:\projects\shopee-copy-product\extension\popup.js` | 按鈕 click → `chrome.tabs.create('batch-upload.html')` |
| `S:\projects\shopee-copy-product\extension\manifest.json` | 無需修改（無需額外權限） |

## 流程

```
使用者點擊 ICON → popup 載入 → 偵測到在 seller.shopee.tw
  → 顯示「批次上傳」按鈕
  → 點擊後 chrome.tabs.create('batch-upload.html')

batch-upload 分頁：
  1. 選取 product-catalog-tw.json
  2. 在目前 seller 分頁執行 extractSellerProductList()
  3. 比對排除已上架商品
  4. 逐筆：
     a. 開新分頁到 product/new
     b. 執行 fillAll(data)
     c. 等待完成
     d. 關分頁
  5. 顯示結果
```

## 關鍵程式碼

### 1. batch-upload.html

`S:\projects\shopee-copy-product\extension\batch-upload.html`

簡單的單頁應用，分四個區塊（步驟 1~4），用 `display:none` 切換可見性。

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; }
    .step { margin-bottom: 24px; padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; }
    .step.completed { border-color: #26aa99; }
    .progress-bar { height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: #26aa99; transition: width .3s; }
    .log { background: #f5f5f5; border-radius: 6px; padding: 10px; font-size: 12px; max-height: 200px; overflow-y: auto; font-family: monospace; }
    .log-entry { padding: 2px 0; }
    .log-entry.ok { color: #26aa99; }
    .log-entry.fail { color: #e74c3c; }
    .log-entry.info { color: #666; }
    button { padding: 8px 20px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    .btn-primary { background: #ee4d2d; color: #fff; }
    .btn-primary:disabled { opacity: .4; cursor: not-allowed; }
    .btn-secondary { background: #e0e0e0; color: #333; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .summary-card { padding: 16px; border-radius: 8px; text-align: center; }
    .summary-card.ok { background: #e8f8f5; }
    .summary-card.fail { background: #fdecea; }
    .summary-card .num { font-size: 32px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>📦 批次上傳至蝦皮</h1>

  <div id="step1" class="step">
    <h3>步驟 1：選擇商品目錄</h3>
    <input type="file" id="fileInput" accept=".json">
    <div id="fileInfo" style="display:none;margin-top:8px;color:#26aa99;"></div>
  </div>

  <div id="step2" class="step" style="display:none">
    <h3>步驟 2：掃描已上架商品</h3>
    <button id="btnScan" class="btn-primary">掃描已上架商品</button>
    <div id="scanInfo" style="display:none;margin-top:8px;"></div>
  </div>

  <div id="step3" class="step" style="display:none">
    <h3>步驟 3：開始上傳</h3>
    <div style="margin-bottom:12px;">
      <span id="progressText">0 / 0 筆</span>
    </div>
    <div class="progress-bar">
      <div id="progressFill" class="progress-fill" style="width:0%"></div>
    </div>
    <div id="currentItem" style="margin:12px 0;font-size:14px;color:#333;"></div>
    <div id="logContainer" class="log"></div>
    <div style="margin-top:12px">
      <button id="btnStart" class="btn-primary">開始上傳</button>
      <button id="btnStop" class="btn-secondary" style="display:none">暫停</button>
    </div>
  </div>

  <div id="step4" class="step" style="display:none">
    <h3>步驟 4：完成</h3>
    <div class="summary-grid">
      <div class="summary-card ok">
        <div class="num" id="successCount">0</div>
        <div>成功</div>
      </div>
      <div class="summary-card fail">
        <div class="num" id="failCount">0</div>
        <div>失敗</div>
      </div>
    </div>
    <div style="margin-top:16px">
      <button id="btnRetry" class="btn-primary">重試失敗項目</button>
      <button id="btnClose" class="btn-secondary">關閉</button>
    </div>
  </div>

  <script src="batch-upload.js"></script>
</body>
</html>
```

### 2. batch-upload.js — 核心邏輯

`S:\projects\shopee-copy-product\extension\batch-upload.js`

**核心原則：直接複製 popup.js「從剪貼簿填入」的已驗證流程，不重造輪子。**

popup.js 的流程非常簡單：
1. `chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data })`
2. 等待 response（`return true` 保持 channel open）
3. 根據 `resp.ok` 和 `resp.results` 顯示結果

batch-upload.js 照做就好，唯一需要額外處理的是：新開的分頁可能因 SPA 重新導向導致 content script 被重注入，需加入「重試機制」。

```javascript
// ── 狀態 ──
const state = {
  catalog: [],
  existingNames: new Set(),
  pending: [],
  results: [],
  isRunning: false,
  shouldStop: false,
}

// ── DOM ──
const $ = id => document.getElementById(id)

// ── 步驟 1：載入檔案 ──
$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  if (!file) return
  try {
    const text = await file.text()
    state.catalog = JSON.parse(text)
    $('fileInfo').textContent = `✅ 已載入 ${state.catalog.length} 筆商品`
    $('fileInfo').style.display = 'block'
    $('step2').style.display = 'block'
  } catch (err) {
    $('fileInfo').textContent = `❌ 檔案格式錯誤：${err.message}`
    $('fileInfo').style.color = '#e74c3c'
    $('fileInfo').style.display = 'block'
  }
})

// ── 步驟 2：掃描已上架商品 ──
$('btnScan').addEventListener('click', async () => {
  $('btnScan').disabled = true
  $('btnScan').textContent = '掃描中...'
  try {
    // 不在 active 找，而是遍歷當前視窗所有分頁
    // 因為 batch-upload.html 用 chrome.tabs.create() 開新分頁後，
    // 新分頁會變成 active，原本的 seller 分頁不再是 active
    const tabs = await chrome.tabs.query({ currentWindow: true })
    const sellerTab = tabs.find(t => t.url && t.url.includes('seller.shopee.tw'))
    if (!sellerTab) {
      throw new Error('請先在賣家頁面開啟此功能')
    }
    const resp = await chrome.tabs.sendMessage(sellerTab.id, { action: 'extractSellerProductList' })
    const products = resp || []
    state.existingNames = new Set(products.map(p => p.name))
    state.pending = state.catalog.filter(item => !state.existingNames.has(item.ps_product_name))
    $('scanInfo').textContent = `✅ 已上架 ${products.length} 筆  待上傳 ${state.pending.length} 筆`
    $('scanInfo').style.display = 'block'
    $('step3').style.display = 'block'
    $('progressText').textContent = `0 / ${state.pending.length} 筆`
  } catch (err) {
    $('scanInfo').textContent = `❌ 掃描失敗：${err.message}`
    $('scanInfo').style.color = '#e74c3c'
    $('scanInfo').style.display = 'block'
  } finally {
    $('btnScan').disabled = false
    $('btnScan').textContent = '掃描已上架商品'
  }
})

// ── 步驟 3：開始上傳 ──
function log(msg, type = 'info') {
  const el = document.createElement('div')
  el.className = `log-entry ${type}`
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
  $('logContainer').appendChild(el)
  el.scrollIntoView({ behavior: 'smooth' })
}

// ── 工具函數 ──
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// 等待分頁完全載入
function waitForTabReady(tabId, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('分頁載入超時')), timeout)
    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated)
        clearTimeout(timer)
        setTimeout(() => resolve(), 500)
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

async function fillAndSave(item, tabId) {
  // 直接複製 popup.js「從剪貼簿填入」的流程：
  // chrome.tabs.sendMessage({ action: 'fillProductData', data }) → 等待 response
  const data = { ... } // 同 popup.js 的資料轉換

  const result = await chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data })

  if (!result || !result.ok) {
    throw new Error((result && result.error) || 'fillAll 失敗')
  }

  // 等待儲存按鈕啟用（輪詢60秒，每秒1次）
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    try {
      const checkResult = await chrome.tabs.sendMessage(tabId, { action: 'checkSaveButton' })
      if (checkResult && checkResult.ready) {
        await chrome.tabs.sendMessage(tabId, { action: 'clickSaveButton' })
        return true
      }
    } catch {}
  }
  throw new Error('等待儲存按鈕超時')
}

// 等待分頁完全載入，且 content script 可通訊
// content_scripts 設定 run_at: document_idle，故需等 status === 'complete'
function waitForTabReady(tabId, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('分頁載入超時')), timeout)

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated)
        clearTimeout(timer)
        // 稍微再等一下讓 content script 初始化
        setTimeout(() => resolve(), 500)
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

async function fillAndSave(item, tabId) {
  // 轉換格式
  const data = {
    title: item.ps_product_name,
    price: item.ps_price,
    description: item.ps_product_description,
    images: item.images || [],
    videos: item.videos || [],
    ps_category: item.ps_category,
    ps_stock: item.ps_stock || 999,
    ps_sku_short: item.ps_sku_short || '',
    ps_brand: item.ps_brand || 'NoBrand',
    ps_length: item.ps_length || 10,
    ps_width: item.ps_width || 10,
    ps_height: item.ps_height || 4,
    installment: item.installment || 24,
    ps_item_cover_image: item.ps_item_cover_image || '',
    url: item.url || '',
  }

  // 觸發填入
  const result = await chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data })

  if (!result?.ok) {
    throw new Error(result?.error || 'fillAll 失敗')
  }

  // 檢查個別欄位是否有失敗
  // fillAll 回傳 { ok: true, results: [{ field, ok, error? }, ...] }
  // ok=true 不代表每個欄位都成功，需檢查 results 中是否有 ok=false
  const failedFields = (result.results || []).filter(r => !r.ok)
  if (failedFields.length > 0) {
    const errors = failedFields.map(r => `${r.field}: ${r.error || '未知'}`).join('; ')
    throw new Error(`欄位填入失敗: ${errors}`)
  }

  // 等待「儲存」按鈕啟用 + 點擊
  // 解法：fillAll 回傳後，輪詢 checkSaveButton 直到按鈕可點擊
  for (let i = 0; i < 30; i++) {
    await sleep(500)
    try {
      const checkResult = await chrome.tabs.sendMessage(tabId, { action: 'checkSaveButton' })
      if (checkResult?.ready) {
        await chrome.tabs.sendMessage(tabId, { action: 'clickSaveButton' })
        return true
      }
    } catch {}
  }
  throw new Error('等待儲存按鈕超時')
}

$('btnStart').addEventListener('click', async () => {
  state.isRunning = true
  state.shouldStop = false
  state.results = []
  $('btnStart').style.display = 'none'
  $('btnStop').style.display = 'inline-block'
  log(`開始上傳 ${state.pending.length} 筆商品`, 'info')

  for (let i = 0; i < state.pending.length; i++) {
    if (state.shouldStop) {
      log('使用者暫停', 'info')
      break
    }
    const item = state.pending[i]
    $('currentItem').textContent = `📄 ${item.ps_product_name}`
    $('progressText').textContent = `${i + 1} / ${state.pending.length} 筆`
    $('progressFill').style.width = `${((i) / state.pending.length) * 100}%`

    let tab = null
    try {
      tab = await chrome.tabs.create({
        url: 'https://seller.shopee.tw/portal/product/new?from=sidebar',
        active: false
      })
      await waitForTabReady(tab.id)

      await fillAndSave(item, tab.id)

      state.results.push({ name: item.ps_product_name, ok: true })
      log(`✅ ${item.ps_product_name}`, 'ok')
    } catch (e) {
      state.results.push({ name: item.ps_product_name, ok: false, error: e.message })
      log(`❌ ${item.ps_product_name}: ${e.message}`, 'fail')
    } finally {
      if (tab?.id) {
        try { chrome.tabs.remove(tab.id) } catch {}
      }
    }

    // 每筆間隔 3 秒，避免觸發 WAF
    await sleep(3000)
  }

  state.isRunning = false
  $('btnStop').style.display = 'none'
  $('progressFill').style.width = '100%'
  log('批次上傳完成', 'info')

  // 顯示完成頁
  $('step3').style.display = 'none'
  $('step4').style.display = 'block'
  const ok = state.results.filter(r => r.ok).length
  const fail = state.results.filter(r => !r.ok).length
  $('successCount').textContent = ok
  $('failCount').textContent = fail
})

$('btnStop').addEventListener('click', () => {
  state.shouldStop = true
  $('btnStop').textContent = '正在停止...'
  $('btnStop').disabled = true
})

$('btnRetry').addEventListener('click', () => {
  const failed = state.results.filter(r => !r.ok).map(r => r.name)
  state.pending = state.catalog.filter(item => failed.includes(item.ps_product_name))
  state.results = []
  $('step4').style.display = 'none'
  $('step3').style.display = 'block'
  $('btnStart').click()
})

$('btnClose').addEventListener('click', () => window.close())
```

### 3. popup.html / popup.js 修改

`S:\projects\shopee-copy-product\extension\popup.html` — 在 seller 模式新增按鈕：

```html
<div class="btn-row" style="margin-top:12px;border-top:1px solid #e0e0e0;padding-top:12px">
  <button id="btnBatchUpload" class="btn-primary">📦 批次上傳</button>
</div>
```

`S:\projects\shopee-copy-product\extension\popup.js` — 在 `initSellerMode()` 加入：

```javascript
$('btnBatchUpload').addEventListener('click', () => {
  chrome.tabs.create({ url: 'batch-upload.html' })
})
```

### 4. content.js 新增兩個 handler

`S:\projects\shopee-copy-product\extension\content.js`

在 `chrome.runtime.onMessage` 區塊新增：

```javascript
if (msg.action === 'checkSaveButton') {
  const btns = document.querySelectorAll('button')
  const btn = Array.from(btns).find(b => /儲存|保存|確認/.test(b.textContent))
  sendResponse({ ready: !!btn && !btn.disabled })
  return true
}

if (msg.action === 'clickSaveButton') {
  const btns = document.querySelectorAll('button')
  const btn = Array.from(btns).find(b => /儲存|保存|確認/.test(b.textContent))
  if (btn) { btn.click(); sendResponse({ ok: true }) }
  else sendResponse({ ok: false, error: '找不到儲存按鈕' })
  return true
}
```

## 尚未確定的問題

1. **儲存按鈕的 selector** — 已修正為 `Array.from(btns).find(b => /儲存|保存|確認/.test(b.textContent))`，但仍需到蝦皮 seller 後台實際頁面確認按鈕文字是否匹配

2. **WAF 頻率限制** — 蝦皮可能對短時間大量新增商品有頻率限制。3 秒間隔是否足夠？需實際測試後才能確定。

3. **新開分頁的 `fillProductData` 失敗（Illegal invocation）** — `fillAndSave` 已完全複製 popup.js 的單行流程 `chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data: item })`，但仍拋出「Illegal invocation」。  
   popup 對已開啟的分頁發送正常，但 batch-upload 對 `chrome.tabs.create` 新開的分頁發送失敗。  
   **需用 DevTools 實際連線 seller 新商品頁面，檢查：**
   - 頁面是否在載入過程中有 SPA 重新導向
   - `document_idle` 時 content script 是否已注入
   - 直接對該分頁執行 `chrome.runtime.sendMessage` 是否正常

## Tasks

### Task 1: 新增 content.js handler

**檔案：** `S:\projects\shopee-copy-product\extension\content.js`

在 `chrome.runtime.onMessage.addListener` 區塊新增 `checkSaveButton` 和 `clickSaveButton` 兩個 handler。

Smoke test：
1. 開啟 seller.shopee.tw/portal/product/new
2. 在 console 執行 `chrome.runtime.sendMessage({ action: 'checkSaveButton' }, console.log)`
3. 確認回傳 `{ ready: false }`（因為尚未填入資料）
4. 手動填一些資料，再執行一次，確認 `{ ready: true }`

### Task 2: 修改 popup.html + popup.js 加入批次上傳按鈕

**檔案：** `S:\projects\shopee-copy-product\extension\popup.html`、`S:\projects\shopee-copy-product\extension\popup.js`

在 seller 模式新增「批次上傳」按鈕，點擊後開啟 `batch-upload.html`。

Smoke test：
1. 在 seller.shopee.tw 任一頁面點擊 ICON
2. 確認 popup 有「批次上傳」按鈕
3. 點擊後開啟新分頁到 `batch-upload.html`

### Task 3: 實作 batch-upload.html + batch-upload.js

**檔案：** `S:\projects\shopee-copy-product\extension\batch-upload.html`、`S:\projects\shopee-copy-product\extension\batch-upload.js`

Smoke test：
1. 開啟 batch-upload.html
2. 選取 `product-catalog-tw.json`
3. 點「掃描已上架商品」→ 確認顯示已上架/待上傳筆數
4. 點「開始上傳」→ 確認逐筆開分頁（使用 `waitForTabReady` 等待載入）、填入、檢查 `fillAll` 回傳的 `results` 是否有失敗欄位、關分頁
5. 手動中斷（關閉分頁）→ 重新掃描 → 確認已上傳的筆數被排除
6. 確認完成頁顯示成功/失敗筆數

### Task 4: 整合測試

1. 確保所有步驟在一個完整流程中運作
2. 測試暫停按鈕正常運作
3. 測試重試失敗項目
4. 測試中斷後重新掃描確實排除已上架商品