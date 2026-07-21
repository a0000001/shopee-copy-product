import json, os, subprocess, sys, time, shutil
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
CATALOG_SRC = BASE / "docs" / "data" / "product-catalog-tw.json"
CATALOG_TEST = BASE / "docs" / "data" / "product-catalog-tw.test.json"
SERVER = BASE / "scripts" / "local-catalog-server.py"
TEST_PORT = 9802
BASE_URL = f"http://localhost:{TEST_PORT}"

passed = 0
failed = 0
errors = []


def check(label, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  [PASS] {label}")
    else:
        failed += 1
        errors.append(f"  [FAIL] {label}  {detail}")
        print(f"  [FAIL] {label}  {detail}")


def api(path, method="GET", body=None):
    payload = BASE / "tmp-test-payload.json"
    cmd = ["curl.exe", "-s"]
    if method == "POST":
        cmd += ["-X", "POST", "-H", "Content-Type: application/json"]
        if body:
            payload.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
            cmd += ["-d", f"@{payload}"]
    cmd += [f"{BASE_URL}{path}"]
    r = subprocess.check_output(cmd, encoding="utf-8", errors="replace").strip()
    return json.loads(r) if r else {}


# ── Step 1: Verify conversion ──
print("=== 1. 確認目錄已轉換為新格式 ===\n")

check("目錄檔案存在", CATALOG_SRC.exists())
data = json.loads(CATALOG_SRC.read_text(encoding="utf-8"))
check(f"共 {len(data)} 筆（原 181→196）", len(data) >= 181)
check("第一筆是 ps_* 格式", "ps_product_name" in data[0])
check("ps_price 為整數", isinstance(data[0]["ps_price"], int))
check("無舊版欄位殘留", "product_name" not in data[0] and "price_twd" not in data[0])
check("中文未逃逸", "\\u" not in CATALOG_SRC.read_text(encoding="utf-8"))

# ── Step 2: Start server and test ──
print("\n=== 2. 測試目錄伺服器 ===\n")

# Kill any lingering server on test port, then clean up old test file
import urllib.request
try:
    urllib.request.urlopen(f"{BASE_URL}/shutdown", timeout=1)
except: pass
CATALOG_TEST.unlink(missing_ok=True)

shutil.copy2(CATALOG_SRC, CATALOG_TEST)
base_count = len(data)

server = None
old_server = None

server = subprocess.Popen(
    [sys.executable, str(SERVER), "--catalog-path", str(CATALOG_TEST), "--port", str(TEST_PORT)],
    cwd=BASE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(2)

try:
    r = api("/health")
    check("健康檢查", r.get("ok") is True)

    r = api("/shutdown")
    check("shutdown 端點", r.get("ok") is True, str(r))

    # Restart server for remaining tests
    time.sleep(1)
    old_server = server
    server = subprocess.Popen(
        [sys.executable, str(SERVER), "--catalog-path", str(CATALOG_TEST), "--port", str(TEST_PORT)],
        cwd=BASE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(2)

    r = api("/append", "POST", {"product": {"ps_product_name": "測試商品", "ps_price": 500, "url": "http://test/append-test", "ps_category": "100644", "ps_stock": 999}})
    check("成功寫入", r.get("action") == "appended", str(r))
    check("目錄大小 +1", r.get("catalog_size") == base_count + 1, str(r))

    # ── 先建立一筆完整資料（含 price/stock/category），再送相同 url → 應 skipped ──
    r = api("/append", "POST", {"product": {"ps_product_name": "完整商品", "ps_price": 500, "url": "http://test/complete-skip", "ps_category": "100644", "ps_stock": 999, "ps_product_description": "desc"}})
    check("完整商品寫入", r.get("action") == "appended", str(r))

    r = api("/append", "POST", {"product": {"ps_product_name": "完整商品", "ps_price": 500, "url": "http://test/complete-skip", "ps_category": "100644", "ps_stock": 999, "ps_product_description": "desc"}})
    check("完整商品重複 url 跳過", r.get("action") == "skipped", str(r))
    check("reason 含 url", "url" in r.get("reason", ""), str(r))

    r = api("/append", "POST", {"product": {"ps_product_name": "完整商品", "ps_price": 999, "url": "http://test/other-url", "ps_category": "100644", "ps_stock": 999, "ps_product_description": "desc"}})
    check("完整商品重複名稱跳過", r.get("action") == "skipped", str(r))
    check("reason 含名稱", "名稱" in r.get("reason", ""), str(r))

    # ── 先存一筆不完整的商品（缺 category），再送完整資料 → 應 merged ──
    r = api("/append", "POST", {"product": {"ps_product_name": "待補資料商品", "ps_price": 300, "url": "http://test/merge-me", "ps_stock": 50}})
    check("不完整商品寫入", r.get("action") == "appended", str(r))

    r = api("/append", "POST", {"product": {"ps_product_name": "待補資料商品", "ps_price": 300, "url": "http://test/merge-me", "ps_category": "100644", "ps_stock": 50, "ps_product_description": "補上描述"}})
    check("不完整商品 url 吻合 → merged", r.get("action") == "merged", str(r))
    check("reason 含 url", "url" in r.get("reason", ""), str(r))

    # 驗證 merge 後資料確實補齊
    merged = json.loads(CATALOG_TEST.read_text(encoding="utf-8"))
    merge_target = [e for e in merged if e.get("ps_product_name") == "待補資料商品"][0]
    check("merged 後 ps_category 已補齊", merge_target.get("ps_category") == "100644", str(merge_target))
    check("merged 後 ps_product_description 已補齊", merge_target.get("ps_product_description") == "補上描述", str(merge_target))

    # ── Canonical URL: same shop/item id, different query params ──
    r = api("/append", "POST", {"product": {"ps_product_name": "第二件商品", "ps_price": 300, "url": "https://shopee.tw/product/12345/67890?sp=abc", "ps_category": "100644", "ps_stock": 50}})
    check("新商品成功寫入", r.get("action") == "appended", str(r))

    r = api("/append", "POST", {"product": {"ps_product_name": "第二件商品複製", "ps_price": 300, "url": "https://shopee.tw/product/12345/67890?sp=xyz&ref=ad", "ps_category": "100644", "ps_stock": 50}})
    check("相同 shop/item id 跳過", r.get("action") == "skipped", str(r))
    check("reason 含 url", "url" in r.get("reason", ""), str(r))

    # ── Similar name (appended_with_warning) ──
    r = api("/append", "POST", {"product": {"ps_product_name": "測試商品X", "ps_price": 600, "url": "http://test/similar-name", "ps_category": "100644", "ps_stock": 999}})
    check("相似名稱仍寫入", r.get("action") == "appended_with_warning", str(r))
    check("reason 含提示", "名稱相似" in r.get("reason", ""), str(r))

    r = api("/append", "POST", {"product": {"url": "http://test/no-name"}})
    check("缺欄位錯誤", r.get("ok") is False, str(r))
    check("錯誤訊息正確", "ps_product_name" in r.get("error", ""), str(r))

    final = json.loads(CATALOG_TEST.read_text(encoding="utf-8"))
    check(f"測試檔 = {base_count + 5} 筆", len(final) == base_count + 5, f"實際 {len(final)}")
    check("JSON 無毀損", all("ps_product_name" in item for item in final))

finally:
    for proc in [old_server, server]:
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    CATALOG_TEST.unlink(missing_ok=True)
    (BASE / "tmp-test-payload.json").unlink(missing_ok=True)

# ── Step 3: Verify extension code ──
print("\n=== 3. 確認 Extension 程式碼 ===\n")

popup_js = (BASE / "extension" / "popup.js").read_text(encoding="utf-8")
check("popup.js 含 submitToCatalog", "function submitToCatalog" in popup_js)
check("popup.js 含 loadServerUrl", "async function loadServerUrl" in popup_js)
check("popup.js 含自動目錄 checkbox", "chkAutoCatalog" in popup_js)
check("popup.js 含 btnCopy 監聽", "btnCopy" in popup_js)

popup_html = (BASE / "extension" / "popup.html").read_text(encoding="utf-8")
check("popup.html 含 chkAutoCatalog", "chkAutoCatalog" in popup_html)

manifest = json.loads((BASE / "extension" / "manifest.json").read_text(encoding="utf-8"))
check("manifest 含 options_page", "options_page" in manifest)
check("host_permissions 含 localhost", any("localhost" in p for p in manifest.get("host_permissions", [])))
check("permissions 含 storage", "storage" in manifest.get("permissions", []))

options_html = BASE / "extension" / "options.html"
options_js = BASE / "extension" / "options.js"
check("options.html 存在", options_html.exists())
check("options.js 存在", options_js.exists())

nmhost = BASE / "extension" / "native-messaging-host"
check("native-messaging-host 目錄存在", nmhost.is_dir())
check("catalog-server-host.py 存在", (nmhost / "catalog-server-host.py").exists())
check("run_host.bat 存在", (nmhost / "run_host.bat").exists())
check("native manifest 模板存在", (nmhost / "com.shopee.catalog_server.json").exists())

bg_js = (BASE / "extension" / "background.js").read_text(encoding="utf-8")
check("background.js 含 nativeMessaging", "connectNative" in bg_js)
check("background.js 含 serverStart", "serverStart" in bg_js)
check("background.js 含 serverStop", "serverStop" in bg_js)
check("background.js 含 serverHealthCheck", "serverHealthCheck" in bg_js)

manifest = json.loads((BASE / "extension" / "manifest.json").read_text(encoding="utf-8"))
check("manifest 含 nativeMessaging", "nativeMessaging" in manifest.get("permissions", []))

install_script = BASE / "scripts" / "install-native-host.ps1"
check("install-native-host.ps1 存在", install_script.exists())
check("install 腳本含 ExtensionId 參數", "ExtensionId" in install_script.read_text(encoding="utf-8"))

# ── Step 4: 驗證新增功能（022 spec） ──
print("\n=== 4. 驗證新增功能（批量上傳與多帳號） ===\n")

content_js = (BASE / "extension" / "content.js").read_text(encoding="utf-8")
check("content.js 含 extractSellerProductList", "function extractSellerProductList" in content_js)
check("content.js 含 postMessage handler", "addEventListener('message'" in content_js or "addEventListener(\"message\"" in content_js)
check("content.js 含 saveRawProductData 發送", "saveRawProductData" in content_js)

bg_js = (BASE / "extension" / "background.js").read_text(encoding="utf-8")
check("background.js 含 saveRawProductData 處理", "action === 'saveRawProductData'" in bg_js or "action === \"saveRawProductData\"" in bg_js)
check("background.js 含 saveRawProductData 函數", "async function saveRawProductData" in bg_js)

server_py = (BASE / "scripts" / "local-catalog-server.py").read_text(encoding="utf-8")
check("伺服器含 saveRawProductData 端點", "saveRawProductData" in server_py)
check("伺服器含 RAW_DATA_PATH", "RAW_DATA_PATH" in server_py)
check("伺服器含 urllib.request", "urllib.request" in server_py)

spec_022 = BASE / "docs" / "spec" / "022-plan-批量自動上傳與多帳號機制（batch_upload_multi_account）.md"
check("022 spec 文件存在", spec_022.exists())

# ── Step 5: 驗證精簡化（統一儲存路徑、移除雙層冗餘） ──
print("\n=== 5. 驗證精簡化（統一儲存路徑、移除雙層冗餘） ===\n")

bg_js = (BASE / "extension" / "background.js").read_text(encoding="utf-8")
check("background.js 已無 handleDownloads", "handleDownloads" not in bg_js)
check("background.js 已無 download action handler", "action === 'download'" not in bg_js and "action === \"download\"" not in bg_js)
check("background.js saveRawProductData 使用 serverUrl 參數", "serverUrl" in bg_js)

popup_html = (BASE / "extension" / "popup.html").read_text(encoding="utf-8")
check("popup 按鈕改為下載資料", "下載資料" in popup_html)
check("popup 已無舊按鈕下載圖片+影片", "下載圖片 + 影片" not in popup_html)

popup_js = (BASE / "extension" / "popup.js").read_text(encoding="utf-8")
check("popup.js 下載按鈕使用 saveRawProductData", "saveRawProductData" in popup_js)
check("popup.js 已無舊 download action", "action: 'download'" not in popup_js and "action: \"download\"" not in popup_js)

content_js = (BASE / "extension" / "content.js").read_text(encoding="utf-8")
check("content.js 含 shop_name 提取", "shop_name" in content_js)
check("content.js shop_name 從 __INITIAL_STATE__ 提取", "account?.username" in content_js or "account.username" in content_js)

server_py = (BASE / "scripts" / "local-catalog-server.py").read_text(encoding="utf-8")
check("伺服器路徑含 shop_name", "shop_name" in server_py)
check("伺服器 RAW_DATA_PATH 預設為 E:/proj/shopee", "E:/proj/shopee" in server_py)
check("伺服器 RAW_DATA_PATH 不含 mazz68", "E:/proj/shopee/mazz68" not in server_py)

# ── Step 6: 驗證批次上傳功能 ──
print("\n=== 6. 驗證批次上傳功能 ===\n")

content_js = (BASE / "extension" / "content.js").read_text(encoding="utf-8")
check("content.js 含 checkSaveButton", "checkSaveButton" in content_js)
check("content.js 含 clickSaveButton", "clickSaveButton" in content_js)
check("content.js 用 Array.from 取代 contains", "Array.from(btns).find" in content_js)

popup_html = (BASE / "extension" / "popup.html").read_text(encoding="utf-8")
check("popup.html 含 btnBatchUpload", "btnBatchUpload" in popup_html)

popup_js = (BASE / "extension" / "popup.js").read_text(encoding="utf-8")
check("popup.js 開 batch-upload.html", "batch-upload.html" in popup_js)

batch_html = (BASE / "extension" / "batch-upload.html")
check("batch-upload.html 存在", batch_html.exists())

batch_js = (BASE / "extension" / "batch-upload.js")
check("batch-upload.js 存在", batch_js.exists())
batch_js_text = batch_js.read_text(encoding="utf-8")
check("batch-upload.js 含 waitForTabReady", "waitForTabReady" in batch_js_text)
check("batch-upload.js 含 fillAndSave", "fillAndSave" in batch_js_text)
check("batch-upload.js 含 checkSaveButton", "checkSaveButton" in batch_js_text)
check("batch-upload.js 含 clickSaveButton", "clickSaveButton" in batch_js_text)

# ── Results ──
print(f"\n{'='*40}")
print(f"通過：{passed}  失敗：{failed}")
if errors:
    print("\n".join(errors))

sys.exit(0 if failed == 0 else 1)
