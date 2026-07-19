{
  // ===== 最小 DOM timing 測試 =====
  // 貼到蝦皮商品頁 Console 執行
  // 1) 立刻拍照（snapshot 1）
  // 2) 等 8 秒後再拍一次（snapshot 2）
  // 3) 比對差異

  const SHOPEE_IMG_DOMAIN = 'down-tw.img.susercontent.com'

  function extractFromDOM(label) {
    const images = []
    const seen = new Set()

    // 從縮圖區取 src, data-src, srcset, data-srcset
    const gallery = document.querySelectorAll(
      '[class*="mdCA_C"] img, [class*="mdCA_C"] source, ' +
      '[class*="uRJsr5"] img, [class*="uRJsr5"] source, ' +
      '[class*="carousel"] img, [class*="carousel"] source, ' +
      '[class*="gallery"] img, [class*="gallery"] source'
    )
    gallery.forEach(el => {
      ;['src', 'data-src', 'srcset', 'data-srcset'].forEach(attr => {
        const val = el.getAttribute(attr)
        if (!val) return
        val.split(',').forEach(part => {
          const url = (part.trim().split(/\s+/)[0] || '').replace(/@.*$/, '')
          if (url && (url.startsWith('http') || url.startsWith('//')) && !seen.has(url)) {
            seen.add(url)
            images.push(url.startsWith('//') ? 'https:' + url : url)
          }
        })
      })
    })

    // carousel container 數量
    const containers = document.querySelectorAll('[class*="mdCA_C"]').length

    console.log(`[${label}] mdCA_C containers: ${containers}`)
    console.log(`[${label}] gallery images extracted: ${images.length}`)
    if (images.length > 0) {
      console.log(`[${label}] first 3:`, images.slice(0, 3))
    }

    // 檢查 <picture> 裡的 img 到底有沒有 src
    const imgsInCarousel = document.querySelectorAll('[class*="mdCA_C"] img, [class*="uRJsr5"] img')
    console.log(`[${label}] <img> in carousel: ${imgsInCarousel.length}`)
    imgsInCarousel.forEach((img, i) => {
      const src = img.getAttribute('src') || '(none)'
      const ds = img.getAttribute('data-src') || '(none)'
      const srcset = img.getAttribute('srcset') || '(none)'
      console.log(`  img[${i}] src=${src.slice(0, 60)} data-src=${ds.slice(0, 60)} srcset=${srcset.slice(0, 60)}`)
    })

    // 檢查 <source> 的 srcset
    const sources = document.querySelectorAll('[class*="mdCA_C"] source, [class*="uRJsr5"] source')
    console.log(`[${label}] <source> in carousel: ${sources.length}`)
    sources.forEach((src, i) => {
      const ss = src.getAttribute('srcset') || '(none)'
      console.log(`  source[${i}] srcset=${ss.slice(0, 80)}`)
    })

    return images
  }

  // Snapshot 1: 立即
  console.log('===== SNAPSHOT 1: IMMEDIATE =====')
  const s1 = extractFromDOM('t0')

  // Snapshot 2: 等 8 秒
  setTimeout(() => {
    console.log('')
    console.log('===== SNAPSHOT 2: AFTER 8s DELAY =====')
    const s2 = extractFromDOM('t8')

    // 比對
    console.log('')
    console.log('===== COMPARISON =====')
    const s1urls = new Set(s1.map(u => u.replace(/@.*$/, '')))
    const s2urls = new Set(s2.map(u => u.replace(/@.*$/, '')))
    const added = [...s2urls].filter(u => !s1urls.has(u))
    const removed = [...s1urls].filter(u => !s2urls.has(u))
    console.log(`t0: ${s1.length} images,  t8: ${s2.length} images`)
    console.log(`新增 (t8 有但 t0 沒有): ${added.length}`)
    added.forEach(u => console.log('  +', u))
    console.log(`消失 (t0 有但 t8 沒有): ${removed.length}`)
    removed.forEach(u => console.log('  -', u))
    console.log('')
    console.log('推論:')
    if (added.length > 0) {
      console.log('  → 圖片會隨時間增加 → TIMING ISSUE（DOM 未完整渲染就被提取）')
    } else if (s1.length === 0 && s2.length === 0) {
      console.log('  → 等 8 秒後還是 0 張 → 選擇器失效或圖片根本不是透過 DOM 渲染')
    } else if (s1.length === s2.length && s1.length > 0) {
      console.log('  → 數量和內容都沒有變化 → 問題不在 DOM timing，在其他地方')
    }
  }, 8000)
}
