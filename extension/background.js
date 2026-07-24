chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: 'saveAsJpg',
    title: '另存為 .JPG',
    contexts: ['image']
  })
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'saveAsJpg',
      title: '另存為 .JPG',
      contexts: ['image']
    })
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'saveAsJpg') return
  const url = info.srcUrl
  try {
    const rawTitle = (tab?.title || '')
    const folder = safeFolderName(rawTitle.replace(/\s*\|\s*蝦皮購物\s*$/, '').trim() || 'shopee_image')
    // 一律轉 JPG，不依賴 URL 副檔名（CDN URL 通常無副檔名，PNG 無法靠 URL 判斷）
    const dataUrl = await toJpgDataUrl(url).catch(e => {
      console.error('[SGC] context menu toJpgDataUrl failed:', e)
      return null
    })
    if (dataUrl) {
      await chrome.downloads.download({ url: dataUrl, filename: `${folder}/${ts()}.jpg`, conflictAction: 'uniquify' })
    } else {
      // 轉換失敗時，fallback 直接下載原始 URL
      await chrome.downloads.download({ url, filename: `${folder}/${ts()}`, conflictAction: 'uniquify' })
    }
  } catch (e) {
    console.error('[SGC] context menu download failed:', e)
  }
})

let nativePort = null
let serverRunning = false

function getNativePort() {
  if (nativePort) return nativePort
  try {
    nativePort = chrome.runtime.connectNative('com.shopee.catalog_server')
    nativePort.onMessage.addListener(msg => {
      if (msg.type === 'status') {
        serverRunning = msg.running
      }
    })
    nativePort.onDisconnect.addListener(() => {
      nativePort = null
      serverRunning = false
    })
    return nativePort
  } catch (e) {
    console.error('[SGC] native host connect failed:', e)
    return null
  }
}

async function checkServerHealth(serverUrl) {
  try {
    const resp = await fetch(serverUrl + '/health', { signal: AbortSignal.timeout(3000) })
    if (resp.ok) {
      const data = await resp.json()
      return data.ok === true
    }
  } catch { }
  return false
}

async function appendToCatalog(serverUrl, product) {
  try {
    console.log('[SGC] appendToCatalog fetch:', serverUrl + '/append')
    const resp = await fetch(serverUrl + '/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product }),
    })
    console.log('[SGC] appendToCatalog status:', resp.status, resp.statusText)
    const result = await resp.json()
    console.log('[SGC] appendToCatalog result:', result)
    if (!resp.ok) {
      return { ok: false, error: result.error || `HTTP ${resp.status}` }
    }
    return result
  } catch (e) {
    console.error('[SGC] appendToCatalog error:', e)
    return { ok: false, error: e.message }
  }
}

async function saveRawProductData(data, serverUrl = 'http://localhost:9801') {
  try {
    const resp = await fetch(serverUrl + '/saveRawProductData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: data }),
      signal: AbortSignal.timeout(30000)
    })
    if (resp.ok) {
      const result = await resp.json()
      return { ok: true, ...result }
    } else {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
      return { ok: false, error: err.error || `HTTP ${resp.status}` }
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'fetchBlob') {
    fetchBlobAsBase64(msg.url)
      .then(res => sendResponse({ ok: true, data: res }))
      .catch(err => sendResponse({ ok: false, error: err.message }))
    return true
  }
  if (msg.action === 'checkPngMagic') {
    checkPngMagic(msg.url)
      .then(isPng => sendResponse({ isPng }))
      .catch(() => sendResponse({ isPng: false }))
    return true
  }
  if (msg.action === 'appendToCatalog') {
    appendToCatalog(msg.serverUrl || 'http://localhost:9801', msg.product || {})
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ ok: false, error: err.message }))
    return true
  }
  if (msg.action === 'saveRawProductData') {
    saveRawProductData(msg.data || {}, msg.serverUrl || 'http://localhost:9801')
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ ok: false, error: err.message }))
    return true
  }
  if (msg.action === 'serverStatus') {
    const port = getNativePort()
    if (port) {
      port.postMessage({ type: 'status' })
      sendResponse({ nativeAvailable: true, serverRunning })
    } else {
      sendResponse({ nativeAvailable: false, serverRunning })
    }
    return true
  }
  if (msg.action === 'serverStart') {
    const port = getNativePort()
    if (!port) {
      sendResponse({ ok: false, error: '無法連接到 Native Host，請先執行 install-native-host.ps1' })
      return true
    }
    const nativeMsg = { type: 'start' }
    if (msg.catalogPath) nativeMsg.catalog_path = msg.catalogPath
    port.postMessage(nativeMsg)
    const waitForRunning = new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ ok: false, error: 'Native Host 無回應' })
      }, 8000)
      const onMsg = (msg) => {
        if (msg.type === 'status' || msg.type === 'error') {
          clearTimeout(timer)
          port.onMessage.removeListener(onMsg)
          if (msg.type === 'status' && msg.running) {
            resolve({ ok: true })
          } else {
            resolve({ ok: false, error: msg.message || '伺服器啟動失敗' })
          }
        }
      }
      port.onMessage.addListener(onMsg)
    })
    waitForRunning.then(res => sendResponse(res))
    return true
  }
  if (msg.action === 'serverStop') {
    const port = getNativePort()
    if (port) {
      port.postMessage({ type: 'stop' })
    }
    sendResponse({ ok: true })
    return true
  }
  if (msg.action === 'serverHealthCheck') {
    checkServerHealth(msg.serverUrl || 'http://localhost:9801').then(running => {
      sendResponse({ running })
    })
    return true
  }
})

function safeFolderName(raw) {
  return raw
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fff_-]/g, '')
    .substring(0, 100) || 'shopee_image'
}

function ts() { return Date.now() }

async function toJpgDataUrl(url, skipPng = false) {
  const resp = await fetch(url, { credentials: 'omit' })
  if (!resp.ok) throw new Error(`fetch failed: ${resp.status} ${url}`)
  const blob = await resp.blob()
  if (skipPng && (blob.type === 'image/png' || blob.type === 'image/x-png')) {
    throw new Error('SKIP_PNG')
  }
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  // 白色底色：PNG 透明背景轉 JPG 時不出黑底
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, bitmap.width, bitmap.height)
  ctx.drawImage(bitmap, 0, 0)
  const jpgBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
  // Service Worker 沒有 URL.createObjectURL，也不能用 FileReader（chrome.downloads 內部會呼叫 createObjectURL）
  // 改用 ArrayBuffer → Uint8Array → btoa 純文字 base64 data URL，完全相容 SW 環境
  const buffer = await jpgBlob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.length)))
  }
  return `data:image/jpeg;base64,${btoa(binary)}`
}

async function fetchBlobAsBase64(url) {
  const resp = await fetch(url, { credentials: 'omit' })
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${url}`)
  const blob = await resp.blob()
  if (blob.type === 'image/webp' || blob.type === 'image/x-webp') {
    try {
      const dataUrl = await toJpgDataUrl(url, false)
      const base64 = dataUrl.split(',')[1]
      return { base64, type: 'image/jpeg' }
    } catch (e) { }
  }
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.length)))
  }
  const base64 = btoa(binary)
  return { base64, type: blob.type }
}

async function checkPngMagic(url) {
  const resp = await fetch(url, { headers: { Range: 'bytes=0-3' }, credentials: 'omit' })
  if (!resp.ok) return false
  const buf = await resp.arrayBuffer()
  const view = new Uint8Array(buf)
  return view.length >= 4 && view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4E && view[3] === 0x47
}

