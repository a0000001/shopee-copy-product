@echo off
chcp 65001 >nul
title PNG→JPG 批次轉換（蝦皮商品圖稿）

echo ============================================
echo   PNG → JPG 轉換工具
echo   圖稿目錄：E:\proj\shopee\蝦皮商品圖稿
echo ============================================
echo.

REM 檢查 Python + Pillow
python -c "from PIL import Image; print('Pillow', Image.__version__)" 2>nul
if errorlevel 1 (
    echo [錯誤] 找不到 Pillow，嘗試安裝中...
    python -m pip install Pillow
    if errorlevel 1 (
        echo [錯誤] 安裝失敗，請手動執行：python -m pip install Pillow
        pause
        exit /b 1
    )
)

echo 開始掃描 PNG 檔案...
echo.

REM 使用 Python 執行轉換
python -c ^
"import os, sys; from PIL import Image;" ^
"root = r'E:\proj\shopee\蝦皮商品圖稿';" ^
"total = converted = skipped = errors = 0;" ^
"for dirpath, dirs, files in os.walk(root):" ^
"    for f in files:" ^
"        if f.lower().endswith('.png'):" ^
"            total += 1;" ^
"            src = os.path.join(dirpath, f);" ^
"            dst = os.path.splitext(src)[0] + '.jpg';" ^
"            if os.path.exists(dst):" ^
"                skipped += 1;" ^
"                print(f'  ⏭ 略過（已有 JPG）: {os.path.relpath(src, root)}');" ^
"                continue;" ^
"            try:" ^
"                img = Image.open(src).convert('RGBA');" ^
"                bg = Image.new('RGB', img.size, (255, 255, 255));" ^
"                bg.paste(img, mask=img.split()[3]);" ^
"                bg.save(dst, 'JPEG', quality=85, optimize=True);" ^
"                old_size = os.path.getsize(src);" ^
"                new_size = os.path.getsize(dst);" ^
"                converted += 1;" ^
"                print(f'  ✅ {os.path.relpath(src, root)}  ({old_size//1024}KB → {new_size//1024}KB)');" ^
"            except Exception as e:" ^
"                errors += 1;" ^
"                print(f'  ❌ {os.path.relpath(src, root)}  ({e})');" ^
"print('---');" ^
"print(f'總計: {total} PNG | 已轉換: {converted} | 略過: {skipped} | 錯誤: {errors}')"

echo.
if errorlevel 1 (
    echo [完成] 轉換程序執行完畢（部分檔案可能失敗）
) else (
    echo [完成] 所有 PNG 轉換完畢！
)

REM 更新 missing-report 的格式統計
echo.
echo 提示：轉換完成後建議更新 missing-report 的格式問題章節。
echo 執行：node docs\scripts\update_audit.js 或重新執行盤點腳本。

echo.
pause
