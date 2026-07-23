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

async function waitForTabReady(tabId, timeout = 30000) {
  const startTime = Date.now()
  
  // 1. 等待頁面基本 status complete
  let isComplete = false
  while (Date.now() - startTime < timeout) {
    try {
      const t = await chrome.tabs.get(tabId)
      if (t && t.status === 'complete') {
        isComplete = true
        break
      }
    } catch { }
    await sleep(200)
  }
  
  if (!isComplete) throw new Error('分頁載入狀態逾時 (30s)')

  // 2. 主動 Ping Content Script 確保通訊已建立
  while (Date.now() - startTime < timeout) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'ping' })
      if (res && res.ok) {
        await sleep(500) // 預留一點緩衝時間讓 Vue 掛載事件
        return true
      }
    } catch (e) {
      // 忽略錯誤，繼續輪詢 (這就是過濾 Receiving end does not exist)
    }
    await sleep(400)
  }
  
  throw new Error('與蝦皮分頁通訊逾時 (Content Script 未啟動或遭阻擋)')
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

            function collectDOM() {
              for (const a of document.querySelectorAll('a[href*="/portal/product/"]')) {
                const href = a.getAttribute('href') || ''
                if (!/\/portal\/product\/\d+/.test(href)) continue
                const name = a.textContent.trim()
                if (!name || nameSet.has(name)) continue
                nameSet.add(name)
                const idMatch = href.match(/\/portal\/product\/(\d+)/)
                items.push({ name, productId: idMatch ? idMatch[1] : '' })
              }
            }
            function readTotal() {
              const t = document.body?.textContent || ''
              const m = t.match(/總計\s*(\d+)\s*項/)||t.match(/共\s*(\d+)\s*筆/)||t.match(/(\d+)\s*件\s*商品/)||t.match(/架上商品\((\d+)\)/)
              return m ? parseInt(m[1]) : 0
            }
            function clickNext() {
              for (const s of ['.eds-pager__button-next','[class*="pager"] [class*="next"]','.eds-pagination__next button,.eds-pagination__next','[class*="pagination"] [class*="next"] button','button[class*="next"],a[class*="next"]','li.next a,li.next button,.ant-pagination-next']) {
                const e = document.querySelector(s)
                if (!e) continue
                if (e.disabled||e.classList.contains('disabled')||e.getAttribute('aria-disabled')==='true') return false
                e.click(); return true
              }
              return false
            }
            function waitTable(t) {
              const tb = document.querySelector('.eds-table__body,table tbody,[class*="table__body"]')||document.querySelector('table')
              if (!tb) return new Promise(r=>setTimeout(r,2000))
              return new Promise(r=>{let l=tb.innerHTML;const o=new MutationObserver(()=>{if(tb.innerHTML!==l){o.disconnect();setTimeout(r,400)}});o.observe(tb,{childList:true,subtree:true});setTimeout(()=>{o.disconnect();r()},t||6000)})
            }

            // 1. API (main world - usually blocked by Shopee, supplement only, no early return)
            const cds = (document.cookie.match(/(?:^|;\s*)SPC_CDS=([^;]+)/)||[])[1]||''
            try {
              const r = await fetch('/api/v3/opt/mpsku/list/v2/search_product_list?SPC_CDS='+encodeURIComponent(cds)+'&SPC_CDS_VER=2&page_size=100&list_type=live_all&request_attribute=&operation_sort_by=recommend_v4&need_ads=false',{credentials:'include'})
              if (r.ok) {
                const list = (await r.json())?.data?.products||[]
                if (list.length>0) { for (const p of list) { const n=(p.name||'').trim(); if(n&&!nameSet.has(n)){nameSet.add(n);items.push({name:n,productId:String(p.id||'')})}}}
              }
            } catch(e) {}

            // 2. SPA click pagination (Plan B - always runs, confirmed working)
            //    Old: while(cur<pages&&items.length<total) - breaks if readTotal()=0
            //    New: keep clicking until next-button gone or no new items
            collectDOM()
            let cur=parseInt(new URL(location.href).searchParams.get('page')||'1')
            const MAX=50; let visited=0
            while (visited<MAX) {
              if (!clickNext()) break
              await waitTable()
              const prev=items.length; collectDOM(); visited++
              cur=parseInt(new URL(location.href).searchParams.get('page')||String(cur+1))
              if (items.length===prev) break
              const t=readTotal(); if(t>0&&items.length>=t) break
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
  let sawRunning = false
  let navigationDetected = false

  const onUpdated = (updatedTabId, info) => {
    if (updatedTabId === tabId && info.status === 'loading' && sawRunning) {
      navigationDetected = true
    }
  }
  chrome.tabs.onUpdated.addListener(onUpdated)

  try {
    // 1. 第一段：文字填寫 (Fire-and-Forget, 跳過媒體上傳避免重複與超時)
    const fillStart = await chrome.tabs.sendMessage(tabId, { action: 'fillProductData', data: { ...item, skipMedia: true } })
    if (!fillStart || !fillStart.ok) throw new Error('無法啟動文字填寫')

    // 輪詢等待文字填寫完成 (最多 45 秒)
    let fillDone = false
    for (let i = 0; i < 150; i++) {
      await sleep(300)
      if (navigationDetected) {
        throw new Error('偵測到分頁於文字填寫期間發生導航/重新載入，content script 狀態已遺失')
      }
      try {
        const st = await chrome.tabs.sendMessage(tabId, { action: 'checkFillStatus' })
        if (st && st.status === 'running') sawRunning = true
        if (st && st.status === 'done') {
          if (st.result && st.result.ok) { fillDone = true; break }
          else throw new Error((st.result && st.result.error) || '文字填寫失敗')
        }
      } catch (e) {
        if (e.message.includes('文字填寫失敗') || e.message.includes('偵測到分頁')) throw e
      }
    }
    if (!fillDone) throw new Error('文字填寫超時 (45s)')
  } finally {
    chrome.tabs.onUpdated.removeListener(onUpdated)
  }

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
  const failed = state.results.filter(r => !r.ok)
  let copyContent = `=== 蝦皮批次上傳診斷報告 (${new Date().toLocaleString()}) ===\n`
  copyContent += `總計: ${state.results.length} 筆 | 成功: ${state.results.filter(r=>r.ok).length} 筆 | 失敗: ${failed.length} 筆\n\n`
  
  if (failed.length > 0) {
    copyContent += `--- 失敗項目列表 ---\n`
    failed.forEach(r => {
      copyContent += `❌ ${r.name}\n   原因: ${r.error || '未知錯誤'}\n`
    })
    copyContent += `\n`
  }

  const logEntries = Array.from(document.querySelectorAll('#logContainer .log-entry')).map(el => el.textContent)
  if (logEntries.length > 0) {
    copyContent += `--- 完整執行 Log (${logEntries.length} 條) ---\n`
    copyContent += logEntries.join('\n')
  }

  try {
    await navigator.clipboard.writeText(copyContent)
    log('已複製完整診斷報告與 Log 至剪貼簿', 'ok')
  } catch (err) {
    log('複製失敗: ' + err.message, 'fail')
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