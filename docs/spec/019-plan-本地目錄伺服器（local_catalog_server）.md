---
type: plan
status: implementing
updated: 2026-07-20
domain: shopee
tags: [product-catalog, local-server, auto-append, extension]
---

# 本地目錄伺服器 — Extension 一鍵寫入商品目錄

> 解決 Chrome Extension 無法寫入本機檔案的限制。本地 Python HTTP 伺服器接收 extension POST 的商品資料，比對重複後自動附加至 `product-catalog-tw.json`。

---

## 現狀

### 目錄檔案

`S:\projects\shopee-copy-product\docs\data\product-catalog-tw.json`

181 筆，格式如下（舊格式）：

```json
{
  "product_name": "Wan2.2-SVI2-Pro-remix...",
  "price_twd": 999,
  "nsfw": true,
  "tag": ["NSFW", "影片生成"],
  "category": "影片生成",
  "product_description": "",
  "ProductId": "PROD-ID-000001",
  "computer_specs": {
    "vram_min": 0, "vram_rec": 0, "ram_min": 0, "ram_rec": 0,
    "disk": 0, "cpu": "", "power": ""
  }
}
```

### Extension 新輸出格式

`S:\projects\shopee-copy-product\extension\popup.js` L118-153 `toJsonClipboard()` 輸出新格式：

```json
{
  "ps_product_name": "AI 繪圖軟體",
  "ps_price": 999,
  "ps_product_description": "...",
  "ps_stock": 999,
  "ps_category": "100644,101937",
  "ps_length": 10,
  "ps_width": 10,
  "ps_height": 4,
  "ps_sku_short": "",
  "ps_brand": "NoBrand",
  "ps_item_cover_image": "https://...",
  "ps_item_image_1": "https://...",
  "ps_item_image_2": "https://...",
  "url": "https://shopee.tw/product/...",
  "videos": [],
  "installment": 24,
  "computer_specs": {},
  "tag": [],
  "nsfw": false,
  "category": "圖片生成/編輯"
}
```

新舊格式對照：

| 舊欄位 | 新欄位 | 說明 |
|--------|--------|------|
| `product_name` | `ps_product_name` | 直接搬 |
| `price_twd` | `ps_price` | 直接搬，型別保持數字 |
| `product_description` | `ps_product_description` | 直接搬 |
| `ProductId` | `ps_sku_short` | 直接搬 |
| `computer_specs` | `computer_specs` | 保留，非 ps_* 但不輸出 Excel |
| `nsfw` | `nsfw` | 保留 |
| `tag` | `tag` | 保留 |
| `category`（中文） | `ps_category`（ID） | 中文→ID 需對照表，目前只有一組 `100644,101937` |
| （無） | `ps_stock` | 補預設 999 |
| （無） | `ps_item_cover_image` | 舊格式無圖片 URL，補空值 |
| （無） | `ps_length/ps_width/ps_height` | 補預設 10/10/4 |
| （無） | `ps_brand` | 補 NoBrand |
| （無） | `url` | extension 內部用，不輸出 Excel |

**關鍵**：extension 輸出的 `ps_sku_short` 永遠為空字串（`data.ProductId` 從未被萃取）。所以重複判斷不能靠 ProductId。

### 可用於去重的資料

- `url`（shopee 商品頁網址）— content.js `extractProductData()` L528 有擷取，toJsonClipboard() 有保留
- `ps_product_name`（商品名稱）— 輔助判斷

---

## 解決方案架構

```
┌─────────────────┐   POST /append         ┌──────────────────────────────┐
│  Extension       │  ───────────────────►  │  local-catalog-server.py     │
│  popup.js        │                        │  (Python http.server, local) │
│  「送出至目錄」   │  ◄───────────────────  │                              │
└─────────────────┘   JSON response         │  ├ 讀取 product-catalog-tw…  │
                                            │  ├ 比對 url/產品名去重      │
                                            │  ├ 無重複則附加             │
                                            │  └ 寫回 JSON                │
                                            └──────────────────────────────┘
```

---

## 步驟

### Step 1：一次性轉換舊目錄 ✅（已完成）

讀取舊格式 181 筆，轉為新格式，寫回同檔案。原檔備份為 `.bak`。

**script**：`S:\projects\shopee-copy-product\scripts\convert-old-catalog.py`

