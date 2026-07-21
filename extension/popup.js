const $ = id => document.getElementById(id)

const DEFAULT_SERVER = 'http://localhost:9801'

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

async function submitToCatalog(data) {
  const json = toJsonClipboard(data)
  const product = JSON.parse(json)[0]

  try {
    const resp = await fetch(`${_serverUrl}/append`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product }),
    })
    const result = await resp.json()
    if (result.ok && result.action === 'appended') {
      showToast('✅ 已寫入目錄')
    } else if (result.ok && result.action === 'appended_with_warning') {
      showToast('⚠️ ' + (result.reason || '已寫入，但名稱相似'))
    } else if (result.ok && result.action === 'skipped') {
      showToast('⏭ ' + result.reason)
    } else {
      showToast('❌ ' + (result.error || '伺服器錯誤'))
    }
  } catch (e) {
    showToast('❌ 無法連線到目錄伺服器')
  }
}

async function updateServerStatus() {
  const indicator = $('serverIndicator')
  const startBtn = $('btnServerStart')
  const stopBtn = $('btnServerStop')
  if (!indicator) return

  indicator.textContent = '檢查中...'
  indicator.className = 'server-status unknown'

  try {
    const resp = await chrome.runtime.sendMessage({ action: 'serverHealthCheck', serverUrl: _serverUrl })
    const running = resp && resp.running
    if (running) {
      indicator.textContent = '● 伺服器運行中'
      indicator.className = 'server-status running'
      if (startBtn) startBtn.style.display = 'none'
      if (stopBtn) stopBtn.style.display = 'inline-block'
    } else {
      indicator.textContent = '○ 伺服器未啟動'
      indicator.className = 'server-status stopped'
      if (startBtn) startBtn.style.display = 'inline-block'
      if (stopBtn) stopBtn.style.display = 'none'
    }
  } catch {
    indicator.textContent = '○ 伺服器未啟動'
    indicator.className = 'server-status stopped'
  }
}

async function onServerStart() {
  const btn = $('btnServerStart')
  btn.disabled = true
  btn.textContent = '啟動中...'
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'serverStart' })
    if (!resp || !resp.ok) {
      showToast('❌ ' + (resp?.error || '啟動失敗'))
      return
    }
    await new Promise(r => setTimeout(r, 1500))
    await updateServerStatus()
  } catch (e) {
    showToast('❌ 啟動失敗：' + e.message)
  } finally {
    btn.disabled = false
    btn.textContent = '▶ 啟動伺服器'
  }
}

async function onServerStop() {
  $('btnServerStop').disabled = true
  try {
    await chrome.runtime.sendMessage({ action: 'serverStop' })
    await new Promise(r => setTimeout(r, 1000))
    await updateServerStatus()
  } catch (e) {
    showToast('❌ 停止失敗：' + e.message)
  } finally {
    $('btnServerStop').disabled = false
  }
}

function showToast(msg) {
  const t = $('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2000)
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
  $('imgCount').textContent = `(${imgs.length} 張)`
  const imgContainer = $('images')
  imgContainer.innerHTML = ''
  imgs.forEach(url => {
    const img = document.createElement('img')
    img.src = url
    img.title = url
    imgContainer.appendChild(img)
  })

  const videos = data.videos || []
  $('videoCount').textContent = `(${videos.length} 個)`
  $('videos').textContent = videos.length
    ? videos.map(v => v.split('/').pop() || v).join('\n')
    : '(無影片)'

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

  $('btnCatalog').addEventListener('click', async () => {
    const data = window._sgcData
    if (!data) { showToast('無資料'); return }
    await submitToCatalog(data)
  })

  $('btnCopy').addEventListener('click', async () => {
    const data = window._sgcData
    if (!data) { showToast('無資料'); return }
    try {
      await navigator.clipboard.writeText(toJsonClipboard(data))
      showToast('已複製 JSON 到剪貼簿！')
    } catch (e) {
      showToast('複製失敗：' + e.message)
    }
  })

  $('btnAI').addEventListener('click', () => {
    const data = window._sgcData
    if (!data) { showToast('無資料'); return }
    navigator.clipboard.writeText(toJsonClipboard(data)).then(() => {
      showToast('已複製 JSON，請貼到 AI 工具')
    }).catch(() => showToast('複製失敗'))
  })

  $('btnDownload').addEventListener('click', async () => {
    const data = window._sgcData
    if (!data) { showToast('無資料'); return }
    if (!data.images.length && !data.videos.length) { showToast('沒有可下載的檔案'); return }
    $('btnDownload').disabled = true
    $('btnDownload').textContent = '下載中...'
    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'download',
        images: data.images,
        videos: data.videos,
        title: data.title
      })
      const total = (resp?.results || []).length
      const ok = (resp?.results || []).filter(r => !r.error).length
      showToast(`下載完成：${ok}/${total} 個檔案`)
    } catch (e) {
      showToast('下載失敗：' + e.message)
    } finally {
      $('btnDownload').disabled = false
      $('btnDownload').textContent = '下載圖片 + 影片'
    }
  })
}

async function main() {
  await loadServerUrl()
  updateServerStatus()

  $('btnServerStart').addEventListener('click', onServerStart)
  $('btnServerStop').addEventListener('click', onServerStop)

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
