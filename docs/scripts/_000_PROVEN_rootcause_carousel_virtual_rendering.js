{
  // ===== 全自動輪播圖診斷 =====
  // 貼到蝦皮商品頁 Console 後按 Enter
  // 會自動：拍照 → 點箭頭 → 點縮圖 → 拍照比對

  console.log('===== SHOPEE CAROUSEL DIAGNOSTIC =====')
  console.log('URL:', window.location.href)
  console.log('')

  function getThumbnailImages() {
    const seen = new Set()
    const items = []
    document.querySelectorAll('.mdCA_C img[src*="file/"]').forEach(img => {
      const src = img.getAttribute('src')
      if (src && !seen.has(src)) { seen.add(src); items.push(src) }
    })
    return items
  }

  function getAllImages() {
    const seen = new Set()
    const items = []
    document.querySelectorAll('img[src*="file/"]').forEach(img => {
      const src = img.getAttribute('src')
      if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('avatar') && !seen.has(src)) {
        seen.add(src)
        // Keep base URL without resize params
        const clean = src.split('@')[0].split('?')[0]
        items.push(clean)
      }
    })
    return [...new Set(items)]
  }

  function clickElement(el, label) {
    if (!el) { console.log(`  ⚠️ ${label}: not found`); return false }
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      el.click()
      console.log(`  ✅ clicked ${label}`)
      return true
    } catch(e) { console.log(`  ❌ ${label} click error: ${e.message}`); return false }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  async function run() {
    // --- Phase 1: Immediate ---
    console.log('── Phase 1: IMMEDIATE ──')
    const thumbs1 = getThumbnailImages()
    const all1 = getAllImages()
    const thumbCount1 = document.querySelectorAll('.mdCA_C').length
    console.log(`  .mdCA_C containers: ${thumbCount1}`)
    console.log(`  thumb images: ${thumbs1.length}`)
    thumbs1.forEach((u,i) => console.log(`    [${i}] ${u.split('/').pop()}`))
    console.log(`  total images on page: ${all1.length}`)

    // --- Phase 2: Click right arrow ---
    console.log('')
    console.log('── Phase 2: CLICK RIGHT ARROW ──')
    const arrowBtns = document.querySelectorAll('button.t3PYzF, button.shopee-icon-button, [class*="arrow"]')
    let arrowClicked = false
    arrowBtns.forEach(btn => {
      const html = btn.outerHTML || ''
      if (html.includes('arrow right') || html.includes('chevron-right') || html.includes('icon arrow right')) {
        arrowClicked = clickElement(btn, 'right arrow') || arrowClicked
      }
    })
    if (!arrowClicked) console.log('  ⚠️ no right arrow found')

    await sleep(1500)

    const thumbs2 = getThumbnailImages()
    const all2 = getAllImages()
    const thumbCount2 = document.querySelectorAll('.mdCA_C').length
    console.log(`  .mdCA_C containers: ${thumbCount2}`)
    console.log(`  thumb images: ${thumbs2.length}`)
    thumbs2.forEach((u,i) => console.log(`    [${i}] ${u.split('/').pop()}`))
    
    const newAfterArrow = thumbs2.filter(u => !thumbs1.includes(u))
    if (newAfterArrow.length > 0) {
      console.log(`  🆕 NEW after arrow click: ${newAfterArrow.length}`)
      newAfterArrow.forEach(u => console.log(`    + ${u.split('/').pop()}`))
    }

    // --- Phase 3: Click all thumbnails ---
    console.log('')
    console.log('── Phase 3: CLICK ALL THUMBNAILS ──')
    const thumbs = document.querySelectorAll('.mdCA_C')
    console.log(`  clicking ${thumbs.length} thumbnails...`)
    thumbs.forEach((t, i) => {
      const img = t.querySelector('img')
      const label = img ? img.getAttribute('src').split('/').pop().slice(0,20) : `thumb ${i}`
      t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      t.click()
    })

    await sleep(2000)

    const thumbs3 = getThumbnailImages()
    const all3 = getAllImages()
    const thumbCount3 = document.querySelectorAll('.mdCA_C').length
    console.log(`  .mdCA_C containers: ${thumbCount3}`)
    console.log(`  thumb images: ${thumbs3.length}`)
    thumbs3.forEach((u,i) => console.log(`    [${i}] ${u.split('/').pop()}`))
    
    const newAfterThumbs = thumbs3.filter(u => !thumbs2.includes(u))
    if (newAfterThumbs.length > 0) {
      console.log(`  🆕 NEW after thumb clicks: ${newAfterThumbs.length}`)
      newAfterThumbs.forEach(u => console.log(`    + ${u.split('/').pop()}`))
    }

    // --- Phase 4: Click right arrow repeatedly ---
    console.log('')
    console.log('── Phase 4: CLICK RIGHT ARROW × 5 ──')
    for (let i = 0; i < 5; i++) {
      arrowBtns.forEach(btn => {
        const html = btn.outerHTML || ''
        if (html.includes('arrow right') || html.includes('chevron-right') || html.includes('icon arrow right')) {
          btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
          btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
          btn.click()
        }
      })
      await sleep(300)
    }
    await sleep(1500)

    const thumbs4 = getThumbnailImages()
    const all4 = getAllImages()
    const thumbCount4 = document.querySelectorAll('.mdCA_C').length
    console.log(`  .mdCA_C containers: ${thumbCount4}`)
    console.log(`  thumb images: ${thumbs4.length}`)
    thumbs4.forEach((u,i) => console.log(`    [${i}] ${u.split('/').pop()}`))
    
    const newAfterScroll = thumbs4.filter(u => !thumbs3.includes(u))
    if (newAfterScroll.length > 0) {
      console.log(`  🆕 NEW after scrolling: ${newAfterScroll.length}`)
      newAfterScroll.forEach(u => console.log(`    + ${u.split('/').pop()}`))
    }

    // --- Phase 5: Check the main display area separately ---
    console.log('')
    console.log('── Phase 5: MAIN DISPLAY AREA ──')
    const mainImg = document.querySelector('.BDieMJ img, [class*="BDieMJ"] img, .I88JaR img')
    if (mainImg) {
      const src = mainImg.getAttribute('src') || mainImg.getAttribute('data-src') || '(none)'
      console.log(`  main display img src: ${src.slice(0, 80)}`)
    }
    const popupImgs = document.querySelectorAll('.o_Jpw2 img[src*="file/"], .o0BjpS img[src*="file/"]')
    console.log(`  images in .o_Jpw2 / .o0BjpS: ${popupImgs.length}`)

    // --- Comparison Summary ---
    console.log('')
    console.log('═══════════════════════════════════')
    console.log('COMPARISON SUMMARY')
    console.log(`Phase 1 (immediate):  ${thumbs1.length} thumbs, ${all1.length} total`)
    console.log(`Phase 2 (arrow):      ${thumbs2.length} thumbs, ${all2.length} total`)
    console.log(`Phase 3 (thumb click): ${thumbs3.length} thumbs, ${all3.length} total`)
    console.log(`Phase 4 (scroll):     ${thumbs4.length} thumbs, ${all4.length} total`)
    
    if (thumbs1.length === thumbs4.length) {
      console.log('')
      console.log('→ 所有操作後縮圖數量沒變，問題不在輪播互動')
      console.log('  下一步：檢查頁面的 JSON 資料、React props、performance entries')
    } else if (thumbs4.length > thumbs1.length) {
      console.log('')
      console.log('→ 縮圖從 ' + thumbs1.length + ' 增加到 ' + thumbs4.length)
      console.log('  可以透過程式化互動補圖')
    }
  }

  run().catch(e => console.error('Error:', e))
}
