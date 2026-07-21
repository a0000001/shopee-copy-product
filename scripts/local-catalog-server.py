import argparse
import json
import os
import re
import time
import urllib.request
from datetime import datetime
from difflib import SequenceMatcher
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG = PROJECT_DIR / "docs" / "data" / "product-catalog-tw.json"
SIMILARITY_THRESHOLD = 0.85

catalog_path: Path = DEFAULT_CATALOG
RAW_DATA_PATH = Path(os.environ.get("SGC_RAW_DATA_PATH", "E:/proj/shopee"))
LOG_FILE = Path(os.environ.get("TEMP", ".")) / "sgc-server-log.txt"


def log_request(method, path, status="", note=""):
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] {method} {path} -> {status} {note}\n")
    except:
        pass


def canonical_product_id(url):
    m = re.search(r'/product/(\d+)/(\d+)', url) or re.search(r'-i\.(\d+)\.(\d+)', url)
    if m:
        return f"{m.group(1)}:{m.group(2)}"
    return url.split('?')[0]


def is_similar(a, b, threshold=SIMILARITY_THRESHOLD):
    return SequenceMatcher(None, a, b).ratio() >= threshold


def load_catalog():
    with open(catalog_path, encoding="utf-8") as f:
        return json.load(f)


def save_catalog(data):
    tmp = catalog_path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, catalog_path)


def check_duplicate(product, catalog):
    sku = product.get("ps_sku_short", "").strip()
    url = product.get("url", "").strip()
    name = product.get("ps_product_name", "").strip()

    url_id = canonical_product_id(url) if url else ""

    for i, existing in enumerate(catalog):
        existing_sku = existing.get("ps_sku_short", "").strip()
        existing_url = existing.get("url", "").strip()
        existing_name = existing.get("ps_product_name", "").strip()

        if sku and existing_sku and sku == existing_sku:
            if _is_complete(existing):
                return "skipped", "ps_sku_short 已存在目錄中", None
            else:
                return "merged", "已更新既有資料（ps_sku_short 吻合）", i

        if url_id and existing_url:
            existing_url_id = canonical_product_id(existing_url)
            if url_id == existing_url_id:
                if _is_complete(existing):
                    return "skipped", "url 已存在目錄中", None
                else:
                    return "merged", "已更新既有資料（url 吻合）", i

        if name and existing_name:
            if name == existing_name:
                if _is_complete(existing):
                    return "skipped", "商品名稱已存在目錄中", None
                else:
                    return "merged", "已更新既有資料（名稱吻合）", i
            if is_similar(name, existing_name):
                return "appended_with_warning", f"與現有商品「{existing_name}」名稱相似，請確認", None

    return None, None, None


def _is_complete(item):
    required = ["ps_price", "ps_stock", "ps_category"]
    for key in required:
        val = item.get(key)
        if val is None or (isinstance(val, str) and val.strip() == ""):
            return False
    return True


