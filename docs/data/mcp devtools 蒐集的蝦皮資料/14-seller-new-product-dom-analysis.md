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

| data-product-edit-field-unique-id | 欄位名稱 | 類型 | 必填 | Excel 對應 | input selector |
|---|---|---|---|---|---|
| `name` | 商品名稱 | text input | ✅ Excel必填 | `ps_product_name` | `input.eds-input__input` |
| `category` | 類別 | 自訂按鈕 | ✅ Excel必填 | `ps_category` | 無 input，需 click `.product-category-box-inner` |
| `gtinCode` | 國際條碼 (GTIN) | text input | ➖ | `ps_gtin_code` | `input.eds-input__input` |
| `brandAndAttributes` | 品牌 + 屬性（整組） | EDS Select + text | ➖ | `ps_brand` | 見下節 |
| `description` | 商品描述 | 富文字編輯器 | ➖ | `ps_product_description` | `[contenteditable="true"]` |
| `price` | 價格 | text input（NT$ prefix） | ✅ Excel必填 | `ps_price` | `input.eds-input__input` |
| `stock` | 商品數量 | text input | ✅ Excel必填 | `ps_stock` | `input.eds-input__input` |
| `minpq` | 最低購買數量 | text input | ➖ | `ps_minimum_purchase_quantity` | `input.eds-input__input` |
| `weight` | 重量（公斤） | text input（kg suffix） | ➖ | `ps_weight` | `input.eds-input__input` |
| `dimension.width` | 包裹尺寸 - 寬 | text input（cm suffix） | ➖ | `ps_width` | `input.eds-input__input` placeholder=`寬` |
| `dimension.length` | 包裹尺寸 - 長 | text input（cm suffix） | ➖ | `ps_length` | `input.eds-input__input` placeholder=`長` |
| `dimension.height` | 包裹尺寸 - 高 | text input（cm suffix） | ➖ | `ps_height` | `input.eds-input__input` placeholder=`高` |
| `dangersGoods` | 禁運品 | radio group（否/是） | ➖ | `ps_dangerous_goods` | `input.eds-radio__input[value="0"]` / `[value="1"]` |
| `preOrder` | 較長備貨 | radio group（否/是） | ➖ | `ps_product_pre_order_dts` | `input.eds-radio__input[value="false"]` / `[value="true"]` |
| `parentSku` | 主商品貨號 | text input | ➖ | `ps_sku_parent_short` | `input.eds-input__input` placeholder=`-` |
| `variation` | 規格 | 動態渲染 | ➖ | `et_title_variation_1` + options | 無直接 input |
| `installment` | 信用卡分期付款 | radio + button + Modal | ➖ | 無 Excel 欄位（賣家後台設定） | 見第十一節 |
| `logistic` | 買家支付運費（物流渠道） | checkbox 群組 | ➖ | 無 Excel 欄位 | `input.eds-checkbox__input` |
| `condition` | 商品保存狀況 | EDS Selector | ➖ | 無 Excel 欄位 | `.eds-selector__inner`（需 click 開啟） |
| `scheduledPublishTime` | 預約上架時間 | EDS DatePicker | ➖ | 無 Excel 欄位 | `.eds-selector`（需 click 開啟） |
| `certificationInfo` | 商品證書 | 動態載入 async | ➖ | 無 Excel 欄位 | `display:none` 時不存在 |

> **圖示說明**：✅ Excel必填 = Shopee 大量上傳範本標記為必填；➖ = 選填，視使用者需求。無 Excel 對應的欄位為 Shopee 後台專屬設定，不上傳。

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

## 十、完整欄位列表（含 label 實際文字 + 必填標示）

選「電腦與周邊配件 > 軟體」後，頁面上所有可互動欄位，依出現順序列出：

### 10.1 DOM 欄位（可透過 content.js 填寫）

