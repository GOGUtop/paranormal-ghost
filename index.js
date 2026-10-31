(() => {
  'use strict';
  // Revenge 0980cfc > Install a plugin uses the Vendetta eval expression format.
  const v = vendetta;
  const MAX_BYTES = 30 * 1024 * 1024;
  const MAX_CONTEXT_AGE_MS = 90 * 1000;
  const state = {
    started: false, sheetHook: false, viewerHooks: [], sheets: 0, menuMatches: 0,
    injections: 0, clicks: 0, uploads: 0, contextUrl: '', contextAt: 0,
    last: '尚未啟動', error: '', lastUpload: ''
  };
  const cleanups = [];
  const config = {server: 'http://aaa.xixisillytavern.top:8788', username: '', password: '', allowHttp: false, onlyCard: true};
  let busy = false;
  const text = x => String(x == null ? '' : x).slice(0, 300);
  const logger = s => { try { v.logger?.log?.('[SaveToCard] ' + text(s)); } catch (_) {} };
  const toast = s => { state.last = text(s); try { v.ui?.toasts?.showToast?.(text(s)); } catch (_) { logger(s); } };
  const store = v.plugin && v.plugin.storage || null;
  for (const k of Object.keys(config)) {
    if (store && typeof store[k] === typeof config[k]) config[k] = store[k];
  }
  const saveConfig = (key, value) => {
    if (!Object.prototype.hasOwnProperty.call(config, key)) return;
    config[key] = value;
    if (store) { try { store[key] = value; } catch (e) { state.error = '保存設定失敗: ' + text(e); } }
  };
  const reportError = e => { state.error = text(e && e.message ? e.message : e); logger(state.error); };
  const fileURL = candidate => {
    if (typeof candidate !== 'string' || candidate.length > 3000) return '';
    let u;
    try { u = new URL(candidate); } catch (_) { return ''; }
    if (u.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(u.hostname)) return '';
    if (!/^\/(?:attachments|ephemeral-attachments)\/[^?#]+\.png$/i.test(u.pathname)) return '';
    // media.discordapp.net is a transform/proxy, never pass its bytes as a card.
    if (u.hostname !== 'cdn.discordapp.com') return '';
    return u.href;
  };
  const allCandidateURLs = (root, limitDepth = 5) => {
    const found = new Set(), seen = new Set();
    const visit = (obj, depth) => {
      if (depth > limitDepth || !obj || found.size > 12) return;
      if (typeof obj === 'string') { const url = fileURL(obj); if (url) found.add(url); return; }
      if (typeof obj !== 'object' || seen.has(obj)) return;
      seen.add(obj);
      if (Array.isArray(obj)) { obj.slice(0, 12).forEach(x => visit(x, depth + 1)); return; }
      for (const [key, value] of Object.entries(obj).slice(0, 40)) {
        if (/^(url|originalUrl|originalURL|uri|source|src|image|imageUrl|media|attachment|attachments|selectedMedia|item|asset|data|props|message|viewer|images|currentItem|selectedItem|thumbnail|original)$/i.test(key)) visit(value, depth + 1);
      }
    };
    visit(root, 0);
    return [...found];
  };
  const currentURL = sheet => {
    const direct = allCandidateURLs(sheet);
    if (direct.length === 1) return direct[0];
    // Never use a previous image if the sheet points at a different or ambiguous attachment.
    if (direct.length > 1) return '';
    if (state.contextUrl && Date.now() - state.contextAt < MAX_CONTEXT_AGE_MS) return state.contextUrl;
    return '';
  };
  const pngHasMetadata = bytes => {
    const sig = [137,80,78,71,13,10,26,10];
    if (bytes.length < 8 || sig.some((n,i) => bytes[i] !== n)) throw Error('檔案不是 PNG');
    let p = 8;
    while (p + 12 <= bytes.length) {
      const len = ((bytes[p]*0x1000000)+(bytes[p+1]<<16)+(bytes[p+2]<<8)+bytes[p+3]) >>> 0;
      if (len > bytes.length - p - 12) throw Error('PNG 區塊長度異常');
      const type = String.fromCharCode(bytes[p+4],bytes[p+5],bytes[p+6],bytes[p+7]);
      if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
        let end = p+8, max = Math.min(p+8+len,p+88);
        while (end < max && bytes[end] !== 0) end++;
        const keyword = String.fromCharCode(...bytes.slice(p+8,end)).toLowerCase();
        if (keyword === 'chara' || keyword === 'ccv3') return true;
      }
      p += 12+len;
      if (type === 'IEND') break;
    }
    return false;
  };
  const serverBase = () => {
    let u;
    try { u = new URL(config.server.trim()); } catch (_) { throw Error('CardVault 網站地址無效'); }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) throw Error('請輸入網站根地址，不含路徑');
    if (u.protocol === 'http:' && !config.allowHttp) throw Error('請先在插件設定中允許 HTTP 明文連線');
    return u.origin;
  };
  const downloadAndUpload = async url => {
    if (busy) return toast('另一張圖片正在處理');
    state.clicks++;
    busy = true;
    try {
      if (!url) throw Error('未找到當前圖片的原始 PNG 地址，已取消上傳');
      const src = fileURL(url);
      if (!src) throw Error('目前只能上傳 Discord CDN 的原始 PNG 附件');
      if (!config.username || !config.password) throw Error('請先在插件設定中輸入 CardVault 帳號密碼');
      const base = serverBase();
      toast('正在下載 PNG 原檔…');
      const download = await fetch(src);
      if (!download.ok) throw Error('下載失敗 HTTP ' + download.status);
      const declared = Number(download.headers?.get?.('content-length') || 0);
      if (declared > MAX_BYTES) throw Error('原始 PNG 超過 30 MB');
      const raw = await download.arrayBuffer();
      if (raw.byteLength > MAX_BYTES) throw Error('原始 PNG 超過 30 MB');
      const bytes = new Uint8Array(raw);
      if (config.onlyCard && !pngHasMetadata(bytes)) throw Error('沒有 chara 或 ccv3 中繼資料，未上傳');
      if (!config.onlyCard) pngHasMetadata(bytes); // verify PNG even in non-card mode
      toast('登入 CardVault…');
      const login = await fetch(base + '/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:config.username,password:config.password})});
      if (!login.ok) throw Error('登入失敗 HTTP ' + login.status);
      const json = await login.json();
      const token = json?.token || json?.data?.token;
      if (typeof token !== 'string' || !token) throw Error('登入結果未提供 token');
      const filename = (decodeURIComponent(new URL(src).pathname.split('/').pop() || 'discord-card.png')).replace(/[\r\n\\]/g,'_').slice(0,180);
      toast('上傳到 CardVault…');
      const response = await fetch(base + '/api/cards/import', { method:'POST',headers:{'Content-Type':'image/png','Authorization':'Bearer '+token,'X-File-Name':filename},body:raw });
      if (!response.ok) throw Error('上傳失敗 HTTP ' + response.status + ': ' + (await response.text()).slice(0,100));
      state.uploads++;
      state.lastUpload = filename;
      toast('已保存到 Card：' + filename);
    } catch (e) { reportError(e); toast('保存到 Card 失敗：' + state.error); }
    finally { busy = false; }
  };
  const labelsOf = option => typeof option?.label === 'string' ? option.label : (typeof option?.text === 'string' ? option.text : '');
  const isSave = label => /^(保存|Save|Save Image|Save Media|Download|儲存|储存)$/i.test(label);
  const isShare = label => /^(分享|Share|转发|轉發|Forward)$/i.test(label);
  const isBrowser = label => /^(在浏览器中打开|在瀏覽器中開啟|在瀏覽器中打開|Open in Browser|Open in browser|Open in External Browser)$/i.test(label);
  const isImageSheet = sheet => {
    if (!sheet || !Array.isArray(sheet.options)) return false;
    const labels = sheet.options.map(labelsOf);
    return labels.some(isSave) && labels.some(isShare) && labels.some(isBrowser);
  };
  const inspectSheet = args => {
    state.sheets++;
    if (!Array.isArray(args)) return;
    const sheet = args[0];
    if (!isImageSheet(sheet)) return;
    state.menuMatches++;
    if (sheet.options.some(o => labelsOf(o) === '保存到 Card')) return;
    const pos = sheet.options.findIndex(o => isSave(labelsOf(o)));
    if (pos < 0) return;
    // Always display the action in the recognized image menu. Determine URL at press time.
    const original = sheet.options[pos];
    const item = { label:'保存到 Card', onPress: () => downloadAndUpload(currentURL(sheet)) };
    if (original && original.icon != null) item.icon = original.icon;
    const options = sheet.options.slice();
    options.splice(pos + 1, 0, item);
    sheet.options = options;
    state.injections++;
    state.last = '已插入圖片選單';
  };
  const patchMethod = (method, matcher, callback) => {
    try {
      const m = v.metro?.findByProps?.(method);
      if (!m || typeof m[method] !== 'function' || (matcher && !matcher(m))) return false;
      const unpatch = v.patcher?.before?.(method, m, callback);
      if (typeof unpatch !== 'function') return false;
      cleanups.push(unpatch);
      return true;
    } catch(e) { reportError(e); return false; }
  };
  const rememberViewerContext = args => {
    // Only opportunistically capture a unique *original PNG attachment* from viewer args.
    if (!args || !Array.isArray(args)) return;
    const urls = allCandidateURLs(args, 6);
    if (urls.length === 1) { state.contextUrl = urls[0]; state.contextAt = Date.now(); }
    else { state.contextUrl = ''; state.contextAt = 0; }
  };
  const plugin = {
    onLoad() {
      if (state.started) return;
      state.started = true;
      state.last = '插件已啟動';
      state.sheetHook = patchMethod('showSimpleActionSheet', null, inspectSheet);
      const mediaMethodNames = ['openMediaModal', 'openMediaViewer', 'openImageViewer', 'openMediaCarousel', 'openImageModal'];
      for (const method of mediaMethodNames) {
        if (patchMethod(method, null, rememberViewerContext)) state.viewerHooks.push(method);
      }
      toast(state.sheetHook ? '保存到 Card 已啟動（圖片選單待測）' : '保存到 Card 已載入：尚未定位選單介面');
    },
    onUnload() {
      while (cleanups.length) { try { cleanups.pop()(); } catch (e) { logger(e); } }
      state.started = false;
      state.contextUrl = '';
    },
    settings: function SaveToCardSettings() {
      const React = v.metro?.common?.React, RN = v.metro?.common?.ReactNative;
      if (!React || !RN?.Text || !RN?.ScrollView || !RN?.TextInput || !RN?.Switch || !RN?.Pressable) return null;
      const h=React.createElement;
      const [form,setForm] = React.useState({...config});
      const [tick,refresh] = React.useState(0);
      const edit = (name,val) => { saveConfig(name,val); setForm(x => ({...x,[name]:val})); };
      const tx = (s,style={}) => h(RN.Text,{style:{fontSize:14,color:'#ebebf4',marginBottom:10,...style}},s);
      const fld = (name,title,secret=false) => h(RN.View,{key:name,style:{marginBottom:16}},
        tx(title), h(RN.TextInput,{value:form[name],onChangeText:value=>edit(name,value),secureTextEntry:secret,autoCapitalize:'none',autoCorrect:false,
          style:{color:'#ffffff',backgroundColor:'#454751',borderRadius:9,paddingHorizontal:12,paddingVertical:10,minHeight:45}}));
      const tog = (name,title,detail) => h(RN.View,{key:name,style:{flexDirection:'row',alignItems:'center',marginBottom:15}},
        h(RN.View,{style:{flex:1}},tx(title,{fontSize:16,marginBottom:2}),tx(detail,{color:'#b6baca',fontSize:12,marginBottom:0})),
        h(RN.Switch,{value:!!form[name],onValueChange:x=>edit(name,x)}));
      const info = (k,v) => tx(k + '：' + String(v),{fontSize:13,color:'#b6baca',marginBottom:5});
      return h(RN.ScrollView,{style:{flex:1},contentContainerStyle:{padding:18,paddingBottom:55}},
        tx('保存到 Card',{fontSize:23,fontWeight:'bold'}),
        tx('在 Discord 圖片右上角 ⋮ 選單中使用。僅在點擊按鈕時上傳。',{color:'#aeb4c8'}),
        fld('server','CardVault 網址'),fld('username','CardVault 用戶名'),fld('password','CardVault 密碼',true),
        tog('onlyCard','只導入角色卡','檢查 PNG chara / ccv3 中繼資料'),
        tog('allowHttp','允許 HTTP 明文連線','你的 CardVault 目前是 HTTP；帳密可能被網路截取'),
        tx('執行狀態',{fontSize:18,fontWeight:'bold',marginTop:14}),
        info('已啟動',state.started?'是':'否'),info('圖片選單 Hook',state.sheetHook?'是':'否'),
        info('圖片檢視器 Hook',state.viewerHooks.join(', ')||'未找到'),
        info('ActionSheet 呼叫',state.sheets),info('圖片選單命中',state.menuMatches),
        info('插入次數',state.injections),info('按鈕點擊',state.clicks),info('成功上傳',state.uploads),
        info('目前圖片 PNG URL',state.contextUrl?'已捕獲':'尚未捕獲'),
        info('最近狀態',state.last),info('最近錯誤',state.error||'無'),
        h(RN.Pressable,{style:{backgroundColor:'#5865f2',borderRadius:10,padding:14,marginTop:20},onPress:()=>refresh(x=>x+1)},
          tx('更新診斷',{fontSize:16,fontWeight:'bold',textAlign:'center',marginBottom:0})),
        tx('注意：這是根據公開 Revenge API 構建的版本，Discord 351.11 圖片選單及原圖取得尚未經你的手機驗證。',{fontSize:12,color:'#b6baca',marginTop:18})
      );
    }
  };
  return plugin;
})()
