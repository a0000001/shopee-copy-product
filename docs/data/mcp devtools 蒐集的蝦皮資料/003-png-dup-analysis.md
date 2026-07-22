# 蝦皮商品頁圖片 PNG 與重複分析（原始數據）

蒐集時間：2026-07-19  
頁面：蝦皮賣家新品區（英文版），listings 模式  
商品：cat toy with stand, LED light, USB charging  
工具：Chrome DevTools Protocol（HTTP + WebSocket API）三輪深度檢查

---

## 一、全部 `img[src*=file]` 圖片（seller 頁面）

透過 CDP `Runtime.evaluate` 列舉所有 `img[src*=file]`，共 **30 張**（seller listings 頁面）。

### 1.1 主圖區（450×450 以上）

| 索引 | URL（id） | 尺寸 | alt | class |
|------|-----------|------|-----|-------|
| 45 | `tw-11134207-820lc-mqrvl64tdg5p63` | 900×900 | 商品圖 | P39yUt |

### 1.2 輪播縮圖區（mdCA_C 容器內，82×82）

| 索引 | URL（id） | 尺寸 | alt | container class |
|------|-----------|------|-----|-----------------|
| 2 | `tw-11134207-820l6-mqst930825fmf1` | 82×82 | | mdCA_C |
| 3 | `tw-11134207-820lc-mqrvl64tdg5p63` | 82×82 | | mdCA_C |
| 4 | `tw-11134207-820lg-mqst92zx68zle8` | 82×82 | | mdCA_C |
| 5 | `tw-11134207-820l6-mqst92zw8jd97d` | 82×82 | | mdCA_C |
| 7 | `tw-11134207-820le-mqst930402dr0d` | 82×82 | | mdCA_C uRJsr5 |
| 8 | `tw-11134207-820lg-mqst92zx68zle8` | 82×82 | | mdCA_C uRJsr5 |
| 9–13 | （其他 5 張） | 82×82 | | mdCA_C uRJsr5 |

### 1.3 非商品圖片（後續被 `isProductImg()` 過濾）

| 類型 | 數量 | alt 範例 | 過濾原因 |
|------|------|----------|----------|
| 賣場大頭貼 | 1 | `profile` | badContainer（shopee-avatar） |
| 賣場連結 | 1 | `造訪賣場` | badAlt |
| 品牌 logo | 13 | `logo` | badContainer |
| 社群 icon | 5 | （空） | badContainer |
| QR code | 1 | `download_qr_code` | badContainer |
| App 圖示 | 3 | `app` | badContainer |
| 星星評分 | 1 | `empty-icon`（.png） | badContainer |
| data:image 空白 | 1 | | badSrc |

---

## 二、重複 file ID

### seller 頁面（cdp-inspect.js）

```
820lg-mqst92zx68zle8
  → <img> 輪播縮圖區
  → <source srcset> 同一個縮圖區
```

此檔案以不同元素類型（`<img>` vs `<source>`）各出現一次，URL 完全相同。`extractFromDOM()` 的 `seen` Set 會正確去重。

### seller 頁面（cdp-final.js image_audit 跨來源比對）

`collected_images` 共 19 筆 URL（9 gallery + 10 supplement），模擬 `extractFromDOM()` 輸出：
- 所有 gallery 內的 file ID 皆唯一（無重複）
- Supplement 內的 URL 皆為不同檔案

### buyer 頁面（buyer-inspect.js）

```
tw-11134207-820l6-mqst930825fmf1 × 2
  → 索引 1: 主圖區 450×450
  → 索引 2: 縮圖區 82×82（mdCA_C 內）
```

---

## 三、PNG URL

`seller` 頁面 `isProductImg` audit 中，唯一 `.png` 結尾的 URL：

```
shoperating/3215f6ba1a0e877fa06e.png
  →  星星評分圖示
  →  已正確被 `isProductImg` 過濾（badContainer）
```

所有商品主圖的 CDN URL 均無副檔名：

```
tw-11134207-820l6-mqst930825fmf1       ← 無 .png / .jpg 副檔名
  → 格式由 CDN Content-Type 決定（webp / jpeg / png）
```

### Buyer 頁面 `document.images` 掃描

| 類型 | 出現次數 | 範例 URL |
|------|----------|----------|
| `.svg` | 13 | `productdetailspage/2ab134f0d714bfe3.svg` |
| `.png` | 1 | `shoprating/3215f6ba1a0e877fa06e.png`（星星評分） |

無商品圖 URL 含有 `.png` 或 `.svg` 副檔名。

---

## 四、mdCA_C 結構（點擊前 vs 點擊後）

### seller 頁面

| 時機 | mdCA_C 數量 | 備註 |
|------|-------------|------|
| 點擊前 | 5 | 初始 virtual rendering |
| 點擊第二個縮圖後 | 14（含 popup） | 完整渲染 |
| 去除 popup 內 | 9 | 實際商品圖片張數 |

每個 mdCA_C 容器內：1 個 `<picture>` → 1 個 `<source>` + 1 個 `<img>`

### buyer 頁面

| 項目 | 值 |
|------|-----|
| mdCA_C 數量 | 5（皆在 DOM，無 virtual rendering） |
| 每個 mdCA_C | 1 個 `<img>`，82×82 |
| parent | `<picture class="i9ihcI">` |
| grandparent | `<div class="FAWPL0">` |

---

## 五、Hash class 存在性檢查

| class | seller 頁面 | buyer 頁面 |
|-------|-------------|------------|
| `o_Jpw2` | ❌ | ❌ |
| `Wi_1Rq` | ✅ | ✅ |
| `Zt4sev` | ✅ | ❌ |
| `mdCA_C` | ✅ | ✅ |
| `TCWu_` | ❌ | ❌ |
| `vYcy_` | ❌ | ❌ |
| `izXPt` | ❌ | ❌ |

---

## 六、`isProductImg()` audit 結果（56 張圖片）

| 結果 | 張數 | 說明 |
|------|------|------|
| `pass` | 14 | 9 張輪播圖 + 5 張原始主圖（部分會被 seen 去重） |
| `badContainer` | 38 | 賣場大頭貼、logo、QR code、星星評分、footer icon |
| `badAlt` | 3 | 造訪賣場、隱私權政策 |
| `badSrc` | 1 | `data:image/...` 空白圖片 |

所有通過的 14 張圖片皆為商品圖 URL，無 shop/logo/PNG 誤放行。

---

## 七、JSON-LD 圖片

### seller 頁面

```
1 張: "tw-11134207-820l6-mqst930825fmf1"
```

### buyer 頁面

```
1 張: "tw-11134207-820l6-mqst930825fmf1"
```

JSON-LD 只提供第一張圖片，與 DOM 縮圖列第一張相同。

---

## 八、`_tn` 圖片

### seller 頁面

| URL | alt | 尺寸 | parent class | isProductImg 結果 |
|-----|-----|------|-------------|-------------------|
| `tw-11134216-820l7-mqor51b0nf2m61_tn` | `profile` | 200×200 | shopee-avatar | badContainer（❌） |

### buyer 頁面

| URL | alt | 尺寸 | parent class |
|-----|-----|------|-------------|
| `tw-11134216-820l7-mqor51b0nf2m61_tn` | `profile` | 200×200 | shopee-avatar |
| `tw-11134216-820l7-mqor51b0nf2m61`（無 `_tn`） | `造訪賣場` | 80×80 | i9ihcI（內含在 F1Gpl5 CiclDV 容器） |

兩頁面賣場大頭貼 file ID 相同（`mqor51b0nf2m61`），代表同一個賣家。
