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

async function waitForTabReady(tabId, timeout = 25000) {
  try {
    const t = await chrome.tabs.get(tabId)
    if (t && t.status === 'complete') {
      await sleep(500)
      return
    }
  } catch { }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      reject(new Error('分頁載入超時 (25s)'))
    }, timeout)
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

async function scanProducts() {
  $('btnScan').disabled = true
  $('btnScan').textContent = '掃描中...'
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true })
    const sellerTab = tabs.find(t => t.url && t.url.includes('seller.shopee.tw/portal/product/list'))
    if (!sellerTab) {
      throw new Error('請先開啟蝦皮「我的商品」列表分頁（seller.shopee.tw/portal/product/list）')
    }
    log('目標賣家分頁: ' + sellerTab.url, 'info')

    let products = null

    // 1. 嘗試 sendMessage 通訊
    try {
      products = await chrome.tabs.sendMessage(sellerTab.id, { action: 'extractSellerProductList' })
    } catch (e) {
      console.warn('[SGC] sendMessage failed, using scripting fallback:', e.message)
    }

    // 2. 備用方案：若 Content Script 因擴充功能重載斷線，改用 chrome.scripting.executeScript 直接爬取
    if (!products || !Array.isArray(products) || products.length === 0) {
      try {
        const [scriptRes] = await chrome.scripting.executeScript({
          target: { tabId: sellerTab.id },
          func: async () => {
            const items = []
            const nameSet = new Set()

            // 1. 同源 API 優先非同步拉取 (page_size=100)
            const apiUrls = [
              '/api/v3/product/get_product_list?page_number=1&page_size=100&version=3.1.0',
              '/api/v2/product/get_item_list?page_number=1&page_size=100'
            ]
            let apiSucceeded = false
            for (const u of apiUrls) {
              try {
                const r = await fetch(u, { credentials: 'include' })
                if (!r.ok) {
                  console.error(`[SGC] API 非 200：${u} → status ${r.status} ${r.statusText}`)
                  continue
                }
                const j = await r.json()
                const list = j?.data?.list || j?.data?.products || j?.data?.items || j?.list || []
                if (Array.isArray(list) && list.length > 0) {
                  console.log(`[SGC] API 命中：${u}，原始筆數 ${list.length}`)
                  for (const item of list) {
                    const name = (item.name || item.item_name || item.title || '').trim()
                    if (name && !nameSet.has(name)) {
                      nameSet.add(name)
                      items.push({ name, productId: String(item.id || item.item_id || item.product_id || '') })
                    }
                  }
                  if (items.length > 0) return items
                }
                console.error(`[SGC] API 回 200 但解析不到商品陣列：${u}`)
              } catch (e) {
                console.error(`[SGC] API 請求例外：${u} → ${e.message}`)
              }
            }

            // 2. DOM 備用匹配：讀取當前 DOM 連結 (/portal/product/數字)
            const productLinks = Array.from(document.querySelectorAll('a[href*="/portal/product/"]')).filter(a => {
              const href = a.getAttribute('href') || a.href || ''
              return /\/portal\/product\/\d+/.test(href)
            })
            for (const link of productLinks) {
              const name = link.textContent.trim()
              if (!name || nameSet.has(name)) continue
              nameSet.add(name)
              items.push({ name })
            }
            return items
          }
        })
        if (scriptRes && scriptRes.result) products = scriptRes.result
      } catch (e) {
        console.error('[SGC] Scripting fallback failed:', e.message)
      }
    }

    if (!products || !Array.isArray(products)) {
      throw new Error('無法與蝦皮分頁建立通訊，請至蝦皮「我的商品」頁面按 F5 重新整理後重試。')
    }

    log('掃描取得 ' + products.length + ' 筆已上架商品', products.length > 0 ? 'ok' : 'info')
    state.existingNames = new Set(products.map(p => p.name))
    if (state.catalog.length > 0) {
      state.pending = state.catalog.filter(item => !state.existingNames.has(item.ps_product_name))
      $('scanInfo').textContent = '✅ 已上架 ' + products.length + ' 筆  待上傳 ' + state.pending.length + ' 筆'
    } else {
      $('scanInfo').textContent = '✅ 已掃描取得 ' + products.length + ' 筆已上架商品'
    }
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

// ── 步驟 2：選擇商品目錄 JSON 檔案 ──
$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  if (!file) return
  try {
    const text = await file.text()
    state.catalog = JSON.parse(text)
    state.pending = state.catalog.filter(item => !state.existingNames.has(item.ps_product_name))
    $('fileInfo').textContent = '✅ 已載入 ' + state.catalog.length + ' 筆目錄（已避開上架 ' + state.existingNames.size + ' 筆，待上傳 ' + state.pending.length + ' 筆）'
    $('fileInfo').className = 'step-info ok'
    $('fileInfo').style.display = 'block'
    $('step3').style.display = 'block'
    $('progressText').textContent = '0 / ' + state.pending.length + ' 筆'
    $('btnStart').textContent = '開始上傳'
    $('btnStart').style.display = 'inline-block'
    $('btnStop').style.display = 'none'
  } catch (err) {
    $('fileInfo').textContent = '❌ 檔案格式錯誤：' + err.message
    $('fileInfo').className = 'step-info fail'
    $('fileInfo').style.display = 'block'
  }
})

// ── 步驟 1 按鈕事件與自動 Landing 掃描 ──
$('btnScan')?.addEventListener('click', scanProducts)
$('btnTestScan')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'scan-test.html' })
})

// 頁面載入自動執行步驟 1 掃描
scanProducts()

