# 蝦皮官方買家頁面 DOM 結構（原始數據）

蒐集時間：2026-07-19  
頁面：https://shopee.tw/product/987022693/52564235595/?is_from_login=true  
商品：ViiTorVoice-NAR（聲音克隆軟體）  
工具：Chrome DevTools Protocol（WebSocket）直接 Runtime.evaluate

---

## 一、全部 `img[src*=file]` 共 30 張

| idx | src（file id） | alt | w×h | class | parentCls | gpCls |
|-----|---------------|-----|-----|-------|-----------|-------|
| 0 | `tw-11134216-820l7-mqor51b0nf2m61_tn` | profile | 200×200 | shopee-avatar__img | shopee-avatar | navbar__link--account__container |
| 1 | `tw-11134207-820l6-mqst930825fmf1` | Product image... | 450×450 | P39yUt NR6MMT | i9ihcI | _rXL5o |
| 2 | `tw-11134207-820l6-mqst930825fmf1` | （空） | 82×82 | P39yUt lazyload TnEtN4 | i9ihcI | FAWPL0 |
| 3 | `tw-11134207-820lc-mqrvl64tdg5p63` | （空） | 82×82 | P39yUt lazyload TnEtN4 | i9ihcI | FAWPL0 |
| 4 | `tw-11134207-820lg-mqst92zx68zle8` | （空） | 82×82 | P39yUt lazyload TnEtN4 | i9ihcI | FAWPL0 |
| 5 | `tw-11134207-820l6-mqst92zw8jd97d` | （空） | 82×82 | P39yUt lazyload TnEtN4 | i9ihcI | FAWPL0 |
| 6 | `tw-11134207-820le-mqst930402dr0d` | （空） | 82×82 | P39yUt lazyload TnEtN4 | i9ihcI | FAWPL0 |
| 7 | `tw-11134216-820l7-mqor51b0nf2m61`（無 _tn） | 造訪賣場 | 80×80 | P39yUt lazyload mYIRfs | i9ihcI | F1Gpl5 CiclDV |
| 8–17 | 品牌 logo × 10 | logo | 52×22 | （空） | HOyEnn | Ei2TcA |
| 18–20 | 品牌 logo × 3 | logo | 52×22 | （空） | HOyEnn | Ei2TcA |
| 21–25 | 社群 icon × 5 | （空） | 16×16 | AlFaz4 | yIJgtJ | wdBnpK |
| 26 | QR code | download_qr_code | 80×80 | Wn14IO | （空） | DLMbEy |
| 27–29 | App 圖示 × 3 | app | 68×16 | （空） | FP4VvO | uJiWCw |

---

## 二、mdCA_C 容器共 5 個

| idx | class | img src（file id） | img w×h | img alt |
|-----|-------|-------------------|----------|---------|
| 0 | mdCA_C | `tw-11134207-820l6-mqst930825fmf1` | 82×82 | （空） |
| 1 | mdCA_C | `tw-11134207-820lc-mqrvl64tdg5p63` | 82×82 | （空） |
| 2 | mdCA_C | `tw-11134207-820lg-mqst92zx68zle8` | 82×82 | （空） |
| 3 | mdCA_C | `tw-11134207-820l6-mqst92zw8jd97d` | 82×82 | （空） |
| 4 | mdCA_C | `tw-11134207-820le-mqst930402dr0d` | 82×82 | （空） |

---

## 三、Hash class 存在性

| class | 存在？ |
|-------|--------|
| `o_Jpw2` | ❌ |
| `Wi_1Rq` | ✅ |
| `Zt4sev` | ❌ |
| `mdCA_C` | ✅ |
| `TCWu_` | ❌ |
| `vYcy_` | ❌ |
| `izXPt` | ❌ |

---

## 四、`document.images` 中 .png / .svg

| idx | src | alt | w×h |
|-----|-----|-----|-----|
| 1–4, 19–22 | `…/2ab134f0d714bfe3.svg` | icon arrow right | 11×11（×4） |
| 12 | `…/a8b7723fab6e2185.svg` | icon arrow left bold | 13×21 |
| 13 | `…/36e0bd793a22338e.svg` | icon arrow right bold | 13×21 |
| 14 | `…/61a15a6ba4b573e6.svg` | outline green truck icon | 16×16 |
| 15 | `…/2c63f179fbca6697.svg` | service entrance icon | 20×20 |
| 16 | `…/d29f372d4b2b0264.svg` | icon head shot | 15×15 |
| 18 | `…/1b7ba9177eca6752.svg` | icon shop | 300×150 |

