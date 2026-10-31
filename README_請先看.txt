保存到 Card — Revenge Classic / Vendetta 完整功能候選版 v1.0.0
============================================================
對應環境：HarmonyOS 7（Android 相容環境）、Discord 351.11、Revenge 0980cfc-main

【這是完整功能的程式包，不是手機 APK，也不是已驗證的一鍵安裝檔】
包含根目錄的 manifest.json 和 index.js，可供 Revenge 的「Install a plugin」由 HTTP(S) 靜態網址安裝。
Revenge Classic 並不能直接從本機 ZIP 安裝這兩個檔案；需要先部署到一個可公開讀取的靜態網址。
本包不能自動更新你的 GitHub 倉庫；如果已授權 ChatGPT 連接 GitHub 且具備寫入權限，可請助理嘗試代為發佈。

【功能】
- 依官方 0980cfc Vendetta 入口輸出 onLoad、onUnload、settings。
- 設定 CardVault 網址、帳號、密碼；預設禁止 HTTP，必須明確開啟。
- 在找到符合「保存 + 分享 + 在瀏覽器中打開」的 showSimpleActionSheet 選單時，在保存之後插入「保存到 Card」。
- 只在你按下新增按鈕後下載原始 Discord CDN PNG，不接觸 Discord Token。
- 校驗 PNG 簽名及 chara/ccv3 文字塊；使用 /api/login 和 /api/cards/import 上傳原始 PNG bytes。
- 無法確定當前圖片 URL 時拒絕上傳，避免上傳錯誤圖片。
- 設定頁內顯示菜單命中、插入、上傳與錯誤診斷。

【未驗證/限制】
- 在你的 Discord 351.11 真機上，圖片右上角「⋮」是否使用 showSimpleActionSheet 未得到證實。
- 目前程式包含完整上傳邏輯，但不能聲稱已完成真機端到端成功導入。
- 如果選單使用其他 Discord 內部模組，新增按鈕仍可能不出現。
- 如果菜單對象無法提供原始 PNG URL，按鈕可以出現但會阻止上傳並提示。
- 在 Discord 內注入第三方修改程式可能違反 Discord 服務條款，有帳號風險。
- CardVault HTTP 會傳輸明文登入憑證，請使用 HTTPS 反向代理或專用帳號。

【基本部署方法（無需修改程式碼）】
1. 將 ready/manifest.json、ready/index.js 部署到 GitHub 公開倉庫根目錄。
2. 在 Revenge Classic 使用倉庫 raw 根地址（例如 https://raw.githubusercontent.com/GOGUtop/SaveToCard/main/）。
3. 若已有舊版，按插件 i → Refetch；在版本不變時可重新安裝，確認名稱 v1.0.0。
4. 插件啟用後點扳手，在設定中輸入 CardVault 帳號密碼（不預填），明確允許 HTTP 才能使用現有 HTTP 網站。

【本地測試】
執行：node tests/test_plugin.cjs
本測試在模擬 Vendetta 載入器和菜單、模擬 HTTP 回應的環境下執行。
不對 Discord 真機或 CardVault 真實服務發送請求。

第三方客戶端安全說明：第三方插件在 Discord 客戶端內具較高權限，請避免未審查來源的插件。