| label 文字 | fieldId | 填入類型 | 必填 | Excel 對應 |
|---|---|---|---|---|
| 商品圖片 | images | 上傳（不填） | ✅ | `ps_item_cover_image` + `ps_item_image_1~8` |
| 行銷活動圖片 | promotionImages | 上傳（不填） | ➖ | 無 |
| 商品影片 | video | 上傳（不填） | ➖ | 無 |
| 商品名稱 | name | text input | ✅ Excel必填 | `ps_product_name` |
| 類別 | category | 自訂 button | ✅ Excel必填 | `ps_category` |
| 國際條碼 (GTIN) | gtinCode | text input | ➖ | `ps_gtin_code` |
| 品牌 | brandAndAttributes（部分） | EDS Select | ➖ | `ps_brand` |
| 保固期限 | （屬性欄位） | EDS Select | ➖ | 無 |
| 尺寸（長 x 寬 x 高） | （屬性欄位） | text input | ➖ | 無（非包裹尺寸） |
| 包裝尺寸 | （屬性欄位） | text input + Select | ➖ | 無 |
| 保固種類 | （屬性欄位） | EDS Select | ➖ | 無 |
| 軟體種類 | （屬性欄位） | EDS Select | ➖ | 無 |
| 處理系統 | （屬性欄位） | EDS Select | ➖ | 無 |
| 每組數量 | （屬性欄位） | text input | ➖ | 無 |
| 商品描述 | description | Quill 富文字 | ➖ | `ps_product_description` |
| 價格 | price | text input（NT$ prefix） | ✅ Excel必填 | `ps_price` |
| 商品數量 | stock | text input | ✅ Excel必填 | `ps_stock` |
| 最低購買數量 | minpq | text input | ➖ | `ps_minimum_purchase_quantity` |
| 多件優惠 | （無 fieldId） | button 互動 | ➖ | 無 |
| 重量 | weight | text input（kg suffix） | ➖ | `ps_weight` |
| 包裹尺寸大小 | dimension.width/length/height | text input（cm suffix） | ➖ | `ps_width` / `ps_length` / `ps_height` |
| 禁運品 | dangersGoods | radio（否/是） | ➖ | `ps_dangerous_goods` |
| 買家支付運費 | logistic | checkbox 群組 | ➖ | 無 |
| 較長備貨 | preOrder | radio（否/是） | ➖ | `ps_product_pre_order_dts` |
| 商品保存狀況 | condition | EDS Select | ➖ | 無 |
| 預約上架時間 | scheduledPublishTime | EDS DatePicker | ➖ | 無 |
| 主商品貨號 | parentSku | text input | ➖ | `ps_sku_parent_short` |
| 信用卡分期付款 | installment | radio + button + Modal | ➖ | 無（後台設定） |

### 10.2 Excel 專屬欄位（DOM 無對應，需由外部資料填入）

| Excel 欄位 | 說明 | 必填 | 建議值 |
|---|---|---|---|
| `ps_sku_short` | SKU 編號 | ➖ | 可用 `ProductId` |
| `ps_hs_code` | HS 稅則編碼 | ➖ | 視使用者需求 |
| `ps_tax_code` | 稅務代碼 | ➖ | 視使用者需求 |
| `ps_new_size_chart` | 尺寸表 | ➖ | 視使用者需求 |
| `et_title_size_chart` | 尺寸表圖片 | ➖ | 視使用者需求 |
| `channel_id.*` | 銷售通路 | ➖ | 視使用者需求 |
| `ps_product_pre_order_dts_range` | 預購天數範圍 | ➖ | 視使用者需求 |
| `ps_tool_mass_upload_sample_attr_country_origin` | 原產國 | ➖ | 臺灣（跨國物流用） |
| `ps_tool_mass_upload_sample_attr_manufacturer_details` | 製造商資訊 | ➖ | 視使用者需求 |
| `ps_tool_mass_upload_sample_attr_packer_details` | 包裝者資訊 | ➖ | 視使用者需求 |
| `ps_tool_mass_upload_sample_attr_importer_details` | 進口商資訊 | ➖ | 視使用者需求 |
| `ps_brand` | 品牌 | ➖ | 已在 DOM 中 |
| `ps_gtin_code` | GTIN 條碼 | ➖ | 已在 DOM 中 |

