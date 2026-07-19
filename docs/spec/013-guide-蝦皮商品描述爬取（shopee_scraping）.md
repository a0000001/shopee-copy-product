---
type: guide
status: revised
updated: 2026-07-17-b
domain: shopee
tags: [shopee, scraping, mazz68, playwright, cookies, blocked, waf]
---

# 蝦皮商品描述爬取指南

> 從 mazz68 蝦皮賣場爬取現有商品描述，作為 Phase 2 商品描述生成的參考素材。

---

## 一、動機

94 個商品資料夾中，僅 Anydoor 有 `商品描述.md`。其餘 93 個需要產出描述文案。若能從現有 mazz68 賣場爬回描述，就能：
- 直接複用（一模一樣的商品）
- 當作風格參考（新商品的文案調性對齊）
- 節省從零撰寫的時間

---

## 二、實際探索歷程

### 2026-07-17-a 初始調查

### 2026-07-17-b 後續測試

| 測試 | 方式 | 結果 |
|------|------|------|
| API `item/get` | webfetch 無 cookie | 403 |
| API `pdp/get_pc` | webfetch 無 cookie | 403 |
| API `pdp/get_rw` | webfetch 無 cookie | 403 |
| 商品頁 Playwright + 完整 cookies | headless Chromium + 使用者 30+ cookies | ❌ HTTP 200 但 redirect → `/verify/captcha` |
| 賣場 API `get_shop_detail` | 公開 API 不需驗證 | ✅ 正常回傳 |

**關鍵發現：**
- 不存在名為 `SPC_EC` 的 cookie（spec 初版推測錯誤）
- WAF 阻擋是 IP + 瀏覽器指紋層級，非缺單一 cookie
- 公開資料顯示加上 `x-api-source: pc` + `af-ac-enc-dat: null` headers 有機會繞過
- CDP 連線（`connect_over_cdp`）繼承真實瀏覽器 session，最有機會成功（待測試）

### 2026-07-17 調查結果（已修正）

#### 可用 API（不需額外簽章）

| API | 方法 | 說明 |
|-----|------|------|
| `/api/v4/shop/get_shop_detail?shopid=25204842` | GET | 回傳賣場基本資訊（shop_id=25204842, item_count=204） |
| `/api/v4/shop/get_categories?shopid=25204842` | GET | 回傳 8 個賣場分類 |
| `/api/v4/shop/get_shop_seo?shopid=25204842` | GET | 回傳 SEO 資訊（描述含 TikTok 連結） |
| `/api/v4/shop/get_shop_base_v2` | POST | 回傳賣場基本資料 |
| `/api/v4/shop/get_shop_tab` | POST | 回傳賣場裝飾資料 |
| `/api/v4/pages/is_short_url/?path=mazz68` | GET | URL 驗證 |

#### 被 WAF 阻擋的 API（全數 403/90309999）

所有 v4 內部 API 受 Shopee WAF（Web Application Firewall）保護，非瀏覽器直接請求回傳錯誤碼 `90309999`。
此為 **IP 層級 + header 簽章** 雙重驗證，**並非缺少某個特定 cookie**。

| API | 錯誤碼 | 說明 |
|-----|--------|------|
| `/api/v4/search/search_items` | 90309999 | 搜尋/列出商品 |
| `/api/v4/item/get` | 90309999 | 取得單一商品詳細資料（含 description） |
| `/api/v4/pdp/get_pc` | 403 | PDP 商品頁 API（2026-07-17 實測） |
| `/api/v4/pdp/get_rw` | 403 | PDP 商品頁 API v2（2026-07-17 實測） |
| `/api/v4/shop/rcmd_items` | 90309999 | 推薦商品（內文已加密） |
| `/api/v4/shop/get_shop_category_items` | error_not_found | 分類商品列表 |
| `/api/v4/shop/get_all_items` | error_not_found | 全部商品列表 |

> 📌 外部公開資料顯示，`pdp/get`、`pdp/get_rw`、`item/get` 等 endpoint 在某些 IP 上可繞過 WAF，加上 `x-api-source: pc` 和 `af-ac-enc-dat: null` header 有機會成功。但對 **已遭 Shopee 封鎖的 IP** 則完全無效。

### 已知可用的 Cookie（從使用者提供，2026-07-17）

