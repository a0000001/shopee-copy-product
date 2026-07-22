// ═══════════════════════════════════════════════════════════════════════
// 蝦皮已上架商品全掃描 (點擊翻頁版) — 貼到 Console 按 Enter 即自動跑完
// ═══════════════════════════════════════════════════════════════════════
;(async function sgcScan() {
  const KEY = '__sgc_collected'
  const allItems = JSON.parse(sessionStorage.getItem(KEY) || '[]')
  const names = new Set(allItems.map(i => i.name))

  function collect() {
    let n = 0
    for (const a of document.querySelectorAll('a[href*="/portal/product/"]')) {
      const href = a.getAttribute('href') || ''
      if (!/\/portal\/product\/\d+/.test(href)) continue
      const name = a.textContent.trim()
      if (!name || names.has(name)) continue
      names.add(name)
      n++
      allItems.push({ name, productId: (href.match(/\/portal\/product\/(\d+)/)||[])[1]||'' })
    }
    return n
  }

  function pageInfo() {
    const t = document.body?.textContent || ''
    const total = parseInt((t.match(/總計\s*(\d+)\s*項/)||t.match(/共\s*(\d+)\s*筆/)||t.match(/(\d+)\s*件\s*商品/)||t.match(/架上商品\((\d+)\)/)||[])[1]||'0')
    const cur = parseInt(new URL(location.href).searchParams.get('page')||'1')
    return { total, cur, pages: Math.ceil(total/12) }
  }

  function clickNext() {
    for (const sel of [
      '.eds-pagination__next button,.eds-pagination__next',
      '[class*="pagination"] [class*="next"] button',
      'button[class*="next"],a[class*="next"]',
      'li.next a,li.next button,.ant-pagination-next'
    ]) {
      const el = document.querySelector(sel)
      if (!el) continue
      if (el.disabled||el.classList.contains('disabled')||el.getAttribute('aria-disabled')==='true') return false
      el.click(); return true
    }
    return false
  }

  function waitRender(ms=6000) {
    const tbl = document.querySelector('.eds-table__body,table tbody,[class*="table__body"]') || document.querySelector('table')
    if (!tbl) return new Promise(r => setTimeout(r, 2000))
    return new Promise(r => {
      let last = tbl.innerHTML
      const mo = new MutationObserver(() => {
        if (tbl.innerHTML !== last) { mo.disconnect(); setTimeout(r, 400) }
      })
      mo.observe(tbl, { childList: true, subtree: true })
      setTimeout(() => { mo.disconnect(); r() }, ms)
    })
  }

  // ══ 主迴圈 ══
  let { total, cur, pages } = pageInfo()
  const added = collect()
  console.log(`[SGC] ${cur}/${pages}頁 | ${allItems.length}/${total} (+${added})`)
  sessionStorage.setItem(KEY, JSON.stringify(allItems))

  while (cur < pages && allItems.length < total) {
    if (!clickNext()) { console.log('⚠️ 無下一頁按鈕'); break }
    await waitRender()
    collect()
    const info = pageInfo()
    cur = info.cur; total = info.total; pages = info.pages
    console.log(`[SGC] ${cur}/${pages}頁 | ${allItems.length}/${total}`)
    sessionStorage.setItem(KEY, JSON.stringify(allItems))
  }

  console.log(`✅ 掃描完成！共 ${allItems.length} 筆商品`)
  console.table(allItems)
  if (allItems.length>0) console.log('📋 複製用: copy(JSON.stringify(allItems))')
  sessionStorage.removeItem(KEY)
})()