> **用法**：寫 content.js 時看 10.1；寫 JSON→Excel 轉換腳本時看 10.2。

---

## 十一、信用卡分期付款（installment）DOM 結構

**位置**：運費與物流頁籤底部（或付款設定區塊）

**流程**：radio 切「是」→ Vue re-render 出現「設定期數」按鈕 → 點擊開 Modal → slider 選期數 → 確認

### 11.1 啟用分期（radio）

```html
<div class="edit-row">
  <div class="edit-label edit-title"><span>信用卡分期付款</span></div>
  <div class="edit-main">
    <div data-product-edit-field-unique-id="installment">
      <div class="eds-radio-group">
        <label class="eds-radio"><input type="radio" value="false" /> 否</label>
        <label class="eds-radio"><input type="radio" value="true" /> 是</label>
      </div>
    </div>
  </div>
</div>
```

**啟用 radio 後**，Vue 非同步 re-render 下方出現狀態列 + 按鈕：

```html
<div class="status">
  <p>目前允許的分期期數：<span></span><a>審核通過</a></p>
  <button class="eds-button eds-button--normal btn">設定期數</button>
</div>
```

### 11.2 設定期數 Modal

```html
<div class="eds-modal__content">
  <div class="eds-modal__header">設定信用卡分期</div>
  <div class="eds-modal__body">
    <div class="installment-setting-modal">
      <div class="tenure-slider">
        <div class="tenure-slider-bubble" style="left: 0%;">3期</div>
        <div class="tenure-slider-bubble" style="left: 33.3333%;">6期</div>
        <div class="tenure-slider-bubble" style="left: 66.6667%;">12期</div>
        <div class="tenure-slider-bubble" style="left: 100%;">24期</div>
      </div>
      <div class="installment-setting-modal__footer">
        <button>取消</button>
        <button class="eds-button--primary">確認</button>
      </div>
    </div>
  </div>
</div>
```

**關鍵細節**：
- 按鈕文字隨狀態變化：無選取時「儲存」(disabled)，選取後「確認」(enabled)
- `document.querySelector('.eds-modal')` 會誤命中圖片裁切 Modal（`image-cropper-modal`），不可用
- `.tenure-slider-bubble` 初始 `active=false`，需點擊啟用

---

## 附錄：我的商品列表頁（product listing）DOM 結構

蒐集時間：2026-07-21  
頁面：`https://seller.shopee.tw/portal/product/list/live/all`  
使用者：nicola1982（已登入狀態）  
本次成功登入原因：見下方 §登入方式說明

### 為什麼這次登入成功？

先前使用 Playwright / Selenium 等自動化工具都被蝦封鎖，因為：
1. 這些工具建立**全新瀏覽器實例**，無任何 cookies、無瀏覽歷史，蝦皮可透過 `navigator.webdriver` 等指標偵測
2. 蝦皮的 WAF（Web Application Firewall）會阻擋非人類行為模式

**本次成功原因**：
- 使用 Chrome DevTools Protocol（CDP）MCP 工具，**連接使用者原本就在使用的 Chrome 瀏覽器**
- 使用者 nicola1982 已經在瀏覽器中登入蝦皮賣家中心，session cookie 有效
- 我只是在已登入的頁面上導航，沒有重新登入，沒有建立新 session
- 所有操作都是「真實瀏覽器中的真實使用者 session」，蝦皮無法區分這是人類還是 AI 輔助操作

**結論**：未來若要自動化操作蝦皮賣家後台，必須：
1. 使用使用者既有的 Chrome 瀏覽器（而非 Playwright/Selenium 開新瀏覽器）
2. 透過 CDP 或 extension 的 content script 操作
3. 不要嘗試重新登入，要重複使用現有 session

