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

// ── 工具函數 ──
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function waitForTabReady(tabId, timeout = 15000) {
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

function log(msg, type = 'info') {
  const el = document.createElement('div')
  el.className = 'log-entry ' + type
  el.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg
  $('logContainer').appendChild(el)
  el.scrollIntoView({ behavior: 'smooth' })
}

// ── 步驟 1：載入檔案 ──
$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  if (!file) return
  try {
    const text = await file.text()
    state.catalog = JSON.parse(text)
    $('fileInfo').textContent = '✅ 已載入 ' + state.catalog.length + ' 筆商品'
    $('fileInfo').className = 'step-info ok'
    $('fileInfo').style.display = 'block'
    $('step2').style.display = 'block'
  } catch (err) {
    $('fileInfo').textContent = '❌ 檔案格式錯誤：' + err.message
    $('fileInfo').className = 'step-info fail'
    $('fileInfo').style.display = 'block'
  }
})

// ── 步驟 2：掃描已上架商品 ──
$('btnScan').addEventListener('click', async () => {
  $('btnScan').disabled = true
  $('btnScan').textContent = '掃描中...'
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true })
    const sellerTab = tabs.find(t => t.url && t.url.includes('seller.shopee.tw'))
    if (!sellerTab) {
      throw new Error('請先在賣家頁面開啟此功能')
    }
    const resp = await chrome.tabs.sendMessage(sellerTab.id, { action: 'extractSellerProductList' })
    const products = resp || []
    state.existingNames = new Set(products.map(p => p.name))
    state.pending = state.catalog.filter(item => !state.existingNames.has(item.ps_product_name))
    $('scanInfo').textContent = '✅ 已上架 ' + products.length + ' 筆  待上傳 ' + state.pending.length + ' 筆'
    $('scanInfo').className = 'step-info ok'
    $('scanInfo').style.display = 'block'
    $('step3').style.display = 'block'
    $('progressText').textContent = '0 / ' + state.pending.length + ' 筆'
    $('btnStart').textContent = '開始上傳'
    $('btnStart').style.display = 'inline-block'
    $('btnStop').style.display = 'none'
  } catch (err) {
    $('scanInfo').textContent = '❌ 掃描失敗：' + err.message
    $('scanInfo').className = 'step-info fail'
    $('scanInfo').style.display = 'block'
  } finally {
    $('btnScan').disabled = false
    $('btnScan').textContent = '掃描已上架商品'
  }
})

// ── 步驟 3：開始上傳 ──
async function fillAndSave(item, tabId) {
  // 完全複製 popup.js「從剪貼簿填入」流程：
  // chrome.tabs.sendMessage({ action: 'fillProductData', data }) → 等待 response
  // 不轉換欄位、不拆兩段、不加 retry，data 直接傳 item（即 product-catalog 的一筆）
  const result = await chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data: item })

  if (!result || !result.ok) {
    throw new Error((result && result.error) || 'fillAll 失敗')
  }

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

$('btnStart').addEventListener('click', async () => {
  if (state.pending.length === 0) {
    log('沒有待上傳的商品', 'info')
    return
  }

  state.isRunning = true
  state.shouldStop = false
  state.results = []
  let consecutiveFailures = 0
  $('btnStart').style.display = 'none'
  $('btnStop').style.display = 'inline-block'
  $('btnStop').disabled = false
  $('btnStop').textContent = '暫停'
  log('開始上傳 ' + state.pending.length + ' 筆商品', 'info')

  for (let i = 0; i < state.pending.length; i++) {
    if (state.shouldStop) {
      log('使用者暫停', 'info')
      break
    }
    const item = state.pending[i]
    $('currentItem').textContent = '📄 ' + item.ps_product_name
    $('progressText').textContent = (i + 1) + ' / ' + state.pending.length + ' 筆'
    $('progressFill').style.width = ((i) / state.pending.length * 100) + '%'

    let tab = null
    try {
      tab = await chrome.tabs.create({
        url: 'https://seller.shopee.tw/portal/product/new?from=sidebar',
      })
      await waitForTabReady(tab.id)
      console.log('[SGC] batch-upload tabId:', tab.id, 'url:', tab.url, 'status:', tab.status)

      await fillAndSave(item, tab.id)

      state.results.push({ name: item.ps_product_name, ok: true })
      log('✅ ' + item.ps_product_name, 'ok')
      consecutiveFailures = 0
    } catch (e) {
      state.results.push({ name: item.ps_product_name, ok: false, error: e.message })
      log('❌ ' + item.ps_product_name + ': ' + e.message, 'fail')
      consecutiveFailures++
      if (consecutiveFailures >= 2) {
        log('⛔ 連續 ' + consecutiveFailures + ' 筆錯誤，自動暫停', 'fail')
        state.shouldStop = true
      }
    } finally {
      if (tab && tab.id) {
        try { chrome.tabs.remove(tab.id) } catch {}
      }
    }

    await sleep(3000)
  }

  state.isRunning = false
  $('btnStop').style.display = 'none'
  $('progressFill').style.width = '100%'
  log('批次上傳完成', 'info')

  $('step3').style.display = 'none'
  $('step4').style.display = 'block'
  const ok = state.results.filter(r => r.ok).length
  const fail = state.results.filter(r => !r.ok).length
  $('successCount').textContent = ok
  $('failCount').textContent = fail
  if (fail > 0) {
    const errText = state.results.filter(r => !r.ok).map(r => '❌ ' + r.name + ': ' + (r.error || '')).join('\n')
    $('errorDetail').textContent = errText
    $('errorDetail').style.display = 'block'
  }
})

$('btnStop').addEventListener('click', () => {
  state.shouldStop = true
  $('btnStop').textContent = '正在停止...'
  $('btnStop').disabled = true
})

$('btnCopyErrors').addEventListener('click', async () => {
  const errText = state.results.filter(r => !r.ok).map(r => '❌ ' + r.name + ': ' + (r.error || '')).join('\n')
  try {
    await navigator.clipboard.writeText(errText)
    log('已複製錯誤訊息', 'info')
  } catch {
    log('複製失敗', 'fail')
  }
})

$('btnRetry').addEventListener('click', () => {
  const failed = state.results.filter(r => !r.ok).map(r => r.name)
  state.pending = state.catalog.filter(item => failed.includes(item.ps_product_name))
  state.results = []
  $('step4').style.display = 'none'
  $('step3').style.display = 'block'
  $('logContainer').innerHTML = ''
  $('btnStart').click()
})

$('btnClose').addEventListener('click', () => window.close())