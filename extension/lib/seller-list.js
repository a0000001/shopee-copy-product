(function () {
  async function extractSellerProductList() {
    const items = []
    const nameSet = new Set()

    function collectFromDOM() {
      let n = 0
      for (const a of document.querySelectorAll('a[href*="/portal/product/"]')) {
        const href = a.getAttribute('href') || ''
        if (!/\/portal\/product\/\d+/.test(href)) continue
        const name = a.textContent.trim()
        if (!name || nameSet.has(name)) continue
        nameSet.add(name); n++
        const idMatch = href.match(/\/portal\/product\/(\d+)/)
        items.push({
          name,
          productId: idMatch ? idMatch[1] : '',
          sku: '',
          url: a.href || '',
          price: '',
          status: 'live'
        })
      }
      return n
    }

    function readTotal() {
      const badge = document.querySelector(".tab-badge, [class*=\"tab-badge\"]")
      if (badge) {
        const bm = (badge.textContent || "").match(/(\d+)/)
        if (bm) return parseInt(bm[1])
      }
      const title = document.querySelector(".list-header-title, [class*=\"list-header-title\"]")
      if (title) {
        const tm = (title.textContent || "").match(/(\d+)\s*件\s*商品/)
        if (tm) return parseInt(tm[1])
      }
      const t = document.body?.textContent || ""
      const m = t.match(/架上商品\s*\(\s*(\d+)\s*\)/)
        || t.match(/(\d+)\s*件\s*商品/)
        || t.match(/總計\s*(\d+)\s*項/)
        || t.match(/共\s*(\d+)\s*筆/)
        || t.match(/架上商品\((\d+)\)/)
      return m ? parseInt(m[1]) : 0
    }

    function clickNextPage() {
      for (const sel of [
        '.eds-pager__button-next',
        '[class*="pager"] [class*="next"]',
        'button.eds-pager__button-next',
        '.eds-pagination__next button,.eds-pagination__next',
        '[class*="pagination"] [class*="next"] button',
        'button[class*="next"],a[class*="next"]',
        'li.next a,li.next button,.ant-pagination-next'
      ]) {
        const el = document.querySelector(sel)
        if (!el) continue
        if (el.disabled || el.classList.contains("disabled") || el.getAttribute("aria-disabled") === "true") return false
        el.click(); return true
      }
      return false
    }

    function waitForRender(timeout) {
      const tbl = document.querySelector(".eds-table__body,table tbody,[class*=\"table__body\"]") || document.querySelector("table")
      if (!tbl) return new Promise(r => setTimeout(r, 2000))
      return new Promise(r => {
        let last = tbl.innerHTML
        const mo = new MutationObserver(() => {
          if (tbl.innerHTML !== last) { mo.disconnect(); setTimeout(r, 400) }
        })
        mo.observe(tbl, { childList: true, subtree: true })
        setTimeout(() => { mo.disconnect(); r() }, timeout || 6000)
      })
    }

    collectFromDOM()
    let total = readTotal()

    const cds = (document.cookie.match(/(?:^|;\s*)SPC_CDS=([^;]+)/) || [])[1] || ""
    const listTypes = ['live_all', 'reviewing', 'unpublished', 'violation', 'banned']
    const beforeApiCount = items.length

    for (const lt of listTypes) {
      let pageNum = 1
      while (pageNum <= 20) {
        const realApiUrl = "/api/v3/opt/mpsku/list/v2/search_product_list"
          + "?SPC_CDS=" + encodeURIComponent(cds)
          + "&SPC_CDS_VER=2&page_size=48&page_number=" + pageNum
          + "&list_type=" + lt + "&request_attribute=&operation_sort_by=recommend_v4&need_ads=false"
        try {
          const res = await fetch(realApiUrl, { credentials: "include" })
          if (res.ok) {
            const json = await res.json()
            const list = json?.data?.products || json?.data?.product_list || json?.data?.list || []
            if (!Array.isArray(list) || list.length === 0) break
            for (const p of list) {
              const name = (p.name || "").trim()
              if (name && !nameSet.has(name)) {
                nameSet.add(name)
                items.push({
                  name,
                  productId: String(p.id || ""),
                  sku: p.parent_sku || "",
                  url: "",
                  price: p.price_detail?.price_min ? String(Math.round(p.price_detail.price_min / 100000)) : "",
                  status: lt
                })
              }
            }
            if (list.length < 48) break
            pageNum++
          } else {
            break
          }
        } catch (e) {
          console.log("[SGC] API error for " + lt + " page " + pageNum + ": " + e.message)
          break
        }
      }
    }

    console.log("[SGC] API scan completed: +" + (items.length - beforeApiCount) + " items added. Total collected: " + items.length)

    // SPA fallback pagination if API failed or total in DOM is greater
    console.log("[SGC] SPA pagination start (" + items.length + " collected so far, total=" + total + ")")
    const MAX_PAGES = 50
    let pagesVisited = 0
    let consecutiveNoNew = 0
    let curPage = parseInt(new URL(location.href).searchParams.get("page") || "1")

    while (pagesVisited < MAX_PAGES) {
      const t = readTotal() || total
      if (t > 0 && items.length >= t) { console.log("[SGC] Reached total count " + t + ", SPA done"); break }

      if (!clickNextPage()) { console.log("[SGC] No next-page button, SPA done"); break }
      await waitForRender()
      const prev = items.length
      collectFromDOM()
      pagesVisited++
      curPage = parseInt(new URL(location.href).searchParams.get("page") || String(curPage + 1))
      console.log("[SGC] SPA page " + curPage + ": +" + (items.length - prev) + " new, total=" + items.length)

      const currentTotal = readTotal() || t
      if (currentTotal > 0 && items.length >= currentTotal) {
        console.log("[SGC] Reached total count " + currentTotal + ", SPA done")
        break
      }

      if (items.length === prev) {
        consecutiveNoNew++
        if (currentTotal === 0 || consecutiveNoNew >= 5) {
          console.log("[SGC] No new items for " + consecutiveNoNew + " page(s), SPA done")
          break
        }
      } else {
        consecutiveNoNew = 0
      }
    }

    if (items.length === 0) {
      const rows = document.querySelectorAll(".eds-table__row, [class*=\"table__row\"]")
      for (const row of rows) {
        const nameLink = row.querySelector("a[href*=\"/portal/product/\"], [class*=\"name\"], [class*=\"title\"]")
        if (!nameLink) continue
        const name = nameLink.textContent.trim()
        if (!name || name === "新增商品" || name === "修改" || nameSet.has(name)) continue
        nameSet.add(name)
        items.push({ name, productId: "", sku: "", url: "", price: "", status: "live" })
      }
    }

    return items
  }

  function readPageInfo() {
    const badge = document.querySelector(".tab-badge, [class*=\"tab-badge\"]")
    const title = document.querySelector(".list-header-title, [class*=\"list-header-title\"]")
    const bodyText = document.body?.textContent || ""
    let totalCount = 0
    if (badge) {
      const bm = (badge.textContent || "").match(/(\d+)/)
      if (bm) totalCount = parseInt(bm[1])
    }
    if (!totalCount && title) {
      const tm = (title.textContent || "").match(/(\d+)\s*件\s*商品/)
      if (tm) totalCount = parseInt(tm[1])
    }
    if (!totalCount) {
      const totalMatch = bodyText.match(/架上商品\s*\(\s*(\d+)\s*\)/)
        || bodyText.match(/(\d+)\s*件\s*商品/)
        || bodyText.match(/總計\s*(\d+)\s*項/)
        || bodyText.match(/共\s*(\d+)\s*筆/)
        || bodyText.match(/架上商品\((\d+)\)/)
      if (totalMatch) totalCount = parseInt(totalMatch[1])
    }
    if (!totalCount) return null
    const pageSize = 12
    const totalPages = Math.ceil(totalCount / pageSize)
    const currentPage = parseInt((window.location.href.match(/(?:[?&])page=(\d+)/) || [])[1] || "1")
    return { totalCount, currentPage, totalPages, pageSize }
  }

  window.__SGC.extractSellerProductList = extractSellerProductList
  window.__SGC.readPageInfo = readPageInfo
})()
