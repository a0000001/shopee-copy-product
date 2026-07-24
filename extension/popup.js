const $ = id => document.getElementById(id)

const DEFAULT_SERVER = 'http://localhost:9801'
const STORAGE_KEY_AUTO_CATALOG = 'autoCatalogOnCopy'
const STORAGE_KEY_AUTO_SAVE_ON_FILL = 'autoSaveOnFill'

let _serverUrl = DEFAULT_SERVER

async function loadServerUrl() {
  try {
    const result = await chrome.storage.sync.get('serverUrl')
    if (result.serverUrl) {
      _serverUrl = result.serverUrl.replace(/\/+$/, '')
    }
  } catch {
    // 無 storage 權限或首次使用，維持預設
  }
}

async function loadAutoCatalogSetting() {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY_AUTO_CATALOG)
    const checked = result[STORAGE_KEY_AUTO_CATALOG] === true
    const chk = $('chkAutoCatalog')
    if (chk) {
      chk.checked = checked
      chk.parentElement.classList.toggle('checked', checked)
    }
  } catch { }
}

async function saveAutoCatalogSetting(checked) {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY_AUTO_CATALOG]: checked })
  } catch { }
}

async function loadAutoSaveSetting() {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY_AUTO_SAVE_ON_FILL)
    const checked = result[STORAGE_KEY_AUTO_SAVE_ON_FILL] === true
    const chk = $('chkAutoSaveOnFill')
    if (chk) {
      chk.checked = checked
      chk.parentElement.classList.toggle('checked', checked)
    }
  } catch { }
}

async function saveAutoSaveSetting(checked) {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY_AUTO_SAVE_ON_FILL]: checked })
  } catch { }
}

function initAutoSaveCheckbox() {
  const chk = $('chkAutoSaveOnFill')
  if (!chk) return
  chk.addEventListener('change', async () => {
    const checked = chk.checked
    chk.parentElement.classList.toggle('checked', checked)
    await saveAutoSaveSetting(checked)
  })
}

function initAutoCatalogCheckbox() {
  const chk = $('chkAutoCatalog')
  if (!chk) return
  chk.addEventListener('change', async () => {
    if (chk.checked) {
      chk.parentElement.classList.add('checked')
      await saveAutoCatalogSetting(true)
    } else {
      if (!confirm('確定要關閉「複製時自動更新JSON至目錄」功能？')) {
        chk.checked = true
        return
      }
      chk.parentElement.classList.remove('checked')
      await saveAutoCatalogSetting(false)
    }
  })
}

async function submitToCatalog(data, silent) {
  try {
    const json = toJsonClipboard(data)
    const product = JSON.parse(json)[0]
    console.log('[SGC] submitToCatalog sending appendToCatalog msg')
    const result = await chrome.runtime.sendMessage({
      action: 'appendToCatalog',
      serverUrl: _serverUrl,
      product,
    })
    console.log('[SGC] submitToCatalog result:', result)
    if (silent) {
      if (result?.ok) return result
      showErrorModal(result?.error || '伺服器錯誤')
      return result
    }
    if (result?.ok && result.action === 'appended') {
      showToast('✅ 已寫入目錄')
    } else if (result?.ok && result.action === 'appended_with_warning') {
      showToast('⚠️ ' + (result.reason || '已寫入，但名稱相似'))
    } else if (result?.ok && result.action === 'merged') {
      showToast('📝 ' + (result.reason || '已更新既有資料'))
    } else if (result?.ok && result.action === 'skipped') {
      showToast('⏭ ' + result.reason)
    } else {
      showErrorModal(result?.error || '伺服器錯誤')
    }
  } catch (e) {
    if (silent) return { ok: false, error: e.message }
    showErrorModal('無法連線 (' + _serverUrl + '): ' + e.message)
  }
}

