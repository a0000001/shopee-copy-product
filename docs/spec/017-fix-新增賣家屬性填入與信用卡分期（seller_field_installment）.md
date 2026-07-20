---
type: fix
status: completed
updated: 2026-07-20
domain: shopee
tags: [shopee, chrome-extension, seller-fill, attribute, dimension, installment, credit-card]
---

# Fix：賣家屬性填入與信用卡分期設定

> 在 seller 填入模式中補上屬性「尺寸（長 x 寬 x 高）」及信用卡分期設定。2026-07-20 完成全部 11/11 欄位驗證。

---

## 一、問題摘要（修復完成）

本修正規格旨在解決 extension 原先在 seller 填入模式（`fillAll`）中未覆蓋以下兩個欄位的問題。**（已於 2026-07-20 完成全部 11/11 欄位實測驗證 ✅）**：

1. **屬性：尺寸（長 x 寬 x 高）** — 已實作自動填入 `10x10x4`（通過驗證）
2. **信用卡分期付款** — 已實作自動開啟並設定為 24 期（通過驗證）

---

## 二、根因分析

### 2.1 屬性欄位：data-product-edit-field-unique-id 未涵蓋

`fieldIdMap`（content.js:609-618）只包含 `name`/`description`/`price`/`stock`/`minpq`/`weight`/`parentSku`/`gtinCode`，**沒有**任何 attribute 欄位。

「尺寸（長 x 寬 x 高）」是動態屬性欄位（選類別後由 Vue 非同步渲染），位於 `brandAndAttributes` 容器內的 `.edit-row` 中，**沒有**獨立的 `data-product-edit-field-unique-id`。`fillAll()` 也未針對此類屬性欄位做任何處理。

### 2.2 `findFieldByLabel` 已具備 fallback 能力

`findFieldByLabel()`（content.js:608-649）有兩層搜尋：
1. **Primary**：`fieldIdMap` → `data-product-edit-field-unique-id` selector
2. **Fallback**：遍歷 `.edit-row` → 比對 `.edit-label` 的 textContent → 取 `input.eds-input__input`

fallback 層**可以**匹配「尺寸（長 x 寬 x 高）」這類無獨立 fieldId 的欄位。只需在 `fillAll()` 中加上呼叫即可。

### 2.3 信用卡分期：無 DOM analysis 記錄

`docs/data/14-seller-new-product-dom-analysis.md`（採集於 2026-07-19）僅涵蓋「基本資料」頁籤，信用卡分期設定屬於**運費與物流**或**付款設定**區塊，未在分析範圍內。需要進一步 inspect 實際賣家頁面的 DOM 結構。

### 2.4 診斷根因：切換分期 radio 後未等 Vue re-render「設定期數」按鈕

2026-07-20 診斷（含隔離變因測試）確認：

**根本原因：radio 切「是」→ Vue re-render → 按鈕出現，這一段沒等**
- `fillAll()` 中步驟 1（啟用分期 radio 為「是」）與步驟 2（找「設定期數」按鈕）之間**沒有任何 await**
- 步驟 1 的 `enableRadio.dispatchEvent(new Event('change', ...))` 觸發 Vue 的非同步 re-render
- Vue 需要時間重新渲染 installment 區塊，插入「設定期數」按鈕
- 原始代碼在 re-render 完成前就搜 button → 找不到或找到過時節點 → 跳過或失敗
- 診斷腳本之所以成功，是因為手動執行時頁面已處在「分期=是」狀態，按鈕早已存在

**次要問題：等待 modal 子元件而非容器**
- 原始 `waitForElement('[class*="installment-setting-modal"]')` resolve 時子元件可能尚未渲染
- 改為等 `.tenure-slider-bubble`（實際操作的 DOM）更安全

**已被排除的假說**
- ❌ `isTrusted` — `dispatchEvent` 的 `isTrusted=false` 事件可正常觸發 Vue bubble（Test A 確認）
- ❌ MouseEvent 冒充 PointerEvent — 同上測試確認無問題

---

## 三、修正方案

### 3.1 Data Model 擴充

在 `toJsonClipboard()` 的 JSON 輸出中加入兩個新欄位：

```typescript
interface ProductData {
  // ... existing fields
  dimension: string    // "10x10x4"（長x寬x高）
  installment: number  // 24（期數）
}
```

