(function () {
  function isSellerEditPage() {
    return window.location.hostname === 'seller.shopee.tw'
  }

  function setNativeValue(input, value) {
    if (!input || !input.classList) return
    if (input.type === 'file') return

    if (input.classList.contains('ql-editor') || input.getAttribute('contenteditable') === 'true') {
      input.innerHTML = '<p>' + value.split('\n').join('</p><p>') + '</p>'
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }))
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }))
      input.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }))
      return
    }

    const proto = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ) || Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )
    if (proto?.set) {
      try { proto.set.call(input, value) } catch (e) { input.value = value }
    } else {
      input.value = value
    }
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }))
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }))
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
      '最低購買數量': 'minpq',
      '商品數量': 'stock',
      '商品名稱': 'name',
      '商品描述': 'description',
      '價格': 'price',
      '數量': 'stock',
      '庫存': 'stock',
      '重量': 'weight',
      '主商品貨號': 'parentSku',
      '國際條碼': 'gtinCode',
    }
    const cleanLabel = labelText.trim().replace(/[\s*]+/g, '')
    const fieldId = fieldIdMap[cleanLabel] || Object.entries(fieldIdMap)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([k]) => cleanLabel.includes(k) || k.includes(cleanLabel))?.[1]

    if (fieldId) {
      const el = document.querySelector(
        `[data-product-edit-field-unique-id="${fieldId}"] input.eds-input__input:not([type="file"]), ` +
        `[data-product-edit-field-unique-id="${fieldId}"] input:not([type="file"]), ` +
        `[data-product-edit-field-unique-id="${fieldId}"] textarea.eds-input__input, ` +
        `[data-product-edit-field-unique-id="${fieldId}"] textarea, ` +
        `[data-product-edit-field-unique-id="${fieldId}"] [contenteditable="true"], ` +
        `[data-product-edit-field-unique-id="${fieldId}"] .ql-editor`
      )
      if (el) return el
    }

    for (const row of document.querySelectorAll('.edit-row')) {
      const labelEl = row.querySelector('.edit-label span:not(.mandatory-icon), .edit-label .item-title, .edit-label')
      if (!labelEl) continue
      const text = (labelEl.textContent || '').trim().replace(/[\s*]+/g, '')
      if ((cleanLabel === '數量' || cleanLabel === '商品數量' || cleanLabel === '庫存') && text.includes('最低')) {
        continue
      }
      if (text === cleanLabel || text.includes(cleanLabel) || cleanLabel.includes(text)) {
        const input = row.querySelector('input.eds-input__input:not([type="file"]), input:not([type="file"]), textarea.eds-input__input, textarea, [contenteditable="true"], .ql-editor')
        if (input) return input
      }
    }

    const labels = document.querySelectorAll('.ant-form-item-label label, label')
    for (const lb of labels) {
      const text = lb.textContent.trim().replace(/[\s*]+/g, '')
      if ((cleanLabel === '數量' || cleanLabel === '商品數量' || cleanLabel === '庫存') && text.includes('最低')) {
        continue
      }
      if (text !== cleanLabel) continue
      const forId = lb.getAttribute('for')
      if (forId) { const el = document.getElementById(forId); if (el) return el }
      const next = lb.nextElementSibling
      if (next && next.matches('input:not([type="file"]), textarea, select')) return next
      const item = lb.closest('.ant-form-item, [class*="form-item"], [class*="field"]')
      if (item) { const el = item.querySelector('input:not([type="file"]), textarea, [contenteditable="true"]'); if (el) return el }
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
    return { ok: false, error: `找不到欄位 [頁面: ${location.pathname}, 標題: ${document.title}]` }
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

  async function fillCategoryAsync(data = {}) {
    const triggerSel = [
      '.product-category-box-inner',
      '.product-category-box',
      '[data-product-edit-field-unique-id="category"] .product-category-box-inner',
      '[data-product-edit-field-unique-id="category"] button',
      '[data-product-edit-field-unique-id="category"] [class*="box"]',
      '.edit-row-category'
    ].join(', ')

    let trigger = document.querySelector(triggerSel)
    if (trigger) {
      const text = (trigger.textContent || '').trim()
      if (text && !text.includes('請選擇') && !text.includes('選擇類別') && (text.includes('電腦與周邊配件') || text.includes('軟體') || text.length > 5)) {
        console.log('[SGC] Category is already selected:', text)
        return { ok: true, alreadySelected: true }
      }
    }

    if (!trigger) {
      const categoryField = document.querySelector('[data-product-edit-field-unique-id="category"]')
      if (categoryField) {
        trigger = categoryField.querySelector('button, [class*="box"], [class*="inner"], div')
      }
    }

    if (!trigger) {
      return { ok: false, error: '找不到類別選擇框' }
    }

    trigger.focus && trigger.focus()
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }))
    trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }))
    trigger.click()
    console.log('[SGC] Clicked category selector')

    const modalList = await waitForElement('.category-list, [class*="category-list"], .category-dialog, .eds-modal, [class*="modal"]', 3000)
    if (!modalList) {
      return { ok: false, error: '類別選擇選單未顯示' }
    }

    const categoryMap = {
      '100644,101937': ['電腦與周邊配件', '軟體'],
      '100644': ['電腦與周邊配件'],
      '101937': ['軟體'],
    }

    let categoryConfig = { mode: 'fallback', path: ['電腦與周邊配件', '軟體'] }
    const categoryRaw = data.category || data.ps_category || ''
    if (categoryRaw && typeof categoryRaw === 'string') {
      if (categoryRaw.includes('>')) {
        categoryConfig = { mode: 'path', path: categoryRaw.split('>').map(s => s.trim()) }
      } else if (/^[\d,]+$/.test(categoryRaw.trim())) {
        const cleanId = categoryRaw.trim()
        if (categoryMap[cleanId]) {
          categoryConfig = { mode: 'path', path: categoryMap[cleanId] }
          console.log('[SGC] Mapped category IDs to path via lookup table:', cleanId, '->', categoryMap[cleanId])
        } else {
          categoryConfig = { mode: 'id', ids: cleanId.split(',').map(s => s.trim()) }
          console.log('[SGC] ps_category is ID format (unmapped), target IDs:', categoryConfig.ids)
        }
      }
    } else if (Array.isArray(data.categoryPath)) {
      categoryConfig = { mode: 'path', path: data.categoryPath }
    }

    let colIdx = 0
    const maxLevels = 5

    while (colIdx < maxLevels) {
      console.log(`[SGC] Processing category column ${colIdx}`)
      let col = null
      for (let i = 0; i < 15; i++) {
        const cols = document.querySelectorAll('.category-list .scroll-item, [class*="category"] .scroll-item, [class*="category-list"] [class*="scroll"]')
        if (cols.length > colIdx) {
          col = cols[colIdx]
          break
        }
        await new Promise(r => setTimeout(r, 60))
      }

      if (!col) {
        console.log(`[SGC] Column ${colIdx} did not appear, assuming leaf reached.`)
        break
      }

      const items = col.querySelectorAll('.category-item, [class*="category-item"], li')
      if (items.length === 0) {
        console.log(`[SGC] Column ${colIdx} has no items.`)
        break
      }

      if (items[0]) {
        console.log(`[SGC Dry-run DOM Check] Col ${colIdx} Item[0] HTML:`, items[0].outerHTML)
      }

      let targetItem = null

      if (categoryConfig.mode === 'id') {
        const targetId = categoryConfig.ids[colIdx]
        if (targetId) {
          targetItem = Array.from(items).find(el => {
            const idAttr = el.getAttribute('data-id') || el.getAttribute('data-category-id') || el.getAttribute('value') || el.dataset?.id || el.dataset?.categoryId
            return idAttr && String(idAttr).trim() === targetId
          })
        }
        if (!targetId && colIdx >= categoryConfig.ids.length) {
          console.log(`[SGC] Reached end of category IDs at level ${colIdx}`)
          break
        }
        if (!targetItem) {
          throw new Error(`類別 ID ${targetId} 在第 ${colIdx} 層選單中找不到對應 DOM 選項`)
        }
      } else {
        const targetText = categoryConfig.path ? categoryConfig.path[colIdx] : null
        if (targetText) {
          targetItem = Array.from(items).find(el => (el.textContent || '').includes(targetText))
        }
        if (!targetItem) {
          if (colIdx === 0) {
            targetItem = Array.from(items).find(el => (el.textContent || '').includes('電腦與周邊配件') || (el.textContent || '').includes('電腦') || (el.textContent || '').includes('3C'))
          } else if (colIdx === 1) {
            targetItem = Array.from(items).find(el => (el.textContent || '').includes('軟體') || (el.textContent || '').includes('Software'))
          } else {
            targetItem = Array.from(items).find(el => {
              const text = (el.textContent || '').trim()
              return text === '其他' || text.includes('其他') || text.toLowerCase().includes('other')
            })
          }
        }
      }

      if (!targetItem) {
        targetItem = items[0]
        console.log(`[SGC] Target not found in column ${colIdx}, fallback to first item:`, targetItem.textContent.trim())
      } else {
        console.log(`[SGC] Found target in column ${colIdx}:`, targetItem.textContent.trim())
      }

      targetItem.scrollIntoView && targetItem.scrollIntoView({ block: 'nearest' })
      targetItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }))
      targetItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }))
      targetItem.click()

      await new Promise(r => setTimeout(r, 300))
      colIdx++
    }

    function findCategoryConfirmButton() {
      const categoryModal = Array.from(document.querySelectorAll(
        '.eds-modal, .category-dialog, .product-category-selector-modal, div[role="dialog"], [class*="category-dialog"], [class*="modal"]'
      )).find(m => m.querySelector('.category-list, [class*="category-list"], .category-item'))

      if (!categoryModal) {
        return document.querySelector('.category-dialog-footer button.eds-button--primary, [class*="category"] button.eds-button--primary, [class*="category"] button')
      }

      const primaryBtn = categoryModal.querySelector('.eds-button--primary, button.eds-button--primary, button[type="button"].eds-button--primary')
      if (primaryBtn) return primaryBtn

      const buttons = Array.from(categoryModal.querySelectorAll('button, .eds-button'))
      for (const btn of buttons) {
        const txt = (btn.textContent || '').trim()
        if (txt === '確定' || txt === '确定' || txt === 'Confirm' || txt === 'OK' || txt.includes('確定')) {
          return btn
        }
      }

      const footerBtn = categoryModal.querySelector('[class*="footer"] .eds-button--primary, [class*="footer"] button')
      if (footerBtn) return footerBtn

      return null
    }

    for (let i = 0; i < 20; i++) {
      const confirmBtn = findCategoryConfirmButton()
      if (confirmBtn) {
        confirmBtn.focus && confirmBtn.focus()
        confirmBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }))
        confirmBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }))
        confirmBtn.click()
        console.log(`[SGC] Clicked category confirm button (attempt ${i + 1})`)
      }
      await new Promise(r => setTimeout(r, 250))
      const stillOpen = document.querySelector(
        '.eds-modal:not([style*="display: none"]), ' +
        '[class*="modal"]:not([style*="display: none"]), ' +
        '.category-list, [class*="category-list"]'
      )
      if (!stillOpen) {
        console.log('[SGC] Category modal closed successfully')
        break
      }
    }

    return { ok: true }
  }

  function randomJitter(min = 150, max = 350) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min
    return new Promise(r => setTimeout(r, ms))
  }

  async function fillAll(data) {
    const results = []

    function buildTitle(productName, category, tag) {
      const tagParts = [category, ...(tag || [])].filter(Boolean)
      const tagStr = tagParts.join('#')
      const hashtag = tagStr ? ' #' + tagStr : ''
      const maxLen = 60

      if ((productName + hashtag).length <= maxLen) {
        return productName + hashtag
      }

      let remaining = []
      let currentLen = productName.length + 1

      for (const part of [...tagParts].reverse()) {
        const wouldAdd = 1 + part.length
        if (currentLen + wouldAdd <= maxLen) {
          remaining.unshift(part)
          currentLen += wouldAdd
        }
      }

      if (remaining.length === 0) {
        return productName.substring(0, maxLen).trim()
      }

      return productName + ' #' + remaining.join('#')
    }

    const title = buildTitle(data.ps_product_name, data.category, data.tag) || data.title || ''
    const titleRes = await fillFieldAsync(title,
      () => findFieldByLabel('商品名稱'),
      '[data-product-edit-field-unique-id="name"] input.eds-input__input',
      'input[placeholder*="商品"]'
    )
    results.push({ field: '商品名稱', ...titleRes })

    if (!titleRes.ok) {
      throw new Error('填寫商品名稱失敗：' + (titleRes.error || '找不到欄位'))
    }

    // 1. 檢查標題欄位容器是否存在 (若 Selector 改版找不到，依嚴格零降級原則拋出 Error)
    const nameContainer = document.querySelector('[data-product-edit-field-unique-id="name"]') || document.querySelector('.edit-row')
    if (!nameContainer) {
      throw new Error('【環境異常/Selector失效】無法找到標題欄位 DOM 容器 [data-product-edit-field-unique-id="name"]，請檢查蝦皮頁面')
    }

    // 2. 輪詢檢查標題欄位下方是否出現蝦皮即時重複警告 (維持 1800ms，每 150ms 檢查一次)
    const pollStart = Date.now()
    while (Date.now() - pollStart < 1800) {
      const titleErrorEl = nameContainer.querySelector('.eds-form-item__error-message, [class*="error"]')
      if (titleErrorEl) {
        const errorMsg = titleErrorEl.textContent.trim()
        if (errorMsg && /重複|已存在|已被使用|already exists/i.test(errorMsg)) {
          throw new Error('【即時預檢中斷】該商品名稱在蝦皮已存在：' + errorMsg)
        }
      }
      await new Promise(r => setTimeout(r, 150))
    }

    await randomJitter()

    try {
      const catResult = await fillCategoryAsync(data)
      results.push({ field: '類別', ...catResult })
      if (catResult.ok && !catResult.alreadySelected) {
        console.log('[SGC] Category changed, waiting 1000ms for DOM re-render to settle...')
        await new Promise(r => setTimeout(r, 1000))
      }
    } catch (e) {
      results.push({ field: '類別', ok: false, error: e.message })
    }
    await randomJitter()

    const brandName = data.ps_brand || 'NoBrand'
    try {
      const brandResult = await fillBrandAsync(brandName)
      results.push({ field: '品牌', ...brandResult })
    } catch (e) {
      results.push({ field: '品牌', ok: false, error: e.message })
    }
    await randomJitter()

    const dimStr = data.dimension || (
      data.ps_length && data.ps_width && data.ps_height
        ? `${data.ps_length}x${data.ps_width}x${data.ps_height}`
        : ''
    )
    if (dimStr) {
      results.push({
        field: '尺寸（長 x 寬 x 高）', ...(await fillFieldAsync(dimStr,
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
        ))
      })
      await randomJitter()
    }

    function buildDescription(product, config) {
      let desc = product.ps_product_description || product.description || ''

      const cs = product.computer_specs
      if (cs && (cs.vram_min || cs.ram_min || cs.disk)) {
        desc += '\n\n---\n\n⚙️ 建議配備\n'
        if (cs.vram_min) {
          let vram = '• 最低 VRAM：' + cs.vram_min + ' GB'
          if (cs.vram_rec) vram += '（建議 ' + cs.vram_rec + ' GB）'
          desc += vram + '\n'
        }
        if (cs.ram_min) {
          let ram = '• 最低 RAM：' + cs.ram_min + ' GB'
          if (cs.ram_rec) ram += '（建議 ' + cs.ram_rec + ' GB）'
          desc += ram + '\n'
        }
        if (cs.disk) desc += '• 硬碟空間：' + cs.disk + ' GB\n'
        if (cs.cpu) desc += '• CPU：' + cs.cpu + '\n'
        if (cs.power) desc += '• 電源：' + cs.power + '\n'
      }

      const activeConfig = config || product._config || (typeof SGC_CONFIG !== 'undefined' ? SGC_CONFIG : null)
      if (activeConfig && activeConfig.hardware_check_url) {
        const hwLabel = activeConfig?.description_footer?.hardware_check_label || '進階電腦檢測工具跟更多好物 👉 傳送門'
        desc += `\n\n${hwLabel}：${activeConfig.hardware_check_url}\n`
      }

      const safeCategory = product.category || '其他'
      const tagParts = [safeCategory, ...(product.tag || [])].filter(Boolean)
      desc += '\n#' + tagParts.join('#')

      return desc
    }

    const desc = buildDescription(data, data._config)
    if (desc) {
      results.push({
        field: '商品描述', ...(await fillFieldAsync(desc,
          () => findFieldByLabel('商品描述'),
          '[data-product-edit-field-unique-id="description"] .ql-editor',
          '[data-product-edit-field-unique-id="description"] [contenteditable="true"]',
          '[data-product-edit-field-unique-id="description"] .rich-text-editor',
          'textarea'
        ))
      })
      await randomJitter()
    }

    const price = data.ps_price ?? data.price ?? ''
    let cleanPrice = ''
      const firstPriceMatch = String(price).split('~')[0].split('-')[0].match(/(?:NT\$|\$)?\s*(\d+(?:,\d+)*)/)
      cleanPrice = firstPriceMatch ? firstPriceMatch[1].replace(/,/g, '') : ''

    if (cleanPrice) {
      const priceRes = await fillFieldAsync(cleanPrice,
        () => findFieldByLabel('價格'),
        '[data-product-edit-field-unique-id="price"] input.eds-input__input',
        'input[placeholder*="價格"]'
      )
      results.push({ field: '價格', ...priceRes })
      if (priceRes.ok) {
        console.log('[SGC] Price filled, waiting 600ms for Sales Info and Installment DOM to render...')
        await new Promise(r => setTimeout(r, 600))
      }
    }
    await randomJitter()

    const stockVal = data.ps_stock != null ? String(data.ps_stock) : '999'
    results.push({
      field: '商品數量', ...(await fillFieldAsync(stockVal,
        '[data-product-edit-field-unique-id="stock"] input.eds-input__input:not([type="file"])',
        '[data-product-edit-field-unique-id="stock"] input:not([type="file"])',
        () => findFieldByLabel('商品數量'),
        () => findFieldByLabel('數量'),
        () => findFieldByLabel('庫存'),
        'input[placeholder*="庫存"]'
      ))
    })
    await randomJitter()

    const numericPrice = Number(cleanPrice || 0)
    const termTarget = String(data.installment || 24)

    if (numericPrice >= 1000) {
      console.log(`[SGC] Price (${numericPrice}) >= 1000, enabling credit card installment (Yes, ${termTarget} terms)...`)
      try {
        const installmentSection = document.querySelector('[data-product-edit-field-unique-id="productInstallmentStatus"]')
          || document.querySelector('[data-product-edit-field-unique-id*="installment"]')
          || Array.from(document.querySelectorAll('.edit-row')).find(r => (r.querySelector('.edit-label')?.textContent || '').includes('分期'))

        if (installmentSection) {
          const yesRadio = Array.from(installmentSection.querySelectorAll('label, input, span, div'))
            .find(el => (el.textContent || '').trim() === '是' || el.value === 'true' || el.value === '1')

          if (yesRadio) {
            yesRadio.click()
            await new Promise(r => setTimeout(r, 600))
            results.push({ field: '信用卡分期付款', ok: true })
          } else {
            results.push({ field: '信用卡分期付款', ok: false, error: '找不到「是」選項按鈕' })
          }

          try {
            let termBtn = null
            for (let i = 0; i < 15; i++) {
              await new Promise(r => setTimeout(r, 200))
              termBtn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent.trim() === '設定期數')
              if (termBtn) break
            }
            if (termBtn) {
              termBtn.click()
              await waitForElement('.tenure-slider-bubble', 4000)
              await new Promise(r => setTimeout(r, 600))

              const targetBubble = Array.from(document.querySelectorAll('.tenure-slider-bubble'))
                .find(b => b.textContent.trim().includes(`${termTarget}期`))
                || Array.from(document.querySelectorAll('.tenure-slider-bubble')).pop()

              if (targetBubble) targetBubble.click()
              await new Promise(r => setTimeout(r, 600))

              let saveBtn = null
              for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 200))
                saveBtn = Array.from(document.querySelectorAll('button')).find(b => {
                  const txt = b.textContent.trim()
                  return (txt === '確認' || txt === '儲存' || txt === '保存' || txt === 'Confirm') && !b.disabled
                })
                if (saveBtn) break
              }
              if (saveBtn) {
                saveBtn.click()
                results.push({ field: '設定期數', ok: true })
              } else {
                results.push({ field: '設定期數', ok: false, error: '找不到啟用/確認按鈕' })
              }
            } else {
              results.push({ field: '設定期數', ok: false, error: '找不到設定期數按鈕' })
            }
          } catch (e) {
            results.push({ field: '設定期數', ok: false, error: e.message })
          }
        } else {
          results.push({ field: '信用卡分期付款', ok: false, error: '找不到信用卡分期區塊' })
        }
      } catch (e) {
        console.error('[SGC] Installment setting error:', e)
      }
    } else {
      console.log(`[SGC] Price (${numericPrice}) < 1000, skipping installment (set to No/Default)`)
      results.push({ field: '信用卡分期付款', ok: true, reason: 'Price < 1000 (Default No)' })
    }

    if (!data.skipMedia) {
      try {
        const mediaResults = await window.__SGC.uploadMediaAsync(data)
        results.push(...mediaResults)
      } catch (e) {
        console.error('[SGC] Media upload error:', e)
        results.push({ field: '媒體上傳', ok: false, error: e.message })
      }
    }

    if (data.autoSave) {
      console.log('[SGC] Auto-save requested, finding and clicking save button...')
      await new Promise(r => setTimeout(r, 600))
      const saveBtn = findMainSaveButton()
      if (saveBtn) {
        const isDisabled = !!saveBtn.disabled || saveBtn.hasAttribute('disabled') || saveBtn.classList?.contains('eds-button--disabled')
        if (!isDisabled) {
          if (saveBtn.focus) saveBtn.focus()
          const opts = { bubbles: true, cancelable: true, composed: true }
          saveBtn.dispatchEvent(new MouseEvent('mousedown', opts))
          saveBtn.dispatchEvent(new MouseEvent('mouseup', opts))
          saveBtn.click()
          console.log('[SGC] Auto-clicked save button after fillAll')
          results.push({ field: '自動發布', ok: true, note: '已自動點擊儲存並上架' })
        } else {
          results.push({ field: '自動發布', ok: false, error: '「儲存並上架」按鈕處於停用狀態 (disabled)' })
        }
      } else {
        results.push({ field: '自動發布', ok: false, error: '找不到「儲存並上架」按鈕' })
      }
    }

    return { ok: true, results }
  }

  function findMainSaveButton() {
    const footer = document.querySelector(
      '.product-edit-footer, .product-edit-bottom-bar, .eds-footer, footer, [class*="footer"], [class*="bottom-bar"]'
    )
    let footerBtns = []
    if (footer) {
      footerBtns = Array.from(footer.querySelectorAll('button, .eds-button')).filter(b => {
        return !b.closest('.eds-modal, .eds-dialog, [role="dialog"], [class*="modal"]')
      })
    }
    if (footerBtns.length > 0) {
      let b = footerBtns.find(el => {
        const t = (el.textContent || '').replace(/\s+/g, '')
        return t.includes('儲存並上架') || t.includes('Save&Publish') || (t.includes('上架') && !t.includes('下架'))
      })
      if (b) return b
      const revBtns = [...footerBtns].reverse()
      b = revBtns.find(el => {
        const t = (el.textContent || '').replace(/\s+/g, '')
        const isPrimary = el.classList?.contains('eds-button--primary') || !!el.querySelector('.eds-button--primary')
        return isPrimary && !/取消|預覽|下架/.test(t)
      })
      if (b) return b
    }
    const globalBtns = Array.from(document.querySelectorAll('button, .eds-button')).filter(b => {
      const inModal = !!b.closest('.eds-modal, .eds-dialog, [role="dialog"], [class*="modal"]')
      const inFormBody = !!b.closest('.edit-main, .edit-row, [class*="wholesale"], [class*="attribute"]')
      return !inModal && !inFormBody
    })
    return globalBtns.find(b => {
      const t = (b.textContent || '').replace(/\s+/g, '')
      return t.includes('儲存並上架') || (t.includes('上架') && !t.includes('下架'))
    }) || null
  }

  window.__SGC.fillAll = fillAll
  window.__SGC.setNativeValue = setNativeValue
  window.__SGC.findMainSaveButton = findMainSaveButton
})()
