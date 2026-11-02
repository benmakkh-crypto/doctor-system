/* ================= القوالب والمظهر (#themes) =================
 * مكتبة 100 قالب للموقع العام + 30 مظهرًا للنظام. لكل جزء صلاحية: S.parts["site.tpl"|"sys.theme"] (0 لا يرى، 1 اطلاع، 2 تعديل، 3 نشر).
 */
const PART_NAMES={"site.tpl":"قوالب الموقع وهويته","site.content":"محتوى الموقع","site.forms":"النماذج والخدمات الإلكترونية","site.design":"تصميم الموقع وظهوره","sys.theme":"مظهر النظام"};
const PART_MAX={"site.tpl":3,"site.content":2,"site.forms":2,"site.design":2,"sys.theme":2};
const PART_DEF={contributor:{"site.tpl":1,"site.content":2,"site.forms":2,"site.design":1,"sys.theme":0},viewer:{"site.tpl":1,"site.content":1,"site.forms":1,"site.design":1,"sys.theme":0}};
const LV_NAMES=["لا يرى","اطلاع","تعديل","تعديل ونشر"];
const partLv=k=>S.admin?PART_MAX[k]:+((S.parts||{})[k]||0);
let thDraft=null,thBase=null,thPrevSys=null;
function applySysTheme(tpl){let st=document.getElementById("nsys");if(!st){st=document.createElement("style");st.id="nsys";document.head.appendChild(st)}
  const t=tpl||(S.cfg&&S.cfg.sysTheme&&S.cfg.sysTheme.tpl);st.textContent=t?NT.sysCSS(NT.sysSpec({tpl:t})):""}
