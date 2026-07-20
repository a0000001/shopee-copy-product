const $ = id => document.getElementById(id)

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
      data = JSON.parse(raw)
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

function toJsonClipboard(data) {
  return JSON.stringify({
    title: data.title || '',
    price: data.price || '',
    description: data.description || '',
    url: data.url || '',
    images: data.images || [],
    videos: data.videos || [],
    dimension: '10x10x4',
    installment: 24
  }, null, 2)
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