def merge_product(existing, product):
    for key, val in product.items():
        if key in ("computer_specs", "videos", "tag") and isinstance(val, (list, dict)):
            if not val and not existing.get(key):
                existing[key] = val
            continue
        existing_val = existing.get(key)
        if existing_val is None or (isinstance(existing_val, str) and existing_val.strip() == ""):
            existing[key] = val


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        log_request("OPTIONS", self.path, "200")
        self._send_json(200, {})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            log_request("GET", "/health", "200")
            self._send_json(200, {"ok": True})
        elif parsed.path == "/shutdown":
            log_request("GET", "/shutdown", "200")
            self._send_json(200, {"ok": True, "message": "shutting down"})
            import threading
            threading.Thread(target=self.server.shutdown, daemon=True).start()
        else:
            log_request("GET", self.path, "404")
            self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        log_request("POST", parsed.path, "start", f"CL={self.headers.get('Content-Length', '?')} Origin={self.headers.get('Origin', '?')}")
        try:
            if parsed.path == "/append":
                self._handle_append()
            elif parsed.path == "/saveRawProductData":
                self._handle_save_raw()
            else:
                self._send_json(404, {"ok": False, "error": "not found"})
            return
        except Exception as e:
            import traceback
            err = f"{type(e).__name__}: {e}"
            log_request("POST", parsed.path, "CRASH", err)
            traceback.print_exc()
            try:
                self._send_json(500, {"ok": False, "error": err})
            except:
                pass

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return None
        try:
            return json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return None

    def _handle_append(self):
        body = self._read_body()
        if body is None:
            self._send_json(400, {"ok": False, "error": "empty body or invalid JSON"})
            return

        product = body.get("product", {})
        if not product.get("ps_product_name"):
            self._send_json(400, {"ok": False, "error": "缺少 ps_product_name"})
            return

        catalog = load_catalog()
        action, reason, index = check_duplicate(product, catalog)

        if action == "skipped":
            log_request("POST", "/append", "200-skipped")
            self._send_json(200, {"ok": True, "action": "skipped", "reason": reason})
            return

        if action == "merged":
            merge_product(catalog[index], product)
            save_catalog(catalog)
            log_request("POST", "/append", "200-merged")
            self._send_json(200, {"ok": True, "action": "merged", "reason": reason, "catalog_size": len(catalog)})
            return

        catalog.append(product)
        save_catalog(catalog)

        resp = {"ok": True, "action": "appended", "catalog_size": len(catalog)}
        if action == "appended_with_warning":
            resp["action"] = "appended_with_warning"
            resp["reason"] = reason

        log_request("POST", "/append", "200-appended")
        self._send_json(200, resp)

    def _handle_save_raw(self):
        body = self._read_body()
        if body is None:
            self._send_json(400, {"ok": False, "error": "empty body or invalid JSON"})
            return

        product = body.get("product", {})
        title = product.get("title", product.get("ps_product_name", "shopee_product"))
        safe_name = re.sub(r'[<>:"/\\|?*]', '_', title)[:100]

        shop_name = product.get("shop_name", "mazz68")
        safe_shop = re.sub(r'[<>:"/\\|?*]', '_', shop_name)[:50]

        product_dir = RAW_DATA_PATH / safe_shop / safe_name
        product_dir.mkdir(parents=True, exist_ok=True)

        # 儲存 JSON
        json_path = product_dir / f"{safe_name}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(product, f, ensure_ascii=False, indent=2)
        log_request("POST", "/saveRawProductData", "200", f"json={json_path}")

        # 儲存圖片（從 URL 下載）
        raw_data_dir = product_dir / "images"
        raw_data_dir.mkdir(exist_ok=True)
        images = product.get("images", [])
        if not images:
            for i in range(1, 9):
                key = f"ps_item_image_{i}"
                val = product.get(key, "")
                if val:
                    images.append(val)
            cover = product.get("ps_item_cover_image", "")
            if cover:
                images.insert(0, cover)

        img_count = 0
        for i, url in enumerate(images):
            if not url:
                continue
            if img_count >= 9:
                break
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                ext = "jpg"
                if resp.headers.get("Content-Type", "").startswith("image/png"):
                    ext = "png"
                img_path = raw_data_dir / f"{safe_name}_{i + 1}.{ext}"
                with open(img_path, "wb") as f:
                    f.write(data)
                img_count += 1
            except Exception as e:
                log_request("POST", "/saveRawProductData", "WARN", f"image {i} download failed: {e}")

        # 儲存影片
        videos = product.get("videos", [])
        vid_dir = product_dir / "videos"
        vid_dir.mkdir(exist_ok=True)
        vid_count = 0
        for url in videos:
            if not url or vid_count >= 1:
                break
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()
                vid_path = vid_dir / f"{safe_name}_video.mp4"
                with open(vid_path, "wb") as f:
                    f.write(data)
                vid_count += 1
            except Exception as e:
                log_request("POST", "/saveRawProductData", "WARN", f"video download failed: {e}")

        self._send_json(200, {
            "ok": True,
            "path": str(product_dir),
            "json": str(json_path),
            "images": img_count,
            "videos": vid_count,
        })

    def log_message(self, format, *args):
        print(f"[{self.client_address[0]}] {args[0]} {args[1]} {args[2]}")


def main():
    parser = argparse.ArgumentParser(description="Shopee 商品目錄本地伺服器")
    parser.add_argument(
        "--catalog-path",
        type=str,
        default=str(DEFAULT_CATALOG),
        help=f"商品目錄 JSON 路徑（預設：{DEFAULT_CATALOG}）",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=9801,
        help="伺服器埠號（預設：9801）",
    )
    args = parser.parse_args()

    global catalog_path
    catalog_path = Path(args.catalog_path).resolve()

    if not catalog_path.exists():
        print(f"[錯誤] 找不到目錄檔案：{catalog_path}")
        return

    server = HTTPServer(("localhost", args.port), Handler)
    print(f"[目錄伺服器] 啟動於 http://localhost:{args.port}")
    print(f"[目錄檔案] {catalog_path}")
    print(f"[請求日誌] {LOG_FILE}")
    print(f"[健康檢查] http://localhost:{args.port}/health")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[目錄伺服器] 已停止")


if __name__ == "__main__":
    main()