轉換規則見上方對照表。`category` 中文→ID 對照維護在 `scripts/category_map.json` 或直接寫在 script 裡。

**category 查無對照時**：`ps_category` 留空字串，並在轉換結束後印出警告清單（列出所有無法對應的商品名稱與原分類），供人工補表後手動修正。

**重複執行保護**：script 開頭檢查目錄第一筆是否已含 `ps_product_name`，若有則視為已轉換完畢，直接跳過不執行，避免二次轉換造成資料損毀。

**smoke test**：
```powershell
python scripts/convert-old-catalog.py
python -c "import json; d=json.load(open('docs/data/product-catalog-tw.json')); assert d and 'ps_product_name' in d[0]; print('ok')"
```

### Step 2：本地目錄伺服器 ✅（已完成）

**script**：`S:\projects\shopee-copy-product\scripts\local-catalog-server.py`

- 使用 Python 內建 `http.server`（不需 Flask）
- 監聽 `localhost:9801`
- 支援命令列參數 `--catalog-path` 指定目錄 JSON 路徑（預設 `docs/data/product-catalog-tw.json`），測試時可指向測試檔
- 支援 GET `/health` 回 `{"ok":true}`
- 支援 GET `/shutdown` 優雅關閉伺服器
- 支援 POST `/append`
- **CORS**：所有回應帶 `Access-Control-Allow-Origin: *`；OPTIONS preflight 回 200（處理方法同 GET）
- **JSON 寫入**：`json.dump(..., ensure_ascii=False, indent=2)` + 開檔用 `encoding='utf-8'`，確保中文不逃逸
- **寫入原子性**：先寫暫存檔（同目錄 `.tmp`），再 `os.replace()` 覆蓋原檔，避免寫入一半損毀

**POST /append 規格**：

Request：
```json
{
  "product": {
    "ps_product_name": "...",
    "ps_price": 999,
    "url": "https://shopee.tw/product/12345/67890",
    "...": "..."
  }
}
```

Response（成功寫入）：
```json
{"ok": true, "action": "appended", "catalog_size": 182}
```

Response（重複跳過）：
```json
{"ok": true, "action": "skipped", "reason": "url 已存在目錄中"}
```

Response（錯誤）：
```json
{"ok": false, "error": "缺少 ps_product_name"}
```

**重複判斷邏輯**（依序比對，回傳第一個符合的結果）：

1. `ps_sku_short` 非空 **且** 目錄中同筆的 `ps_sku_short` 也非空，且兩者相同（兩者皆空時不比對，跳下一條規則） → `skipped`
2. 將 `url` 正規化為 `shop_id:item_id` 後比對（從 `/product/{shop_id}/{item_id}` 或 `-i.{shop_id}.{item_id}` 抽出），抽不到時退回去掉 query string 比對 path → `skipped`
3. `ps_product_name` 與目錄中任一筆完全相同 → `skipped`
4. `ps_product_name` 與目錄中任一筆相似度 >= 0.85（`difflib.SequenceMatcher`）但非完全相同 → `appended_with_warning`，資料仍寫入，但 reason 提示「與現有商品「XXX」名稱相似，請確認」

**response 三種 action**：

| action | 意義 |
|--------|------|
| `appended` | 無重複，已寫入 |
| `appended_with_warning` | 已寫入，但名稱與目錄中某筆相似，請人工確認 |
| `skipped` | 偵測到重複，跳過不寫入 |

**smoke test**：
```powershell
# 啟動伺服器
python scripts/local-catalog-server.py
# 另一個視窗測試
curl -X POST http://localhost:9801/append -H "Content-Type: application/json" -d '{"product":{"ps_product_name":"test","url":"http://test.com"}}'
# 再次送出相同 url → 應回 skipped
curl -X POST http://localhost:9801/append -H "Content-Type: application/json" -d '{"product":{"ps_product_name":"test","url":"http://test.com"}}'
```

### Step 3：Extension 新增按鈕 ✅（已完成）

**修改檔案**：
- `S:\projects\shopee-copy-product\extension\popup.js`
- `S:\projects\shopee-copy-product\extension\popup.html`

在「複製到剪貼簿」旁新增「送出至目錄」按鈕。點擊後：
1. 取目前商品資料（同 toJsonClipboard 的邏輯）
2. `fetch('http://localhost:9801/append', { method: 'POST', body: JSON.stringify({ product }) })`
3. 根據 response 顯示不同 toast：
   - `appended` → ✅ 已寫入目錄
   - `skipped` → ⏭ 已存在，跳過
   - 連線失敗 → ❌ 無法連線到目錄伺服器

