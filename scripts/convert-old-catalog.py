import json
import os
import shutil
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

JSON_PATH = PROJECT_DIR / "docs" / "data" / "product-catalog-tw.json"
BAK_PATH = JSON_PATH.with_suffix(".json.bak")

CATEGORY_MAP = {
    "電腦與周邊配件 > 軟體": "100644,101937",
}

FIELD_ORDER = [
    "ps_product_name", "ps_price", "ps_product_description",
    "ps_stock", "ps_category", "ps_length", "ps_width", "ps_height",
    "ps_sku_short", "ps_brand",
    "ps_item_cover_image", "ps_item_image_1", "ps_item_image_2",
    "ps_item_image_3", "ps_item_image_4", "ps_item_image_5",
    "ps_item_image_6", "ps_item_image_7", "ps_item_image_8",
    "url", "videos", "installment",
    "computer_specs", "tag", "nsfw", "category",
]


def convert_item(item):
    new = {
        "ps_product_name": item.get("product_name", ""),
        "ps_price": item.get("price_twd", 0),
        "ps_product_description": item.get("product_description", ""),
        "ps_stock": 999,
        "ps_category": CATEGORY_MAP.get(item.get("category", ""), ""),
        "ps_length": 10,
        "ps_width": 10,
        "ps_height": 4,
        "ps_sku_short": item.get("ProductId", ""),
        "ps_brand": "NoBrand",
        "ps_item_cover_image": "",
        "ps_item_image_1": "",
        "ps_item_image_2": "",
        "ps_item_image_3": "",
        "ps_item_image_4": "",
        "ps_item_image_5": "",
        "ps_item_image_6": "",
        "ps_item_image_7": "",
        "ps_item_image_8": "",
        "url": "",
        "videos": [],
        "installment": 0,
        "computer_specs": item.get("computer_specs", {}),
        "tag": item.get("tag", []),
        "nsfw": item.get("nsfw", False),
        "category": item.get("category", ""),
    }
    return {k: new[k] for k in FIELD_ORDER if k in new}


def main():
    if not JSON_PATH.exists():
        print(f"[錯誤] 找不到目錄檔案：{JSON_PATH}")
        return

    with open(JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        print("[錯誤] JSON 格式錯誤：最外層應為陣列")
        return

    if len(data) == 0:
        print("[警告] 目錄為空，無需轉換")
        return

    first = data[0]
    if "ps_product_name" in first:
        print("[OK] 目錄已是新格式，跳過（重複執行保護）")
        return

    old_count = len(data)
    print(f"[總共 {old_count} 筆] 開始轉換...")

    warnings = []
    converted = []
    cat_counter = Counter()
    for item in data:
        new_item = convert_item(item)
        cat = item.get("category", "")
        cat_counter[cat] += 1
        if cat and new_item["ps_category"] == "":
            warnings.append(cat)
        converted.append(new_item)

    shutil.copy2(JSON_PATH, BAK_PATH)
    print(f"[備份] 原檔 → {BAK_PATH}")

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(converted, f, ensure_ascii=False, indent=2)

    print(f"\n[OK] 轉換完成：{old_count} 筆 → 新格式")
    print(f"     寫入：{JSON_PATH}")

    unique_warnings = sorted(set(warnings))
    if unique_warnings:
        print(f"\n[警告] 以下 {len(unique_warnings)} 個分類查無 ps_category 對照，已留空：")
        for c in unique_warnings:
            count = cat_counter[c]
            print(f"   {count:4d} 筆  {c}")
        print("\n   請手動補 category_map.json 後，再用 json-to-shopee-excel.py 的 --stock 參數輸出 Excel")

    print("\n[分類統計]：")
    for cat, count in cat_counter.most_common():
        matched = "[OK]" if cat in CATEGORY_MAP else "[--]"
        print(f"   {count:4d} 筆  {matched}  {cat}")


if __name__ == "__main__":
    main()