### 頁面網址

| 用途 | URL |
|------|-----|
| 全部商品 | `https://seller.shopee.tw/portal/product/list/live/all` |
| 架上商品 | `https://seller.shopee.tw/portal/product/list/live/live` |
| 違規/刪除 | `https://seller.shopee.tw/portal/product/list/banned/action` |
| 審核中 | `https://seller.shopee.tw/portal/product/list/review` |
| 未上架 | `https://seller.shopee.tw/portal/product/list/unlist` |

### 商品數量摘要

| 狀態 | 數量 |
|------|------|
| 架上商品 | 98 |
| 違規/刪除 | 2 |
| 審核中 | 0 |
| 未上架 / 尚未刊登 | 48 |
| 需要重新補貨 | 86 |
| 需要商品內容優化 | 0 |

### 表格欄位

使用 EDS Table（`.eds-table`），表頭：

| 欄位 | CSS class | 說明 |
|------|-----------|------|
| 商品 | `eds-table__cell first-cell` | 圖片 + 名稱 + 主商品貨號 + 商品 ID + 規格 ID |
| 價格 | `eds-table__cell` | NT$ 價格 |
| 商品數量 | `eds-table__cell` | 庫存數量（含 tooltip：可銷售數量、運送中庫存） |
| 成效 | `eds-table__cell` | 已售出、過去 30 天銷量、瀏覽量 |
| 商品診斷 | `eds-table__cell` | 需要優化的內容數量 |
| 操作 | `eds-table__cell last-cell` | 下拉選單（編輯、建立廣告、複製、即時預覽、下架等） |

### 每列商品資料結構

每列是 `.eds-table__row.valign-top`，裡面包含：

```
商品圖片（img，src 為 cf.shopee.tw 縮圖）
商品名稱（a，href 為 /portal/product/{productId}）
主商品貨號: {sku 或 "-"}
商品 ID: {productId}
規格 ID: {variationId}
價格: NT${price}
庫存: {stock 或 "已售完"}
已售出 {count}
過去 30 天銷量 {count}
過去 30 天瀏覽量 {count}
{商品診斷} 或 "-"
操作: 編輯 / 建立廣告 / 更多（複製、即時預覽、下架等）
```

### 擷取已上架商品列表的 content.js 程式碼

```javascript
function extractSellerProductList() {
  const items = []
  const rows = document.querySelectorAll('.eds-table__row.valign-top')
  for (const row of rows) {
    const nameLink = row.querySelector('a[href*="/portal/product/"]')
    if (!nameLink) continue

    const text = row.textContent
    const skuMatch = text.match(/主商品貨號:\s*(\S+)/)
    const idMatch = text.match(/商品 ID:\s*(\d+)/)
    const priceMatch = text.match(/NT\$(\d+)/)
    const stockText = text.match(/(\d+)\s*$/)  // might match price

    items.push({
      name: nameLink.textContent.trim(),
      productId: idMatch ? idMatch[1] : '',
      sku: skuMatch && skuMatch[1] !== '-' ? skuMatch[1] : '',
      url: nameLink.href,
      price: priceMatch ? priceMatch[1] : '',
    })
  }
  return items
}
```

### 操作按鈕（action column）

每列最後的操作欄 `.eds-table__cell.last-cell` 包含：

```
編輯（連結到 /portal/product/{productId}）
建立廣告
更多 ▼
  ├── 複製
  ├── 即時預覽
  ├── 下架
  ├── 低庫存提醒
  └── 設定推廣活動分潤
```

### 分頁

```
1 / 9  下一頁 ▶
12 / 每頁
```

### 搜尋與篩選

搜尋欄位 placeholder：`搜尋 商品名稱, 主商品貨號, 商品選項貨號, 商品ID`