async function updateServerStatus() {
  const indicator = $('serverIndicator')
  const btn = $('btnServerToggle')
  if (!indicator) return

  indicator.className = 'server-status spin'
  indicator.title = '檢查中…'

  try {
    const resp = await chrome.runtime.sendMessage({ action: 'serverHealthCheck', serverUrl: _serverUrl })
    const running = resp && resp.running
    if (running) {
      indicator.textContent = '●'
      indicator.className = 'server-status running'
      indicator.title = '伺服器運行中'
      btn.textContent = '⏹'
      btn.className = 'btn-server running'
      btn.title = '停止伺服器'
      btn.disabled = false
    } else {
      indicator.textContent = '⚠'
      indicator.className = 'server-status stopped'
      indicator.title = '伺服器未啟動'
      btn.textContent = '▶'
      btn.className = 'btn-server'
      btn.title = '啟動伺服器'
      btn.disabled = false
    }
  } catch {
    indicator.textContent = '⚠'
    indicator.className = 'server-status stopped'
    indicator.title = '伺服器未啟動'
    btn.textContent = '▶'
    btn.className = 'btn-server'
    btn.title = '啟動伺服器'
    btn.disabled = false
  }
}

async function onServerToggle() {
  const btn = $('btnServerToggle')
  const indicator = $('serverIndicator')
  const isRunning = btn.classList.contains('running')

  btn.disabled = true
  indicator.textContent = '◌'
  indicator.className = 'server-status spin'
  indicator.title = '處理中…'

  try {
    if (isRunning) {
      await chrome.runtime.sendMessage({ action: 'serverStop' })
      await new Promise(r => setTimeout(r, 1000))
    } else {
      const resp = await chrome.runtime.sendMessage({ action: 'serverStart' })
      if (!resp || !resp.ok) {
        showErrorModal(resp?.error || '啟動失敗')
        btn.disabled = false
        return
      }
      await new Promise(r => setTimeout(r, 1500))
    }
    await updateServerStatus()
  } catch (e) {
    showErrorModal(e.message)
    btn.disabled = false
  }
}

async function ensureServerRunning() {
  const indicator = $('serverIndicator')
  if (indicator?.classList.contains('running')) return true
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'serverHealthCheck', serverUrl: _serverUrl })
    if (resp && resp.running) {
      await updateServerStatus()
      return true
    }
  } catch { }
  const startResp = await chrome.runtime.sendMessage({ action: 'serverStart' })
  if (!startResp || !startResp.ok) {
    showErrorModal(startResp?.error || '無法啟動伺服器')
    return false
  }
  await new Promise(r => setTimeout(r, 1500))
  await updateServerStatus()
  return true
}

