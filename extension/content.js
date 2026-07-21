(function () {
  console.log('[SGC] content.js loaded, URL:', window.location.href)
  const SHOPEE_IMG_DOMAIN = 'down-tw.img.susercontent.com'

  function isProductPage() {
    const p = window.location.pathname
    return p.includes('-i.') || p.startsWith('/product/')
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
          const r = { title: '', price: '', description: '', images: [], videos: [] }
          if (product.name) r.title = product.name
          if (product.price) r.price = (product.price / 100000).toString()
          if (product.price_max) r.price = `${r.price} ~ ${product.price_max / 100000}`
          if (product.description) {
            const d = document.createElement('div')
            d.innerHTML = product.description
            r.description = d.textContent || d.innerText || ''
            r.description = cleanDescription(r.description)
          }
          // 合併所有圖片來源，不再因為第一個有值就 break
          function resolveImgUrl(img) {
            let val = ''
            if (typeof img === 'string') {
              val = img
            } else if (img && typeof img === 'object') {
              val = img.url || img.image || img.image_url || img.image_id || ''
            }
            if (!val || typeof val !== 'string') return null
            if (val.startsWith('http') || val.startsWith('//')) {
              return val.startsWith('//') ? 'https:' + val : val
            }
            // 短 ID（e.g. "tw-abcdef..."）
            if (!val.includes('/')) {
              return `https://${SHOPEE_IMG_DOMAIN}/file/${val}`
            }
            return val
          }

          const allImgUrls = []
          const imgSourceArrays = [
            product.images, product.image_list, product.img_list, product.album
          ]
          for (const arr of imgSourceArrays) {
            if (Array.isArray(arr)) {
              arr.forEach(img => {
                const u = resolveImgUrl(img)
                if (u) allImgUrls.push(u)
              })
            }
          }
          // 變體圖片（models）
          if (Array.isArray(product.models)) {
            product.models.forEach(model => {
              const u = resolveImgUrl(model.image || model.image_id || model.image_url || '')
              if (u) allImgUrls.push(u)
            })
          }
          // 規格顏色圖片（tier_variations）
          if (Array.isArray(product.tier_variations)) {
            product.tier_variations.forEach(tv => {
              if (Array.isArray(tv.images)) {
                tv.images.forEach(img => {
                  const u = resolveImgUrl(img)
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
              r.images = ids.map(id => `https://${SHOPEE_IMG_DOMAIN}/file/${id}`)
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
      r.description = cleanDescription(descriptionText)
    }

    function isProductImg(el) {
      // 排除 alt 含店鋪/品牌相關字眼
      const alt = (el.getAttribute('alt') || '').toLowerCase()
      const badAlt = [
        '造訪賣場', 'logo', 'avatar', '頭像', '商標', '商店', '賣場',
        'shop', 'seller', 'visit', '店鋪', '客服', '聊聊',
        '蝦皮', 'shopee', 'icon', '圖標', '分享', 'share'
      ]
      if (badAlt.some(kw => alt.includes(kw))) return false

      // 排除 src/srcset 含 avatar/logo/icon 路徑的圖片
      for (const attr of ['src', 'srcset', 'data-src', 'data-srcset']) {
        const val = (el.getAttribute(attr) || '').toLowerCase()
        if (val.includes('_tn') || val.includes('avatar') || val.includes('logo') || val.includes('/icon')) return false
      }

      // 排除位於 shop 相關容器或頁首/頁尾/側欄/導覽等語意容器中的圖片
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

      // 排除外連至賣場頁的連結內圖片
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
    
    // 1. 先處理輪播圖與縮圖容器 (mdCA_C, uRJsr5, carousel, gallery)
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

    // 2. 搜尋頁面上其他符合商品圖片特徵的 img 和 source
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
      } catch (e) {}
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
        r.description = cleanDescription(r.description)
      }
      // 合併 API 回傳的所有圖片來源
      function resolveApiImgUrl(img) {
        let val = ''
        if (typeof img === 'string') val = img
        else if (img && typeof img === 'object') val = img.url || img.image || img.image_url || img.image_id || ''
        if (!val) return null
        if (val.startsWith('http') || val.startsWith('//')) return val.startsWith('//') ? 'https:' + val : val
        if (!val.includes('/')) return `https://${SHOPEE_IMG_DOMAIN}/file/${val}`
        return val
      }
      const apiAllImgs = []
      ;[item.images, item.image_list, item.img_list, item.album].forEach(arr => {
        if (Array.isArray(arr)) arr.forEach(img => { const u = resolveApiImgUrl(img); if (u) apiAllImgs.push(u) })
      })
      if (Array.isArray(item.models)) {
        item.models.forEach(m => { const u = resolveApiImgUrl(m.image || m.image_id || ''); if (u) apiAllImgs.push(u) })
      }
      if (Array.isArray(item.tier_variations)) {
        item.tier_variations.forEach(tv => {
          if (Array.isArray(tv.images)) tv.images.forEach(img => { const u = resolveApiImgUrl(img); if (u) apiAllImgs.push(u) })
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

  // ──────────────────────────────────────────────
  // Carousel virtual rendering fix
  // ──────────────────────────────────────────────
  function triggerCarouselFullRender() {
    const all = Array.from(document.querySelectorAll('.mdCA_C'))
    console.log(`[SGC] triggerCarouselFullRender: total .mdCA_C=${all.length}`)

    // Strategy 1: .o_Jpw2 container (CSS Modules hash for thumbnail strip)
    let target = null
    const strip = document.querySelector('.o_Jpw2')
    if (strip) {
      target = strip.querySelector('.mdCA_C')
      console.log('[SGC] triggerCarouselFullRender: found .o_Jpw2, target=', !!target)
    }

    // Strategy 2: second .mdCA_C outside dialog/popup（避開第一個避免觸發 popup/video）
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

    // ── 觸發 carousel 完整渲染（僅 shopee.tw 商品頁，不影響 seller 頁面） ──
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

    data.images = dedupe(data.images).filter(u => {
      if (!u) return false
      const lower = u.toLowerCase()
      return !lower.endsWith('.svg') && !/\.png/i.test(u) && !lower.includes('_tn') && !lower.includes('_cover')
    })
    // PNG magic number check at collection time (CDN URLs have no extension)
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
    data.videos = dedupe(data.videos)
    data.title = (data.title || document.title || '').replace(/\s*\|\s*蝦皮購物\s*$/, '')
    data.url = window.location.href
    if (ids) { data.shopid = ids.shopid; data.itemid = ids.itemid }

    return data
  }

  function dedupe(arr) {
    return [...new Set(arr)]
  }

  function cleanDescription(text) {
    if (!text) return ''
    const trashKeywords = [
      '商品評價',
      '全部5 星',
      '客服中心',
      '幫助中心',
      '關於蝦皮',
      '關注我們',
      '下載蝦皮',
      '版權所有',
      '©'
    ]
    let cleaned = text
    for (const kw of trashKeywords) {
      const idx = cleaned.indexOf(kw)
      if (idx !== -1) {
        cleaned = cleaned.substring(0, idx)
      }
    }
    return cleaned.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  }

  // ──────────────────────────────────────────────
  // Seller page: fill fields
  // ──────────────────────────────────────────────
  function isSellerEditPage() {
    return window.location.hostname === 'seller.shopee.tw'
  }

  function setNativeValue(input, value) {
    if (input.classList.contains('ql-editor')) {
      input.innerHTML = '<p>' + value.split('\n').join('</p><p>') + '</p>'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('blur', { bubbles: true }))
      return
    }

    const proto = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ) || Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )
    if (proto?.set) proto.set.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    input.focus()
  }

  function waitForElement(selector, timeout = 2000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector)
      if (el) return resolve(el)
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector)
        if (el) {
          observer.disconnect()
          resolve(el)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      setTimeout(() => {
        observer.disconnect()
        resolve(null)
      }, timeout)
    })
  }

  function findFieldByLabel(labelText) {
    const fieldIdMap = {
      '商品名稱': 'name',
      '商品描述': 'description',
      '價格': 'price',
      '商品數量': 'stock',
      '最低購買數量': 'minpq',
      '重量': 'weight',
      '主商品貨號': 'parentSku',
      '國際條碼': 'gtinCode',
    }
    const cleanLabel = labelText.trim().replace(/[\s*]+/g, '')
    const fieldId = Object.entries(fieldIdMap).find(([k]) => cleanLabel.includes(k) || k.includes(cleanLabel))?.[1]
    
    if (fieldId) {
      const el = document.querySelector(`[data-product-edit-field-unique-id="${fieldId}"] input.eds-input__input, [data-product-edit-field-unique-id="${fieldId}"] textarea.eds-input__input, [data-product-edit-field-unique-id="${fieldId}"] .ql-editor`)
      if (el) return el
    }

    for (const row of document.querySelectorAll('.edit-row')) {
      const labelEl = row.querySelector('.edit-label span:not(.mandatory-icon), .edit-label .item-title, .edit-label')
      if (!labelEl) continue
      const text = (labelEl.textContent || '').trim().replace(/[\s*]+/g, '')
      if (text === cleanLabel || text.includes(cleanLabel) || cleanLabel.includes(text)) {
        const input = row.querySelector('input.eds-input__input, textarea.eds-input__input, .ql-editor')
        if (input) return input
      }
    }

    const labels = document.querySelectorAll('.ant-form-item-label label, label')
    for (const lb of labels) {
      const text = lb.textContent.trim().replace(/[\s*]+/g, '')
      if (text !== cleanLabel) continue
      const forId = lb.getAttribute('for')
      if (forId) { const el = document.getElementById(forId); if (el) return el }
      const next = lb.nextElementSibling
      if (next && next.matches('input, textarea, select')) return next
      const item = lb.closest('.ant-form-item, [class*="form-item"], [class*="field"]')
      if (item) { const el = item.querySelector('input, textarea'); if (el) return el }
    }
    return null
  }

  async function fillFieldAsync(value, ...strategies) {
    for (const s of strategies) {
      let el = null
      if (typeof s === 'string') {
        el = await waitForElement(s, 1000)
      } else if (typeof s === 'function') {
        el = s()
        if (!el) {
          await new Promise(r => setTimeout(r, 200))
          el = s()
        }
      }
      if (el) {
        console.log('[SGC] fill via strategy:', s)
        setNativeValue(el, value)
        return { ok: true }
      }
    }
    return { ok: false, error: '找不到欄位' }
  }

  async function fillBrandAsync(brandName = 'NoBrand') {
    let brandContainer = document.querySelector('[data-product-edit-field-unique-id="brandAndAttributes"] .eds-select')
    let container = brandContainer || document.querySelector('.product-brand-item .eds-select, .attribute-select-item .eds-select')
    if (!container) {
      console.log('[SGC] Brand container not found, waiting...')
      await waitForElement('[data-product-edit-field-unique-id="brandAndAttributes"] .eds-select, .product-brand-item .eds-select, .attribute-select-item .eds-select', 2000)
      brandContainer = document.querySelector('[data-product-edit-field-unique-id="brandAndAttributes"] .eds-select')
      container = brandContainer || document.querySelector('.product-brand-item .eds-select, .attribute-select-item .eds-select')
    }
    if (!container) return { ok: false, error: '找不到品牌欄位容器' }
    
    const selector = container.querySelector('.eds-selector')
    if (!selector) return { ok: false, error: '找不到品牌下拉觸發器' }
    
    selector.focus()
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    selector.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    selector.click()
    console.log('[SGC] Clicked brand selector')
    
    const menu = await waitForElement('.eds-select__menu, .eds-dropdown-menu, .eds-select-popover', 1500)
    if (!menu) return { ok: false, error: '下拉選單未顯示' }
    
    // 輪詢等待選項渲染（最多等 3 秒），因為品牌選項可能是非同步載入
    let options = []
    for (let i = 0; i < 30; i++) {
      const rawOptions = Array.from(document.querySelectorAll('.eds-option, .eds-select__option, .eds-select-popover .option, .eds-select__menu_no_top_radius div[index], [class*="option"]'))
      const filtered = rawOptions.filter(opt => {
        const className = typeof opt.className === 'string' ? opt.className : ''
        if (className.includes('options') || className.includes('menu') || className.includes('wrapper') || className.includes('scrollbar')) {
          return false
        }
        if (opt.querySelector('.eds-option, .eds-select__option, .option')) {
          return false
        }
        return true
      })
      if (filtered.length > 0) {
        options = filtered
        break
      }
      await new Promise(r => setTimeout(r, 100))
    }
    console.log(`[SGC] Found ${options.length} brand options`)
    
    const target = options.find(opt => {
      const txt = (opt.textContent || '').trim().toLowerCase()
      return txt === brandName.toLowerCase() || 
             txt === 'nobrand' || 
             txt === '無品牌' ||
             txt.includes(brandName.toLowerCase()) ||
             txt.includes('自有') ||
             txt.includes('其他品牌') ||
             txt.includes('nobrand')
    })
    
    if (target) {
      if (target.focus) target.focus()
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      target.click()
      console.log('[SGC] Clicked brand option:', target.textContent.trim())
      return { ok: true }
    }
    
    if (options.length > 0) {
      const fallbackOpt = options[0]
      if (fallbackOpt.focus) fallbackOpt.focus()
      fallbackOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      fallbackOpt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      fallbackOpt.click()
      console.log('[SGC] Fallback: Clicked first brand option:', fallbackOpt.textContent.trim())
      return { ok: true }
    }
    
    return { ok: false, error: `找不到品牌選項：${brandName}` }
  }

  async function fillCategoryAsync() {
    // 檢查是否已選擇正確類別
    const trigger = document.querySelector('.product-category-box-inner, .product-category-box, [data-product-edit-field-unique-id="category"] .product-category-box-inner')
    if (trigger) {
      const text = (trigger.textContent || '').trim()
      if (text.includes('電腦與周邊配件') && text.includes('軟體')) {
        console.log('[SGC] Category "電腦與周邊配件 > 軟體" is already selected.')
        return { ok: true, alreadySelected: true }
      }
    }

    if (!trigger) {
      return { ok: false, error: '找不到類別選擇框' }
    }

    // 點擊展開類別選擇彈窗
    trigger.focus && trigger.focus()
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    trigger.click()
    console.log('[SGC] Clicked category selector')

    // 等待類別選擇彈窗載入
    const modalList = await waitForElement('.category-list', 2000)
    if (!modalList) {
      return { ok: false, error: '類別選擇選單未顯示' }
    }

    // 遍歷所有層級，直到無新欄位產生
    let colIdx = 0
    const maxLevels = 5 // 安全上限，避免無窮迴圈
    
    while (colIdx < maxLevels) {
      console.log(`[SGC] Processing category column ${colIdx}`)
      
      // 等待該欄位出現 (第 0 欄直接取得，後續欄位等待渲染)
      let col = null
      if (colIdx === 0) {
        col = document.querySelector('.category-list .scroll-item')
      } else {
        // 等待第 colIdx 個欄位出現 (500ms max wait, checking every 50ms)
        for (let i = 0; i < 10; i++) {
          const cols = document.querySelectorAll('.category-list .scroll-item')
          if (cols.length > colIdx) {
            col = cols[colIdx]
            break
          }
          await new Promise(r => setTimeout(r, 50))
        }
      }
      
      if (!col) {
        console.log(`[SGC] Column ${colIdx} did not appear, assuming leaf reached.`)
        break
      }
      
      // 在此欄中選擇適當的項目
      const items = col.querySelectorAll('.category-item')
      if (items.length === 0) {
        console.log(`[SGC] Column ${colIdx} has no items.`)
        break
      }
      
      let targetItem = null
      if (colIdx === 0) {
        // 第一級：尋找「電腦與周邊配件」
        targetItem = Array.from(items).find(el => (el.textContent || '').includes('電腦與周邊配件'))
      } else if (colIdx === 1) {
        // 第二級：尋找「軟體」
        targetItem = Array.from(items).find(el => (el.textContent || '').includes('軟體'))
      } else {
        // 第三級及以上：優先尋找「其他」（可能叫「其他」或「其他軟體」等）
        targetItem = Array.from(items).find(el => {
          const text = (el.textContent || '').trim()
          return text === '其他' || text.includes('其他') || text.toLowerCase().includes('other')
        })
      }
      
      // 如果沒找到，預設選擇第一個選項
      if (!targetItem) {
        targetItem = items[0]
        console.log(`[SGC] Target not found in column ${colIdx}, fallback to first item:`, targetItem.textContent.trim())
      } else {
        console.log(`[SGC] Found target in column ${colIdx}:`, targetItem.textContent.trim())
      }
      
      // 點擊選取
      targetItem.scrollIntoView && targetItem.scrollIntoView({ block: 'nearest' })
      targetItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      targetItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      targetItem.click()
      
      // 等待 200ms 以讓子級選單有時間觸發載入
      await new Promise(r => setTimeout(r, 200))
      colIdx++
    }

    function findCategoryConfirmButton() {
      // 1. 尋找包含 .category-list 的 modal/dialog 容器
      const categoryModal = Array.from(document.querySelectorAll(
        '.eds-modal, .category-dialog, .product-category-selector-modal, div[role="dialog"], .category-dialog-footer'
      )).find(m => m.querySelector('.category-list') || m.querySelector('.category-item'))
      
      if (!categoryModal) {
        console.log('[SGC] Category modal container not found')
        return null
      }

      // 2. 在該 modal 中尋找 primary 按鈕或含有 "確定"/"Confirm" 文字的按鈕
      const primaryBtn = categoryModal.querySelector('.eds-button--primary, button.eds-button--primary')
      if (primaryBtn) {
        console.log('[SGC] Found primary button in category modal:', primaryBtn.textContent.trim())
        return primaryBtn
      }

      // 3. Fallback: 尋找該 modal 內的所有 button，篩選文字
      const buttons = Array.from(categoryModal.querySelectorAll('button, .eds-button'))
      for (const btn of buttons) {
        const txt = (btn.textContent || '').trim()
        if (txt === '確定' || txt === '确定' || txt === 'Confirm' || txt === 'OK' || txt.includes('確定')) {
          console.log('[SGC] Found button by text in category modal:', txt)
          return btn
        }
      }

      // 4. 更寬鬆的尋找：只要在 modal 底部（footer）的 primary 按鈕
      const footerBtn = categoryModal.querySelector('[class*="footer"] .eds-button--primary, [class*="footer"] button')
      if (footerBtn) {
        console.log('[SGC] Found footer button in category modal:', footerBtn.textContent.trim())
        return footerBtn
      }

      return null
    }

    // 等待確定按鈕可用 (等待最多 3 秒)
    let confirmBtn = null
    for (let i = 0; i < 30; i++) {
      confirmBtn = findCategoryConfirmButton()
      if (confirmBtn) {
        const isDisabled = confirmBtn.disabled || 
                           confirmBtn.hasAttribute('disabled') || 
                           confirmBtn.classList.contains('eds-button--disabled') ||
                           confirmBtn.getAttribute('disabled') === 'true'
        if (!isDisabled) {
          console.log('[SGC] Category confirm button is enabled!')
          break
        }
      }
      await new Promise(r => setTimeout(r, 100))
    }

    if (confirmBtn) {
      const isDisabled = confirmBtn.disabled || 
                         confirmBtn.hasAttribute('disabled') || 
                         confirmBtn.classList.contains('eds-button--disabled') ||
                         confirmBtn.getAttribute('disabled') === 'true'
      if (isDisabled) {
        console.warn('[SGC] Category confirm button is still disabled, clicking anyway...')
      }
      
      // 稍微延遲以防 Vue 3 未載入事件監聽器
      await new Promise(r => setTimeout(r, 200))
      
      confirmBtn.focus && confirmBtn.focus()
      confirmBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }))
      confirmBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }))
      confirmBtn.click()
      console.log('[SGC] Clicked category confirm button')
    } else {
      return { ok: false, error: '找不到類別確認按鈕' }
    }

    // 等待屬性與品牌欄位載入
    const brandField = await waitForElement('[data-product-edit-field-unique-id="brandAndAttributes"]', 2000)
    if (!brandField) {
      console.warn('[SGC] Dynamic fields did not render in time, proceeding anyway')
    } else {
      console.log('[SGC] Dynamic fields loaded')
    }

    return { ok: true }
  }

  async function downloadMediaAsFile(url, filename, mimeType, skipPng = false) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'fetchBlob', url }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!response || !response.ok) {
          reject(new Error(response?.error || '下載失敗'))
          return
        }
        try {
          const base64 = response.data.base64
          const type = response.data.type || mimeType || 'image/jpeg'
          if (skipPng && (type === 'image/png' || type === 'image/x-png')) {
            reject(new Error('SKIP_PNG'))
            return
          }
          const binaryString = atob(base64)
          const len = binaryString.length
          const bytes = new Uint8Array(len)
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          if (skipPng) {
            const pngMagic = [0x89, 0x50, 0x4E, 0x47]
            if (bytes.length >= 4 && pngMagic.every((b, i) => bytes[i] === b)) {
              reject(new Error('SKIP_PNG'))
              return
            }
          }
          const blob = new Blob([bytes], { type })
          const file = new File([blob], filename, { type })
          resolve(file)
        } catch (err) {
          reject(err)
        }
      })
    })
  }

  async function uploadMediaAsync(data) {
    const mediaResults = []
    
    // 重建 images 陣列：從 images 取，或從 ps_item_* 欄位重建（相容舊版 JSON）
    let images = Array.isArray(data.images) ? data.images : []
    if (images.length === 0) {
      for (let i = 0; i < 9; i++) {
        const key = i === 0 ? 'ps_item_cover_image' : `ps_item_image_${i}`
        const url = data[key]
        if (url) images.push(url)
      }
    }

    const videos = Array.isArray(data.videos) ? data.videos : []

    if (images.length > 0) {
      console.log(`[SGC] Found ${images.length} images to upload`)
      const imageContainer = document.querySelector('[data-product-edit-field-unique-id="images"]')
      
      if (!imageContainer) {
        mediaResults.push({ field: '商品圖片', ok: false, error: '找不到圖片上傳容器' })
      } else {
        const fileInputs = Array.from(imageContainer.querySelectorAll('input[type="file"]'))
        if (fileInputs.length === 0) {
          mediaResults.push({ field: '商品圖片', ok: false, error: '找不到圖片上傳 input 欄位' })
        } else {
          // 收集已上傳的圖片 URL，用於去重
          const existingUrls = new Set()
          imageContainer.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || img.getAttribute('data-src') || ''
            if (src) existingUrls.add(src.split('?')[0].replace(/\/$/, ''))
          })

          const downloadedFiles = []
          for (const url of images) {
            const cleanUrl = url.split('?')[0].replace(/\/$/, '')
            if (existingUrls.has(cleanUrl)) {
              console.log(`[SGC] Skipping already uploaded image: ${url}`)
              continue
            }
            if (downloadedFiles.length >= 9) {
              console.log('[SGC] Reached 9-image limit, skipping remaining')
              break
            }
            try {
              let ext = 'jpg'
              if (url.includes('.png') || url.includes('.PNG')) ext = 'png'
              const filename = `img_${Date.now()}_${downloadedFiles.length + 1}.${ext}`
              const file = await downloadMediaAsFile(url, filename, ext === 'png' ? 'image/png' : 'image/jpeg', true)
              downloadedFiles.push(file)
              console.log(`[SGC] Downloaded image ${downloadedFiles.length}/9: ${url}`)
            } catch (e) {
              if (e.message === 'SKIP_PNG') {
                console.log(`[SGC] Skipped PNG image: ${url}`)
              } else {
                console.error(`[SGC] Failed to download image ${url}:`, e)
              }
            }
          }

          if (downloadedFiles.length > 0) {
            try {
              const firstInput = fileInputs[0]
              if (firstInput && (firstInput.multiple || firstInput.hasAttribute('multiple'))) {
                const dt = new DataTransfer()
                downloadedFiles.forEach(file => dt.items.add(file))
                firstInput.value = ''
                firstInput.files = dt.files
                firstInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }))
                firstInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }))
                firstInput.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }))
                console.log(`[SGC] Injected all ${downloadedFiles.length} files to multiple-enabled input`)
              } else {
                for (let i = 0; i < downloadedFiles.length; i++) {
                  const currentInputs = Array.from(imageContainer.querySelectorAll('input[type="file"]'))
                  if (currentInputs.length === 0) {
                    console.warn('[SGC] No file inputs found during iteration', i)
                    break
                  }
                  const targetInput = currentInputs[i] || currentInputs[currentInputs.length - 1]
                  const dt = new DataTransfer()
                  dt.items.add(downloadedFiles[i])
                  targetInput.value = ''
                  targetInput.files = dt.files
                  targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }))
                  targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }))
                  targetInput.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }))
                  console.log(`[SGC] Injected file ${i+1}/${downloadedFiles.length} to input`)
                  await new Promise(r => setTimeout(r, 500))
                }
              }
              const skipped = images.length - downloadedFiles.length - (images.length > 9 ? images.length - 9 : 0)
              const note = `成功注入 ${downloadedFiles.length} 張圖片` + (skipped > 0 ? `，略過 ${skipped} 張重複` : '')
              mediaResults.push({ field: '商品圖片', ok: true, note })
            } catch (e) {
              mediaResults.push({ field: '商品圖片', ok: false, error: `注入圖片失敗: ${e.message}` })
            }
          } else {
            mediaResults.push({ field: '商品圖片', ok: false, error: '無圖片成功下載（可能已全部存在）' })
          }
        }
      }
    }

    // 影片上傳
    if (videos.length > 0) {
      console.log(`[SGC] Found ${videos.length} videos to upload`)
      const videoContainer = document.querySelector('[data-product-edit-field-unique-id="videos"], [data-product-edit-field-unique-id="video"]')
      
      if (!videoContainer) {
        mediaResults.push({ field: '商品影片', ok: false, error: '找不到影片上傳容器' })
      } else {
        const fileInputs = Array.from(videoContainer.querySelectorAll('input[type="file"]'))
        if (fileInputs.length === 0) {
          mediaResults.push({ field: '商品影片', ok: false, error: '找不到影片上傳 input 欄位' })
        } else {
          const downloadedVideos = []
          for (const url of videos) {
            if (downloadedVideos.length >= 1) {
              console.log('[SGC] Only uploading 1 video, skipping remaining')
              break
            }
            try {
              const filename = `video_${Date.now()}.mp4`
              const file = await downloadMediaAsFile(url, filename, 'video/mp4', false)
              downloadedVideos.push(file)
              console.log(`[SGC] Downloaded video: ${url}`)
            } catch (e) {
              console.error(`[SGC] Failed to download video ${url}:`, e)
            }
          }

          if (downloadedVideos.length > 0) {
            try {
              const targetInput = fileInputs[0]
              const dt = new DataTransfer()
              downloadedVideos.forEach(file => dt.items.add(file))
              targetInput.value = ''
              targetInput.files = dt.files
              targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }))
              targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }))
              targetInput.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }))
              console.log(`[SGC] Injected ${downloadedVideos.length} video(s)`)
              mediaResults.push({ field: '商品影片', ok: true, note: `成功注入 ${downloadedVideos.length} 部影片` })
            } catch (e) {
              mediaResults.push({ field: '商品影片', ok: false, error: `注入影片失敗: ${e.message}` })
            }
          } else {
            mediaResults.push({ field: '商品影片', ok: false, error: '無影片成功下載' })
          }
        }
      }
    }

    return mediaResults
  }

  async function fillAll(data) {
    const results = []

    // 先選取類別
    try {
      const catResult = await fillCategoryAsync()
      results.push({ field: '類別', ...catResult })
      // 如果類別有變更，等待 1000ms 讓 Vue DOM 重新渲染並穩定下來，防止後續填入的欄位值被清空
      if (catResult.ok && !catResult.alreadySelected) {
        console.log('[SGC] Category changed, waiting 1000ms for DOM re-render to settle...')
        await new Promise(r => setTimeout(r, 1000))
      }
    } catch (e) {
      results.push({ field: '類別', ok: false, error: e.message })
    }

    const desc = data.ps_product_description || data.description || ''
    const price = data.ps_price ?? data.price ?? ''
    const title = data.ps_product_name || data.title || ''

    results.push({ field: '商品名稱', ...(await fillFieldAsync(title,
      () => findFieldByLabel('商品名稱'),
      '[data-product-edit-field-unique-id="name"] input.eds-input__input',
      'input[placeholder*="商品"]'
    ))})

    if (desc) {
      results.push({ field: '商品描述', ...(await fillFieldAsync(desc,
        () => findFieldByLabel('商品描述'),
        '[data-product-edit-field-unique-id="description"] .ql-editor',
        'textarea'
      ))})
    }

    let cleanPrice = ''
    if (price) {
      cleanPrice = price.split('~')[0].split('-')[0].replace(/[^\d]/g, '').trim()
    }

    if (cleanPrice) {
      results.push({ field: '價格', ...(await fillFieldAsync(cleanPrice,
        () => findFieldByLabel('價格'),
        '[data-product-edit-field-unique-id="price"] input.eds-input__input',
        'input[placeholder*="價格"]'
      ))})
    }

    const stockVal = data.ps_stock != null ? String(data.ps_stock) : '999'
    results.push({ field: '商品數量', ...(await fillFieldAsync(stockVal,
      () => findFieldByLabel('商品數量'),
      '[data-product-edit-field-unique-id="stock"] input.eds-input__input',
      'input[placeholder*="數量"]'
    ))})

    results.push({ field: '最低購買數量', ...(await fillFieldAsync('1',
      () => findFieldByLabel('最低購買數量'),
      '[data-product-edit-field-unique-id="minpq"] input.eds-input__input',
      'input[placeholder*="最低"]'
    ))})

    const brandName = data.ps_brand || 'NoBrand'
    try {
      const brandResult = await fillBrandAsync(brandName)
      results.push({ field: '品牌', ...brandResult })
    } catch (e) {
      results.push({ field: '品牌', ok: false, error: e.message })
    }

    // ── 填入屬性：尺寸（長 x 寬 x 高） ──
    const dimStr = data.dimension || (
      data.ps_length && data.ps_width && data.ps_height
        ? `${data.ps_length}x${data.ps_width}x${data.ps_height}`
        : ''
    )
    if (dimStr) {
      results.push({ field: '尺寸（長 x 寬 x 高）', ...(await fillFieldAsync(dimStr,
        () => findFieldByLabel('尺寸（長 x 寬 x 高）'),
        async () => {
          const attrSection = document.querySelector('[data-product-edit-field-unique-id="brandAndAttributes"]')
          if (!attrSection) return null
          const rows = attrSection.querySelectorAll('.edit-row')
          for (const row of rows) {
            const label = (row.querySelector('.edit-label')?.textContent || '').replace(/[\s*]+/g, '')
            if (label.includes('尺寸')) {
              return row.querySelector('input.eds-input__input')
            }
          }
          return null
        }
      ))})
    }

    // ── 信用卡分期付款 ──
    const installment = data.installment
    if (installment) {
      try {
        // 1. 開啟分期付款（選「是」）
        const enableRadio = document.querySelector('[data-product-edit-field-unique-id*="installment"] input[value="true"], [data-product-edit-field-unique-id*="installment"] input.eds-radio__input[value="true"]')
          || document.querySelector('[data-product-edit-field-unique-id*="installment"] .eds-switch')
          || (() => {
            const rows = document.querySelectorAll('.edit-row')
            for (const row of rows) {
              const label = (row.querySelector('.edit-label')?.textContent || '').replace(/[\s*]+/g, '')
              if (label.includes('分期')) {
                return row.querySelector('input[type="radio"][value="true"], input[type="radio"][value="1"], .eds-switch')
              }
            }
            return null
          })()
        if (enableRadio) {
          if (enableRadio.tagName === 'INPUT' && enableRadio.type === 'radio') {
            enableRadio.checked = true
            enableRadio.dispatchEvent(new Event('change', { bubbles: true }))
          } else {
            enableRadio.click()
          }
          results.push({ field: '信用卡分期付款', ok: true })
        } else {
          results.push({ field: '信用卡分期付款', ok: false, error: '找不到分期付款開關' })
        }

        // 2. 設定期數為 24（等 Vue re-render → 按鈕 → Modal → bubble → 確認）
        try {
          // 等 Vue 把「設定期數」按鈕渲染出來（radio 剛切「是」要等 re-render）
          let termBtn = null
          for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 200))
            termBtn = Array.from(document.querySelectorAll('button'))
              .find(b => b.textContent.trim() === '設定期數')
            if (termBtn) break
          }
          if (!termBtn) {
            results.push({ field: '設定期數', ok: false, error: '找不到設定期數按鈕' })
          } else {
            termBtn.click()
            // 等 Vue 把 slider bubble 渲染好
            await waitForElement('.tenure-slider-bubble', 4000)
            await new Promise(r => setTimeout(r, 600))

            // 點「24期」bubble
            const b24 = Array.from(document.querySelectorAll('.tenure-slider-bubble'))
              .find(b => b.textContent.trim() === '24期')
            if (b24) b24.click()
            await new Promise(r => setTimeout(r, 600))

            // 等按鈕啟用（Vue 需要時間從「儲存」disabled→「確認」enabled）
            let saveBtn = null
            for (let i = 0; i < 15; i++) {
              await new Promise(r => setTimeout(r, 200))
              saveBtn = Array.from(document.querySelectorAll('button')).find(b => {
                const txt = b.textContent.trim()
                return (txt === '確認' || txt === '儲存' || txt === '保存') && !b.disabled
              })
              if (saveBtn) break
            }
            if (saveBtn) {
              saveBtn.click()
              results.push({ field: '設定期數', ok: true })
            } else {
              const allBtns = Array.from(document.querySelectorAll('button'))
                .map(b => `"${b.textContent.trim()}" disabled=${b.disabled}`)
              results.push({ field: '設定期數', ok: false,
                error: `找不到啟用按鈕，所有按鈕: ${allBtns.join(' | ')}` })
            }
          }
        } catch (e) {
          results.push({ field: '設定期數', ok: false, error: e.message })
        }
      } catch (e) {
        console.error('[SGC] Installment setting error:', e)
      }
    }

    // 處理媒體自動下載與上傳
    try {
      const mediaResults = await uploadMediaAsync(data)
      results.push(...mediaResults)
    } catch (e) {
      console.error('[SGC] Media upload error:', e)
      results.push({ field: '媒體上傳', ok: false, error: e.message })
    }

    return { ok: true, results }
  }

  // ──────────────────────────────────────────────
  // Message handlers
  // ──────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'getProductData') {
      extractProductData().then(sendResponse)
      return true
    }
    if (msg.action === 'fillProductData') {
      fillAll(msg.data || {}).then(sendResponse)
      return true
    }
  })

  // ── Auto-trigger carousel full render on product page（讓第一次點 icon 就有完整圖片） ──
  if (isProductPage() && !isSellerEditPage()) {
    setTimeout(() => {
      triggerCarouselFullRender()
      // fire-and-forget, extractProductData() 內也有 trigger 作為 safety net
    }, 0)
  }

  console.log('[SGC] content script ready')
  if (isSellerEditPage()) {
    console.log('[SGC] on seller page — fillProductData handler registered')
  }
})()