function loadThemeFonts(){if(document.getElementById("nfonts"))return;const l=document.createElement("link");l.id="nfonts";l.rel="stylesheet";
  l.href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;800&family=Cairo:wght@600;800&family=Amiri:wght@700&family=Almarai:wght@700;800&family=Reem+Kufi:wght@600;700&display=swap";document.head.appendChild(l)}
const fontName=k=>(NT.FONT.find(f=>f[0]===k)||NT.FONT[0]);
function tplMini(s){const f=fontName(s.font);
  return `<div class="tpv h-${s.hero} c-${s.card} hd-${s.head}" style="--g:${s.g};--g2:${s.g2};--g3:${s.g3};--gold:${s.gold};--gold2:${s.gold2};--bg:${s.bg};--rr:${Math.max(2,s.radius/3)}px;--tile:${s.pat==="none"?"none":NT.tile(s.pat)};--fd:'${f[2]}'" aria-hidden="true">
   <div class="tph"><i class="lg"></i><span></span><span></span><span></span><b></b></div>
   <div class="tpe"><div class="tx"><em>بسم الله</em><strong>عطاءٌ منظّم</strong><span></span><span class="s"></span><div class="bt"><i></i><i></i></div></div><div class="ar"><svg viewBox="0 0 40 40"><path d="${star8(20,20,17)}"/><path d="${star8(20,20,9)}"/></svg></div></div>
   <div class="tpk"><i></i><i></i><i></i></div><div class="tpf"><span></span><span></span></div></div>`}
function sysMini(t){return `<div class="spv" style="--b:${t.b};--b2:${t.b2};--s1:${t.sb[0]};--s2:${t.sb[1]};--s3:${t.sb[2]};--gd:${t.gold}" aria-hidden="true"><div class="spt"><i></i><b></b></div><div class="spb"><div class="sps"><i class="on"></i><i></i><i></i><i></i></div><div class="spm"><span class="k"><i></i><i></i><i></i></span><span class="c"></span><span class="bt"></span></div></div></div>`}
function viewThemes(){
  const lvS=partLv("site.tpl"),lvY=partLv("sys.theme");
  if(!lvS&&!lvY)return `${crumb([["القوالب والمظهر"]])}<div class="tw"><div class="empty"><b>ليست لديك صلاحية على القوالب والمظهر</b><small>اطلب من مسؤول النظام صلاحية «قوالب الموقع» أو «مظهر النظام».</small></div></div>`;
  if(S.scope==="*")return `${crumb([["القوالب والمظهر"]])}<div class="tw"><div class="empty"><b>اختر مؤسسة أولًا</b><small>لكل مؤسسة قالب موقعها ومظهر نظامها. اختر مؤسسة من الكشاف ثم عد إلى هنا.</small><a class="btn pri" href="#orgs">الكشاف</a></div></div>`;
  loadThemeFonts();
  const tab=ui.thTab||(lvS?"site":"sys");
  const pub=S.cfg.siteTheme,dr=S.cfg.siteDraft;const pubS=pub?NT.siteSpec(pub):null;
  const curSys=(S.cfg.sysTheme&&S.cfg.sysTheme.tpl)||"";
  const head=`${crumb([["القوالب والمظهر"]])}
   <section class="thhero"><div class="thm"><span class="thi">${ico("palette")}</span><div><small>TEMPLATES · مكتبة القوالب</small><h1>القوالب والمظهر</h1><p>${NF.format(NT.SITE.length)} قالبًا جاهزًا للموقع الإلكتروني و${NF.format(NT.SYS.length)} مظهرًا للنظام. اختر، وخصّص الألوان والخطوط والواجهة وترتيب الأقسام، ثم انشر لمؤسستك.</p></div></div>
    <div class="ths"><span><b>${NF.format(NT.SITE.length)}</b><small>قالب موقع</small></span><span><b>${NF.format(NT.PAL.length)}</b><small>لوحة ألوان</small></span><span><b>${NF.format(NT.FONT.length)}</b><small>خطوط</small></span><span><b>${NF.format(NT.SYS.length)}</b><small>مظهر نظام</small></span></div>
    <div class="thnow"><small>المنشور الآن</small><b>${pubS?esc(NT.SITE.find(x=>x.id===pubS.tpl)?.n||pubS.tpl):"القالب الأصلي"}</b>${dr&&JSON.stringify(Object.assign({},dr,{by:0,at:0}))!==JSON.stringify(Object.assign({},pub||{},{by:0,at:0}))?`<em>مسودة غير منشورة${dr.by?" · "+esc(nameOf(dr.by)):""}</em>`:""}<span class="lvb">صلاحيتك: ${LV_NAMES[lvS]}</span></div></section>
   <div class="seg thtabs" role="tablist">${lvS?`<button data-thtab="site" class="${tab==="site"?"on":""}">${ico("WEB")} قوالب الموقع <small>${NT.SITE.length}</small></button>`:""}${lvY||S.admin?`<button data-thtab="sys" class="${tab==="sys"?"on":""}">${ico("palette")} مظهر النظام <small>${NT.SYS.length}</small></button>`:""}<button data-thtab="perm" class="${tab==="perm"?"on":""}">${ico("shieldCheck")} الصلاحيات</button></div>`;
  if(tab==="perm")return head+partsMatrixHTML(true);
  if(tab==="sys"){
    return head+`<section class="box"><h3>مظهر النظام لمؤسستك <small>يغيّر القائمة الجانبية والشريط العلوي واللونين الرئيسي والذهبي لكل منسوبي المؤسسة</small></h3>
     ${thPrevSys?`<div class="banner orgban">${ico("eye")} تعاين الآن «${esc(NT.SYS.find(x=>x.id===thPrevSys)?.n||"")}». <button class="btn sm" data-sysapply="${thPrevSys}" ${lvY<2?"disabled":""}>اعتماده للمؤسسة</button> <button class="btn sm" data-sysprev="">إلغاء المعاينة</button></div>`:""}
     <div class="sysgrid">${[{id:"",n:"الأصلي (نافذ)",b:"#0f5a4b",b2:"#0b4639",sb:["#0e4d3f","#0a3a30","#072c24"],gold:"#deb24e"}].concat(NT.SYS).map(t=>`<article class="syc ${curSys===t.id?"cur":""} ${thPrevSys===t.id&&t.id?"prev":""}">${sysMini(t)}<div class="syn"><b>${esc(t.n)}</b>${curSys===t.id?`<em>المعتمد</em>`:""}</div>
       <div class="sya"><button class="btn sm" data-sysprev="${t.id}">${ico("eye")} معاينة</button><button class="btn sm pri" data-sysapply="${t.id}" ${lvY<2||curSys===t.id?"disabled":""}>${ico("check")} اعتماد</button></div></article>`).join("")}</div></section>`;
  }
  // قوالب الموقع
  if(ui.thSel){
    if(!thDraft){thBase=JSON.parse(JSON.stringify(ui.thSel==="__cur"?(dr||pub||{tpl:NT.SITE[0].id}):{tpl:ui.thSel}));thDraft=NT.siteSpec(thBase)}
    return head+themeEditorHTML(lvS);
  }
  const q=(ui.thq||"").trim(),cat=ui.thcat||"",hero=ui.thhero||"";
  const L=NT.SITE.filter(t=>(!cat||t.cat===cat)&&(!hero||t.hero===hero)&&(!q||(t.n+" "+t.cat).includes(q)));
  const lim=ui.thlim||24;
  return head+`<section class="box thlib">
    <div class="thbar"><label class="opq">${ico("search")}<input id="thq" type="search" placeholder="ابحث باسم القالب أو تصنيفه: الواحة، محراب، صحي…" value="${esc(q)}" autocomplete="off"></label>
     <button class="btn pri" data-thedit="__cur">${ico("sliders")} تخصيص القالب الحالي</button>${lvS>=3&&pub?`<button class="btn" data-threset>${ico("refresh")} العودة إلى القالب الأصلي</button>`:""}</div>
    <div class="thchips"><span>التصنيف</span><button data-thcat="" class="${!cat?"on":""}">الكل</button>${NT.cats.map(c=>`<button data-thcat="${esc(c)}" class="${cat===c?"on":""}">${esc(c)}</button>`).join("")}</div>
    <div class="thchips"><span>الواجهة</span><button data-thhero="" class="${!hero?"on":""}">الكل</button>${NT.HERO.map(([k,n])=>`<button data-thhero="${k}" class="${hero===k?"on":""}">${n}</button>`).join("")}<em>${NF.format(L.length)} قالب</em></div>
    <div class="tpgrid">${L.slice(0,lim).map(t=>{const isPub=pubS&&pubS.tpl===t.id,isDr=dr&&dr.tpl===t.id&&!isPub;return `<article class="tpc ${isPub?"pub":""}">${tplMini(t)}
      <div class="tpi"><div><b>${esc(t.n)}</b><small>${esc(t.cat)} · ${esc(fontName(t.font)[1])} · بطاقات ${esc(NT.CARD.find(c=>c[0]===t.card)[1])}</small></div><span class="sw">${[t.g,t.g2,t.gold,t.bg].map(c=>`<i style="background:${c}"></i>`).join("")}</span></div>
      ${isPub?`<em class="tpb">منشور</em>`:isDr?`<em class="tpb dr">مسودة</em>`:""}
      <div class="tpa"><button class="btn sm pri" data-thedit="${t.id}">${ico("sliders")} ${lvS>=2?"معاينة وتخصيص":"معاينة"}</button></div></article>`}).join("")||`<div class="empty"><b>لا قوالب بهذه التصفية</b></div>`}</div>
    ${L.length>lim?`<div class="thmore"><button class="btn" data-thmore>عرض المزيد (${NF.format(L.length-lim)})</button></div>`:""}</section>`;
}
function themeEditorHTML(lv){const d=thDraft;const ro=lv<2?"disabled":"";const base=NT.SITE.find(x=>x.id===d.tpl);
  const chips=(k,L)=>`<div class="thopt" data-thk="${k}">${L.map(([v,n])=>`<button data-thv="${v}" class="${d[k]===v?"on":""}" ${ro}>${n}</button>`).join("")}</div>`;
  const col=(k,n)=>`<label class="thcol"><input type="color" data-thc="${k}" value="${d[k]}" ${ro}><span>${n}</span></label>`;
  const SN=Object.fromEntries(NT.SECS);
  return `<section class="thed">
   <div class="thpv"><div class="thpvh"><b>${ico("eye")} معاينة حيّة</b><span class="seg"><button data-thdev="d" class="${(ui.thdev||"d")==="d"?"on":""}">${ico("monitor")} حاسب</button><button data-thdev="m" class="${ui.thdev==="m"?"on":""}">${ico("phone")} جوال</button></span><a class="btn sm" href="${esc(siteHref())}" target="_blank" rel="noopener">${ico("ext")} الموقع المنشور</a></div>
    <div class="thfr ${ui.thdev==="m"?"m":""}"><div class="thsc"><iframe id="thFrame" title="معاينة الموقع" src="${esc(siteHref())}"></iframe></div></div></div>
   <div class="thctl">
    <div class="thct"><button class="btn sm" data-thback>${ico("chev")} كل القوالب</button><div><small>القالب</small><b>${esc(base?.n||d.tpl)}</b></div></div>
    ${lv<2?`<div class="banner">صلاحيتك على القوالب «اطلاع»: تعاين ولا تعدّل.</div>`:""}
    <details open><summary>${ico("palette")} الألوان</summary><div class="thcols">${col("g","الرئيسي")}${col("g2","الداكن")}${col("g3","الأعمق")}${col("gold","الذهبي")}${col("gold2","الذهبي الداكن")}${col("bg","الخلفية")}</div>
     <div class="thpals"><small>لوحات جاهزة</small>${NT.PAL.map(p=>`<button data-thpal="${p[0]}" title="${esc(p[1])}" ${ro}><i style="background:${p[3]}"></i><i style="background:${p[6]}"></i><i style="background:${p[8]}"></i></button>`).join("")}</div></details>
    <details open><summary>${ico("layout")} الواجهة والشكل</summary>
     <div class="throw"><small>الواجهة الرئيسية</small>${chips("hero",NT.HERO)}</div>
     <div class="throw"><small>الرأس</small>${chips("head",NT.HEAD)}</div>
     <div class="throw"><small>البطاقات</small>${chips("card",NT.CARD)}</div>
     <div class="throw"><small>الزخرفة</small>${chips("pat",NT.PAT)}</div>
     <div class="throw"><small>الخط</small><div class="thopt fonts" data-thk="font">${NT.FONT.map(f=>`<button data-thv="${f[0]}" class="${d.font===f[0]?"on":""}" style="font-family:'${f[2]}'" ${ro}>${f[1]}</button>`).join("")}</div></div>
     <div class="throw"><small>استدارة الزوايا <output id="thRadO">${d.radius}</output></small><input type="range" min="0" max="32" step="2" value="${d.radius}" data-thrad ${ro}></div></details>
    <details><summary>${ico("list")} الأقسام وترتيبها</summary><ol class="thsecs" id="thSecs">${thSecsHTML(lv)}</ol></details>
    <details><summary>${ico("type")} نصوص الواجهة</summary>
     <label class="thtxt">العنوان الرئيسي<input data-tht="heroTitle" maxlength="120" value="${esc(d.heroTitle||"")}" placeholder="عطاءٌ منظّم… وأثرٌ يدوم" ${ro}></label>
     <label class="thtxt">النص التعريفي<textarea data-tht="heroLead" maxlength="400" rows="3" placeholder="اتركه فارغًا لاستخدام النص الأصلي" ${ro}>${esc(d.heroLead||"")}</textarea></label></details>
    <div class="thact">${lv>=2?`<button class="btn" data-thsave>${ico("doc")} حفظ مسودة</button>`:""}${lv>=3?`<button class="btn pri" data-thpub>${ico("check")} نشر على الموقع</button>`:lv>=2?`<small>النشر لمن يملك صلاحية «تعديل ونشر».</small>`:""}<button class="btn" data-thundo>${ico("refresh")} تراجع</button></div>
   </div></section>`}
function thSecsHTML(lv){const d=thDraft;const SN=Object.fromEntries(NT.SECS);const ro=lv<2?"disabled":"";
  return d.order.map((k,i)=>`<li class="${d.hide.includes(k)?"off":""}"><label class="check"><input type="checkbox" data-thsh="${k}" ${d.hide.includes(k)?"":"checked"} ${ro}>${esc(SN[k])}</label><span><button data-thmv="${i}" data-dir="-1" ${i===0||ro?"disabled":""} aria-label="لأعلى">▲</button><button data-thmv="${i}" data-dir="1" ${i===d.order.length-1||ro?"disabled":""} aria-label="لأسفل">▼</button></span></li>`).join("")}
function thPayload(){const d=thDraft;const o={tpl:d.tpl};const b=NT.SITE.find(x=>x.id===d.tpl)||{};
  ["g","g2","g3","gold","gold2","bg","hero","card","font","pat","radius","head"].forEach(k=>{if(d[k]!==b[k])o[k]=d[k]});
  if(JSON.stringify(d.order)!==JSON.stringify(b.order))o.order=d.order;if(d.hide.length)o.hide=d.hide;if(d.heroTitle)o.heroTitle=d.heroTitle;if(d.heroLead)o.heroLead=d.heroLead;return o}
let thPostT=null;
/** يعرض الموقع بعرض حاسب حقيقي (1280) مصغّرًا داخل المعاينة، أو بعرض جوال (390) */
function thFit(){const box=$(".thsc"),fr=$("#thFrame");if(!box||!fr)return;const m=$(".thfr").classList.contains("m");const W=m?390:1280;const k=Math.min(1,box.clientWidth/W);fr.style.width=W+"px";fr.style.height=(box.clientHeight/k)+"px";fr.style.transform=`scale(${k})`}
window.addEventListener("resize",()=>{if(R&&R.v==="themes")thFit()});
function thPost(){clearTimeout(thPostT);thPostT=setTimeout(()=>{const f=$("#thFrame");try{f&&f.contentWindow&&f.contentWindow.postMessage({nafithTheme:thPayload()},"*")}catch(e){}},120)}
window.addEventListener("message",e=>{if(e.data&&e.data.nafithSiteReady&&thDraft)thPost()});
function bindThemes(main){
  if(R.v!=="themes")return;
  main.querySelectorAll("[data-thtab]").forEach(b=>b.onclick=()=>{ui.thTab=b.dataset.thtab;render()});
  main.querySelectorAll("[data-thcat]").forEach(b=>b.onclick=()=>{ui.thcat=b.dataset.thcat;ui.thlim=24;render()});
  main.querySelectorAll("[data-thhero]").forEach(b=>b.onclick=()=>{ui.thhero=b.dataset.thhero;ui.thlim=24;render()});
  const mo=main.querySelector("[data-thmore]");if(mo)mo.onclick=()=>{ui.thlim=(ui.thlim||24)+24;render()};
  const q=$("#thq");if(q)q.oninput=()=>{ui.thq=q.value;ui.thlim=24;render()};
  main.querySelectorAll("[data-thedit]").forEach(b=>b.onclick=()=>{ui.thSel=b.dataset.thedit;thDraft=null;render();window.scrollTo(0,0)});
  const rs=main.querySelector("[data-threset]");if(rs)rs.onclick=()=>confirmBox("العودة إلى القالب الأصلي","سيظهر الموقع العام بتصميمه الأصلي، وتبقى مسودتك محفوظة.","العودة",async()=>{const d=await act("saveTheme",{kind:"site",theme:null,publish:true},"عاد الموقع إلى قالبه الأصلي");if(d){S.cfg.siteTheme=null;S.cfg.siteDraft=null;render()}});
  // مظهر النظام
  main.querySelectorAll("[data-sysprev]").forEach(b=>b.onclick=()=>{thPrevSys=b.dataset.sysprev||null;applySysTheme(thPrevSys||undefined);render()});
  main.querySelectorAll("[data-sysapply]").forEach(b=>b.onclick=async()=>{const id=b.dataset.sysapply;const d=await act("saveTheme",{kind:"sys",theme:id?{tpl:id}:null},"اعتُمد مظهر النظام لكل منسوبي المؤسسة");if(d){S.cfg.sysTheme=d.sysTheme;thPrevSys=null;applySysTheme();render()}});
  bindPartsMatrix(main);
  if(!thDraft)return;
  const ed=main.querySelector(".thed");if(!ed)return;
  const fr=$("#thFrame");if(fr)fr.onload=()=>thPost();thFit();
  main.querySelector("[data-thback]").onclick=()=>{ui.thSel=null;thDraft=null;render()};
  main.querySelectorAll("[data-thdev]").forEach(b=>b.onclick=()=>{ui.thdev=b.dataset.thdev;main.querySelectorAll("[data-thdev]").forEach(x=>x.classList.toggle("on",x===b));$(".thfr").classList.toggle("m",ui.thdev==="m");thFit()});
  main.querySelectorAll(".thopt").forEach(g=>g.querySelectorAll("button").forEach(b=>b.onclick=()=>{thDraft[g.dataset.thk]=b.dataset.thv;g.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));thPost()}));
  main.querySelectorAll("[data-thc]").forEach(i=>i.oninput=()=>{thDraft[i.dataset.thc]=i.value;thPost()});
  main.querySelectorAll("[data-thpal]").forEach(b=>b.onclick=()=>{const p=NT.PAL.find(x=>x[0]===b.dataset.thpal);["g","g2","g3","gold","gold2","bg"].forEach((k,j)=>{thDraft[k]=p[3+j];const i=main.querySelector(`[data-thc="${k}"]`);if(i)i.value=p[3+j]});thPost()});
  const rd=main.querySelector("[data-thrad]");if(rd)rd.oninput=()=>{thDraft.radius=+rd.value;$("#thRadO").textContent=rd.value;thPost()};
  main.querySelectorAll("[data-tht]").forEach(i=>i.oninput=()=>{thDraft[i.dataset.tht]=i.value;thPost()});
  const bindSecs=()=>{const ol=$("#thSecs");if(!ol)return;
    ol.querySelectorAll("[data-thsh]").forEach(c=>c.onchange=()=>{const k=c.dataset.thsh;thDraft.hide=c.checked?thDraft.hide.filter(x=>x!==k):[...thDraft.hide,k];ol.innerHTML=thSecsHTML(partLv("site.tpl"));bindSecs();thPost()});
    ol.querySelectorAll("[data-thmv]").forEach(b=>b.onclick=()=>{const i=+b.dataset.thmv,j=i+ +b.dataset.dir;const o=thDraft.order;[o[i],o[j]]=[o[j],o[i]];ol.innerHTML=thSecsHTML(partLv("site.tpl"));bindSecs();thPost()})};
  bindSecs();
  const un=main.querySelector("[data-thundo]");if(un)un.onclick=()=>{thDraft=NT.siteSpec(thBase);render()};
  const save=async pub=>{const d=await act("saveTheme",{kind:"site",theme:thPayload(),publish:pub},pub?"نُشر القالب على الموقع العام":"حُفظت المسودة");if(d){S.cfg.siteDraft=d.siteDraft;if(pub)S.cfg.siteTheme=d.siteTheme;thBase=thPayload();render()}};
  const sv=main.querySelector("[data-thsave]");if(sv)sv.onclick=()=>save(false);
  const pb=main.querySelector("[data-thpub]");if(pb)pb.onclick=()=>confirmBox("نشر القالب","سيظهر الموقع العام لزواره بهذا القالب فورًا.","نشر",()=>save(true));
}
/* ---------- مصفوفة صلاحيات الأجزاء (لكل مستخدم) ---------- */
let partsDraft=null;
function partsMatrixHTML(inThemes){
  const keys=Object.keys(PART_NAMES);
  const roleRows=`<div class="tw pm"><table><thead><tr><th>الجزء</th><th>مسؤول النظام</th><th>مساهم (افتراضي)</th><th>مشاهد (افتراضي)</th></tr></thead><tbody>${keys.map(k=>`<tr><td class="t">${esc(PART_NAMES[k])}</td><td class="pc ok"><span>${LV_NAMES[PART_MAX[k]]}</span></td><td class="pc ${PART_DEF.contributor[k]>=2?"ok":PART_DEF.contributor[k]?"part":"no"}"><span>${LV_NAMES[PART_DEF.contributor[k]]}</span></td><td class="pc ${PART_DEF.viewer[k]?"part":"no"}"><span>${LV_NAMES[PART_DEF.viewer[k]]}</span></td></tr>`).join("")}</tbody></table></div>`;
  if(!S.admin)return `<section class="box"><h3>صلاحيات الأجزاء <small>الموقع الإلكتروني والقوالب ومظهر النظام</small></h3>${roleRows}<p class="why">صلاحيتك أنت: ${keys.map(k=>`${esc(PART_NAMES[k])} «${LV_NAMES[partLv(k)]}»`).join("، ")}.</p></section>`;
  if(!usersCache){loadUsers();return `<div class="skel" style="height:260px"></div>`}
  const U=usersCache.filter(u=>u.org!=="*");
  if(!partsDraft)partsDraft=Object.fromEntries(U.map(u=>[u.username,Object.assign({},u.caps||{})]));
  const changed=U.filter(u=>JSON.stringify(partsDraft[u.username]||{})!==JSON.stringify(u.caps||{}));
  return `<section class="box"><h3>صلاحيات الأجزاء حسب الدور <small>القيم الافتراضية</small></h3>${roleRows}</section>
   <section class="box"><h3>صلاحيات الأجزاء لكل موظف <small>${U.length} حساب · ${keys.length} أجزاء</small></h3>
   <div class="tw pmx parts"><table><thead><tr><th>الموظف</th><th>الدور</th>${keys.map(k=>`<th>${esc(PART_NAMES[k])}</th>`).join("")}</tr></thead><tbody>
   ${U.map(u=>{const d=partsDraft[u.username]||{};const adm=u.role==="admin";return `<tr class="${changed.includes(u)?"chg":""}"><td class="t"><span class="uav sm">${esc(u.name.trim().charAt(0))}</span><span><b>${esc(u.name)}</b><small class="code">${esc(u.username)}</small></span></td><td>${esc(u.roleName||u.role)}</td>
     ${keys.map(k=>adm?`<td class="pc ok"><span>كامل</span></td>`:`<td><select data-pcap="${esc(u.username)}:${k}"><option value="">افتراضي (${LV_NAMES[(PART_DEF[u.role]||{})[k]||0]})</option>${LV_NAMES.slice(0,(u.role==="viewer"?1:PART_MAX[k])+1).map((n,i)=>`<option value="${i}" ${d[k]===i?"selected":""}>${n}</option>`).join("")}</select></td>`).join("")}</tr>`}).join("")}</tbody></table></div>
   <div class="flow" style="margin-top:12px"><button class="btn pri" data-pcapsave ${changed.length?"":"disabled"}>${ico("check")} حفظ التغييرات${changed.length?` (${changed.length})`:""}</button><button class="btn" data-pcapundo ${changed.length?"":"disabled"}>تراجع</button></div>
   <p class="why" style="margin-bottom:0">«لا يرى» يخفي وحدات ذلك الجزء من القوائم والتقارير. «اطلاع» يعرضها دون تعديل. «تعديل» يسمح بالإضافة والتعديل. «تعديل ونشر» في القوالب يسمح بنشر القالب على الموقع العام. كل ذلك يُفرض على الخادم، وصلاحية الإدارة (الموقع الإلكتروني) شرط قبلها.</p></section>`}
function bindPartsMatrix(main){
  main.querySelectorAll("[data-pcap]").forEach(e=>e.onchange=()=>{const [u,k]=e.dataset.pcap.split(":");const d=partsDraft[u]||(partsDraft[u]={});if(e.value==="")delete d[k];else d[k]=+e.value;render()});
  const un=main.querySelector("[data-pcapundo]");if(un)un.onclick=()=>{partsDraft=null;render()};
  const sv=main.querySelector("[data-pcapsave]");if(sv)sv.onclick=async()=>{sv.disabled=true;let n=0;
    for(const u of usersCache.filter(u=>JSON.stringify(partsDraft[u.username]||{})!==JSON.stringify(u.caps||{}))){try{await call("saveUser",{username:u.username,name:u.name,email:u.email,role:u.role,depts:u.depts,active:u.active,phone:u.phone,caps:partsDraft[u.username]||{}});n++}catch(e){if(e.code==="AUTH")return;toast(u.name+": "+e.message)}}
    toast(`حُفظت صلاحيات الأجزاء لـ${n} موظف`);partsDraft=null;usersCache=null;await loadUsers()};
}
