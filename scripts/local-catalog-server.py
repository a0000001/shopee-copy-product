import argparse
import json
import os
import tempfile
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG = PROJECT_DIR / "docs" / "data" / "product-catalog-tw.json"

catalog_path: Path = DEFAULT_CATALOG


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

    for existing in catalog:
        existing_sku = existing.get("ps_sku_short", "").strip()
        existing_url = existing.get("url", "").strip()
        existing_name = existing.get("ps_product_name", "").strip()

        if sku and existing_sku and sku == existing_sku:
            return "ps_sku_short 已存在目錄中"
        if url and existing_url and url == existing_url:
            return "url 已存在目錄中"
        if name and existing_name and name == existing_name:
            return "商品名稱已存在目錄中"

    return None


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send_json(200, {})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._send_json(200, {"ok": True})
        else:
            self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/append":
            self._send_json(404, {"ok": False, "error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            self._send_json(400, {"ok": False, "error": "empty body"})
            return

        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            self._send_json(400, {"ok": False, "error": "invalid JSON"})
            return

        product = body.get("product", {})
        if not product.get("ps_product_name"):
            self._send_json(400, {"ok": False, "error": "缺少 ps_product_name"})
            return

        catalog = load_catalog()
        reason = check_duplicate(product, catalog)
        if reason:
            self._send_json(200, {
                "ok": True,
                "action": "skipped",
                "reason": reason,
            })
            return

        catalog.append(product)
        save_catalog(catalog)
        self._send_json(200, {
            "ok": True,
            "action": "appended",
            "catalog_size": len(catalog),
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
    args = parser.parse_args()

    global catalog_path
    catalog_path = Path(args.catalog_path).resolve()

    if not catalog_path.exists():
        print(f"[錯誤] 找不到目錄檔案：{catalog_path}")
        return

    server = HTTPServer(("localhost", 9801), Handler)
    print(f"[目錄伺服器] 啟動於 http://localhost:9801")
    print(f"[目錄檔案] {catalog_path}")
    print(f"[健康檢查] http://localhost:9801/health")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[目錄伺服器] 已停止")


if __name__ == "__main__":
    main()