| idx | src | alt | w×h |
|-----|-----|-----|-----|
| 22 | `…/shoprating/3215f6ba1a0e877fa06e.png` | empty-icon | 121×121 |

---

## 五、JSON-LD

```
["https://down-tw.img.susercontent.com/file/tw-11134207-820l6-mqst930825fmf1"]
```

---

## 六、重複 file ID

```
tw-11134207-820l6-mqst930825fmf1  × 2
  → src 索引 1: 主圖區 450×450
  → src 索引 2: 縮圖區 82×82（mdCA_C 內）
```

---

## 七、`_tn` 圖片

| src（file id） | alt | w×h | parentCls |
|---------------|-----|-----|-----------|
| `tw-11134216-820l7-mqor51b0nf2m61_tn` | profile | 200×200 | shopee-avatar |

---

## 八、大型圖片（≥400px）

| idx | src（file id） | w×h | parentCls | gpCls |
|-----|---------------|-----|-----------|-------|
| 0 | `tw-11134207-820l6-mqst930825fmf1` | 450×450 | i9ihcI | _rXL5o |

---

## 九、Carousel 結構查詢

| 項目 | 值 |
|------|-----|
| 有 image-view / carousel / gallery class 容器？ | ❌ |
| 有 thumbnail / thumb class 容器？ | ❌ |
| 可用點擊的縮圖元素數量 | 0 |

---

## 十、使用者登入狀態

頁面 URL 含 `?is_from_login=true`，已登入狀態。`__INITIAL_STATE__` script tag 存在並包含完整商品資料。

---

## 十一、買家賣場商品列表頁 (`https://shopee.tw/shop/25204842/search`) 結構 Inspection

蒐集時間：2026-07-22  
目標賣場：`https://shopee.tw/mazz68` (Shop ID: `25204842`)  
工具：Antigravity DevTools Engine (CDP non-automation Chrome)

### 11.1 賣場頁面 URL 與分頁機制

- **主要賣場商品搜尋 URL**: `https://shopee.tw/shop/25204842/search`
- **分頁 URL 參數**: `?page=0` (第一頁), `?page=1` (第二頁) ... `&sortBy=sales` (熱銷排序), `&sortBy=ctime` (最新排序)
- **單頁商品數量**: 預設每頁顯示 30 筆（或 60 筆 lazyload 滾動加載）。

### 11.2 商品卡片 DOM 結構

- **商品卡片連結**: `a[href*="/product/25204842/"]` 或 `a[data-sqe="link"]`
- **商品卡片容器**: `div.shop-search-result-view__item` / `div.col-xs-2-4`
- **商品圖片**: `img.lazyload` / `img[src*="down-tw.img.susercontent.com/file/"]`
- **商品標題**: `div[data-sqe="name"]` / `div.item-card__name`
- **商品價格**: `span[class*="price"]` / `span[class*="currency"]`

### 11.3 買家頁面分頁控制項 (Buyer Pagination Controls)

- **分頁按鈕容器**: `div.shopee-page-controller`
- **頁碼按鈕**: `button.shopee-button-solid--primary` (當前頁), `button.shopee-button-no-outline`
- **下一頁按鈕**: `button.shopee-icon-button--right` / `button[class*="icon-button--right"]`
- **頂部迷你分頁器**: `div.shopee-mini-page-controller` (包含 `span.shopee-mini-page-controller__current` 及左右切換按鈕)

### 11.4 反爬蟲與載入特性備註

1. **Lazy Loading 滾動加載**: 買家頁面下方的商品卡片圖片與 DOM 節點採動態懶載入，滑鼠需向下滾動 (`scroll`) 才能觸發完整 HTML 渲染。
2. **非自動測試控制優勢**: 使用 CDP 非 `--enable-automation` 控制時，存取 `https://shopee.tw/shop/25204842/search` 均能正常回傳 200 OK，不會被觸發人機驗證或頁面重定向。
