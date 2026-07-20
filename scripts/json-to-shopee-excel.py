#!/usr/bin/env python3
"""
json-to-shopee-excel.py — product-catalog JSON → Shopee mass upload Excel converter.

Usage:
  python json-to-shopee-excel.py product-catalog-tw.json -o shopee-mass-upload-kaohsiung.xlsx
  python json-to-shopee-excel.py product-catalog-tw.json --stock 50 -o output.xlsx
  python json-to-shopee-excel.py product-catalog-tw.json --stock 0 -o output.xlsx

Output: .xlsx with 2 sheets
  - 上傳模式 (37 columns)
  - 參考欄位 (reference fields)
"""

import argparse
import json
import sys

try:
    from openpyxl import Workbook
except ImportError:
    print("Error: openpyxl is required. Install with: pip install openpyxl", file=sys.stderr)
    sys.exit(1)

UPLOAD_SHEET_COLS = [
    "ps_category",
    "ps_product_name",
    "ps_product_description",
    "ps_minimum_purchase_quantity",
    "ps_sku_parent_short",
    "ps_dangerous_goods",
    "et_title_variation_integration_no",
    "et_title_variation_1",
    "et_title_option_for_variation_1",
    "et_title_image_per_variation",
    "et_title_variation_2",
    "et_title_option_for_variation_2",
    "ps_price",
    "ps_stock",
    "ps_sku_short",
    "ps_new_size_chart",
    "et_title_size_chart",
    "ps_gtin_code",
    "ps_item_cover_image",
    "ps_item_image_1",
    "ps_item_image_2",
    "ps_item_image_3",
    "ps_item_image_4",
    "ps_item_image_5",
    "ps_item_image_6",
    "ps_item_image_7",
    "ps_item_image_8",
    "ps_weight",
    "ps_length",
    "ps_width",
    "ps_height",
    "channel_id.30005",
    "channel_id.30015",
    "channel_id.30017",
    "channel_id.30019",
    "ps_product_pre_order_dts",
    "et_title_reason",
]

REF_SHEET_COLS = [
    "ps_hs_code",
    "ps_tax_code",
    "ps_brand",
    "ps_product_pre_order_dts_range",
    "ps_tool_mass_upload_sample_attr_country_origin",
    "ps_tool_mass_upload_sample_attr_manufacturer_details",
    "ps_tool_mass_upload_sample_attr_packer_details",
    "ps_tool_mass_upload_sample_attr_importer_details",
]

SKIP_FIELDS = {
    "installment", "computer_specs", "tag", "url", "videos", "nsfw", "category",
}

ALL_UPLOAD_COLS = set(UPLOAD_SHEET_COLS)
ALL_REF_COLS = set(REF_SHEET_COLS)
ALL_EXCEL_COLS = ALL_UPLOAD_COLS | ALL_REF_COLS


def col_sheet(col_name):
    if col_name in ALL_UPLOAD_COLS:
        return "upload"
    if col_name in ALL_REF_COLS:
        return "ref"
    return None


def build_row(product, stock_override):
    upload_row = {col: "" for col in UPLOAD_SHEET_COLS}
    ref_row = {col: "" for col in REF_SHEET_COLS}

    for key, value in product.items():
        if key in SKIP_FIELDS:
            continue
        sheet = col_sheet(key)
        if sheet is None:
            continue
        if value is None:
            continue
        target = upload_row if sheet == "upload" else ref_row
        target[key] = str(value)

    if stock_override is not None:
        upload_row["ps_stock"] = str(stock_override)

    for img_col in [f"ps_item_image_{i}" for i in range(1, 9)]:
        upload_row.setdefault(img_col, "")

    return upload_row, ref_row


def convert(json_path, output_path, stock_override):
    with open(json_path, "r", encoding="utf-8") as f:
        products = json.load(f)

    if not isinstance(products, list):
        print("Error: JSON root must be an array", file=sys.stderr)
        sys.exit(1)

    wb = Workbook()
    ws_upload = wb.active
    ws_upload.title = "上傳模式"
    ws_upload.append(UPLOAD_SHEET_COLS)

    ws_ref = wb.create_sheet("參考欄位")
    ws_ref.append(REF_SHEET_COLS)

    for product in products:
        upload_row, ref_row = build_row(product, stock_override)
        ws_upload.append([upload_row[col] for col in UPLOAD_SHEET_COLS])
        ws_ref.append([ref_row[col] for col in REF_SHEET_COLS])

    wb.save(output_path)
    print(f"[OK] Converted {len(products)} products -> {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert product-catalog JSON to Shopee mass upload Excel"
    )
    parser.add_argument("input", help="Path to product-catalog JSON file")
    parser.add_argument("-o", "--output", default="shopee-mass-upload.xlsx",
                        help="Output Excel file path (default: shopee-mass-upload.xlsx)")
    parser.add_argument("--stock", type=int, default=None,
                        help="Override ps_stock for all products (use --stock 0 to set zero)")

    args = parser.parse_args()

    convert(args.input, args.output, args.stock)


if __name__ == "__main__":
    main()
