const assert = require('node:assert/strict');
const fs=require('node:fs'); const vm=require('node:vm'); const crypto=require('node:crypto');
const src=fs.readFileSync(__dirname+'/../ready/index.js','utf8');
const manifest=JSON.parse(fs.readFileSync(__dirname+'/../ready/manifest.json','utf8'));
assert.equal(crypto.createHash('sha256').update(src).digest('hex'), manifest.hash);
const calls={};const fetchLog=[];const messages=[];
const storage={server:'http://aaa.xixisillytavern.top:8788',username:'testuser',password:'testpassword',allowHttp:true,onlyCard:true};
const sheetModule={showSimpleActionSheet(){}};
const viewerModule={openMediaModal(){}};
const React={ createElement:(type,props,...children)=>({type,props:{...props,children}}), useState:v=>[v,()=>{}] };
const RN={Text:function Text(){},ScrollView:function ScrollView(){},TextInput:function TextInput(){},Switch:function Switch(){},Pressable:function Pressable(){},View:function View(){}};
const vendetta={plugin:{storage},logger:{log(){}},metro:{findByProps(n){return n==='showSimpleActionSheet'?sheetModule:n==='openMediaModal'?viewerModule:null;},common:{React,ReactNative:RN}},patcher:{before(n,mod,cb){calls[n]=cb;return ()=>{delete calls[n];};}},ui:{toasts:{showToast:m=>messages.push(m)}}};
const PNG=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('0000000a74455874636861726100616263','hex'),Buffer.alloc(4),Buffer.from('0000000049454e44ae426082','hex')]);
const makeRes=(payload,code=200)=>({ok:code===200,status:code,headers:{get:()=>null},arrayBuffer: async()=>payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength),json:async()=>({token:'test-token'}),text:async()=>''});
async function fetchMock(url,options){fetchLog.push({url,options});if(url.includes('/attachments/'))return makeRes(PNG);return makeRes(Buffer.alloc(0));}
const sandbox={URL,Buffer,Date,fetch:fetchMock,console,Uint8Array,ArrayBuffer,Set,Map};
const evaluator=vm.runInNewContext(`vendetta=>{return ${src}}`,sandbox,{timeout:2000});
const plugin=evaluator(vendetta);
assert.equal(typeof plugin.onLoad,'function');assert.equal(typeof plugin.onUnload,'function');assert.equal(typeof plugin.settings,'function');
plugin.onLoad(); assert.ok(calls.showSimpleActionSheet);assert.ok(calls.openMediaModal);
// A genuine-looking image action menu with a single original attachment.
const url='https://cdn.discordapp.com/attachments/111/222/card.png?ex=abcd';
const sheet={ options:[{label:'保存'}, {label:'分享'}, {label:'在浏览器中打开'}, {label:'跳转到消息'}], attachment:{url} };
calls.showSimpleActionSheet([sheet]);
assert.equal(sheet.options[1].label,'保存到 Card');
const nonImage={options:[{label:'保存'}, {label:'分享'}]};calls.showSimpleActionSheet([nonImage]);assert.equal(nonImage.options.length,2);
const settings=plugin.settings();assert.equal(settings.type,RN.ScrollView);assert.match(JSON.stringify(settings),/CardVault/);
(async()=>{
 await sheet.options[1].onPress();
 assert.deepEqual(fetchLog.map(v=>v.url),[url,'http://aaa.xixisillytavern.top:8788/api/login','http://aaa.xixisillytavern.top:8788/api/cards/import']);
 assert.equal(fetchLog[2].options.headers.Authorization,'Bearer test-token');
 assert.equal(fetchLog[2].options.headers['X-File-Name'],'card.png');
 assert.equal(fetchLog[2].options.body.byteLength,PNG.byteLength);
 assert.ok(messages.some(x=>x.includes('已保存到 Card')));
 // A menu without an original attachment still gains the action but never uploads the wrong image.
 const bad={options:[{label:'Save'},{label:'Share'},{label:'Open in Browser'}]};calls.showSimpleActionSheet([bad]);
 const prev=fetchLog.length; await bad.options[1].onPress();assert.equal(fetchLog.length,prev);
 plugin.onUnload();assert.equal(Object.keys(calls).length,0);
 console.log('PASS: manifest hash, actual Vendetta eval contract, settings, action insertion, PNG bytes, auth, no-URL safety, cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
