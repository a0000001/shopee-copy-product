const $ = id => document.getElementById(id)

const DEFAULT_SERVER = 'http://localhost:9801'
const STORAGE_KEY_AUTO_CATALOG = 'autoCatalogOnCopy'

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
  $('status').style.display = 'none'
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
      const resp = await chrome.tabs.sendMessage(tab.id, {
        action: 'fillProductData',
        data
      })
      const el = $('fillResult')
      el.style.display = 'block'
      if (resp?.ok) {
        const ok = (resp.results || []).filter(r => r.ok).length
        const total = (resp.results || []).length
        const details = (resp.results || []).map(r => `${r.ok ? '✅' : '❌'} ${r.field}: ${r.error || 'ok'}`).join('\n')
        el.className = 'value'
        el.style.color = '#26aa99'
        el.textContent = `✅ 完成 ${ok}/${total} 個欄位`
        el.title = details
      } else {
        el.className = 'value error'
        el.textContent = `❌ ${resp?.error || '填入失敗'}`
      }
    } catch (e) {
      const el = $('fillResult')
      el.style.display = 'block'
      el.className = 'value error'
      el.textContent = '❌ 通訊失敗：' + e.message
    } finally {
      $('btnFill').disabled = false
      $('btnFill').textContent = '📋 從剪貼簿填入'
    }
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
  chrome.tabs.sendMessage(tab.id, { action: 'getProductData' }).then(resp => {
    if (!resp) { showError('內容腳本無回應，請重新整理頁面再試'); return }
    if (resp.error) { showError(resp.error); return }
    showData(resp)
  }).catch(e => {
    showError('通訊失敗：' + e.message)
  })

  $('btnCopy').addEventListener('click', async () => {
    const data = window._sgcData
    if (!data) { showToast('無資料'); return }
    try {
      await navigator.clipboard.writeText(toJsonClipboard(data))
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
  updateServerStatus()
  initAutoCatalogCheckbox()

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