// ── 步驟 3：兩段式 Fire-and-Forget 上傳單件商品 ──
async function fillAndSaveSingle(item, tabId) {
  // 1. 第一段：文字填寫 (Fire-and-Forget)
  const fillStart = await chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data: item })
  if (!fillStart || !fillStart.ok) throw new Error('無法啟動文字填寫')

  // 輪詢等待文字填寫完成 (最多 45 秒)
  let fillDone = false
  for (let i = 0; i < 150; i++) {
    await sleep(300)
    try {
      const st = await chrome.tabs.sendMessage(tabId, { action: 'checkFillStatus' })
      if (st && st.status === 'done') {
        if (st.result && st.result.ok) { fillDone = true; break }
        else throw new Error((st.result && st.result.error) || '文字填寫失敗')
      }
    } catch (e) {
      if (e.message.includes('文字填寫失敗')) throw e
    }
  }
  if (!fillDone) throw new Error('文字填寫超時 (45s)')

  // 2. 第二段：媒體上傳 (Fire-and-Forget)
  const mediaStart = await chrome.tabs.sendMessage(tabId, { action: 'uploadMedia', data: item })
  if (!mediaStart || !mediaStart.ok) throw new Error('無法啟動媒體上傳')

  // 輪詢等待媒體上傳完成 (最多 60 秒)
  let mediaDone = false
  for (let i = 0; i < 200; i++) {
    await sleep(300)
    try {
      const st = await chrome.tabs.sendMessage(tabId, { action: 'checkMediaStatus' })
      if (st && st.status === 'done') {
        if (st.result && st.result.ok) { mediaDone = true; break }
        else throw new Error((st.result && st.result.error) || '媒體上傳失敗')
      }
    } catch (e) {
      if (e.message.includes('媒體上傳失敗')) throw e
    }
  }
  if (!mediaDone) throw new Error('媒體上傳超時 (60s)')

  // 3. 第三段：按鈕檢測與點擊發布 (最多 30 秒)
  let lastReason = '等待按鈕就緒'
  for (let i = 0; i < 100; i++) {
    await sleep(300)
    try {
      const checkResult = await chrome.tabs.sendMessage(tabId, { action: 'checkSaveButton' })
      if (checkResult && checkResult.ready) {
        const clickRes = await chrome.tabs.sendMessage(tabId, { action: 'clickSaveButton' })
        if (clickRes && clickRes.ok) return true
        throw new Error((clickRes && clickRes.error) || '點擊上架按鈕失敗')
      } else if (checkResult && checkResult.reason) {
        lastReason = checkResult.reason
      }
    } catch (e) {
      if (e.message.includes('點擊上架按鈕失敗')) throw e
    }
  }
  throw new Error('儲存按鈕未就緒: ' + lastReason)
}

// ── 帶重試之單件上傳流程 ──
async function processItemWithRetry(item) {
  let tab = null
  try {
    tab = await chrome.tabs.create({
      url: 'https://seller.shopee.tw/portal/product/new?from=sidebar',
    })
    await waitForTabReady(tab.id)
    await fillAndSaveSingle(item, tab.id)
    return true
  } finally {
    if (tab && tab.id) {
      try { chrome.tabs.remove(tab.id) } catch { }
    }
  }
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
  $('btnStop').textContent = '中斷'
  log('開始上傳 ' + state.pending.length + ' 筆商品', 'info')

  for (let i = 0; i < state.pending.length; i++) {
    if (state.shouldStop) {
      log('使用者手動中斷', 'info')
      break
    }
    const item = state.pending[i]
    const startTime = Date.now()
    $('currentItem').textContent = '📄 ' + item.ps_product_name
    $('progressText').textContent = (i + 1) + ' / ' + state.pending.length + ' 筆'
    $('progressFill').style.width = ((i) / state.pending.length * 100) + '%'

    let success = false
    let lastErr = ''

    // 第一輪嘗試
    try {
      await processItemWithRetry(item)
      success = true
    } catch (e1) {
      lastErr = e1.message
      console.warn(`[SGC] Item ${item.ps_product_name} first attempt failed:`, lastErr)
    }

    // 若單筆失敗，自動等待 10 秒後重試 1 次
    if (!success && !state.shouldStop) {
      log(`⚠️ ${item.ps_product_name} 首次失敗 (${lastErr})，等待 10 秒後進行第 2 次重試...`, 'info')
      await sleep(10000)
      try {
        await processItemWithRetry(item)
        success = true
      } catch (e2) {
        lastErr = e2.message
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    if (success) {
      state.results.push({ name: item.ps_product_name, ok: true })
      log(`✅ [${elapsed}s] ${item.ps_product_name} (已成功跳轉至商品列表)`, 'ok')
      consecutiveFailures = 0
    } else {
      state.results.push({ name: item.ps_product_name, ok: false, error: lastErr })
      log('❌ ' + item.ps_product_name + ': ' + lastErr, 'fail')
      consecutiveFailures++

      // 若連續 2 筆失敗，自動觸發 60 秒冷卻等待
      if (consecutiveFailures >= 2 && !state.shouldStop) {
        log('⚠️ 連續 2 筆失敗，啟動 60 秒 WAF / 頻率限制冷卻倒數...', 'fail')
        for (let cd = 60; cd > 0; cd--) {
          if (state.shouldStop) break
          $('btnStop').textContent = `冷卻中 (${cd}s)`
          await sleep(1000)
        }
        $('btnStop').textContent = '中斷'
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
  $('btnStop').textContent = '正在中斷...'
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