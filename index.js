(() => {
  'use strict';
  // Revenge 0980cfc > Install a plugin uses the Vendetta eval expression format.
  const v = vendetta;
  const MAX_BYTES = 30 * 1024 * 1024;
  const MAX_CONTEXT_AGE_MS = 20 * 1000;
  const state = {
    started: false, sheetHook: false, viewerHooks: [], jsxHooks: [], jsxCalls: 0, jsxMenuMatches: 0, lazyCalls: 0, sheets: 0, menuMatches: 0,
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
    // Discord's media proxy sometimes references the same attachment. Use CDN ORIGINAL,
    // not resized/re-encoded proxy bytes. Preserve attachment signature fields only.
    if (u.hostname === 'media.discordapp.net') {
      u.hostname = 'cdn.discordapp.com';
      for (const key of Array.from(u.searchParams.keys())) {
        if (!['ex','is','hm'].includes(key)) u.searchParams.delete(key);
      }
    }
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
        if (/^(url|originalUrl|originalURL|uri|source|src|image|imageUrl|media|attachment|attachments|selectedMedia|item|asset|data|props|message|viewer|images|currentItem|selectedItem|thumbnail|original|sourceURL|sourceUri|sourceURI|originalUri|mediaUrl|mediaURL|cdnUrl|fullUrl|fullURL|originalSource|fileUrl|fileURL)$/i.test(key)) visit(value, depth + 1);
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
  // Additional strategy: some Discord 351.x overflow menus are rendered as
  // React/JSX popup items, NOT by showSimpleActionSheet. Inspect freshly built
  // element trees and only touch a sibling array resembling the image menu.
  // This is reversible via patcher unpatch functions; nothing uploads on render.
  const menuText = (item, depth = 0) => {
    if (depth > 6 || item == null) return '';
    if (typeof item === 'string') return item.trim();
    if (typeof item !== 'object') return '';
    for (const key of ['label','title','text','name']) {
      if (typeof item[key] === 'string' && item[key].length < 80) return item[key].trim();
    }
    const p = item.props;
    if (p && typeof p === 'object') {
      for (const key of ['label','title','text','name']) {
        if (typeof p[key] === 'string' && p[key].length < 80) return p[key].trim();
      }
      if (typeof p.children === 'string') return p.children.trim();
      if (p.children && !Array.isArray(p.children)) return menuText(p.children, depth + 1);
      if (Array.isArray(p.children) && p.children.length <= 8) {
        const labels=p.children.map(c=>menuText(c,depth+1)).filter(Boolean);
        const matches=labels.filter(x=>isSave(x)||isShare(x)||isBrowser(x));
        if(matches.length===1)return matches[0];
      }
    }
    return '';
  };
  const hasCallback = obj => obj && typeof obj === 'object' &&
    ['onPress','onClick','onSelect','action','callback','onActivate'].some(k => typeof obj[k] === 'function');
  const makeAction = (orig, handler, depth = 0) => {
    if (!orig || typeof orig !== 'object' || depth > 5) return null;
    const isElement = !!orig.props && typeof orig.props === 'object' && orig.type != null;
    const props = isElement ? orig.props : orig;
    const changed = {...props};
    let changedLabel = false, changedHandler = false;
    for (const key of ['label','title','text','name']) {
      if (typeof props[key] === 'string' && isSave(props[key])) { changed[key] = '保存到 Card'; changedLabel = true; }
    }
    for (const key of ['onPress','onClick','onSelect','action','callback','onActivate']) {
      if (typeof props[key] === 'function') { changed[key] = handler; changedHandler = true; }
    }
    if (!changedHandler && isElement && !hasCallback(props)) {
      // Some menu items' outer component only stores the label; the callback
      // belongs to its inner Pressable. Replace only a single-child chain.
      if (props.children && !Array.isArray(props.children)) {
        const child = makeAction(props.children, handler, depth+1);
        if (child) { changed.children = child; changedHandler = true; }
      } else if (Array.isArray(props.children) && props.children.length <= 8) {
        for (let i=0;i<props.children.length;i++) {
          const child = makeAction(props.children[i], handler, depth+1);
          if (child) { changed.children = props.children.slice(); changed.children[i]=child; changedHandler = true; break; }
        }
      }
    }
    if (!changedLabel && typeof props.children === 'string' && isSave(props.children)) {
      changed.children = '保存到 Card'; changedLabel = true;
    }
    if (!changedLabel && props.children && !Array.isArray(props.children)) {
      const child = cloneLabel(props.children, depth+1);
      if (child) { changed.children = child; changedLabel = true; }
    }
    if (!changedLabel && Array.isArray(props.children) && props.children.length <= 8) {
      for(let i=0;i<props.children.length;i++) {
        const child=cloneLabel(props.children[i],depth+1);
        if(child){changed.children=props.children.slice();changed.children[i]=child;changedLabel=true;break;}
      }
    }
    if (!changedLabel || !changedHandler) return null;
    if ('id' in changed) changed.id = 'save-to-card-image';
    if ('key' in changed) changed.key = 'save-to-card-image';
    if ('disabled' in changed) changed.disabled = false;
    if ('isDisabled' in changed) changed.isDisabled = false;
    if (!isElement) return changed;
    const React = v.metro?.common?.React;
    if (typeof React?.cloneElement === 'function') {
      try { return React.cloneElement(orig, {...changed,key:'save-to-card-image'}); } catch (_) {}
    }
    return {...orig,props:changed,key:'save-to-card-image'};
  };
  const cloneLabel = (obj, depth = 0) => {
    if (depth > 6 || obj == null) return null;
    if (typeof obj === 'string') return isSave(obj) ? '保存到 Card' : null;
    if (typeof obj !== 'object') return null;
    const props = obj.props;
    if (!props || typeof props !== 'object') return null;
    const p = {...props};let change = false;
    for (const k of ['label','title','text','name']) {
      if (typeof p[k] === 'string' && isSave(p[k])) {p[k]='保存到 Card';change=true;}
    }
    if (typeof p.children === 'string' && isSave(p.children)) {p.children='保存到 Card';change=true;}
    if (!change && p.children && !Array.isArray(p.children)) {
      const c=cloneLabel(p.children,depth+1);if(c){p.children=c;change=true;}
    }
    if (!change && Array.isArray(p.children) && p.children.length<=8) {
      for(let i=0;i<p.children.length;i++){
        const c=cloneLabel(p.children[i],depth+1);
        if(c){p.children=p.children.slice();p.children[i]=c;change=true;break;}
      }
    }
    if (!change) return null;
    const React=v.metro?.common?.React;
    if (typeof React?.cloneElement==='function') {
      try {return React.cloneElement(obj,p);} catch(_){}
    }
    return {...obj,props:p};
  };
  const spliceImageMenu = (arr, context) => {
    if (!Array.isArray(arr) || arr.length < 3 || arr.length > 18) return null;
    const labels=arr.map(menuText);
    if (!labels.some(isSave) || !labels.some(isShare) || !labels.some(isBrowser)) return null;
    if (labels.includes('保存到 Card')) return null;
    state.jsxMenuMatches++;
    const pos=labels.findIndex(isSave), original=arr[pos];
    // First render the action even when image URL isn't available. On click,
    // show the error rather than silently uploading another image.
    const action=makeAction(original,()=>downloadAndUpload(currentURL(context)));
    if (!action) { state.last='找到圖片選單，但無法安全複製保存項目';return null; }
    const result=arr.slice();result.splice(pos+1,0,action);
    state.injections++;
    state.last='JSX 圖片選單已插入保存到 Card';
    return result;
  };
  const menuFields = ['options','items','actions','menuItems','menuOptions','actionItems','children','rows'];
  const transformMenu = (props, depth = 0) => {
    if (!props || typeof props!=='object' || depth > 2) return null;
    let next=null;
    for(const key of menuFields) {
      if (!Array.isArray(props[key])) continue;
      const patched=spliceImageMenu(props[key],props);
      if(patched){next=next||{...props};next[key]=patched;break;}
    }
    if(next)return next;
    if(depth<2){for(const key of ['menu','data','menuData','content','config']){
      if(!props[key] || Array.isArray(props[key]) || typeof props[key]!=='object') continue;
      const nested=transformMenu(props[key],depth+1);
      if(nested){return {...props,[key]:nested};}
    }}
    return null;
  };
  const inspectElement = element => {
    state.jsxCalls++;
    if(!element || typeof element!=='object' || !element.props)return element;
    const changed=transformMenu(element.props);
    if(!changed)return element;
    const React=v.metro?.common?.React;
    if(typeof React?.cloneElement==='function'){
      try{return React.cloneElement(element,changed);}catch(_){}
    }
    return {...element,props:changed};
  };
  const patchAfter = (method, mod, cb, label) => {
    if(!mod || typeof mod[method]!=='function' || typeof v.patcher?.after!=='function')return false;
    try {const unpatch=v.patcher.after(method,mod,cb);
      if(typeof unpatch!=='function')return false;
      cleanups.push(unpatch);state.jsxHooks.push(label);return true;
    }catch(e){reportError(e);return false;}
  };
  const installJSXHooks = () => {
    // React.createElement and automatic JSX runtime are distinct factory paths.
    // Patch both to cover different Discord bundles without relying on guessed
    // image-menu component names.
    const React=v.metro?.common?.React;
    patchAfter('createElement',React,(args,result)=>inspectElement(result),'React.createElement');
    const names=[['jsx','jsxs'],['jsx','jsxs','Fragment'],['jsxDEV']];
    const modules=[];
    for(const keys of names){
      try {const m=v.metro?.findByProps?.(...keys);
        if(m && !modules.includes(m))modules.push(m);
      }catch(_){}
    }
    for(const m of modules){
      for(const method of ['jsx','jsxs','jsxDEV']){
        if(typeof m[method]==='function')patchAfter(method,m,(args,result)=>inspectElement(result),'JSX.'+method);
      }
    }
    // Popup opening gives diagnostics even if props aren't rendered through
    // the factories we can intercept. NEVER suppress the original popup.
    try {const m=v.metro?.findByProps?.('openLazy');
      if(m && typeof m.openLazy==='function') {
        const off=v.patcher.before('openLazy',m,args=>{
          state.lazyCalls++;
          for(const x of args||[]){if(x && typeof x==='object'){
            const changed=transformMenu(x);
            if(changed) {try{Object.assign(x,changed);}catch(e){reportError(e);}}
          }}
        });
        if(typeof off==='function'){cleanups.push(off);state.jsxHooks.push('ActionSheet.openLazy');}
      }
    }catch(e){reportError(e);}
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
      installJSXHooks();
      const mediaMethodNames = ['openMediaModal', 'openMediaViewer', 'openImageViewer', 'openMediaCarousel', 'openImageModal'];
      for (const method of mediaMethodNames) {
        if (patchMethod(method, null, rememberViewerContext)) state.viewerHooks.push(method);
      }
      toast('保存到 Card 已啟動，JSX Hooks: ' + state.jsxHooks.length);
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
        info('React/JSX 鉤子',state.jsxHooks.join(', ')||'未找到'),info('JSX 執行次數',state.jsxCalls),
        info('JSX 圖片選單命中',state.jsxMenuMatches),info('openLazy 呼叫',state.lazyCalls),
        info('ActionSheet 呼叫',state.sheets),info('圖片選單命中',state.menuMatches),
        info('插入次數',state.injections),info('按鈕點擊',state.clicks),info('成功上傳',state.uploads),
        info('目前圖片 PNG URL',state.contextUrl?'已捕獲':'尚未捕獲'),
        info('最近狀態',state.last),info('最近錯誤',state.error||'無'),
        h(RN.Pressable,{style:{backgroundColor:'#5865f2',borderRadius:10,padding:14,marginTop:20},onPress:()=>refresh(x=>x+1)},
          tx('更新診斷',{fontSize:16,fontWeight:'bold',textAlign:'center',marginBottom:0})),
        tx('注意：圖片選單新增 React/JSX 攔截，實機菜單位置仍需驗證；若網址不可得，點擊不會上傳。',{fontSize:12,color:'#b6baca',marginTop:18})
      );
    }
  };
  return plugin;
})()
