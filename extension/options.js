const $ = id => document.getElementById(id)

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('serverUrl')
    if (result.serverUrl) {
      $('serverUrl').value = result.serverUrl
    }
  } catch {
    // 使用預設值
  }
}

async function saveSettings() {
  const url = $('serverUrl').value.trim()
  if (!url) {
    $('status').textContent = '請輸入伺服器位址'
    $('status').style.color = '#c00'
    return
  }
  try {
    await chrome.storage.sync.set({ serverUrl: url })
    $('status').textContent = '✅ 已儲存'
    $('status').style.color = '#26aa99'
    setTimeout(() => { $('status').textContent = '' }, 2000)
  } catch (e) {
    $('status').textContent = '❌ 儲存失敗：' + e.message
    $('status').style.color = '#c00'
  }
}

async function updateServerStatus(showRefreshMsg) {
  const el = $('serverStatus')
  const startBtn = $('btnServerStart')
  const stopBtn = $('btnServerStop')

  el.textContent = '檢查中...'
  el.className = 'server-status'

  try {
    const url = $('serverUrl').value.trim() || 'http://localhost:9801'
    const resp = await chrome.runtime.sendMessage({ action: 'serverHealthCheck', serverUrl: url })
    const running = resp && resp.running
    if (running) {
      el.textContent = '● 伺服器運行中'
      el.className = 'server-status running'
      startBtn.style.display = 'none'
      stopBtn.style.display = 'inline-block'
    } else {
      el.textContent = '○ 伺服器未啟動'
      el.className = 'server-status stopped'
      startBtn.style.display = 'inline-block'
      stopBtn.style.display = 'none'
    }
  } catch (e) {
    el.textContent = '○ 伺服器未啟動'
    el.className = 'server-status stopped'
    startBtn.style.display = 'inline-block'
    stopBtn.style.display = 'none'
  }
}

async function onServerStart() {
  const btn = $('btnServerStart')
  btn.disabled = true
  btn.textContent = '啟動中...'
  try {
    await chrome.runtime.sendMessage({ action: 'serverStart' })
    await new Promise(r => setTimeout(r, 5000))
    await updateServerStatus()
  } catch (e) {
    $('serverStatus').textContent = '❌ 啟動失敗：' + e.message
    $('serverStatus').className = 'server-status error'
  } finally {
    btn.disabled = false
    btn.textContent = '▶ 啟動伺服器'
  }
}

async function onServerStop() {
  const btn = $('btnServerStop')
  btn.disabled = true
  try {
    await chrome.runtime.sendMessage({ action: 'serverStop' })
    await new Promise(r => setTimeout(r, 2000))
    await updateServerStatus()
  } catch (e) {
    $('serverStatus').textContent = '❌ 停止失敗：' + e.message
    $('serverStatus').className = 'server-status error'
  } finally {
    btn.disabled = false
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings()
  updateServerStatus()
  $('btnSave').addEventListener('click', saveSettings)
  $('btnServerStart').addEventListener('click', onServerStart)
  $('btnServerStop').addEventListener('click', onServerStop)
  $('btnServerRefresh').addEventListener('click', () => updateServerStatus(true))
})
