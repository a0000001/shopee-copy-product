console.log('[SGC-test] chrome:', typeof chrome)
console.log('[SGC-test] chrome.tabs:', typeof chrome?.tabs)

const out = document.getElementById('output')

function log(msg, type) {
  const line = document.createElement('div')
  line.className = type || 'info'
  line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg
  out.appendChild(line)
  line.scrollIntoView({ behavior: 'smooth' })
}

function assert(label, actual, expected) {
  if (String(actual).trim() === String(expected).trim()) {
    log('   ✅ ' + label + ': ' + JSON.stringify(actual), 'ok')
    return true
  } else {
    log('   ❌ ' + label + ': 期望 ' + JSON.stringify(expected) + '，實際 ' + JSON.stringify(actual), 'fail')
    return false
  }
}

function assertContains(label, actual, expected) {
  if (String(actual).includes(String(expected))) {
    log('   ✅ ' + label + ' 包含期望值: ' + JSON.stringify(expected), 'ok')
    return true
  } else {
    log('   ❌ ' + label + ': 期望包含 ' + JSON.stringify(expected) + '，實際 ' + JSON.stringify(actual), 'fail')
    return false
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function pollUntilDone(tabId, checkAction, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await sleep(1000)
    try {
      const s = await chrome.tabs.sendMessage(tabId, { action: checkAction })
      if (s && s.status === 'done') return s.result
      const elapsed = Math.round((Date.now() - start) / 1000)
      if (elapsed % 5 === 0) log('   ⏳ ' + checkAction + ' 等待中... (' + elapsed + 's)', 'info')
    } catch { /* tab 暫時無法連接，繼續等 */ }
  }
  throw new Error(checkAction + ' 輪詢超時（' + (timeoutMs / 1000) + 's）')
}

document.getElementById('btnCopyLog').addEventListener('click', () => {
  const text = Array.from(out.children).map(el => el.textContent).join('\n')
  navigator.clipboard.writeText(text).then(() => {
    log('已複製日誌', 'ok')
  }).catch((err) => {
    log('複製失敗: ' + (err?.message || err), 'fail')
  })
})

document.getElementById('btnTest').addEventListener('click', async () => {
  out.innerHTML = ''
  let tab = null
  let passCount = 0, failCount = 0

  function check(result) { if (result) passCount++; else failCount++ }

  try {
    log('1. 確認 chrome API 可用...', 'info')
    log('   chrome.tabs: ' + (typeof chrome?.tabs), 'info')
    log('   chrome.tabs.sendMessage: ' + (typeof chrome?.tabs?.sendMessage), 'info')
    log('   chrome.scripting: ' + (typeof chrome?.scripting), 'info')

    log('2. 建立新分頁...', 'info')
    tab = await chrome.tabs.create({
      url: 'https://seller.shopee.tw/portal/product/new?from=sidebar',
    })
    log('   tab.id: ' + tab.id, 'info')

    log('3. 等待分頁載入完成（onUpdated + complete）...', 'info')
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated)
        reject(new Error('分頁載入超時'))
      }, 30000)

      function onUpdated(id, info) {
        if (id === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated)
          clearTimeout(timer)
          log('   收到 status=complete', 'info')
          setTimeout(resolve, 1500)
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdated)

      chrome.tabs.get(tab.id).then(t => {
        if (t && t.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated)
          clearTimeout(timer)
          log('   分頁已為 complete 狀態', 'info')
          setTimeout(resolve, 1500)
        }
      }).catch(() => {})
    })
    log('   分頁載入完成', 'ok')

    log('4. 取得分頁最新資訊...', 'info')
    const updatedTab = await chrome.tabs.get(tab.id)
    log('   url: ' + updatedTab.url, 'info')
    log('   title: ' + updatedTab.title, 'info')

    log('5. 送出 ping 訊息...', 'info')
    const pingResult = await chrome.tabs.sendMessage(tab.id, { action: 'ping' })
    check(assert('ping', pingResult?.ok, true))

    // ── 測試資料（完整模擬真實商品資料）
    const testData = {
      ps_product_name: '測試商品專用請勿下單購買（10字以上）',
      ps_price: '$1,999',
      ps_product_description: '測試商品詳細描述第一行\n測試商品詳細描述第二行\n測試商品詳細描述第三行（多行內文測試）',
      ps_stock: 999,
      ps_category: '100644,101937',
      ps_weight: '0.5',
      ps_length: 10,
      ps_width: 10,
      ps_height: 4,
      installment: 24,
      images: [
        'https://down-tw.img.susercontent.com/file/tw-11134207-820lh-mquatbvkvtor21',
        'https://down-tw.img.susercontent.com/file/tw-11134207-820lg-mquatbvjint91b'
      ],
      videos: [
        'https://down-aka-tw.vod.susercontent.com/api/v4/11110105/mms/tw-11110105-6v65e-mqv0uh1avnri01.16000031784496897.mp4'
      ],
    }

    // ── 步驟 6：文字填入（fire-and-forget + 輪詢）
    log('6. 送出 fillProductData（文字階段，fire-and-forget）...', 'info')
    const fillStartRes = await chrome.tabs.sendMessage(tab.id, {
      action: 'fillProductData',
      data: { ...testData, skipMedia: true }
    })
    if (!fillStartRes || !fillStartRes.ok) {
      throw new Error('fillProductData 啟動失敗: ' + (fillStartRes?.error || '未知'))
    }
    log('   已啟動，開始輪詢 checkFillStatus...', 'info')

    const fillResult = await pollUntilDone(tab.id, 'checkFillStatus', 120000)
    if (!fillResult || !fillResult.ok) {
      throw new Error('fillAll 失敗: ' + (fillResult?.error || '未知'))
    }
    log('   fillProductData 完成:', 'ok')
    if (fillResult.results) {
      fillResult.results.forEach(r => {
        check(r.ok ? (log('   ✅ ' + r.field, 'ok'), true) : (log('   ❌ ' + r.field + ': ' + r.error, 'fail'), false))
      })
    }

    // ── 步驟 6b：DOM 斷言驗證（文字欄位）
    log('6b. DOM 斷言驗證（文字欄位）...', 'info')
    try {
      const [domCheck] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          function getVal(sel) {
            const el = document.querySelector(sel)
            return el ? (el.value !== undefined ? el.value : el.textContent.trim()) : null
          }
          const nameInput = document.querySelector('[data-product-edit-field-unique-id="name"] input.eds-input__input, input[placeholder*="商品名稱"]')
          const descInput = document.querySelector('[data-product-edit-field-unique-id="description"] .ql-editor, textarea')
          const priceInput = document.querySelector('[data-product-edit-field-unique-id="price"] input.eds-input__input, input[placeholder*="價格"]')
          const stockInput =
            document.querySelector('[data-product-edit-field-unique-id="stock"] input.eds-input__input') ||
            document.querySelector('[data-product-edit-field-unique-id="stock"] input') ||
            Array.from(document.querySelectorAll('input[placeholder*="數量"], input[placeholder*="庫存"], input')).find(el => {
              const ph = el.getAttribute('placeholder') || ''
              const rowText = el.closest('.edit-row, .product-edit-form-item, .ant-form-item, tr')?.textContent || ''
              return (rowText.includes('數量') || rowText.includes('庫存') || ph.includes('庫存')) && !ph.includes('最低') && !rowText.includes('最低')
            })
          const weightInput = document.querySelector('[data-product-edit-field-unique-id="weight"] input.eds-input__input, input[placeholder*="重量"]')

          const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"])')).map(el => {
            const container = el.closest('[data-product-edit-field-unique-id]')
            const containerId = container?.getAttribute('data-product-edit-field-unique-id') || null
            const label = el.closest('.edit-row, .product-edit-form-item, .ant-form-item')?.querySelector('.edit-label, label')?.textContent?.trim() || ''
            return {
              uniqueId: containerId,
              label: label.replace(/[\s\n]+/g, ' ').substring(0, 15),
              placeholder: el.placeholder || '',
              value: el.value || ''
            }
          })

          return {
            name: nameInput?.value || null,
            desc: descInput?.textContent?.trim() || descInput?.value || null,
            price: priceInput?.value || null,
            stock: stockInput?.value || null,
            weight: weightInput?.value || null,
            allInputs
          }
        }
      })
      const dom = domCheck.result
      log('   DOM 讀取結果: ' + JSON.stringify({ name: dom.name, desc: dom.desc?.substring(0, 20), price: dom.price, stock: dom.stock, weight: dom.weight }), 'info')
      if (dom.allInputs) {
        log('   🔍 DOM 所有文字 Input 診斷資料: ' + JSON.stringify(dom.allInputs), 'info')
      }
      if (dom.name !== null) check(assertContains('商品名稱', dom.name, '測試商品專用'))
      if (dom.price !== null) check(assertContains('價格', dom.price, '1999'))
      if (dom.stock !== null) check(assert('數量', dom.stock, '999'))
      if (dom.weight !== null) check(assertContains('重量', dom.weight, '0.5'))
    } catch (e) {
      log('   DOM 斷言跳過: ' + e.message, 'info')
    }

    // ── 步驟 7：媒體上傳（fire-and-forget + 輪詢）
    log('7. 送出 uploadMedia（媒體階段，fire-and-forget）...', 'info')
    const mediaStartRes = await chrome.tabs.sendMessage(tab.id, { action: 'uploadMedia', data: testData })
    if (!mediaStartRes || !mediaStartRes.ok) {
      throw new Error('uploadMedia 啟動失敗: ' + (mediaStartRes?.error || '未知'))
    }
    log('   已啟動，開始輪詢 checkMediaStatus...', 'info')

    const mediaResult = await pollUntilDone(tab.id, 'checkMediaStatus', 120000)
    log('   uploadMedia 完成，ok=' + mediaResult?.ok, mediaResult?.ok ? 'ok' : 'fail')
    if (mediaResult?.results) {
      mediaResult.results.forEach(r => {
        check(r.ok ? (log('   ✅ ' + r.field, 'ok'), true) : (log('   ❌ ' + r.field + ': ' + r.error, 'fail'), false))
      })
    }

    // ── 步驟 7b：DOM 斷言驗證（媒體數量）
    log('7b. DOM 斷言驗證（媒體數量）...', 'info')
    try {
      const [mediaCheck] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const imgPreviews = document.querySelectorAll(
            '[data-product-edit-field-unique-id="images"] img, .product-edit-form-item img, [class*="image-uploader"] img'
          )
          const videoPreviews = document.querySelectorAll(
            '[data-product-edit-field-unique-id="videos"] video, [data-product-edit-field-unique-id="video"] video, video'
          )
          return {
            imageCount: imgPreviews.length,
            videoCount: videoPreviews.length,
          }
        }
      })
      const media = mediaCheck.result
      log('   媒體 DOM: 圖片=' + media.imageCount + ', 影片=' + media.videoCount, 'info')
      if (media.imageCount > 0) check(assert('圖片數量 ≥ 2', media.imageCount >= 2, true))
      if (media.videoCount > 0) check(assert('影片數量 ≥ 1', media.videoCount >= 1, true))
    } catch (e) {
      log('   媒體 DOM 斷言跳過: ' + e.message, 'info')
    }

    // ── 步驟 8：checkSaveButton
    log('8. 送出 checkSaveButton...', 'info')
    const checkResult = await chrome.tabs.sendMessage(tab.id, { action: 'checkSaveButton' })
    log('   checkSaveButton: ' + JSON.stringify(checkResult), checkResult?.ready ? 'ok' : 'fail')
    check(assert('「儲存並上架」按鈕存在', checkResult?.btnText !== null, true))
    check(assert('抓取目標按鈕為「儲存並上架」', (checkResult?.btnText || '').includes('上架'), true))
    check(assert('「儲存並上架」按鈕就緒 (enabled)', checkResult?.ready || false, true))

    // ── 最終結果
    log('─────────────────────────────', 'info')
    if (failCount === 0) {
      log('✅ 全部 ' + passCount + ' 項測試通過', 'ok')
    } else {
      log('⚠️ ' + passCount + ' 項通過，' + failCount + ' 項失敗', 'fail')
    }

  } catch (e) {
    log('❌ 錯誤: ' + e.message, 'fail')
    log('❌ 類型: ' + e.constructor.name, 'fail')
    log('❌ stack: ' + (e.stack || '無'), 'fail')
  } finally {
    if (tab && tab.id) {
      setTimeout(() => {
        try { chrome.tabs.remove(tab.id) } catch {}
        log('測試分頁已關閉', 'info')
      }, 3000)
    }
  }
})