| Cookie | Domain | 用途 |
|--------|--------|------|
| `SPC_SI` | `.shopee.tw` | Session ID（使用者識別） |
| `SPC_U` | `.shopee.tw` | 使用者 ID（987179147） |
| `SPC_F` | `.shopee.tw` | 設備指紋 |
| `SPC_R_T_ID` | `.shopee.tw` | 追蹤/驗證 ID（Refresh Token variant） |
| `SPC_R_T_IV` | `.shopee.tw` | 與 R_T_ID 搭配的 IV |
| `SPC_T_ID` | `.shopee.tw` | 追蹤/驗證 ID |
| `SPC_T_IV` | `.shopee.tw` | 與 T_ID 搭配的 IV |
| `SPC_ST` | `.shopee.tw` | Session Token |
| `SPC_STK` | `.shopee.tw` | CSRF Token（已用於 X-CSRFToken header，仍無效） |
| `SPC_CDS` | `.shopee.tw` | 客戶端資料 |
| `SPC_CLIENTID` | `.shopee.tw` | 客戶端 ID |
| `SPC_SC_SESSION` | `.shopee.tw` | Session 憑證 |
| `SPC_SC_MAIN_SHOP_SA_UD` | `.shopee.tw` | 賣場 UD 標記 |
| `SPC_SEC_SI` | `shopee.tw` | 安全 Session ID |
| `SPC_IA` | `shopee.tw` | 內部標記 |
| `csrftoken` | `.shopee.tw` | CSRF Token（瀏覽器層級） |
| `SC_DFP` | `.shopee.tw` | 廣告/追蹤指紋 |

> ⚠️ 曾誤認缺少名為 `SPC_EC` 的 cookie。經公開資料查證與使用者實測，**不存在名為 `SPC_EC` 的 cookie**。錯誤碼 90309999 是 Shopee WAF 針對 IP 與請求特徵的阻擋，非缺單一 cookie。

---

## 三、實際可行的爬取方式

### 替代方案 A：Playwright DOM 提取（✅ 賣場頁可行，商品頁 ❌）

不需 API 簽章，直接渲染賣場頁面，從 DOM 提取商品資料。

**2026-07-17-b 實測結果：**
- 賣場頁（shopee.tw/mazz68）：✅ 可提取 40 個 item ID
- 商品頁（shopee.tw/product/...）：❌ 遭 WAF CAPTCHA 阻擋，即使傳入完整使用者 cookie 也無效

**步驟：**

```
1. 用 Playwright 開啟 https://shopee.tw/mazz68
2. 等待頁面渲染完畢（~8 秒）
3. 從 DOM 提取 product card 資料：
   - 連結中的 itemid（從 URL 模式 -i.{shopid}.{itemid} 擷取）
   - 圖片 alt 文字（商品名稱）
   - card 文字內容（含名稱、價格、評分、售出數）
4. 嘗試導航至商品頁面 → ❌ 遭 Traffic Verification 阻擋
```

**可以提取的資料：**
- 40 個 item ID（目前僅加載首頁展示的商品，需滾動更多）
- 商品名稱（從 img alt 或 card text）
- 價格（含幣別）
- 評分星級
- 售出數量

**無法提取的資料：**
- 商品描述（需進入商品詳情頁，被 CAPTCHA 阻擋）
- 商品規格
- 商品圖片 URL（部分）

### 替代方案 B：真實瀏覽器 CDP 連線（✅ 最有機會）

透過 `playwright.connect_over_cdp` 連接到使用者真實的 Chrome 瀏覽器，繼承完整的 session + cookies + IP 信任度，不需額外 cookie。

```
python -m playwright install
python docs/scripts/scrape_shopee_cdp.py
```
瀏覽器需以 remote debugging 模式啟動：
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

### 替代方案 C：特定 header + 乾淨 IP 嘗試 API

公開資料顯示以下方式有機會繞過 WAF：
- 加上 `x-api-source: pc` header
- 加上 `af-ac-enc-dat: null` header
- 使用印尼/乾淨住宅 IP（避免已遭封鎖的 data center IP）
- 先訪問 `/api/v4/pages/is_short_url` 初始化 SPC_F、SPC_SI、SPC_T_ID cookie

但對於**已遭 Shopee 封鎖的 IP** 仍無效。

### 替代方案 D：手動複製描述（🔄 可行但費時）

若上述皆不可行，最後手段：
1. 在瀏覽器中開啟 mazz68 賣場
2. 逐一點開商品，複製「商品描述」區塊
3. 貼入對應的 `{商品名稱}/商品描述.md`

---

## 四、爬蟲腳本（Playwright 版）

**檔案**：`docs/scripts/scrape_shopee.py`

### 相依套件

```bash
pip install playwright
playwright install chromium
```

### 執行方式

```bash
# Step 1：提取賣場商品 ID（不需登入，直接從 DOM 抓）
python docs/scripts/test_shopee_api.py

# Step 2：用 Playwright + 使用者 cookie 嘗試爬取描述
python docs/scripts/scrape_shopee.py

# Step 3（替代）：CDP 連線到真實瀏覽器爬取
python docs/scripts/scrape_shopee_cdp.py
```

### 腳本功能

