function log(msg, type = 'info') {
  const el = document.createElement('div')
  el.className = 'log-entry ' + type
  el.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg
  document.getElementById('logContainer').appendChild(el)
}

document.getElementById('btnRunScan').addEventListener('click', async () => {
  document.getElementById('logContainer').innerHTML = ''
  document.getElementById('itemTbody').innerHTML = ''
  document.getElementById('itemTable').style.display = 'none'

  log('1. 開始尋找 seller.shopee.tw/portal/product/list 分頁...', 'info')
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true })
    const sellerTab = tabs.find(t => t.url && t.url.includes('seller.shopee.tw'))
    if (!sellerTab) {
      throw new Error('未找到 seller.shopee.tw 分頁，請先開啟蝦皮賣家中心商品列表頁！')
    }

    log('   已找到分頁: ID=' + sellerTab.id + ' URL=' + sellerTab.url, 'ok')
    log('2. 執行 extractSellerProductList 掃描...', 'info')

    let resp = null
    try {
      resp = await chrome.tabs.sendMessage(sellerTab.id, { action: 'extractSellerProductList' })
    } catch (e) {
      log('   sendMessage 失敗（擴充功能重載離線），自動改用 scripting 注入...', 'info')
    }

    if (!resp || !Array.isArray(resp) || resp.length === 0) {
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
              const href = link.getAttribute('href') || link.href || ''
              const idMatch = href.match(/\/portal\/product\/(\d+)/)
              items.push({ name, productId: idMatch ? idMatch[1] : '', url: link.href })
            }
            return items
          }
        })
        if (scriptRes && scriptRes.result) {
          resp = scriptRes.result
        }
      } catch (e) {
        log('   scripting 注入失敗: ' + e.message, 'fail')
      }
    }

    if (!resp || !Array.isArray(resp)) {
      throw new Error('無法與蝦皮分頁建立通訊，請至蝦皮分頁按 F5 重新整理頁面後重試。')
    }

    log('✅ 成功掃描取得 ' + resp.length + ' 筆商品', 'ok')

    if (resp.length === 0) {
      log('⚠️ 掃描結果為 0 筆，請確認分頁是否在「我的商品」頁面。', 'fail')
      return
    }

    document.getElementById('itemTable').style.display = 'table'
    const tbody = document.getElementById('itemTbody')
    resp.forEach((item, index) => {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${item.name}</td>
        <td>${item.productId || '-'}</td>
        <td>${item.price || '-'}</td>
      `
      tbody.appendChild(tr)
    })
  } catch (e) {
    log('❌ 錯誤: ' + e.message, 'fail')
  }
})
