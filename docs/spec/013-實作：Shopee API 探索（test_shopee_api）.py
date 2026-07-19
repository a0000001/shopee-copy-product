"""Shopee API 探索腳本：測試多種 endpoint 的可存取性與商品描述提取"""
import asyncio
import json
from playwright.async_api import async_playwright

cookies_list = [
    {"name": "SPC_SI", "value": "Y3YnagAAAABqT0cyT2V1MxX0GwIAAAAAWmhmbWVpZkg=", "domain": ".shopee.tw", "path": "/"},
    {"name": "SPC_U", "value": "987179147", "domain": ".shopee.tw", "path": "/"},
    {"name": "SPC_F", "value": "GiQ6LKBT3FO7ur7YMg22fC3WNbK37Nyz", "domain": ".shopee.tw", "path": "/"},
    {"name": "SPC_STK", "value": "pskPrzk9HQVlKylLBT7uYBbxlz2kSWEgO5ZHGF+YYTp9qFHJwg7Bok3chIEK6MeG6vc6zUYKFlh81r4ZZNWYkucFvnZII1Dp++o4/IIaIPXOPyCSJMlCBXh4Yq9hhX8fGJalmfNQ6ztugq/OQZhpDRurbzatTuE6I8QwfawIAt0XFt3hozoSckVAe8QZYez6mqHXgI+Q9YWppPjJwL5H/YmQwvjkehEgSXInXgoXBkDWO4kTGzvT3LvygAxofGAUUVhPMahRNC/kiz0uBwQQR9w4kHm5yRbagSJzIThUUSmkWw6xw9l2BmEE1jD9gpj4DooaQiD2qk3zhslOk4hZ8ijNropqL2YDMY0AbvW51x3RFykJ58RTM0NpTJct+A8u7dmpGcJ6KoCHAGDgZt6RQuHz7+RXPCg3ANLQTtDst9Vhl29C2x9B3st8vANHBeNF6vn+6O7ar111qSLdLrVwk9ohQ9o7CKCL9Z4Ez4vYpzyzs2dM6dJYRBcr5vswEV6e", "domain": ".shopee.tw", "path": "/"},
    {"name": "SPC_SC_SESSION", "value": "gz3O4GLnTdTAN5Ie4GTcBbde90eKUAoqoDmqf5y7wTKGpT0lhQAZafbFzWDcwtowCrf5jIOjRk5iq+6XzQNDoq/mQyEc1JpWSMVGAPuaCC0UjPQGw8PfRscLyaz71FPGQVug+acOaOOYSYXkpJ/nXDa2scPIgrnNPn7Vmrp+KfjK+Q6IdDfzfR7ylcNR9V/SlhMvmhicxqQHIV59cVM6/cv5PxA+N8lGKf6a+8HDci9wIce4aOsfxXwH4uXR9OqBhx/c73+ndVlJHGaoGJTHAAA==_1_987179147", "domain": ".shopee.tw", "path": "/"},
    {"name": "SPC_SEC_SI", "value": "v1-VjVEbjNBSlFBNjZiaVBQSMnCqoJLOzMD2t2Zcdu7sQBjyM5Z0sUUx0nmoSSrHoKLAH7tun9D2GHHb8Mv1KuhuDKEK6fwDWRxFz4+9I7HpUY=", "domain": "shopee.tw", "path": "/"},
    {"name": "SPC_CLIENTID", "value": "R2lRNkxLQlQzRk83ztmcbroojksrtkfw", "domain": ".shopee.tw", "path": "/"},
    {"name": "SPC_CDS", "value": "sFqsOHTwOStzQadDRBOiHBAFBGhPQEKW", "domain": ".shopee.tw", "path": "/"},
]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
            locale="zh-TW",
            viewport={"width": 390, "height": 844},  # Mobile viewport
        )
        await context.add_cookies(cookies_list)
        page = await context.new_page()

        # Try mobile API for shop items
        print("=== Trying mobile API ===")
        await page.goto("https://shopee.tw/mazz68", wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(5000)

        # Mobile API endpoint
        result = await page.evaluate("""
            async () => {
                try {
                    // Mobile shop items API
                    const r = await fetch('https://shopee.tw/api/v4/shop/get_shop_detail?shopid=25204842&need_clip=true&no_239=true', {
                        credentials: 'include',
                        headers: { 'Accept': 'application/json', 'Referer': 'https://shopee.tw/mazz68' }
                    });
                    return await r.json();
                } catch(e) { return {error: e.message}; }
            }
        """)
        err = result.get('error')
        print(f"get_shop_detail: error={err}")
        
        if err == 0:
            data = result.get('data', {})
            items = data.get('item_list', []) or data.get('items', [])
            print(f"  Items from detail API: {len(items)}")
            for item in items[:3]:
                iid = item.get('itemid') or item.get('item_id', '')
                name = item.get('name', '')[:50]
                desc = item.get('description', '')[:100]
                print(f"  [{iid}] {name}")
                print(f"    desc: {desc}")

        # Also try search API within browser context
        print("\n=== Trying search API ===")
        search_query = "AI換臉工具 照片 影片 視訊 3合1"
        search_enc = await page.evaluate("""
            async (query) => {
                try {
                    const r = await fetch('https://shopee.tw/api/v4/search/search_items?by=relevancy&keyword=' + encodeURIComponent(query) + '&limit=5&match_id=25204842&newest=0&order=desc&page_type=shop&scenario=PAGE_GLOBAL_SEARCH&shop_categoryids=&version=2', {
                        credentials: 'include',
                        headers: { 'Accept': 'application/json', 'Referer': 'https://shopee.tw/mazz68' }
                    });
                    return await r.json();
                } catch(e) { return {error: e.message}; }
            }
        """, search_query)
        err2 = search_enc.get('error')
        print(f"search_items: error={err2}")
        if err2 == 0:
            items = search_enc.get('data', {}).get('items', [])
            print(f"  Items found: {len(items)}")
            for item in items[:3]:
                basic = item.get('item_basic', item)
                print(f"  [{basic.get('itemid')}] {str(basic.get('name',''))[:50]}")
                print(f"    desc: {str(basic.get('description',''))[:100]}")

        # Finally, check what NON-signed API endpoints are available
        print("\n=== Testing various API endpoints ===")
        endpoints = [
            "/api/v4/shop/get_shop_detail?shopid=25204842",
            "/api/v4/product/get_rating?itemid=40858642009&shopid=25204842",
        ]
        for ep in endpoints:
            res = await page.evaluate("""
                async (endpoint) => {
                    try {
                        const r = await fetch('https://shopee.tw' + endpoint, {
                            credentials: 'include',
                            headers: { 'Accept': 'application/json', 'Referer': 'https://shopee.tw/mazz68' }
                        });
                        return await r.json();
                    } catch(e) { return {error: e.message}; }
                }
            """, ep)
            ep_name = ep.split('?')[0].rsplit('/', 1)[-1]
            err = res.get('error')
            print(f"  {ep_name}: error={err} {list(res.keys())[:4]}")

        await browser.close()

asyncio.run(main())
