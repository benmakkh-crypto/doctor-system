/*@@THEMES@@*/
/* ================= مكتبة القوالب: 100 قالب للموقع + 30 مظهرًا للنظام =================
 * ملف مشترك: يُنسخ كما هو داخل Index.html وSite.html (tools/sync-themes.js).
 * قالب الموقع = لوحة ألوان × تخطيط واجهة، ومعه خط ونمط زخرفة وشكل بطاقات وترتيب أقسام.
 * ما تحفظه المؤسسة: {tpl, g,g2,g3,gold,gold2,bg, hero,card,font,pat,radius,head, order:[], hide:[], heroTitle, heroLead}
 */
var NT=(function(){
  var PAL=[
    ["oasis","الواحة","خيري","#0e4d3f","#0a3a30","#062520","#deb24e","#b8862a","#f6f8f7"],
    ["lazuli","اللازورد","تعليمي","#1d4e89","#163a66","#0d2341","#e0b44c","#b8862a","#f4f7fb"],
    ["turq","الفيروز","صحي","#0f6e74","#0b5357","#063336","#e7b75a","#c08a2e","#f3f8f8"],
    ["andalus","الأندلس","ثقافي","#a4452c","#7f3420","#4a1d12","#e2b04a","#b8862a","#fbf6f1"],
    ["cordoba","قرطبة","أسري","#7b2d43","#5c2132","#35121d","#d9a84a","#b0812a","#fbf5f6"],
    ["palm","النخيل","بيئي","#3d6b35","#2d5127","#1a3017","#d8b04c","#b08a2b","#f6f8f3"],
    ["amber","العنبر","وقفي","#8a5a2b","#6b4520","#3e2812","#e6b85c","#c08a2e","#fbf7f1"],
    ["jasmine","الياسمين","أسري","#5b3a8c","#462c6c","#291a40","#e0b44c","#b8862a","#f8f6fb"],
    ["emerald","الزمرد","إغاثي","#087f5b","#066649","#033d2c","#f0c14b","#c99a2e","#f2faf6"],
    ["coral","المرجان","شبابي","#c2513a","#9c3f2c","#5e2418","#f1c35a","#c99a2e","#fdf6f3"],
    ["dusk","الغروب","شبابي","#b5532f","#8d3f23","#4f2213","#f3c45d","#d09c34","#fdf7f2"],
    ["dawn","الفجر","تعليمي","#2f6f9f","#245679","#14324a","#f2c15c","#c99a2e","#f4f8fb"],
    ["night","الليل","رسمي","#1f2a44","#161e33","#0b101d","#d9b45a","#b38b30","#f4f5f8"],
    ["pomeg","الرمان","صحي","#9b1d34","#7a1628","#460c17","#e8b84f","#bf8f2c","#fcf5f6"],
    ["olive","الزيتون","وقفي","#5f6b2e","#4a5323","#2b3014","#dcb24e","#b38b2b","#f7f8f2"],
    ["sea","البحر","إغاثي","#0b6e8f","#08566f","#043243","#f0c35a","#c99a2e","#f2f8fa"],
    ["honey","العسل","شبابي","#a8700f","#84580c","#4a3107","#2f8f75","#1f6e59","#fcf8ef"],
    ["lavender","الخزامى","أسري","#6a5acd","#5246a8","#2e2763","#f0c35a","#c99a2e","#f7f6fd"],
    ["cedar","الأرز","رسمي","#2e5e4e","#23493c","#132a22","#c9a227","#a3821c","#f4f7f5"],
    ["sand","الرمال","ثقافي","#8f7048","#6f5737","#41331f","#1f7a63","#155845","#fbf8f2"]
  ];
  var HERO=[["split","منقسم"],["center","مركزي"],["arch","محراب"],["banner","فاتح"],["minimal","مختصر"]];
  var CARD=[["soft","ناعمة"],["outline","محدّدة"],["glass","زجاجية"],["elevated","بارزة"],["flat","مسطحة"]];
  var HEAD=[["solid","داكن"],["light","فاتح"],["line","بإطار مزدوج"]];
  var FONT=[["kufi","كوفي وبلكس","Noto Kufi Arabic","IBM Plex Sans Arabic","Noto+Kufi+Arabic:wght@600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700"],
    ["tajawal","تجوال","Tajawal","Tajawal","Tajawal:wght@400;500;700;800"],
    ["cairo","القاهرة","Cairo","Cairo","Cairo:wght@400;600;700;800"],
    ["amiri","أميري الكلاسيكي","Amiri","IBM Plex Sans Arabic","Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700"],
    ["almarai","المراعي","Almarai","Almarai","Almarai:wght@400;700;800"],
    ["reem","ريم الكوفي","Reem Kufi","Tajawal","Reem+Kufi:wght@500;600;700&family=Tajawal:wght@400;500;700"]];
  var PAT=[["girih","نجوم ومربعات"],["stars","نجمة ثمانية"],["circles","دوائر متداخلة"],["lattice","مشربية"],["none","بدون"]];
  var SECS=[["about","من نحن"],["services","خدماتنا"],["programs","برامجنا"],["impact","أثرنا"],["news","الأخبار"],["eservices","الخدمات الإلكترونية"],["partners","الشركاء"],["gov","الحوكمة"]];
  var ORD=[["about","services","programs","impact","news","eservices","partners","gov"],
    ["impact","services","programs","about","news","eservices","gov","partners"],
    ["services","eservices","about","programs","impact","news","partners","gov"],
    ["news","about","programs","impact","services","eservices","partners","gov"]];
  var RAD=[18,10,24,4,14];
  var SITE=[];
  PAL.forEach(function(p,pi){HERO.forEach(function(h,hi){
    SITE.push({id:p[0]+"-"+h[0],n:p[1]+" · "+h[1],cat:p[2],pal:p[0],
      g:p[3],g2:p[4],g3:p[5],gold:p[6],gold2:p[7],bg:p[8],hero:h[0],
      card:CARD[(pi*2+hi)%5][0],font:FONT[(pi+hi*2)%6][0],pat:PAT[(pi+hi)%4][0],radius:RAD[(pi+hi)%5],
      head:HEAD[(pi+hi)%3][0],order:ORD[(pi*3+hi)%4].slice(),hide:[]});
  })});
  /* مظاهر النظام: القائمة الجانبية والشريط العلوي واللون الرئيسي واللون الذهبي */
  var SYSX=[["charcoal","الفحم","#2b3a42","#1f2a30","#121a1e","#d9b45a"],["midnight","منتصف الليل","#1b2a5a","#14204a","#0a1230","#e6c25c"],
    ["royal","الملكي","#4b2a7a","#3a2060","#22123a","#e0b44c"],["burgundy","العنّابي","#6e1f33","#551828","#320d17","#e3b65a"],
    ["forest","الغابة","#1f5130","#173e25","#0c2414","#d9b04c"],["ocean","المحيط","#0d4f6e","#0a3d55","#052333","#f0c35a"],
    ["cocoa","الكاكاو","#5a3b2a","#46301f","#291a10","#e6b85c"],["graphite","الجرافيت","#3a3f47","#2c3036","#181b1f","#c9a227"],
    ["copper","النحاس","#1f5a5a","#174545","#0c2828","#d98c4a"],["indigo","النيلي","#2f3d8f","#25306f","#141b42","#c9ced8"]];
  var SYS=PAL.map(function(p){return {id:p[0],n:p[1],b:p[3],b2:p[4],sb:[p[3],p[4],p[5]],gold:p[6],acc:p[7]}})
    .concat(SYSX.map(function(x){return {id:x[0],n:x[1],b:x[2],b2:x[3],sb:[x[2],x[3],x[4]],gold:x[5],acc:x[5]}}));
  function hx(h){h=String(h||"").replace("#","");if(h.length===3)h=h.split("").map(function(c){return c+c}).join("");var n=parseInt(h,16);return [n>>16&255,n>>8&255,n&255]}
  function mix(a,b,t){var A=hx(a),B=hx(b);return "#"+A.map(function(v,i){return ("0"+Math.round(v+(B[i]-v)*t).toString(16)).slice(-2)}).join("")}
  var okHex=function(v){return /^#[0-9a-f]{6}$/i.test(String(v||""))};
  function find(L,id){for(var i=0;i<L.length;i++)if(L[i].id===id)return L[i];return null}
  /** يدمج القالب الأساسي مع تعديلات المؤسسة ويعيد مواصفات كاملة سليمة */
  function siteSpec(t){t=t||{};var base=find(SITE,t.tpl)||SITE[0];var s=JSON.parse(JSON.stringify(base));
    ["g","g2","g3","gold","gold2","bg"].forEach(function(k){if(okHex(t[k]))s[k]=t[k]});
    if(t.hero&&HERO.some(function(x){return x[0]===t.hero}))s.hero=t.hero;
    if(t.card&&CARD.some(function(x){return x[0]===t.card}))s.card=t.card;
    if(t.head&&HEAD.some(function(x){return x[0]===t.head}))s.head=t.head;
    if(t.font&&FONT.some(function(x){return x[0]===t.font}))s.font=t.font;
    if(t.pat&&PAT.some(function(x){return x[0]===t.pat}))s.pat=t.pat;
    if(t.radius!=null&&+t.radius>=0&&+t.radius<=32)s.radius=+t.radius;
    var keys=SECS.map(function(x){return x[0]});
    if(Array.isArray(t.order)){var o=t.order.filter(function(k){return keys.indexOf(k)>=0});keys.forEach(function(k){if(o.indexOf(k)<0)o.push(k)});s.order=o}
    if(Array.isArray(t.hide))s.hide=t.hide.filter(function(k){return keys.indexOf(k)>=0});
    s.heroTitle=String(t.heroTitle||"").slice(0,120);s.heroLead=String(t.heroLead||"").slice(0,400);s.tpl=base.id;
    return s}
  function sysSpec(t){t=t||{};var b=find(SYS,t.tpl)||SYS[0];return b}
  function fontOf(s){for(var i=0;i<FONT.length;i++)if(FONT[i][0]===s.font)return FONT[i];return FONT[0]}
  function enc(svg){return "url(\"data:image/svg+xml,"+svg.replace(/"/g,"'").replace(/</g,"%3C").replace(/>/g,"%3E").replace(/#/g,"%23")+"\")"}
  function star(cx,cy,r,k){k=k||.765;var p="";for(var i=0;i<16;i++){var a=-Math.PI/2+i*Math.PI/8,rr=i%2?r*k:r;p+=(i?"L":"M")+(cx+rr*Math.cos(a)).toFixed(1)+" "+(cy+rr*Math.sin(a)).toFixed(1)}return p+"Z"}
  function tile(k){var w="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><g fill='none' stroke='#000' stroke-width='1.2'>";
    if(k==="stars")return enc(w+"<path d='"+star(40,40,22)+"'/><path d='"+star(0,0,22)+"'/><path d='"+star(80,0,22)+"'/><path d='"+star(0,80,22)+"'/><path d='"+star(80,80,22)+"'/><path d='"+star(40,40,9)+"'/></g></svg>");
    if(k==="circles")return enc(w+"<circle cx='40' cy='40' r='20'/><circle cx='0' cy='40' r='20'/><circle cx='80' cy='40' r='20'/><circle cx='40' cy='0' r='20'/><circle cx='40' cy='80' r='20'/><circle cx='20' cy='20' r='20'/><circle cx='60' cy='20' r='20'/><circle cx='20' cy='60' r='20'/><circle cx='60' cy='60' r='20'/></g></svg>");
    if(k==="lattice")return enc(w+"<path d='M0 20L20 0M60 0L80 20M80 60L60 80M20 80L0 60M20 0L40 20L60 0M80 20L60 40L80 60M60 80L40 60L20 80M0 60L20 40L0 20'/><rect x='30' y='30' width='20' height='20' transform='rotate(45 40 40)'/><circle cx='40' cy='40' r='4'/></g></svg>");
    return enc(w+"<rect x='20' y='20' width='40' height='40'/><rect x='20' y='20' width='40' height='40' transform='rotate(45 40 40)'/><circle cx='40' cy='40' r='9'/><path d='M0 0L20 20M80 0L60 20M0 80L20 60M80 80L60 60'/></g></svg>")}
  /** متغيرات وأنماط الموقع العام للقالب */
  function siteCSS(s){var f=fontOf(s);var L=[];
    L.push(":root{--g:"+s.g+";--g2:"+s.g2+";--g3:"+s.g3+";--gold:"+s.gold+";--gold2:"+s.gold2+";--bg:"+s.bg+";--r:"+s.radius+"px;--f-d:'"+f[2]+"',Tahoma,sans-serif;--f-b:'"+f[3]+"','Segoe UI',Tahoma,sans-serif;--tile:"+(s.pat==="none"?"none":tile(s.pat))+";--gl:"+mix(s.gold,"#ffffff",.3)+";--gm:"+mix(s.g,"#ffffff",.18)+"}");
    L.push(".hero{background:radial-gradient(110% 120% at 85% 10%,var(--gm) 0%,var(--g2) 45%,var(--g3) 100%)}.btn.gold{background:linear-gradient(135deg,var(--gl),var(--gold2))}.btn.green{background:linear-gradient(135deg,var(--gm),var(--g2))}");
    L.push(".logo svg [stroke='#deb24e'],.art svg [stroke='#deb24e']{stroke:var(--gold)}.art svg [fill='#deb24e']{fill:var(--gold)}");
    if(s.pat==="none")L.push(".hero::before,.impact::before,.ft::before{display:none}");
    var H={center:".hero .wrap{grid-template-columns:1fr;text-align:center;padding:84px 0 130px}.hero .art{display:none}.hero .acts{justify-content:center}.hero .verse{justify-content:center;margin-inline:auto}.hero .lead{margin-inline:auto;max-width:720px}",
      arch:".hero .wrap{grid-template-columns:1fr;text-align:center;padding:70px 0 120px}.hero .art{display:none}.hero .acts{justify-content:center}.hero .verse{justify-content:center;margin-inline:auto}.hero .wrap>div:first-child{position:relative;max-width:780px;margin-inline:auto;padding:84px 48px 34px}.hero .wrap>div:first-child::before,.hero .wrap>div:first-child::after{content:'';position:absolute;inset:0;border:2px solid color-mix(in srgb,var(--gold) 70%,transparent);border-bottom:0;border-radius:50% 50% 0 0/38% 38% 0 0;pointer-events:none}.hero .wrap>div:first-child::after{inset:12px 12px 0;border-width:1px;opacity:.6}@media (max-width:640px){.hero .wrap>div:first-child{padding:60px 18px 24px}}",
      banner:".hero{background:linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--g) 10%,var(--bg)));color:var(--ink)}.hero::before{background:color-mix(in srgb,var(--g) 10%,transparent)}.hero h1{color:var(--g)}.hero h1 em{color:var(--gold2)}.hero .lead,.hero .verse small{color:var(--muted)}.hero .bsm{color:var(--gold2)}.hero .verse{color:var(--ink)}.hero .btn.ghost{background:#fff;color:var(--g);border:1.5px solid color-mix(in srgb,var(--g) 25%,#fff)}",
      minimal:".hero{background:var(--g2)}.hero::before{opacity:.5}.hero .wrap{grid-template-columns:1fr;padding:54px 0 84px}.hero .art{display:none}.hero h1{font-size:clamp(28px,3.4vw,40px)}"};
    if(H[s.hero])L.push(H[s.hero]);
    var C={outline:".card{box-shadow:none;border:1.5px solid color-mix(in srgb,var(--g) 22%,var(--line))}.card:hover{border-color:var(--gold)}",
      glass:"section:not(.impact){background-image:linear-gradient(color-mix(in srgb,var(--g) 4%,transparent),transparent)}.card{background:color-mix(in srgb,#fff 72%,transparent);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.7);box-shadow:0 10px 30px color-mix(in srgb,var(--g) 10%,transparent)}",
      elevated:".card{border:0;box-shadow:0 16px 40px color-mix(in srgb,var(--g) 14%,transparent)}",
      flat:".card{border:0;box-shadow:none;background:color-mix(in srgb,var(--g) 5%,#fff)}.card:hover{box-shadow:none;background:color-mix(in srgb,var(--g) 9%,#fff)}"};
    if(C[s.card])L.push(C[s.card]);
    if(s.head==="light")L.push(".hd{background:rgba(255,255,255,.94);color:var(--ink);border-bottom:2px solid var(--gold)}.hd .nav a:hover{background:color-mix(in srgb,var(--g) 8%,transparent)}.hd .btn.ghost{background:transparent;color:var(--g);border:1.5px solid color-mix(in srgb,var(--g) 30%,#fff)}.hd .menu{color:var(--ink);border-color:var(--line)}.logo small{color:var(--muted)}");
    if(s.head==="line")L.push(".hd{border-bottom:5px double var(--gold)}");
    return L.join("\n")}
  function fontURL(s){return "https://fonts.googleapis.com/css2?family="+fontOf(s)[4]+"&display=swap"}
  /** مظهر النظام: يغيّر القائمة الجانبية والشريط العلوي واللون الرئيسي والذهبي */
  function sysCSS(t){var d=mix(t.b,"#ffffff",.42);
    var dark="--brand:"+d+";--brand-2:"+mix(t.b2,"#000000",.45)+";--accent:"+t.gold+";";
    return ":root{--brand:"+t.b+";--brand-2:"+t.b2+";--accent:"+t.acc+";--sb1:"+t.sb[0]+";--sb2:"+t.sb[1]+";--sb3:"+t.sb[2]+";--gold:"+t.gold+";--pat:"+t.b+"12}"+
      "@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){"+dark+"}}:root[data-theme=\"dark\"]{"+dark+"}"}
  return {PAL:PAL,HERO:HERO,CARD:CARD,HEAD:HEAD,FONT:FONT,PAT:PAT,SECS:SECS,SITE:SITE,SYS:SYS,siteSpec:siteSpec,sysSpec:sysSpec,siteCSS:siteCSS,fontURL:fontURL,sysCSS:sysCSS,tile:tile,mix:mix,cats:PAL.map(function(p){return p[2]}).filter(function(c,i,a){return a.indexOf(c)===i})};
})();
/*@@/THEMES@@*/
