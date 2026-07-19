# Shopee Copy Product — Chrome Extension

一鍵擷取蝦皮商品標題、價格、描述，下載圖片(JPG)與影片。

## 專案結構

```
shopee-copy-product/
├── extension/              # 擴充功能原始碼（打包上傳時只 zip 這個資料夾）
│   ├── manifest.json       # MV3 宣告
│   ├── background.js       # Service Worker（右鍵選單、批次下載）
│   ├── content.js          # Content Script（頁面資料擷取）
│   ├── popup.html          # 彈出視窗
│   ├── popup.js            # 彈出視窗邏輯
│   └── icon.png            # 圖示
├── docs/
│   ├── spec/               # 工程文件（不上架）
│   └── privacy/            # 隱私權政策（GitHub Pages）
├── .env                    # GitHub Token（已加入 .gitignore）
├── .gitignore
└── README.md
```

## 開發

1. 開啟 `chrome://extensions` → 開發者模式
2. 載入未封裝擴充功能 → 選取 `extension/` 資料夾

## 打包上架

只打包 `extension/` 資料夾：

```bash
cd extension && Compress-Archive -Path * -DestinationPath ../shopee-copy-product.zip
```

## 相關文件

- 完整 spec：`docs/spec/014-spec-擴充功能-chrome extension-shopee-get-content.md`
- 上架檢查清單：`docs/spec/021-guide-上架審查工具與檢查清單（chrome_web_store_publish）.md`
