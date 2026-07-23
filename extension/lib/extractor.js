(function () {
  function isProductPage() {
    const p = window.location.pathname
    return p.includes('-i.') || p.startsWith('/product/')
  }

  function isSellerEditPage() {
    return window.location.hostname === 'seller.shopee.tw'
  }

  function extractItemShopIds() {
    const m = window.location.pathname.match(/-i\.(\d+)\.(\d+)/)
    if (m) return { shopid: m[1], itemid: m[2] }
    const m2 = window.location.pathname.match(/\/product\/(\d+)\/(\d+)/)
    if (m2) return { shopid: m2[1], itemid: m2[2] }
    return null
  }

  function extractFromMeta() {
    const r = { title: '', price: '', description: '', images: [], videos: [] }

    const ogTitle = document.querySelector('meta[property="og:title"]')
    if (ogTitle) r.title = ogTitle.getAttribute('content') || ''

    const ogDesc = document.querySelector('meta[property="og:description"]')
    if (ogDesc) r.description = ogDesc.getAttribute('content') || ''

    const ogImages = document.querySelectorAll('meta[property="og:image"]')
    ogImages.forEach(el => {
      const url = el.getAttribute('content')
      if (url) r.images.push(url)
    })

    const priceMeta = document.querySelector('meta[property="product:price:amount"]')
    if (priceMeta) r.price = (priceMeta.getAttribute('content') || '').trim()

    return r
  }

  function extractFromScripts() {
    const scripts = document.querySelectorAll('script')
    for (const s of scripts) {
      const text = s.textContent || ''
      if (text.includes('window.__INITIAL_STATE__')) {
        try {
          const jsonStr = text.replace(/^[^=]*=\s*/, '').replace(/;?\s*$/, '')
          const data = JSON.parse(jsonStr)
          const product = data?.productDetail?.product || data?.product || data?.item || data?.pageData?.product || {}
          const shop = data?.productDetail?.shop || data?.shop || {}
          const r = { title: '', price: '', description: '', images: [], videos: [] }
          r.shop_name = shop?.account?.username || shop?.username || ''
          if (product.name) r.title = product.name
          if (product.price) r.price = (product.price / 100000).toString()
          if (product.price_max) r.price = `${r.price} ~ ${product.price_max / 100000}`
          if (product.description) {
            const d = document.createElement('div')
            d.innerHTML = product.description
            r.description = d.textContent || d.innerText || ''
            r.description = window.__SGC.cleanDescription(r.description)
          }

          const allImgUrls = []
          const imgSourceArrays = [
            product.images, product.image_list, product.img_list, product.album
          ]
          for (const arr of imgSourceArrays) {
            if (Array.isArray(arr)) {
              arr.forEach(img => {
                const u = window.__SGC.resolveImgUrl(img)
                if (u) allImgUrls.push(u)
              })
            }
          }
          if (Array.isArray(product.models)) {
            product.models.forEach(model => {
              const u = window.__SGC.resolveImgUrl(model.image || model.image_id || model.image_url || '')
              if (u) allImgUrls.push(u)
            })
          }
          if (Array.isArray(product.tier_variations)) {
            product.tier_variations.forEach(tv => {
              if (Array.isArray(tv.images)) {
                tv.images.forEach(img => {
                  const u = window.__SGC.resolveImgUrl(img)
                  if (u) allImgUrls.push(u)
                })
              }
            })
          }
          r.images = [...new Set(allImgUrls)].filter(Boolean)

          if (!r.images.length) {
            const dump = JSON.stringify(data).match(/"tw-[a-z0-9]+"/g)
            if (dump) {
              const ids = [...new Set(dump.map(s => s.replace(/"/g, '')))]
              r.images = ids.map(id => `https://${window.__SGC.SHOPEE_IMG_DOMAIN}/file/${id}`)
            }
          }
          if (product.video_info) {
            if (product.video_info.url) r.videos.push(product.video_info.url)
            if (product.video_info.video_url) r.videos.push(product.video_info.video_url)
            if (Array.isArray(product.video_info.video_url_list)) {
              r.videos.push(...product.video_info.video_url_list)
            }
          }
          if (r.title || r.price || r.description || r.images.length) return r
        } catch (e) {
          console.warn('[SGC] __INITIAL_STATE__ parse error:', e)
        }
      }
    }
    return null
  }

  function extractFromDOM() {
    const r = { title: '', price: '', description: '', images: [], videos: [] }

    const h1 = document.querySelector('h1')
    if (h1) r.title = h1.textContent.trim()

    const priceLive = document.querySelector('[aria-live="polite"]')
    if (priceLive) {
      const t = priceLive.textContent.trim()
      if (t.match(/[\d,]+/) && (t.includes('$') || t.includes('NT$'))) {
        r.price = t.replace(/\s+/g, ' ').trim()
      }
    }
    if (!r.price) {
      const priceSelectors = [
        '[class*="price"]', '[class*="Price"]', '[class*="currency"]',
        '[class*="Currency"]', '[data-testid*="price"]', '.product-price'
      ]
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel)
        if (!el) continue
        const t = el.textContent.trim()
        if (t.match(/[\d,]+/) && (t.includes('$') || t.includes('NT$'))) {
          r.price = t.replace(/\s+/g, ' ').trim()
          break
        }
      }
    }

    let descriptionText = ''
    const descHeaders = Array.from(document.querySelectorAll('h2, div, h3, span')).filter(el => {
      const t = el.textContent.trim()
      return (t === '商品描述' || t === '商品詳情') && el.children.length === 0
    })

    if (descHeaders.length > 0) {
      const header = descHeaders[0]
      let contentEl = header.nextElementSibling
      if (!contentEl && header.parentElement) {
        contentEl = header.parentElement.nextElementSibling
      }
      if (contentEl) {
        const text = contentEl.innerText || ''
        if (text && !text.includes('商品評價') && !text.includes('客服中心')) {
          descriptionText = text.trim()
        }
      }
    }

    if (!descriptionText) {
      const allText = document.body?.innerText || ''
      const descMatch = allText.match(/(?:商品描述|商品詳情)\s*([\s\S]*?)(?=商品評價|評價|客服中心|幫助中心|關注我們|©\s*\d+|$)/)
      if (descMatch && descMatch[1].trim()) {
        descriptionText = descMatch[1].trim()
      } else {
        const backupMatch = allText.match(/(?:商品描述|商品詳情)[\s\S]{1,1500}/)
        if (backupMatch) {
          descriptionText = backupMatch[0].replace(/^(?:商品描述|商品詳情)\s*/, '').trim()
        }
      }
    }

    if (descriptionText) {
      r.description = window.__SGC.cleanDescription(descriptionText)
    }

    function isProductImg(el) {
      const alt = (el.getAttribute('alt') || '').toLowerCase()
      const badAlt = [
        '造訪賣場', 'logo', 'avatar', '頭像', '商標', '商店', '賣場',
        'shop', 'seller', 'visit', '店鋪', '客服', '聊聊',
        '蝦皮', 'shopee', 'icon', '圖標', '分享', 'share'
      ]
      if (badAlt.some(kw => alt.includes(kw))) return false

      for (const attr of ['src', 'srcset', 'data-src', 'data-srcset']) {
        const val = (el.getAttribute(attr) || '').toLowerCase()
        if (val.includes('_tn') || val.includes('avatar') || val.includes('logo') || val.includes('/icon')) return false
      }

      const badClasses = [
        'avatar', 'logo', 'seller', 'store-', 'recommend', 'similar',
        'related', 'foryou', 'suggest', 'comment', 'review', 'rating',
        'feedback', 'navbar', 'nav-bar', 'navigation', 'sidebar', 'side-bar',
        'banner', 'shop-header', 'shop-info', 'shop-detailed', 'shop-card',
        'shop-page', 'shop-avatar', 'shop-owner', 'shop-decor', 'shop-nav'
      ]
      const closeSelector = badClasses.map(c => `[class*="${c}"]`).join(', ')
        + ', header, footer, nav, aside'
      if (el.closest(closeSelector)) return false

      const link = el.closest('a')
      if (link) {
        const href = (link.getAttribute('href') || '').toLowerCase()
        if (href.includes('/shop/') || href.includes('shop_id=') || href.includes('seller/')) return false
      }

      return true
    }

    function extractUrlsFromString(str) {
      if (!str) return []
      if (str.startsWith('data:')) return []
      const urls = []
      const items = str.split(',')
      for (const item of items) {
        const trimmed = item.trim()
        if (!trimmed) continue
        const urlPart = trimmed.split(/\s+/)[0]
        if (urlPart && (urlPart.startsWith('http') || urlPart.startsWith('//'))) {
          let cleanUrl = urlPart
          if (cleanUrl.startsWith('//')) {
            cleanUrl = 'https:' + cleanUrl
          }
          urls.push(cleanUrl)
        }
      }
      return urls
    }

    function normalizeImageUrl(url) {
      if (!url) return null
      if (url.startsWith('data:')) return null
      let clean = url
      if (clean.startsWith('//')) {
        clean = 'https:' + clean
      }
      clean = clean.split('@')[0].split('?')[0]
      return clean
    }

    const seen = new Set()

    const galleryItems = document.querySelectorAll(
      '[class*="mdCA_C"] img, [class*="mdCA_C"] source, ' +
      '[class*="uRJsr5"] img, [class*="uRJsr5"] source, ' +
      '[class*="carousel"] img, [class*="carousel"] source, ' +
      '[class*="gallery"] img, [class*="gallery"] source'
    )

    galleryItems.forEach(el => {
      const attrs = ['src', 'data-src', 'srcset', 'data-srcset']
      attrs.forEach(attr => {
        const val = el.getAttribute(attr)
        if (!val) return
        const urls = extractUrlsFromString(val)
        urls.forEach(url => {
          const base = normalizeImageUrl(url)
          if (!base) return
          if (!seen.has(base)) {
            seen.add(base)
            r.images.push(base)
            console.log(`[SGC] Extracted from gallery element attribute [${attr}]:`, base)
          }
        })
      })
    })

    document.querySelectorAll('img, source').forEach(el => {
      if (el.closest('[class*="i9ihcI"]')) return
      if (!isProductImg(el)) return
      const attrs = ['src', 'data-src', 'srcset', 'data-srcset']
      attrs.forEach(attr => {
        const val = el.getAttribute(attr)
        if (!val) return
        const urls = extractUrlsFromString(val)
        urls.forEach(url => {
          const base = normalizeImageUrl(url)
          if (!base) return

          const lower = base.toLowerCase()
          if (lower.includes('susercontent.com') || lower.includes('shopeemobile.com') || lower.includes('down-tw.img')) {
            const w = parseInt(el.getAttribute('width')) || el.naturalWidth || el.width || 0
            const h = parseInt(el.getAttribute('height')) || el.naturalHeight || el.height || 0
            if (w > 0 && h > 0 && (w < 100 || h < 100)) return
            if (!seen.has(base)) {
              seen.add(base)
              r.images.push(base)
              console.log(`[SGC] Extracted from general page element [${attr}]:`, base)
            }
          }
        })
      })
    })

    const videos = document.querySelectorAll('video source[src], video[src]')
    const vSeen = new Set()
    videos.forEach(v => {
      const src = v.src || v.getAttribute('src') || ''
      if (src && !vSeen.has(src)) {
        vSeen.add(src)
        r.videos.push(src)
      }
    })
    const allSources = document.querySelectorAll('source[src*="shopeemobile.com"], source[src*="video"]')
    allSources.forEach(s => {
      const src = s.src || s.getAttribute('src') || ''
      if (src && !vSeen.has(src)) {
        vSeen.add(src)
        r.videos.push(src)
      }
    })

    return r
  }

  function extractFromJSONLD() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')
    for (const s of scripts) {
      try {
        const raw = JSON.parse(s.textContent)
        const items = raw?.['@graph'] || [raw]
        for (const data of items) {
          if (data?.['@type'] !== 'Product') continue
          const r = { title: '', price: '', description: '', images: [], videos: [] }
          if (data.name) r.title = data.name
          const imgs = Array.isArray(data.image) ? data.image : (data.image ? [data.image] : [])
          r.images = imgs.filter(Boolean)
          if (r.images.length) return r
        }
      } catch (e) { }
    }
    return null
  }

  function getCSRFToken() {
    const m = document.cookie.match(/(?:^|;\s*)SPC_([^=]+)=([^;]+)/)
    return m ? m[2] : ''
  }

  async function tryFetchAPI(shopid, itemid, version = 'v4') {
    const url = `https://shopee.tw/api/${version}/item/get?itemid=${itemid}&shopid=${shopid}`
    const resp = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': window.location.origin + '/',
      }
    })
    if (!resp.ok) return null
    const json = await resp.json()
    return json?.item || null
  }

  async function extractFromAPI(shopid, itemid) {
    try {
      let item = await tryFetchAPI(shopid, itemid, 'v4')
      if (!item) item = await tryFetchAPI(shopid, itemid, 'v2')
      if (!item) return null
      const r = { title: '', price: '', description: '', images: [], videos: [] }
      if (item.name) r.title = item.name
      if (item.price) r.price = (item.price / 100000).toString()
      if (item.price_max) r.price = `${r.price} ~ ${item.price_max / 100000}`
      if (item.description) {
        const d = document.createElement('div')
        d.innerHTML = item.description
        r.description = d.textContent || d.innerText || ''
        r.description = window.__SGC.cleanDescription(r.description)
      }
      const apiAllImgs = []
      ;[item.images, item.image_list, item.img_list, item.album].forEach(arr => {
        if (Array.isArray(arr)) arr.forEach(img => { const u = window.__SGC.resolveImgUrl(img); if (u) apiAllImgs.push(u) })
      })
      if (Array.isArray(item.models)) {
        item.models.forEach(m => { const u = window.__SGC.resolveImgUrl(m.image || m.image_id || ''); if (u) apiAllImgs.push(u) })
      }
      if (Array.isArray(item.tier_variations)) {
        item.tier_variations.forEach(tv => {
          if (Array.isArray(tv.images)) tv.images.forEach(img => { const u = window.__SGC.resolveImgUrl(img); if (u) apiAllImgs.push(u) })
        })
      }
      r.images = [...new Set(apiAllImgs)].filter(Boolean)
      if (item.video_info) {
        if (item.video_info.url) r.videos.push(item.video_info.url)
        if (item.video_info.video_url) r.videos.push(item.video_info.video_url)
        if (Array.isArray(item.video_info.video_url_list)) {
          r.videos.push(...item.video_info.video_url_list)
        }
      }
      if (r.title || r.price) return r
    } catch (e) {
      console.warn('[SGC] API error:', e)
    }
    return null
  }

  function triggerCarouselFullRender() {
    const all = Array.from(document.querySelectorAll('.mdCA_C'))
    console.log(`[SGC] triggerCarouselFullRender: total .mdCA_C=${all.length}`)

    let target = null
    const strip = document.querySelector('.o_Jpw2')
    if (strip) {
      target = strip.querySelector('.mdCA_C')
      console.log('[SGC] triggerCarouselFullRender: found .o_Jpw2, target=', !!target)
    }

    if (!target) {
      const safe = all.filter(el => !el.closest('[role="dialog"], [class*="odal"], [class*="opup"]'))
      console.log(`[SGC] triggerCarouselFullRender: safe=${safe.length}/${all.length}`)
      target = safe[1] || safe[0]
    }

    if (!target) {
      console.log('[SGC] triggerCarouselFullRender: no target found, giving up')
      return false
    }

    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    target.click()
    console.log('[SGC] triggerCarouselFullRender: clicked')
    return true
  }

  async function waitForCarouselStable(target = 9) {
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => requestAnimationFrame(r))
    if (document.querySelectorAll('.mdCA_C').length >= target) return
    await new Promise(r => setTimeout(r, 500))
  }

  async function extractProductData() {
    if (!isProductPage()) return { error: '不在商品頁面上' }

    const ids = extractItemShopIds()
    let data = extractFromScripts()
    if (!data) data = extractFromJSONLD()
    if (!data) data = extractFromMeta()

    let apiData = null
    if (ids) {
      apiData = await extractFromAPI(ids.shopid, ids.itemid)
    }

    if (data && apiData && apiData.images.length) {
      data.images = [...data.images, ...apiData.images]
    }
    if (!data && apiData) data = apiData

    if (!isSellerEditPage()) {
      triggerCarouselFullRender()
      await waitForCarouselStable()
    }

    const domData = extractFromDOM()
    if (!data) data = domData
    else {
      if (!data.title && domData.title) data.title = domData.title
      if (!data.price && domData.price) data.price = domData.price
      if (!data.description && domData.description) data.description = domData.description
      data.images = [...data.images, ...domData.images]
      data.videos = [...data.videos, ...domData.videos]
    }

    data.images = window.__SGC.dedupe(data.images).filter(u => {
      if (!u) return false
      const lower = u.toLowerCase()
      return !lower.endsWith('.svg') && !/\.png/i.test(u) && !lower.includes('_tn') && !lower.includes('_cover')
    })

    const pngResults = await Promise.all(data.images.map(url =>
      new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'checkPngMagic', url }, resp => {
          resolve(resp?.isPng || false)
        })
      })
    ))
    data.images = data.images.filter((_, i) => !pngResults[i])
    const totalSlides = document.querySelectorAll('[class*="mdCA_C"]').length
    console.log(`[SGC] mdCA_C containers: ${totalSlides}, images collected: ${data.images.length}`)
    data.videos = window.__SGC.dedupe(data.videos)
    data.title = (data.title || document.title || '').replace(/\s*\|\s*蝦皮購物\s*$/, '')
    data.url = window.location.href
    if (ids) { data.shopid = ids.shopid; data.itemid = ids.itemid }

    if (!data.shop_name) {
      const scripts = document.querySelectorAll('script')
      for (const s of scripts) {
        const text = s.textContent || ''
        if (text.includes('window.__INITIAL_STATE__')) {
          try {
            const jsonStr = text.replace(/^[^=]*=\s*/, '').replace(/;?\s*$/, '')
            const initData = JSON.parse(jsonStr)
            const shop = initData?.productDetail?.shop || initData?.shop || {}
            data.shop_name = shop?.account?.username || shop?.username || ''
          } catch { }
          break
        }
      }
    }

    chrome.runtime.sendMessage({ action: 'saveRawProductData', data: data }).catch(() => { })

    return data
  }

  window.__SGC.extractProductData = extractProductData
})()