Options page（選項頁面）：
- `S:\projects\shopee-copy-product\extension\options.html`
- `S:\projects\shopee-copy-product\extension\options.js`
- 欄位：伺服器位址（預設 `http://localhost:9801`）

**smoke test**：
1. 確保伺服器已啟動
2. 開啟任一 shopee.tw 商品頁
3. 點 extension → 按「送出至目錄」
4. 確認 toast 出現

### Step 4：manifest 註冊 options_page 與 host_permissions ✅（已完成）

```json
{
  "options_page": "options.html",
  "host_permissions": [
    "http://localhost/*"
  ]
}
```

### Step 5：Native Messaging Host — Extension 直接啟動/停止伺服器 ✅（已完成）

讓 extension 能透過 Chrome Native Messaging API 自動啟動/停止 `local-catalog-server.py`，不再需要手動跑指令。

**架構**：

```
┌─────────────────────┐   chrome.runtime.connectNative    ┌──────────────────────────────────┐
│  Extension           │  ◄──────────────────────────────► │  catalog-server-host.py          │
│  background.js       │                                    │  (Native Messaging Host, Python) │
│  (Service Worker)    │   stdin/stdout (4B-length JSON)    │                                  │
└─────────────────────┘                                    │  ├ subprocess: local-catalog-    │
                                                            │  │   server.py --catalog-path ... │
                                                            │  └ HTTP /shutdown 優雅關閉       │
                                                            └──────────────────────────────────┘
```

**新增檔案**：

- `extension/native-messaging-host/catalog-server-host.py` — Native Messaging Host，接收 start/stop/status 指令，管理伺服器子行程
- `extension/native-messaging-host/run_host.bat` — batch wrapper（Chrome 執行 native host 需要 .bat 或 .exe）
- `extension/native-messaging-host/com.shopee.catalog_server.json` — Native manifest 模板（安裝時填入 extension ID）
- `scripts/install-native-host.ps1` — 安裝腳本（填 ID + 註冊 HKCU 登錄）

**修改檔案**：

- `extension/background.js` — 新增 `connectNative`、處理 `serverStart`/`serverStop`/`serverStatus`/`serverHealthCheck` 四則訊息
- `extension/manifest.json` — 加入 `"nativeMessaging"` 權限
- `extension/popup.html` — 頂端加入伺服器狀態指示燈 + 啟動/停止按鈕
- `extension/popup.js` — `updateServerStatus()` + `onServerStart()` + `onServerStop()`
- `extension/options.html` — 加入伺服器狀態區塊 + Native Host 安裝說明
- `extension/options.js` — 加入狀態更新、啟動/停止控制
- `scripts/local-catalog-server.py` — 新增 `GET /shutdown` 端點供 native host 優雅關閉

**安裝方式**：

1. `chrome://extensions` → 啟用開發者模式 → 複製 extension ID（32 個小寫字母）
2. 執行（擇一）：
   ```powershell
   .\scripts\install-native-host.ps1 -ExtensionId 你的ID
   ```
   或（若已設定 `.env` 的 `EXTENSION_ID`）：
   ```powershell
   .\scripts\install-native-host.ps1
   ```
3. `chrome://extensions` → 重新整理 extension

**安裝後使用**：

- 開啟 extension popup → 頂端會顯示伺服器狀態
- 按「▶ 啟動伺服器」→ background.js 經 native host 啟動 `local-catalog-server.py`
- 按「⏹ 停止」→ native host 請求 `/shutdown` 優雅關閉，必要時 kill
- Options page 也有相同的狀態面板 + 啟動/停止按鈕

**已知限制**：

| 項目 | 說明 |
|------|------|
| 需手動安裝 Native Host | 一次性安裝，extension ID 變更時需重裝 |
| Chrome 背景終止 Service Worker | 若 Chrome 殺掉 background.js，native port 斷線，伺服器不受影響（subprocess 獨立） |

---

## 已知限制