function showToast(msg) {
  const t = $('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2000)
}

function showErrorModal(msg) {
  const modal = $('errorModal')
  const body = $('errorModalBody')
  body.textContent = msg
  modal.style.display = 'flex'
}

function hideErrorModal() {
  $('errorModal').style.display = 'none'
}

async function copyErrorToClipboard() {
  const text = $('errorModalBody').textContent
  try {
    await navigator.clipboard.writeText(text)
    showToast('已複製錯誤訊息')
  } catch {
    showToast('複製失敗')
  }
}

function showError(msg) {
  $('status').style.display = 'none'
  const el = $('error')
  el.textContent = msg
  el.style.display = 'block'
}

function updateFlowHeader(activeStep) {
  const step1 = $('flowStep1')
  const step2 = $('flowStep2')
  const step3 = $('flowStep3')

  if (!step1 || !step2 || !step3) return

  step1.classList.remove('active', 'clickable')
  step2.classList.remove('active')
  step3.classList.remove('active')

  if (activeStep === 1) step1.classList.add('active')
  if (activeStep === 2) step2.classList.add('active')
  if (activeStep === 3) step3.classList.add('active')

  if (activeStep === 3) {
    step1.classList.add('clickable')
    step1.title = '點擊在新分頁開啟蝦皮商品頁 (↗)'
    step1.onclick = () => {
      chrome.tabs.create({ url: 'https://shopee.tw' })
    }
  } else {
    step1.title = '步驟一：在商品頁擷取資料'
    step1.onclick = null
  }
}

function updateModeBadge(mode) {
  const badge = $('modeBadge')
  if (!badge) return

  badge.style.display = 'flex'
  if (mode === 'seller') {
    document.body.style.backgroundColor = '#f0faf8'
    badge.className = 'mode-badge seller'
    badge.innerHTML = '<span>📝 賣家編輯頁 — 填入模式</span><span style="font-size:10px;font-weight:400;color:#26aa99">Step 3/3</span>'
    try {
      chrome.action.setBadgeText({ text: '✏️' })
    } catch {}
  } else {
    document.body.style.backgroundColor = '#f8f9fa'
    badge.className = 'mode-badge extract'
    badge.innerHTML = '<span>🛒 商品頁 — 擷取模式</span><span style="font-size:10px;font-weight:400;color:#0066cc">Step 1/3</span>'
    try {
      chrome.action.setBadgeText({ text: 'SGC' })
    } catch {}
  }
}

function showEmptyState({ title, desc, icon = 'ℹ️', showShopeeBtn = true, showReloadBtn = false, tabId = null }) {
  $('status').style.display = 'none'
  $('result').style.display = 'none'
  $('sellerUI').style.display = 'none'
  $('error').style.display = 'none'

  const emptyState = $('emptyState')
  if (!emptyState) return

  emptyState.style.display = 'block'
  $('emptyIcon').textContent = icon
  $('emptyTitle').textContent = title
  $('emptyDesc').textContent = desc

  const btnGoShopee = $('btnGoShopee')
  const btnReloadTab = $('btnReloadTab')

  if (btnGoShopee) {
    btnGoShopee.style.display = showShopeeBtn ? 'inline-block' : 'none'
    btnGoShopee.onclick = () => {
      chrome.tabs.create({ url: 'https://shopee.tw' })
    }
  }

  if (btnReloadTab) {
    btnReloadTab.style.display = showReloadBtn ? 'inline-block' : 'none'
    btnReloadTab.onclick = () => {
      if (tabId) {
        chrome.tabs.reload(tabId)
        window.close()
      }
    }
  }
}

function showData(data) {
  $('status').style.display = 'none'
  $('result').style.display = 'block'

  $('title').textContent = data.title || '(無標題)'
  $('price').textContent = data.price || '(無價格)'
  $('description').textContent = data.description || '(無描述)'

  const imgs = data.images || []
  const videos = data.videos || []
  $('mediaCount').textContent = `影片(${videos.length}) 圖片(${imgs.length})`
  const container = $('mediaGrid')
  container.innerHTML = ''
  videos.forEach(url => {
    const el = document.createElement('div')
    el.className = 'thumb-video'
    el.title = url.split('/').pop() || url
    el.textContent = '▶'
    container.appendChild(el)
  })
  imgs.forEach(url => {
    const img = document.createElement('img')
    img.src = url
    img.title = url
    container.appendChild(img)
  })

  window._sgcData = data
}

function initSellerMode(tab) {
  updateFlowHeader(3)
  updateModeBadge('seller')
  $('status').style.display = 'none'
  const lbl = $('sellerModeLabel')
  if (lbl) lbl.style.display = 'none' // modeBadge 已顯示相同訊息，避免重複
  $('sellerUI').style.display = 'block'

  $('btnFill').addEventListener('click', async () => {
    let raw
    try {
      raw = await navigator.clipboard.readText()
    } catch {
      showToast('無法讀取剪貼簿，請檢查權限')
      return
    }
    if (!raw) { showToast('剪貼簿空白'); return }

    let data
    try {
      const parsed = JSON.parse(raw)
      data = Array.isArray(parsed) ? parsed[0] : parsed
    } catch {
      data = { title: raw }
    }

    $('btnFill').disabled = true
    $('btnFill').textContent = '填入中...'
    $('fillResult').style.display = 'none'

    try {
      const autoSave = $('chkAutoSaveOnFill')?.checked === true
      const started = await chrome.tabs.sendMessage(tab.id, {
        action: 'fillProductData',
        data: { ...data, autoSave }
      })
      if (!started?.ok) throw new Error(started?.error || 'content script 無回應')
    } catch (e) {
      const el = $('fillResult')
      el.style.display = 'block'
      el.className = 'value error'
      el.textContent = '❌ 通訊失敗：' + e.message
      $('btnFill').disabled = false
      $('btnFill').textContent = '📋 從剪貼簿填入'
      return
    }

    const el = $('fillResult')
    el.style.display = 'block'
    el.className = 'value'
    el.style.color = '#888'
    el.textContent = '填入中⋯'

    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 500))
      let state
      try {
        state = await chrome.tabs.sendMessage(tab.id, { action: 'checkFillStatus' })
      } catch {
        el.textContent = '❌ 通訊中斷'
        el.className = 'value error'
        break
      }
      if (!state || state.status === 'running') {
        el.textContent = `填入中${'.'.repeat((i % 3) + 1)}`
        continue
      }
      const result = state.result || {}
      const okCount = (result.results || []).filter(r => r.ok).length
      const total = (result.results || []).length
      const details = (result.results || []).map(r => `${r.ok ? '✅' : '❌'} ${r.field}: ${r.error || 'ok'}`).join('\n')
      el.style.color = result.ok ? '#26aa99' : '#e74c3c'
      el.textContent = result.ok
        ? `✅ 完成 ${okCount}/${total} 個欄位`
        : `❌ ${result.error || '填入失敗'}`
      el.title = details
      break
    }

    $('btnFill').disabled = false
    $('btnFill').textContent = '📋 從剪貼簿填入'
  })

  $('btnBatchUpload').addEventListener('click', () => {
    chrome.tabs.create({ url: 'batch-upload.html' })
  })
  $('btnBatchTest').addEventListener('click', () => {
    chrome.tabs.create({ url: 'batch-upload-test.html' })
  })
}