| 功能 | 現況 |
|------|------|
| 賣場商品提取（40 個 item ID） | ✅ 完成 |
| 從 DOM 擷取名稱/價格/評分 | ✅ 完成 |
| 爬取商品描述（Playwright + cookie） | ❌ 遭 WAF CAPTCHA 阻擋（2026-07-17-b 實測） |
| 爬取商品描述（CDP 真實瀏覽器） | ⏳ 待測試 |
| 商品比對到 product-catalog.json | ⏳ 待實作 |
| 增量輸出 | ⏳ 待實作 |

---

## 五、輸出結構

### 已提取資料：`docs/data/shopee-item-ids.json`

```json
{
  "40858642009": {
    "itemid": "40858642009",
    "shopid": "25204842",
    "href": "/AI換臉工具-照片-影片-視訊-3合1-支援18--i.25204842.40858642009?extraParams=...",
    "imgAlt": "AI換臉工具  照片 影片 視訊 3合1 支援18+",
    "cardText": "AI換臉工具 照片 影片 視訊 3合1 支援18+$1,528隔日到貨5.0已售出 29"
  }
}
```

| 欄位 | 說明 |
|------|------|
| `itemid` | 蝦皮商品 ID |
| `shopid` | 賣場 ID（固定 25204842） |
| `href` | 商品頁面相對路徑（含 SEO slug） |
| `imgAlt` | 商品主圖 alt 文字（≈ 商品名稱） |
| `cardText` | 卡片文字（含名稱、價格、評分、售出數） |

### 輸出：`docs/data/product-descriptions.json`

待通過 WAF 或 CDP 連線後執行的產出。

---

## 六、已知困難

### 1. Shopee WAF（Web Application Firewall）

Shopee 對所有 v4 API endpoint 啟用 WAF 保護，非瀏覽器請求回傳 `90309999`。

**錯誤認知更正**：最初推測需名為 `SPC_EC` 的 cookie 進行請求簽章，但經公開資料查證：
- 錯誤碼 90309999 是 **IP 層級 WAF 阻擋**，非缺單一 cookie
- 所有 Chrome DevTools 可看到的 cookie 均已收集，**不存在 `SPC_EC`**
- 公開爬蟲社群回報：需**乾淨住宅 IP** + 正確 headers（`x-api-source: pc`, `af-ac-enc-dat: null`）才有機會繞過

### 2. Product Page CAPTCHA

導航至商品詳情頁時，Shopee 可能觸發 CAPTCHA / Traffic Verification，阻擋自動化工具。

```
觸發條件：
- 直接導航至商品 URL（GET）
- 從 shop page 點擊商品連結
- Playwright 或 requests 等非瀏覽器行為

影響：
- 頁面被導向 /verify/traffic/error 或 /verify/captcha
- `is_logged_in=false` 即使 cookie 有效也觸發
- 無法讀取商品描述、規格等內容
```

### 3. 商品頁面所需 Cookie

shop page（listing）和 product page（detail）的驗證層級不同：
- shop page：公開，不需嚴格驗證
- product page：需要完整登入 session + 可能需 CAPTCHA

### 4. 分類商品列表無效

即使 `get_categories` 成功回傳 8 個分類，`get_shop_category_items` 和 `get_all_items` 都回 `error_not_found`，無法透過分類遍歷商品。

---

## 七、後續建議

### 優先嘗試（依可行性排序）

1. **真實瀏覽器 CDP 連線**（`playwright.connect_over_cdp`）— 繼承完整 session + IP 信任度，最有機會
2. 若 CDP 仍被商品頁 CAPTCHA 阻擋，考慮 **Shopee Mobile API**（簽章機制可能不同）
3. **Shopee Open Platform**（open.shopee.com）— 官方 API，需申請合作夥伴帳號

### 亦可考慮

- 在已登入的瀏覽器中逐個商品頁面手動複製描述
- 若以上皆不可行，跳過描述爬取，直接用 AI 生成

---

## 八、相關文件

- 爬蟲腳本（Playwright DOM 提取）：`docs/scripts/scrape_shopee.py`
- 爬蟲腳本（CDP 連線）：`docs/scripts/scrape_shopee_cdp.py`（待建立）
- 爬蟲腳本（舊版 requests）：`docs/scripts/scrape_shopee_requests.py`
- 測試腳本：`docs/scripts/test_shopee_api.py`（API 探索 + Playwright 測試）
- 已提取商品 ID：`docs/data/shopee-item-ids.json`（40 個 item ID 含名稱/價格）
- 產品目錄：`docs/data/product-catalog.json`
- 圖片/影片/描述規格：`spec/012-plan-商品圖片影片與描述規範（shopee_media_description）.md`
- 總體上架計畫：`spec/001-plan-商品上架流程（shopee_listing_pipeline）.md`