| 項目 | 說明 |
|------|------|
| 只支援同機 localhost | extension 與 server 不能在不同機器 |
| Native Host 需手動安裝 | 一次性安裝 `install-native-host.ps1`，extension ID 變更時需重裝 |
| 無 git commit | 寫入 JSON 後不自動版本控制 |
| 無「更新既有商品」API | 目錄視為唯讀累加，若需修正既有資料請手動編輯 JSON（刻意設計） |
| category 中文→ID 對照表 | 目前只有「電腦與周邊配件 > 軟體 = 100644,101937」，日後手動補 |
| 去重比對：名稱相似度門檻 | 0.85 為起始值，若實際使用發現太敏感或太遲鈍可調整 `SIMILARITY_THRESHOLD`；門檻設太高可能漏接近似商品，設太低可能誤擋合法新商品 |

---

## 測試流程

### Test 1：舊目錄轉換 ✅（已完成，跳過）

Step 1 commit `fb1cbf4` 時已執行完畢。如需驗證：
```powershell
Test-Path docs/data/product-catalog-tw.json.bak
python -c "import json; d=json.load(open('docs/data/product-catalog-tw.json', encoding='utf-8')); print(f'{len(d)} 筆，ps_* 格式：{list(d[0].keys())[:5]}')"
```

---

### Test 2：目錄伺服器（全自動）

執行以下單一指令即可跑完整個測試：

```powershell
python scripts/test-catalog-server.py
```

**涵蓋項目**（44 項測試）：
- 啟動伺服器 + 健康檢查 + `/shutdown` 端點
- 成功寫入一筆新商品
- 重複 url 跳過 + reason 檢查
- 重複商品名稱跳過 + reason 檢查
- Canonical URL（`shop_id:item_id`）比對，不同 query string 仍視為重複
- 相似名稱（`difflib.SequenceMatcher >= 0.85`）→ `appended_with_warning`
- 缺少必填欄位錯誤
- 寫入後 JSON 無毀損
- extension 程式碼檢查（popup.js/background.js/manifest/options/native host）
- 自動清理測試檔並關閉伺服器

---

### Test 3：Extension 一鍵寫入

先確保伺服器正在跑（可用 Test 2 的 script 確認），再到 Chrome 操作。

**前置**：
```
1. Chrome → chrome://extensions → 找到「Shopee Get Content」→ 按重新整理
```

**操作**：
```
2. 開啟任一 shopee.tw 商品頁
3. 點 extension 圖示 → 確認庫存顯示 999、類別下拉可選
4. 按「送出至目錄」
   - 成功：toast 顯示 ✅ 已寫入目錄
   - 第一次成功後，再按一次 → ⏭ url 已存在目錄中
5. 關閉伺服器 → 再按「送出至目錄」 → ❌ 無法連線到目錄伺服器
```

---

### Test 4：Options page

```
1. Chrome → extension 圖示右鍵 → 選項
2. 確認伺服器位址欄位顯示 http://localhost:9801
3. 改成 http://localhost:9999 → 儲存
4. 在商品頁按「送出至目錄」→ ❌ 無法連線（因為 server 不在 9999）
5. 改回 http://localhost:9801 → 儲存 → 再次送出 → ✅ 成功
```

---

### 回歸確認

```
開商品頁 → extension → 「複製到剪貼簿」
貼到記事本，確認 JSON 欄位名為 ps_product_name、ps_price 等 ps_* 開頭
```

---

## 相關檔案路徑

| 用途 | 路徑 |
|------|------|
| 商品目錄 JSON | `S:\projects\shopee-copy-product\docs\data\product-catalog-tw.json` |
| 轉換 script（一次性） | `S:\projects\shopee-copy-product\scripts\convert-old-catalog.py` |
| 目錄伺服器 script | `S:\projects\shopee-copy-product\scripts\local-catalog-server.py` |
| Extension popup | `S:\projects\shopee-copy-product\extension\popup.js` |
| Extension popup HTML | `S:\projects\shopee-copy-product\extension\popup.html` |
| Options page | `S:\projects\shopee-copy-product\extension\options.html` |
| Options page JS | `S:\projects\shopee-copy-product\extension\options.js` |
| Extension manifest | `S:\projects\shopee-copy-product\extension\manifest.json` |
| 新格式規格 | `S:\projects\shopee-copy-product\docs\spec\018-spec-商品目錄JSON結構與大量上傳對應（product_catalog_structure）.md` |
| 類別對照表 | `S:\projects\shopee-copy-product\scripts\category_map.json` |