const CATEGORY_MAP = {
  '電腦與周邊配件 > 軟體': '100644,101937',
}

function getSelectedCategory() {
  const sel = $('ps_category')
  return sel ? sel.value : ''
}

function getStockValue() {
  const input = $('ps_stock')
  if (!input) return 999
  const v = parseInt(input.value, 10)
  return isNaN(v) ? 999 : v
}

function toJsonClipboard(data) {
  const stock = getStockValue()
  const catIds = getSelectedCategory()

  const images = data.images || []
  const psImages = {}
  if (images.length > 0) {
    psImages.ps_item_cover_image = images[0]
  }
  for (let i = 1; i < Math.min(images.length, 9); i++) {
    psImages[`ps_item_image_${i}`] = images[i]
  }

  const output = {
    ps_product_name: data.title || '',
    ps_price: data.price ?? '',
    ps_product_description: data.description || '',
    ps_stock: stock,
    ps_category: catIds,
    ps_length: 10,
    ps_width: 10,
    ps_height: 4,
    ps_sku_short: data.ProductId || '',
    ps_brand: 'NoBrand',
    ...psImages,
    images,
    url: data.url || '',
    videos: data.videos || [],
    installment: 24,
  }

  if (data.computer_specs) {
    output.computer_specs = data.computer_specs
  }

  return JSON.stringify([output], null, 2)
}

