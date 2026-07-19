"""
Shopee 商品爬蟲 — Playwright DOM 提取版

目前限制：
- 商品詳情頁遭 CAPTCHA / WAF 阻擋，無法取得商品描述
- 可成功提取賣場頁面 DOM 中的 40 個商品 ID/名稱/價格/評分

執行方式：
  1. 安裝依賴：pip install playwright
  2. 安裝瀏覽器：playwright install chromium
  3. 確保 cookies_list 中的 cookie 有效
  4. python scrape_shopee.py
"""
import asyncio
import json
from playwright.async_api import async_playwright

# TODO: 改為環境變數或 {file:path} 載入，不要 hardcode
cookies_list = [

async def extract_products(page):
    return await page.evaluate("""
        () => {
            const items = {};
            const re = /-i\\.(\\d+)\\.(\\d+)/;
            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href') || '';
                const match = href.match(re);
                if (!match) return;
                const shopid = match[1];
                const itemid = match[2];
                if (!items[itemid]) {
                    const card = a.closest('[role="group"]');
                    const cardText = card ? card.textContent.replace(/\\s+/g, ' ').trim() : '';
                    const img = card ? card.querySelector('img') : null;
                    const imgAlt = img ? (img.getAttribute('alt') || '') : '';
                    items[itemid] = {
                        itemid, shopid, href: href,
                        imgAlt: imgAlt, cardText: cardText,
                    };
                }
            });
            return Object.values(items);
        }
    """)

async def extract_description(page):
    return await page.evaluate("""
        () => {
            const r = {};
            
            // Method 1: Find the "商品描述" section heading and get its sibling/content
            const allText = document.body ? document.body.innerText : '';
            // Try to find Product description section
            const descHeadingRegex = /商品描述[\\s\\S]{1,3000}/;
            const match = allText.match(descHeadingRegex);
            if (match) {
                r['method'] = '商品描述_section';
                r['description'] = match[0].substring(0, 3000);
                return r;
            }
            
            // Method 2: Try known description containers
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
            
            // Method 3: Extract description from script data
            const scripts = document.querySelectorAll('script');
            for (const s of scripts) {
                const text = s.textContent || '';
                // Look for window.__INITIAL_STATE__ or __STORE__
                if (text.includes('__INITIAL_STATE__') || text.includes('window.__data')) {
                    const descMatch = text.match(/"description"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"/);
                    if (descMatch) {
                        r['method'] = 'script_INITIAL_STATE';
                        r['description'] = descMatch[1].substring(0, 2000);
                        return r;
                    }
                }
            }
            
            // Method 4: Just return raw body text
            r['method'] = 'raw_body';
            r['description'] = allText.substring(0, 3000);
            return r;
        }
    """)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
            locale="zh-TW",
            viewport={"width": 1920, "height": 1080},
        )
        await context.add_cookies(cookies_list)
        page = await context.new_page()

        print("Step 1: Loading shop page to extract product IDs...")
        await page.goto("https://shopee.tw/mazz68", wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(8000)

        products = await extract_products(page)
        print(f"Found {len(products)} products")

        output = {}
        base_url = "https://shopee.tw"

        for idx, prod in enumerate(products):
            itemid = prod['itemid']
            slug = prod['href'].split('?')[0]
            url = base_url + slug
            name_short = prod['imgAlt'][:50]

            print(f"\n  [{idx+1}/{len(products)}] {itemid}: {name_short}...")

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(3000)

                desc_result = await extract_description(page)
                desc = desc_result.get('description', '')
                method = desc_result.get('method', 'unknown')
                print(f"    Method: {method}, length: {len(desc)} chars")

                output[itemid] = {
                    'name_alt': prod['imgAlt'],
                    'card_text': prod['cardText'],
                    'description': desc,
                    'desc_method': method,
                }

            except Exception as e:
                print(f"    ERROR: {e}")
                output[itemid] = {
                    'name_alt': prod['imgAlt'],
                    'card_text': prod['cardText'],
                    'description': '',
                    'desc_method': f'error: {e}',
                }

            await page.wait_for_timeout(500)

        # Save
        outpath = "E:\\proj\\shopee\\docs\\data\\product-descriptions.json"
        with open(outpath, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"\nSaved {len(output)} descriptions to {outpath}")

        # Summary
        with_desc = sum(1 for v in output.values() if len(v.get('description', '')) > 20)
        no_desc = len(output) - with_desc
        print(f"  With descriptions: {with_desc}")
        print(f"  No descriptions: {no_desc}")

        await browser.close()

asyncio.run(main())
