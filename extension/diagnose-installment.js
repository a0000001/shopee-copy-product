// === 設定期數診斷腳本：複製整段貼到 seller 頁面 Console ===
(async function diagnose() {
  const log = []
  const ok = msg => { log.push('✅ ' + msg); console.log('[SGC] ✅ ' + msg) }
  const fail = msg => { log.push('❌ ' + msg); console.log('[SGC] ❌ ' + msg) }

  // 1. 檢查 content script 是否已載入
  ok('診斷開始')
  const contentLoaded = document.querySelector('[class*="eds-input"]') !== null
  ok('頁面 EDS 元件存在: ' + contentLoaded)

  // 2. 尋找設定期數按鈕
  const btn = document.querySelector('.status button.eds-button')
    || document.querySelector('[class*="status"] button')
    || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '設定期數')
  if (!btn) { fail('找不到設定期數按鈕'); showResult(log); return }
  ok('找到按鈕: class=' + btn.className + ' text=' + btn.textContent.trim())

  // 3. 點擊按鈕
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
  btn.click()
  ok('已點擊，等待 2 秒 Modal 出現...')
  await new Promise(r => setTimeout(r, 2000))

  // 4. 檢查 modal
  const installmentModal = document.querySelector('[class*="installment-setting-modal"]')
  if (installmentModal) {
    ok('找到 installment-setting-modal')
  } else {
    fail('找不到 installment-setting-modal（class 可能不同）')
    // 列出所有含 modal 的 class
    const allModals = Array.from(document.querySelectorAll('[class*="modal"], [class*="Modal"]'))
      .map(el => el.className.substring(0, 80))
    fail('頁面上含 modal 的元素: ' + JSON.stringify(allModals))
  }

  // 5. 檢查 bubbles
  const bubbles = document.querySelectorAll('.tenure-slider-bubble')
  if (bubbles.length > 0) {
    const info = Array.from(bubbles).map(b => b.textContent.trim() + '(active=' + b.classList.contains('active') + ')')
    ok('找到 ' + bubbles.length + ' 個 bubbles: ' + info.join(', '))

    const b24 = Array.from(bubbles).find(b => b.textContent.trim() === '24期')
    if (b24) {
      ok('24期 bubble active=' + b24.classList.contains('active'))
      // 點擊
      b24.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
      b24.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }))
      b24.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      b24.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      b24.click()
      await new Promise(r => setTimeout(r, 800))
      ok('點擊後 24期 bubble active=' + b24.classList.contains('active'))
    } else {
      fail('找不到 24期 bubble')
    }
  } else {
    fail('找不到任何 tenure-slider-bubble')
  }

  // 6. 找 slider circle
  const circles = document.querySelectorAll('.tenure-slider-circle')
  if (circles.length > 0) {
    ok('找到 ' + circles.length + ' 個 slider circle')
    circles.forEach((c, i) => {
      ok('circle[' + i + '] style.left=' + (c.style.left || '未設定'))
    })
    // 點擊最後一個 circle（右側拖曳桿）
    const last = circles[circles.length - 1]
    last.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    last.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }))
    last.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    last.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    last.click()
    ok('已點擊最後一個 slider circle')
    await new Promise(r => setTimeout(r, 500))
  } else {
    fail('找不到 slider circle')
  }

  // 7. 找啟用的按鈕
  await new Promise(r => setTimeout(r, 1000))
  const saveBtn = Array.from(document.querySelectorAll('button')).find(b => {
    const txt = b.textContent.trim()
    return (txt === '確認' || txt === '儲存' || txt === '保存') && !b.disabled
  })
  if (saveBtn) {
    ok('找到啟用按鈕: "' + saveBtn.textContent.trim() + '"')
    saveBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    saveBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    saveBtn.click()
    ok('已點擊按鈕，設定期數完成！')
  } else {
    fail('找不到啟用的確認/儲存/保存按鈕')
    const allBtns = Array.from(document.querySelectorAll('button')).map(b => '"' + b.textContent.trim() + '" disabled=' + b.disabled)
    fail('頁面上所有按鈕: ' + allBtns.join(', '))
  }

  showResult(log)
})()

function showResult(log) {
  const txt = log.join('\n')
  console.log('[SGC] === 診斷結果 ===\n' + txt)
  // 用 textarea 顯示完整結果
  const ta = document.createElement('textarea')
  ta.value = txt
  ta.style.cssText = 'position:fixed;top:10px;left:10px;width:600px;height:400px;z-index:99999;font-size:12px'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  alert('按 Ctrl+C 複製結果\n\n' + txt.substring(0, 500) + '\n\n(完整結果已顯示在頁面左上角 textarea)')
}