function initExtractMode(tab) {
  updateFlowHeader(1)
  updateModeBadge('extract')

  const url = tab?.url || ''
  if (!url.includes('shopee.tw')) {
    showEmptyState({
      title: '目前頁面不是蝦皮商品頁',
      desc: '請前往蝦皮購物商品頁面，或點擊下方按鈕前往。',
      icon: '🛒',
      showShopeeBtn: true,
      showReloadBtn: false
    })
    return
  }

  chrome.tabs.sendMessage(tab.id, { action: 'getProductData' }).then(resp => {
    if (!resp) {
      showEmptyState({
        title: '內容腳本無回應',
        desc: '內容腳本尚未載入或遭中斷，請嘗試重新整理頁面。',
        icon: '🔄',
        showShopeeBtn: false,
        showReloadBtn: true,
        tabId: tab.id
      })
      return
    }
    if (resp.error) {
      if (resp.errorCode === 'NOT_PRODUCT_PAGE') {
        // 走錯頁面（店鋪/列表/搜尋頁）：引導前往商品詳情頁，重新整理無意義
        showEmptyState({
          title: '目前頁面不是蝦皮商品頁',
          desc: '你目前在店鋪或列表頁，請點入任一商品詳情頁後再開啟外掛。',
          icon: '🛒',
          showShopeeBtn: true,
          showReloadBtn: false
        })
      } else {
        // 其他真正的讀取錯誤（errorCode 未知或未設定）
        showEmptyState({
          title: '無法讀取商品資料',
          desc: resp.error,
          icon: '⚠️',
          showShopeeBtn: true,
          showReloadBtn: true,
          tabId: tab.id
        })
      }
      return
    }
    showData(resp)
  }).catch(e => {
    showEmptyState({
      title: '通訊失敗',
      desc: '無法與頁面腳本連線：' + e.message + '。請重新整理頁面再試。',
      icon: '⚠️',
      showShopeeBtn: false,
      showReloadBtn: true,
      tabId: tab.id
    })
  })

  $('btnCopy').addEventListener('click', async () => {
    const data = window._sgcData
    if (!data) { showToast('無資料'); return }
    try {
      await navigator.clipboard.writeText(toJsonClipboard(data))
      updateFlowHeader(2)
    } catch (e) {
      showToast('複製失敗：' + e.message)
      return
    }
    if ($('chkAutoCatalog')?.checked) {
      const started = await ensureServerRunning()
      if (!started) return
      const result = await submitToCatalog(data, true)
      if (result?.ok) {
        if (result.action === 'skipped') {
          showToast('✅ 已複製 JSON，目錄已存在，略過')
        } else if (result.action === 'merged') {
          showToast('📝 已複製 JSON，已更新目錄')
        } else {
          showToast('✅ 已複製 JSON，已寫入目錄')
        }
      }
    } else {
      showToast('已複製 JSON 到剪貼簿！')
    }
  })

  $('btnDownload').addEventListener('click', async () => {
    const data = window._sgcData
    if (!data) { showToast('無資料'); return }
    $('btnDownload').disabled = true
    $('btnDownload').textContent = '下載中...'
    try {
      const started = await ensureServerRunning()
      if (!started) return
      const resp = await chrome.runtime.sendMessage({
        action: 'saveRawProductData',
        data: data,
        serverUrl: _serverUrl
      })
      if (resp?.ok) {
        showToast('✅ 已儲存原始資料')
      } else {
        showErrorModal(resp?.error || '儲存失敗')
      }
    } catch (e) {
      showToast('下載失敗：' + e.message)
    } finally {
      $('btnDownload').disabled = false
      $('btnDownload').textContent = '下載資料'
    }
  })
}

async function main() {
  await loadServerUrl()
  await loadAutoCatalogSetting()
  await loadAutoSaveSetting()
  updateServerStatus()
  initAutoCatalogCheckbox()
  initAutoSaveCheckbox()

  $('btnServerToggle').addEventListener('click', onServerToggle)
  $('btnCloseError').addEventListener('click', hideErrorModal)
  $('btnCopyError').addEventListener('click', copyErrorToClipboard)

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) { showError('無法取得目前分頁'); return }

  const url = tab.url || ''
  if (url.includes('seller.shopee.tw')) {
    initSellerMode(tab)
  } else {
    initExtractMode(tab)
  }
}

document.addEventListener('DOMContentLoaded', main)
