"""
選項 A：用 Playwright + 使用者 cookie 測試商品頁

Cookies 請放在同目錄的 cookies.json（已 gitignore），
參考 cookies.json.example 的格式填入實際值。
"""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

COOKIES_PATH = Path(__file__).parent / "cookies.json"

if COOKIES_PATH.exists():
    with open(COOKIES_PATH, encoding="utf-8") as f:
        COOKIES = json.load(f)
else:
    print(f"WARNING: {COOKIES_PATH} not found — proceeding without cookies (will likely be blocked)")
    COOKIES = []

TARGET_URL = "https://shopee.tw/product/987022693/56914167000/"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="zh-TW",
            viewport={"width": 1920, "height": 1080},
        )
        await context.add_cookies(COOKIES)
        page = await context.new_page()

        print(f"Navigating to {TARGET_URL} ...")
        try:
            resp = await page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=30000)
            print(f"HTTP status: {resp.status if resp else 'N/A'}")
        except Exception as e:
            print(f"Navigation error: {e}")

        await page.wait_for_timeout(5000)
        current_url = page.url
        print(f"Current URL: {current_url}")

        # Check if blocked
        if "verify" in current_url or "captcha" in current_url or "traffic" in current_url:
            print("RESULT: BLOCKED by verification page")
            await page.screenshot(path="E:\\proj\\shopee\\test_blocked.png")
            print("Screenshot saved to test_blocked.png")
        else:
            print("RESULT: Page loaded successfully!")
            title = await page.title()
            print(f"Page title: {title}")

            # Try extracting description
            desc = await page.evaluate("""
                () => {
                    const r = {};
                    const allText = document.body ? document.body.innerText : '';

                    const m = allText.match(/商品描述[\\s\\S]{1,3000}/);
                    if (m) { r.method = 'section'; r.desc = m[0].substring(0, 2000); return r; }

                    for (const sel of ['[class*="product-description"]', '[class*="product_detail"]', '#module_product_detail']) {
                        const el = document.querySelector(sel);
                        if (el && el.textContent.trim().length > 20) {
                            r.method = sel; r.desc = el.textContent.trim().substring(0, 2000); return r;
                        }
                    }

                    const scripts = document.querySelectorAll('script');
                    for (const s of scripts) {
                        const t = s.textContent || '';
                        if (t.includes('__INITIAL_STATE__')) {
                            const d = t.match(/"description"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"/);
                            if (d) { r.method = '__INITIAL_STATE__'; r.desc = d[1].substring(0, 2000); return r; }
                        }
                    }

                    r.method = 'raw'; r.desc = allText.substring(0, 2000);
                    return r;
                }
            """)
            print(f"Description method: {desc.get('method', 'N/A')}")
            print(f"Description length: {len(desc.get('desc', ''))} chars")
            print(f"\n--- DESCRIPTION ---\n{desc.get('desc', '(empty)')}\n--- END ---")

        await browser.close()

asyncio.run(main())
