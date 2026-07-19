# seller.shopee.tw 新增商品頁面 DOM 結構分析

蒐集時間：2026-07-19  
頁面：`https://seller.shopee.tw/portal/product/new?from=sidebar`  
已選類別：**電腦與周邊配件 > 軟體**

---

## 一、框架確認

- **前端框架**：Vue 3 + EDS（Shopee 自有 Design System）
- **不是** Ant Design，原本 content.js 用的 `.ant-form-item-label label` selector 完全無效
- Vue 3 Scoped Style 屬性（`data-v-xxxxxxxx`）每次版本可能改變，**不得用於 selector**

---

## 二、最穩定的 Selector 基礎：`data-product-edit-field-unique-id`

每個欄位容器都有 `data-product-edit-field-unique-id` 屬性，是目前最穩定的識別方式：

```js
document.querySelector('[data-product-edit-field-unique-id="name"] input.eds-input__input')
```

### 完整欄位 ID 對照表（選類別後渲染）

| data-product-edit-field-unique-id | 欄位名稱 | 類型 | input selector |
|---|---|---|---|
| `name` | 商品名稱 | text input | `input.eds-input__input` |
| `category` | 類別 | 自訂按鈕（無 input） | 無 input，需 click `.product-category-box-inner` |
| `gtinCode` | 國際條碼 (GTIN) | text input | `input.eds-input__input` |
| `brandAndAttributes` | 品牌 + 屬性（整組） | EDS Select 下拉 + text | 見下節 |
| `certificationInfo` | 商品證書 | 動態載入 async | `display:none` 時不存在 |
| `description` | 商品描述 | 富文字編輯器 | `input[type="file"]` 是圖片上傳，非描述文字 |
| `variation` | 規格 | 動態渲染 | 無直接 input |
| `price` | 價格 | text input（NT$ prefix） | `input.eds-input__input` |
| `stock` | 商品數量 | text input | `input.eds-input__input` |
| `minpq` | 最低購買數量 | text input | `input.eds-input__input` |
| `weight` | 重量（公斤） | text input（kg suffix） | `input.eds-input__input` |
| `dimension.width` | 包裹尺寸 - 寬 | text input（cm suffix） | `input.eds-input__input` placeholder=`寬` |
| `dimension.length` | 包裹尺寸 - 長 | text input（cm suffix） | `input.eds-input__input` placeholder=`長` |
| `dimension.height` | 包裹尺寸 - 高 | text input（cm suffix） | `input.eds-input__input` placeholder=`高` |
| `dangersGoods` | 禁運品 | radio group（否/是） | `input.eds-radio__input[value="0"]` / `[value="1"]` |
| `logistic` | 買家支付運費（物流渠道） | checkbox 群組 | `input.eds-checkbox__input` |
| `preOrder` | 較長備貨 | radio group（否/是） | `input.eds-radio__input[value="false"]` / `[value="true"]` |
| `condition` | 商品保存狀況 | EDS Selector（無 input） | `.eds-selector__inner`（需 click 開啟） |
| `scheduledPublishTime` | 預約上架時間 | EDS DatePicker（無 input） | `.eds-selector`（需 click 開啟） |
| `parentSku` | 主商品貨號 | text input | `input.eds-input__input` placeholder=`-` |

---

## 三、欄位 DOM 結構模板

### 3.1 標準 text input 欄位（商品名稱為例）

