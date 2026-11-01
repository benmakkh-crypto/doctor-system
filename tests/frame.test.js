// يشغّل النظام داخل إطار كما يفعل Apps Script، ويتأكد أن النقر على رابط داخلي لا ينقل النافذة العليا.
// الاستخدام: NODE_PATH=$(npm root -g) node tests/frame.test.js index.html
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const html=fs.readFileSync(process.argv[2],'utf8');
const b=await chromium.launch();const p=await b.newPage();
await p.route('http://top.test/',r=>r.fulfill({contentType:'text/html',body:'<iframe id=f src="http://inner.test/app" style="width:1400px;height:900px"></iframe>'}));
await p.route('http://inner.test/app',r=>r.fulfill({contentType:'text/html',body:html}));
await p.route(/fonts/,r=>r.abort());
await p.goto('http://top.test/');await p.waitForTimeout(1500);
const f=p.frames().find(x=>x.url().startsWith('http://inner.test'));
await f.fill('#lUser','zubair').catch(()=>{});
const ins=await f.$$eval('input',a=>a.map(i=>i.id+':'+i.type));
const u=ins.find(s=>s.endsWith(':text'))?.split(':')[0], pw=ins.find(s=>s.endsWith(':password'))?.split(':')[0];
await f.fill('#'+u,'zubair');await f.fill('#'+pw,'Demo2026');await f.press('#'+pw,'Enter');
await p.waitForTimeout(2500);
const link=await f.$('a[href^="#m"], a[href^="#"]');console.log('link',await link?.getAttribute('href'));
await link.click();await p.waitForTimeout(1200);
console.log('top url after click:',p.url());await b.close();})();
