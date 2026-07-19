"""
Shopee 商品爬蟲 — CDP 連線版

連接到使用者真實 Chrome 瀏覽器（需以 remote debugging 啟動），
繼承完整 session + IP 信任度，嘗試提取商品描述。

啟動 Chrome：
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222

執行：
  python docs/scripts/scrape_shopee_cdp.py
"""
import asyncio
import json
from playwright.async_api import async_playwright

TARGET_PRODUCT_URL = "https://shopee.tw/product/987022693/56914167000/"

async def extract_description(page):
    return await page.evaluate("""
        () => {
            const r = {};
            const allText = document.body ? document.body.innerText : '';

            const descHeadingRegex = /商品描述[\\s\\S]{1,3000}/;
            const match = allText.match(descHeadingRegex);
            if (match) {
                r['method'] = '商品描述_section';
                r['description'] = match[0].substring(0, 3000);
                return r;
            }

            const selectors = [
                '[class*="product-description"]', '[class*="product_description"]',
                '[class*="description-content"]', '[class*="product_detail"]',
                '[class*="productDetail"]', '#module_product_detail',
                'div[data-testid="product-detail"]',
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.textContent.trim().length > 20) {
                    r['method'] = 'selector: ' + sel;
                    r['description'] = el.textContent.trim().substring(0, 3000);
                    return r;
                }
            }

            const scripts = document.querySelectorAll('script');
            for (const s of scripts) {
                const text = s.textContent || '';
                if (text.includes('__INITIAL_STATE__') || text.includes('window.__data')) {
                    const descMatch = text.match(/"description"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"/);
                    if (descMatch) {
                        r['method'] = 'script_INITIAL_STATE';
                        r['description'] = descMatch[1].substring(0, 2000);
                        return r;
                    }
                }
            }

            r['method'] = 'raw_body';
            r['description'] = allText.substring(0, 3000);
            return r;
        }
    """)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        context = browser.contexts[0]
        page = await context.new_page()

        print(f"Navigating to {TARGET_PRODUCT_URL}...")
        try:
            resp = await page.goto(TARGET_PRODUCT_URL, wait_until="domcontentloaded", timeout=30000)
            print(f"HTTP status: {resp.status if resp else 'N/A'}")
        except Exception as e:
            print(f"Navigation error: {e}")

        await page.wait_for_timeout(5000)
        current_url = page.url
        print(f"Current URL: {current_url}")

        if "verify" in current_url or "captcha" in current_url or "traffic" in current_url:
            print("BLOCKED: Redirected to verification page")
            return

        desc_result = await extract_description(page)
        print(f"\nMethod: {desc_result.get('method', 'N/A')}")
        print(f"Description length: {len(desc_result.get('description', ''))} chars")
        print(f"\n--- DESCRIPTION ---\n{desc_result.get('description', '(empty)')[:2000]}\n--- END ---")

        await browser.close()

asyncio.run(main())