```html
<!-- 整個 edit-row -->
<div class="edit-row">
  <div class="edit-label edit-title">
    <div class="mandatory"><span class="mandatory-icon">*</span></div>
    <span>商品名稱</span>          <!-- label 是 <span>，不是 <label> -->
  </div>
  <div class="edit-main">
    <div class="product-edit-form-item" data-product-edit-field-unique-id="name">
      <div class="product-edit-form-item-content">
        <div class="eds-input">
          <div class="eds-input__inner eds-input__inner--large">
            <input class="eds-input__input" type="text" placeholder="品牌名稱 + 商品類型..." />
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

**正確 selector**：
```js
'[data-product-edit-field-unique-id="name"] input.eds-input__input'
```

### 3.2 品牌欄位（EDS Select + 屬性群組）

品牌欄位包在 `data-product-edit-field-unique-id="brandAndAttributes"` 的 SPAN 容器裡。

```html
<span class="async-component" data-product-edit-field-unique-id="brandAndAttributes">
  <div class="ls-upload-cmpt-container product-attrbute-brand-list"
       instanceid="attributeAndBrand"
       componentkey="ProductAttributeAndBrand">
    <div class="attribute-select-container-new">
      <div class="attribute-select-list attribute-select-container-layout-vertical">
        <!-- 品牌 edit-row -->
        <div class="edit-row" data-ls-upload-cmpt="">
          <div class="edit-label edit-title">
            <div class="item-title">
              <div class="mandatory"><span class="mandatory-icon">*</span></div>
              品牌                  <!-- 注意：文字直接在 div 裡，不在 <span> -->
            </div>
          </div>
          <div class="degrade-wrap">
            <div class="edit-row-right-medium">
              <div class="product-edit-form-item product-brand-item">
                <!-- EDS Select 容器 -->
                <div class="popover-wrap field-disabled-tips attribute-text"
                     category-ids="100644,101937">
                  <div class="eds-select">
                    <div class="eds-dropdown eds-select-popover">
                      <!-- 下拉選單，點擊後展開 -->
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</span>
```

**重要發現**：
- `category-ids="100644,101937"` — 品牌欄位帶有類別 ID，代表品牌選項是依類別動態載入的
- 品牌使用 `eds-select` 下拉，**不是** 原生 `<select>`，需要模擬 click 操作
- 品牌 edit-row 的 label 是 `div.item-title` 裡的純文字節點，不是 `<span>`

### 3.3 EDS Select 下拉操作方式（品牌/條件/屬性）

EDS Select 沒有原生 `<input>` 或 `<select>`，只有：
```html
<div class="eds-selector eds-selector--large" tabindex="0">
  <div class="eds-selector__inner">（當前選中值）</div>
</div>
```

操作流程：
1. `element.click()` 或 `element.dispatchEvent(new MouseEvent('click'))` → 展開下拉
2. 等待 `.eds-select__menu` 出現（MutationObserver）
3. 找到目標 `option` 並 click

### 3.4 商品描述欄位（富文字編輯器）

```html
<span class="async-component" data-product-edit-field-unique-id="description">
  <div class="ls-upload-cmpt-container product-description-editor"
       instanceid="description_after_specification"
       componentkey="ProductDescriptionEditor">
    <div class="rich-text-editor">
      <!-- 富文字編輯器容器，不是普通 textarea -->
    </div>
  </div>
</span>
```

**重要**：商品描述是富文字編輯器（不是普通 `<textarea>`），填入純文字需要：
1. 找到 `.rich-text-editor` 的可編輯容器（通常是 `[contenteditable="true"]`）
2. 設定 `innerText` 並 dispatch 相關 input/change 事件

---

## 四、label 識別邏輯

| 欄位類型 | label 所在 | 文字節點位置 |
|---|---|---|
| 標準欄位（商品名稱、價格等） | `.edit-label .span` | `<span>` 純文字 |
| 品牌/屬性欄位 | `.edit-label .item-title > div` | `div` 的 textContent（含 mandatory div） |
| 商品影片 | `.edit-label > div` | 直接在 `<div>` 裡，無包裝 span |

---

## 五、修正後的 `findFieldByLabel` 邏輯建議

舊版（無效）：
```js
document.querySelectorAll('.ant-form-item-label label, label')
```

新版正確邏輯：
```js
function findFieldByLabel(labelText) {
  // 優先用 data-product-edit-field-unique-id
  const fieldIdMap = {
    '商品名稱': 'name',
    '價格': 'price',
    '商品數量': 'stock',
    '最低購買數量': 'minpq',
    '重量': 'weight',
    '主商品貨號': 'parentSku',
    '國際條碼': 'gtinCode',
  }
  const fieldId = Object.entries(fieldIdMap).find(([k]) => labelText.includes(k))?.[1]
  if (fieldId) {
    const el = document.querySelector(`[data-product-edit-field-unique-id="${fieldId}"] input.eds-input__input`)
    if (el) return el
  }

  // fallback：找 edit-row 裡的 span/div 文字比對
  for (const row of document.querySelectorAll('.edit-row')) {
    const labelEl = row.querySelector('.edit-label span:not(.mandatory-icon), .edit-label .item-title')
    if (!labelEl) continue
    const text = (labelEl.textContent || '').trim().replace(/[\s*]+$/, '')
    if (text === labelText || text.includes(labelText)) {
      return row.querySelector('input.eds-input__input, textarea.eds-input__input')
    }
  }
  return null
}
```

---

## 六、`waitForElement` 必要性

由於 Vue 3 SPA 的 `v-if` 機制，選類別後屬性欄位（品牌、保固等）是**非同步渲染**的。
在呼叫 `fillAll` 時必須等待目標 selector 出現：

```js
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector)
    if (el) return resolve(el)
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) { observer.disconnect(); resolve(el) }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => { observer.disconnect(); reject(new Error(`Timeout: ${selector}`)) }, timeout)
  })
}
```

---

## 七、品牌下拉的操作策略

品牌欄位使用 EDS Select（`.eds-select`），沒有原生 `<input>`。操作方式：

```js
async function fillBrand(brandName) {
  // 1. 找品牌 EDS Select 容器
  const brandContainer = document.querySelector(
    '[data-product-edit-field-unique-id="brandAndAttributes"] .eds-select'
  )
  if (!brandContainer) throw new Error('找不到品牌欄位')

  // 2. 找 trigger 元素並 click 展開
  const trigger = brandContainer.querySelector('.eds-selector')
  trigger.click()

  // 3. 等待下拉選單出現
  const menu = await waitForElement('.eds-select__menu', 3000)

  // 4. 找到目標選項並 click
  const options = menu.querySelectorAll('[class*="eds-select__option"], [class*="option"]')
  for (const opt of options) {
    if (opt.textContent.trim() === brandName) {
      opt.click()
      return true
    }
  }
  throw new Error(`找不到品牌選項：${brandName}`)
}
```

---

## 八、目前 content.js 的 `fillAll` 問題摘要

| 問題 | 根因 | 修正方向 |
|---|---|---|
| findFieldByLabel 找不到任何欄位 | selector 用 Ant Design 的 `.ant-form-item-label label`，實際是 EDS `<span>` | 改用 `data-product-edit-field-unique-id` 為主，span/div 文字比對為輔 |
| 品牌填不進去 | 品牌是 EDS Select 自訂下拉，沒有 `<select>` | 需 click 展開 → 等 menu → click option |
| 填入時機太早 | fillAll 是同步立即執行，Vue 渲染尚未完成 | 加 waitForElement + MutationObserver |
| 商品描述填不進去 | 是富文字編輯器，不是 textarea | 找 `[contenteditable="true"]` 並操作 innerText + input 事件 |

---

## 九、商品描述編輯器：Quill

**確認是 Quill 富文字編輯器**（不是 ProseMirror 或 Tiptap）。

`html
<div class="ql-editor ql-blank"
     data-gramm="false"
     contenteditable="true"
     data-placeholder="請輸入商品描述或點選以新增圖片">
  <p><br></p>
