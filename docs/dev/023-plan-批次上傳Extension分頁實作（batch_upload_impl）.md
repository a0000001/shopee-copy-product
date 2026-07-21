# 023 — 批次上傳 Extension 分頁 實作文件

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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.url.includes('seller.shopee.tw')) {
      throw new Error('請先在賣家頁面開啟此功能')
    }
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'extractSellerProductList' })
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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
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

  // 等待「儲存」按鈕啟用 + 點擊
  // 問題：如何確定 fillAll 完成且表單可提交？
  // 解法：fillAll 回傳後，等待一段時間讓 Vue 更新 DOM，再找儲存按鈕
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
      await sleep(3000)  // 等待頁面初始載入

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
  const btn = document.querySelector('button:contains("儲存"), button:contains("保存"), button:contains("確認")')
  sendResponse({ ready: !!btn && !btn.disabled })
  return true
}

if (msg.action === 'clickSaveButton') {
  const btn = document.querySelector('button:contains("儲存"), button:contains("保存"), button:contains("確認")')
  if (btn) { btn.click(); sendResponse({ ok: true }) }
  else sendResponse({ ok: false, error: '找不到儲存按鈕' })
  return true
}
```

## 尚未確定的問題

1. **`checkSaveButton` 的 selector** — `button:contains()` 不是標準 CSS selector。蝦皮 seller 頁面的儲存按鈕用什麼方式選取？需要先手動觀察 DOM。可能要用 `Array.from(document.querySelectorAll('button')).find(b => /儲存|保存|確認/.test(b.textContent))`

2. **`fillAll()` 的成功判斷** — `fillAll()` 目前回傳 `{ ok: true, results: [...] }`。但即使某些欄位失敗，`ok` 仍可能為 `true`。是否需要更嚴格的判斷？

3. **分頁管理** — `chrome.tabs.create()` 建立的分頁在背景載入，content script 可能無法立即注入。需等待 tab 完全載入後再發送訊息。目前用 `sleep(3000)` 不太可靠，應該用 `chrome.tabs.onUpdated` 監聽 `complete` 狀態。

4. **WAF 觸發** — 蝦皮可能對短時間大量新增商品有頻率限制。3 秒間隔是否足夠？是否需要動態調整（連續失敗時增加間隔）？

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
4. 點「開始上傳」→ 確認逐筆開分頁、填入、關分頁
5. 確認完成頁顯示成功/失敗筆數

### Task 4: 整合測試

1. 確保所有步驟在一個完整流程中運作
2. 測試暫停按鈕正常運作
3. 測試重試失敗項目
4. 測試中斷後重新掃描確實排除已上架商品