這兩個欄位在提取端（buyer page）無對應資料來源，因此不受 `extractProductData()` 影響。它們是**硬編碼預設值**，僅在 JSON 輸出時帶入，讓 seller 填入流程取得。

### 3.2 尺寸屬性填入（content.js）

在 `fillAll()` 中，品牌填入完成後加入尺寸屬性填入：

```javascript
// ── 填入屬性：尺寸（長 x 寬 x 高） ──
const dimension = data.dimension || '10x10x4'
if (dimension) {
  results.push({ field: '尺寸（長 x 寬 x 高）', ...(await fillFieldAsync(dimension,
    () => findFieldByLabel('尺寸（長 x 寬 x 高）'),
    // 防禦性 selector：直接在 brandAndAttributes 下找含「尺寸」的 input
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
```

**補充說明**：
- 尺寸是商品規格屬性（儲存在 `brandAndAttributes` 區塊），**不同於**包裹尺寸（`dimension.width/length/height`，在物流區塊）
- `findFieldByLabel` 的 fallback 可以透過 `.edit-row` 文字比對找到該欄位
- 因屬性欄位是選類別後 Vue 非同步渲染，第二個 strategy 使用 `async` function + `findFieldByLabel`（內部有 `waitForElement` 概念）

### 3.3 信用卡分期設定（已確認 DOM 結構）

經實際 inspect 賣家頁面，信用卡分期設定的操作流程是**按鈕 → Modal → 滑桿 → 確認**，非直覺的 input/select：

**步驟一：啟用分期付款**

主頁面上有一個 radio group「信用卡分期付款」，選「是」啟用。

| 元素 | selector |
|------|----------|
| 信用卡分期付款 radio「是」 | `input[type="radio"][value="true"]`（在 `.edit-row` 內 label 含「分期」） |

**步驟二：設定期數（Modal 流程）**

啟用後出現一組狀態列：
```html
<div class="status">
  <p>目前允許的分期期數：<span></span><a>審核通過</a></p>
  <button class="eds-button">設定期數</button>
</div>
```

點擊「設定期數」→ 彈出 Modal：

```html
<div class="eds-modal__content">
  <div class="eds-modal__header">設定信用卡分期</div>
  <div class="eds-modal__body">
    <div class="installment-setting-modal">
      <div class="tenure-slider">
        <div class="tenure-slider-bubble active" style="left: 0%;">3期</div>
        <div class="tenure-slider-bubble active" style="left: 33.3333%;">6期</div>
        <div class="tenure-slider-bubble active" style="left: 66.6667%;">12期</div>
        <div class="tenure-slider-bubble active" style="left: 100%;">24期</div>
      </div>
      <div class="installment-setting-modal__footer">
        <button>取消</button>
        <button class="eds-button--primary">確認</button>
      </div>
    </div>
  </div>
</div>
```

**實機驗證重點**（2026-07-20 診斷結果）：
- 按鈕 selector：`.status button.eds-button` ✅ 命中
- Modal 出現後 `document.querySelector('.eds-modal')` 會命中**圖片裁切 modal**（`image-cropper-modal`），非分期 Modal → **不要用 `.eds-modal` 作為 wait selector**
- 改用 `[class*="installment-setting-modal"]` 或直接等 `.tenure-slider-bubble`
- Bubbles 初始狀態：全部 `active=false`（需點擊啟用）
- 按鈕文字：**「儲存」**（未選取時，disabled）→ 選取後變 **「確認」**（enabled）

**最終實作（`S:\projects\shopee-copy-product\extension\content.js:1174-1221`）**：

```javascript
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
```

**關鍵修改**（v1 → v2）：
1. **新增 retry 找「設定期數」按鈕**（等 Vue re-render）— 切換分期 radio 到「是」後，搜 button 前加入最多 3 秒的 retry 迴圈，等 Vue 渲染出按鈕。這是唯一的必要修復。
2. `waitForElement('[class*="installment-setting-modal"]')` → `waitForElement('.tenure-slider-bubble')` — 避免 modal 容器剛插入時子元件尚未渲染的問題。次要安全層。
3. 移除多餘的 slider circle 備案點擊（因 Test A 確認 bubble dispatchEvent 即可正常觸發）

---

## 四、實作檔案索引