</div>
`

**selector**：
`js
'[data-product-edit-field-unique-id="description"] .ql-editor'
`

**填入純文字的正確方式**：
`js
const editor = document.querySelector('[data-product-edit-field-unique-id="description"] .ql-editor')
editor.focus()
// 清除現有內容
editor.innerHTML = ''
// 插入文字
document.execCommand('insertText', false, descriptionText)
// 或手動設定並觸發 input event
editor.innerHTML = '<p>' + descriptionText.replace(/\n/g, '</p><p>') + '</p>'
editor.dispatchEvent(new Event('input', { bubbles: true }))
`

---

## 十、完整欄位列表（含 label 實際文字，選「電腦與周邊配件 > 軟體」後）

| label 文字 | fieldId | 填入類型 |
|---|---|---|
| 商品圖片 | images | 上傳（不填） |
| 行銷活動圖片 | promotionImages | 上傳（不填） |
| 商品影片 | video | 上傳（不填） |
| 商品名稱 | name | text input |
| 類別 | category | 自訂 button（不填） |
| 國際條碼 (GTIN) | gtinCode | text input |
| 品牌 | brandAndAttributes（部分） | EDS Select（需 click） |
| 保固期限 | （屬性欄位，無獨立 fieldId） | EDS Select |
| 尺寸（長 x 寬 x 高） | （屬性欄位） | text input |
| 包裝尺寸 | （屬性欄位） | text input + EDS Select（單位） |
| 保固種類 | （屬性欄位） | EDS Select |
| 軟體種類 | （屬性欄位） | EDS Select |
| 處理系統 | （屬性欄位） | EDS Select |
| 每組數量 | （屬性欄位） | text input |
| 商品描述 | description | Quill 富文字 .ql-editor |
| 價格 | price | text input（NT$ prefix） |
| 商品數量 | stock | text input |
| 最低購買數量 | minpq | text input |
| 多件優惠 | （無 fieldId） | button 互動 |
| 重量 | weight | text input（kg suffix） |
| 包裹尺寸大小 | dimension.width/.length/.height | text input（cm suffix） |
| 禁運品 | dangersGoods | radio（否/是）|
| 買家支付運費 | logistic | checkbox 群組 |
| 較長備貨 | preOrder | radio（否/是）|
| 商品保存狀況 | condition | EDS Select（全新/二手） |
| 預約上架時間 | scheduledPublishTime | EDS DatePicker |
| 主商品貨號 | parentSku | text input |
