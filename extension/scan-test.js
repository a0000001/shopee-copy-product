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
              for (const s of ['.eds-pagination__next button,.eds-pagination__next','[class*="pagination"] [class*="next"] button','button[class*="next"],a[class*="next"]','li.next a,li.next button,.ant-pagination-next']) {
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

            // 1. API (main world - usually blocked, supplement only, no early return)
            const cds = (document.cookie.match(/(?:^|;\s*)SPC_CDS=([^;]+)/)||[])[1]||''
            try {
              const r = await fetch('/api/v3/opt/mpsku/list/v2/search_product_list?SPC_CDS='+encodeURIComponent(cds)+'&SPC_CDS_VER=2&page_size=100&list_type=live_all&request_attribute=&operation_sort_by=recommend_v4&need_ads=false',{credentials:'include'})
              if (r.ok) {
                const list = (await r.json())?.data?.products||[]
                if (list.length>0) { for (const p of list) { const n=(p.name||'').trim(); if(n&&!nameSet.has(n)){nameSet.add(n);items.push({name:n,productId:String(p.id||'')})}}}
              }
            } catch(e) {}

            // 2. SPA click pagination (Plan B - always runs, confirmed working)
            //    Old: while(cur<pages&&items.length<total) breaks if readTotal()=0
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
