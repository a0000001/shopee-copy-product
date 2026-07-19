{
  // ===== DOM click 測試：點擊輪播觸發更多圖片 =====
  // 貼到蝦皮商品頁 Console 執行
  // 1) 立即拍照（snapshot 1）
  // 2) 探索並點擊箭頭 & 所有縮圖
  // 3) 等 3 秒再拍（snapshot 2）
  // 4) 比對

  function getImages() {
    const seen = new Set()
    const urls = []
    document.querySelectorAll(
      '[class*="mdCA_C"] img, [class*="mdCA_C"] source, ' +
      '[class*="uRJsr5"] img, [class*="uRJsr5"] source, ' +
      '[class*="carousel"] img, [class*="carousel"] source'
    ).forEach(el => {
      ;['src', 'data-src', 'srcset', 'data-srcset'].forEach(attr => {
        const val = el.getAttribute(attr)
        if (!val) return
        val.split(',').forEach(part => {
          const raw = part.trim().split(/\s+/)[0] || ''
          const url = raw.startsWith('//') ? 'https:' + raw : raw
          const clean = url.replace(/@.*$/, '')
          if (clean.startsWith('http') && !seen.has(clean)) {
            seen.add(clean)
            urls.push(clean)
          }
        })
      })
    })
    return urls
  }

  function logSnapshot(label, imgs) {
    console.log(`[${label}] images: ${imgs.length}`)
    imgs.forEach((u, i) => console.log(`  ${i}: ${u.split('/').pop()}`))
  }

  // Snapshot 1
  console.log('===== SNAPSHOT 1: IMMEDIATE =====')
  const s1 = getImages()
  logSnapshot('t0', s1)

  // 探索可點擊的輪播按鈕
  console.log('')
  console.log('===== EXPLORING CONTROLS =====')

  // 1. 找所有可能的「下一頁」箭頭
  const allButtons = document.querySelectorAll('button, [role="button"], [class*="arrow"], [class*="next"], [class*="chevron"], [class*="right"]')
  const arrows = []
  allButtons.forEach(btn => {
    const rect = btn.getBoundingClientRect()
    // 只考慮在輪播區附近的按鈕
    const carousel = btn.closest('[class*="mdCA_C"], [class*="carousel"], [class*="gallery"]')
    if (carousel || rect.width < 60) {
      arrows.push(btn)
    }
  })
  console.log(`found ${arrows.length} candidate arrow buttons`)
  arrows.forEach((b, i) => {
    const rect = b.getBoundingClientRect()
    const text = (b.textContent || '').trim().slice(0, 30)
    const cls = (b.className || '').slice(0, 40)
    console.log(`  btn[${i}] class="${cls}" text="${text}" pos=(${rect.left},${rect.top}) size=${rect.width}x${rect.height}`)
    try { b.click() } catch(e) { console.log(`    click failed: ${e.message}`) }
  })

  // 2. 點擊所有縮圖（觸發對應主圖載入）
  const thumbs = document.querySelectorAll('[class*="mdCA_C"], [class*="uRJsr5"]')
  console.log(`\nclicking ${thumbs.length} thumbnails...`)
  thumbs.forEach((t, i) => {
    try {
      t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      t.click()
    } catch(e) { console.log(`  thumb[${i}] click failed`) }
  })

  // 3. 等 3 秒
  setTimeout(() => {
    console.log('')
    console.log('===== SNAPSHOT 2: AFTER 3s + CLICKS =====')
    const s2 = getImages()
    logSnapshot('t3', s2)

    // 比對
    console.log('')
    console.log('===== COMPARISON =====')
    const added = s2.filter(u => !s1.includes(u))
    console.log(`t0: ${s1.length} → t3: ${s2.length}`)
    console.log(`新增: ${added.length}`)
    added.forEach(u => console.log('  +', u.split('/').pop()))
    if (added.length > 0) {
      console.log('\n→ 點擊觸發更多圖片載入 ✅ 可以用程式化點擊補圖')
    } else {
      console.log('\n→ 點擊也沒增加圖片 ❌ 問題不在輪播的互動載入')
      console.log('  推測：蝦皮可能透過 API 預載所有圖片 URL，但只 render 前 5 個縮圖')
      console.log('  解法方向：尋找頁面上的 JSON blob / React props / performance entries')
    }
  }, 3000)
}