篩選條件：
- 全部 / 重新補貨(86) / 商品內容優化(0)
- 分類（下拉選單）
- 按鈕：搜尋、重設、展開

### 實用 API 端點（從頁面行為推測）

| 端點 | 用途 |
|------|------|
| `/api/v2/product/get_item_list` | 取得商品列表（需要授權） |
| `/api/v2/product/get_item_detail` | 取得單一商品詳細資料 |
| `/portal/product/{productId}` | 編輯商品頁面 |

---

## 增加：新版新增商品頁面網址

| 用途 | URL |
|------|-----|
| 新增商品（側邊欄） | `https://seller.shopee.tw/portal/product/new?from=sidebar` |
| 新增商品（直接） | `https://seller.shopee.tw/portal/product/new` |
| 大量上傳 | `https://seller.shopee.tw/portal/product-mass/import/upload` |
| 下載模板 | `https://seller.shopee.tw/portal/product-mass/import/download` |
| 分類對應 | `https://seller.shopee.tw/portal/product-mapping/categories` |
| 品牌對應 | `https://seller.shopee.tw/portal/product-mapping/brand` |
| 規格對應 | `https://seller.shopee.tw/portal/product-mapping/variation` |

---

## 增加：賣家中心側邊欄導覽結構

### 第一層
- 首頁
- 訂單管理
  - 我的銷售
  - 批次出貨
  - 退貨/退款/不成立
  - 物流設定
- 商品管理
  - 我的商品
  - 新增商品
- 行銷活動
  - 行銷活動
  - 蝦皮廣告
  - 蝦皮聯盟行銷服務
  - 直播短影音數據
  - 我的行銷活動
  - 我的限時特賣
  - 優惠券
  - 蝦皮活動
- 客服設置管理
  - 聊聊管理
  - AI 賣場客服
  - 我的聊聊廣播
  - 評價管理
- 財務管理
  - 我的進帳
  - 我的錢包
  - 銀行帳號
- 數據中心
  - 賣家數據中心
  - 營運表現
- 賣場管理
  - 賣場介紹
  - 賣場佈置
  - 賣場設定
  - 申訴中心
  - 賣家任務
- 付費服務中心
  - 付費服務中心
  - 我的服務

### 教訓 1：Vue radio toggle 後「等 re-render」再找依賴 UI

**錯誤寫法**（搜 button 前無 await）：
```javascript
radio.checked = true
radio.dispatchEvent(new Event('change', { bubbles: true }))
// ❌ Vue 還沒 re-render，底下的 button 還不存在
const btn = document.querySelector('button') // → null
```

**正確寫法**（retry 等 Vue re-render）：
```javascript
radio.checked = true
radio.dispatchEvent(new Event('change', { bubbles: true }))
let btn = null
for (let i = 0; i < 15; i++) { // 最多 3 秒
  await new Promise(r => setTimeout(r, 200))
  btn = document.querySelector('button')
  if (btn) break
}
```

這是本次修復的**唯一必要修正**。診斷腳本之所以成功，是因為測試時分期已是「是」狀態、按鈕早已存在；但 extension 剛從「否」切到「是」，button 還不存在。

### 教訓 2：`waitForElement` 要等目標節點而非容器

錯誤：`waitForElement('[class*="installment-setting-modal"]')` — modal 容器 DOM 插入時 Vue 子元件還沒渲染。

正確：`waitForElement('.tenure-slider-bubble')` — 等實際要互動的元素出現。

### 教訓 3：`dispatchEvent(isTrusted=false)` 可正常觸發 Vue 3

原先懷疑 Vue 3 的 `@click` 或 `@pointerdown` 會過濾 `isTrusted=false` 的事件。隔離變因測試（2026-07-20）證明 `dispatchEvent(new MouseEvent('pointerdown', ...))` 可以讓 bubble 從 `active=false` 變 `active=true`。**事件信任鏈不是問題**。
