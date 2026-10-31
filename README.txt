保存到 Card v1.7（一鍵保存版）

使用流程：Discord 圖片右上角 ⋮ → 保存到 Card → 頂部顯示「正在保存…」→ 插件內部取得原始 PNG、驗證 SillyTavern 角色卡、登入並上傳 CardVault → 服務器確認成功後顯示「已保存到 Card」。

不會自動按 Discord 原生「保存」，不會把圖片另存相冊，也不要求用戶再次操作。若原始圖片網址無法取得、不是 PNG 角色卡，或伺服器拒絕，則顯示真實錯誤，不會顯示成功。

安裝：將 index.js、manifest.json 覆蓋上傳至 GOGUtop/paranormal-ghost 倉庫根目錄；Revenge → Plugins → i → Refetch，重新載入 Discord。保留舊插件設定資料。

注意：這是有本地模擬測試的候選版，沒有在 Discord 351.11 真機完成驗證。CardVault HTTP 連線可能洩露帳號密碼，優先部署 HTTPS。