| 功能 | 檔案（絕對路徑） | 關鍵行號 |
|------|------------------|----------|
| `toJsonClipboard` 輸出 dimension/installment | `S:\projects\shopee-copy-product\extension\popup.js` | 101-110 |
| `fillAll` 尺寸屬性填入 + 信用卡分期 | `S:\projects\shopee-copy-product\extension\content.js` | 1145-1225 |
| seller 介面提示文字 | `S:\projects\shopee-copy-product\extension\popup.html` | 49-53 |
| 診斷腳本（設定期數流程驗證） | `S:\projects\shopee-copy-product\extension\diagnose-installment.js` | 全檔 |
| 本規格文件 | `S:\projects\shopee-copy-product\docs\spec\017-fix-新增賣家屬性填入與信用卡分期（seller_field_installment）.md` | 全檔 |

## 五、未確認問題

1. 不同類別下「尺寸（長 x 寬 x 高）」的 DOM 結構是否一致未全面驗證（僅測試電腦周邊類別）
2. Installment Modal 內部 slider 元件行為是否隨頁面版本變動未確定

> **已排除**：`isTrusted` / MouseEvent 冒充 PointerEvent 假說 — 2026-07-20 隔離測試顯示 `dispatchEvent` 可正常觸發 Vue bubble active 變化。

## 六、Tasks

### Task 1：Smoke Test（每次改動 seller 相關代碼後執行）

1. 選一個會顯示「尺寸（長 x 寬 x 高）」屬性的類別（電腦與周邊配件 > 硬碟）
2. 點「填寫全部」
3. 確認以下欄位正確填入：
   - ✅ 尺寸（長 x 寬 x 高）= `10x10x4`
   - ✅ 信用卡分期付款 =「是」
   - ✅ 設定期數 = 24 期
4. 從舊版 JSON（無 dimension/installment 欄位）貼入 → 不報錯

### Task 2：若設定期數再度失敗時

1. 打開 seller 頁面 Console（F12）
2. 複製下列診斷腳本貼入執行，貼回結果：

```javascript
// 診斷腳本在 S:\projects\shopee-copy-product\extension\diagnose-installment.js
(async function diagnose() {
  const log = []; const ok = m => log.push('✅ '+m); const fail = m => log.push('❌ '+m)
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '設定期數')
  if (!btn) { fail('no button'); alert(log.join('\n')); return }
  btn.click(); await new Promise(r => setTimeout(r, 2000))
  const bubble = Array.from(document.querySelectorAll('.tenure-slider-bubble')).find(b => b.textContent.trim() === '24期')
  if (bubble) { bubble.click(); ok('clicked 24期'); await new Promise(r => setTimeout(r, 1000)) } else fail('no 24期')
  const sv = [...document.querySelectorAll('button')].find(b => (b.textContent.trim()==='確認'||b.textContent.trim()==='儲存')&&!b.disabled)
  if (sv) { sv.click(); ok('saved') } else fail('no save btn: ' + [...document.querySelectorAll('button')].map(b=>`"${b.textContent.trim()}" d=${b.disabled}`))
  alert(log.join('\n'))
})()
```

---

## 七、風險與注意事項

1. **屬性欄位依類別動態渲染** — 若選的類別沒有「尺寸（長 x 寬 x 高）」屬性，`fillFieldAsync` 會回傳 `{ ok: false, error: '找不到欄位' }`，不影響其他欄位填入
2. **向後相容** — 舊版 clipboard JSON 沒有這兩個欄位，`fillAll` 中應以 `data.dimension || ''` 判斷，無值則跳過
3. **與包裹尺寸無關** — 「尺寸（長 x 寬 x 高）」是**商品屬性**（產品規格），非「包裹尺寸」（`dimension.width/length/height`，決定運費）。兩者不可混淆
4. **Vue slider 事件綁定依賴實作細節** — 本次透過 `.click()` 避開 `dispatchEvent` 的信任問題，但若蝦皮 (Shopee) 後端改用 `@pointerdown` 綁定則可能復發

---

## 附錄：參考資料

- 賣家頁面 DOM 分析：`docs/data/mcp devtools 蒐集的蝦皮資料/14-seller-new-product-dom-analysis.md`
- 現有 fieldIdMap：`content.js:608-618`
- `fillAll` 函數：`content.js:1059-1135`
- `findFieldByLabel` 函數：`content.js:608-649`
- `toJsonClipboard` 函數：`popup.js:101-110`
