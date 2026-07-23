(function () {
  console.log('[SGC] content-boot.js loaded, URL:', window.location.href)

  // ── Chrome runtime message handlers ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'ping') {
      sendResponse({ ok: true })
      return true
    }

    if (msg.action === 'getProductData') {
      window.__SGC.extractProductData()
        .then(data => sendResponse(data))
        .catch(e => sendResponse({ ok: false, error: e.message }))
      return true
    }

    if (msg.action === 'fillProductData') {
      window._sgcFillState = { status: 'running', result: null }
      window.__SGC.fillAll(msg.data || {})
        .then(res => { window._sgcFillState = { status: 'done', result: res } })
        .catch(e => { window._sgcFillState = { status: 'done', result: { ok: false, error: e.message } } })
      sendResponse({ ok: true, status: 'started' })
      return true
    }

    if (msg.action === 'checkFillStatus') {
      sendResponse(window._sgcFillState || { status: 'idle', result: null })
      return true
    }

    if (msg.action === 'uploadMedia') {
      window._sgcMediaState = { status: 'running', result: null }
      window.__SGC.uploadMediaAsync(msg.data || {}).then(results => {
        const ok = results.every(r => r.ok)
        window._sgcMediaState = { status: 'done', result: { ok, results } }
      }).catch(e => {
        window._sgcMediaState = { status: 'done', result: { ok: false, error: e.message } }
      })
      sendResponse({ ok: true, status: 'started' })
      return true
    }

    if (msg.action === 'checkMediaStatus') {
      sendResponse(window._sgcMediaState || { status: 'idle', result: null })
      return true
    }

    if (msg.action === 'extractSellerProductList') {
      Promise.resolve(window.__SGC.extractSellerProductList())
        .then(items => sendResponse(items))
        .catch(() => sendResponse([]))
      return true
    }

    if (msg.action === 'getPageInfo') {
      sendResponse(window.__SGC.readPageInfo())
      return true
    }

    if (msg.action === 'checkSaveButton') {
      const btn = window.__SGC.findMainSaveButton()
      if (!btn) {
        sendResponse({ ready: false, reason: '頁面上未找到「儲存並上架」按鈕' })
        return true
      }
      const isDisabled = !!btn.disabled || btn.classList?.contains('eds-button--disabled') || btn.hasAttribute('disabled')
      sendResponse({
        ready: !isDisabled,
        btnText: btn.textContent.trim(),
        reason: isDisabled ? `按鈕「${btn.textContent.trim()}」處於停用狀態 (disabled)` : 'OK'
      })
      return true
    }

    if (msg.action === 'clickSaveButton') {
      const btn = window.__SGC.findMainSaveButton()
      if (!btn) {
        sendResponse({ ok: false, error: '找不到儲存/上架按鈕' })
        return true
      }
      const isDisabled = !!btn.disabled || btn.hasAttribute('disabled') || btn.classList?.contains('eds-button--disabled')
      if (isDisabled) {
        sendResponse({ ok: false, error: '「儲存並上架」按鈕被停用，無法點擊' })
        return true
      }
      console.log('[SGC] Click save button:', btn.textContent.trim())
      if (btn.focus) btn.focus()
      const opts = { bubbles: true, cancelable: true, composed: true }
      btn.dispatchEvent(new MouseEvent('mousedown', opts))
      btn.dispatchEvent(new MouseEvent('mouseup', opts))
      btn.click()

      ;(async () => {
        const start = Date.now()
        while (Date.now() - start < 25000) {
          await new Promise(r => setTimeout(r, 300))
          if (window.location.pathname.includes('/portal/product/list')) {
            sendResponse({ ok: true, note: '已成功跳轉至商品列表' })
            return
          }
          const successToast = document.querySelector('.eds-toast--success, .eds-message--success, .shopee-toast--success, [class*="toast"][class*="success"]')
          if (successToast) {
            sendResponse({ ok: true, note: '成功提示: ' + successToast.textContent.trim() })
            return
          }
        }
        if (window.location.pathname.includes('/portal/product/list')) {
          sendResponse({ ok: true, note: '已跳轉至列表' })
        } else {
          sendResponse({ ok: false, error: '點擊上架後蝦皮未跳轉且無回應' })
        }
      })()
      return true
    }
  })

  // ── postMessage handler for CDP-triggered operations ──
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return
    const msg = event.data
    if (msg.action === 'fillProductData') {
      const result = await window.__SGC.fillAll(msg.data || {})
      window.postMessage({ action: 'fillProductDataResult', result }, '*')
    }
    if (msg.action === 'extractSellerProductList') {
      const items = await window.__SGC.extractSellerProductList()
      window.postMessage({ action: 'extractSellerProductListResult', items }, '*')
    }
    if (msg.action === 'getPageInfo') {
      window.postMessage({ action: 'getPageInfoResult', pageInfo: window.__SGC.readPageInfo() }, '*')
    }
    if (msg.action === 'getProductData') {
      const data = await window.__SGC.extractProductData()
      window.postMessage({ action: 'getProductDataResult', data }, '*')
    }
  })

  console.log('[SGC] content script ready')
  if (window.location.hostname === 'seller.shopee.tw') {
    console.log('[SGC] on seller page — fillProductData handler registered')
  }
})()
