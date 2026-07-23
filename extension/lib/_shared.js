(function () {
  window.__SGC = window.__SGC || {}

  const SHOPEE_IMG_DOMAIN = 'down-tw.img.susercontent.com'

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
    if (!val.includes('/')) {
      return `https://${SHOPEE_IMG_DOMAIN}/file/${val}`
    }
    return val
  }

  window.__SGC.dedupe = dedupe
  window.__SGC.cleanDescription = cleanDescription
  window.__SGC.resolveImgUrl = resolveImgUrl
  window.__SGC.SHOPEE_IMG_DOMAIN = SHOPEE_IMG_DOMAIN
})()
