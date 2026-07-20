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

document.addEventListener('DOMContentLoaded', () => {
  loadSettings()
  $('btnSave').addEventListener('click', saveSettings)
})
