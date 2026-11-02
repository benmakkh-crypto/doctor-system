/* ================= المنصة: المؤسسات و«الكشاف» =================
 * المشرف العام (حساب org = '*') يرى كل المؤسسات، ويختار مؤسسة للعمل داخلها من أعلى الصفحة.
 */
const orgName=id=>id==="*"?"المنصة":(S.orgs||[]).find(o=>o.id===id)?.name||"المؤسسة الرئيسية";
const ORG_TYPES_UI=["جمعية خيرية","مؤسسة أهلية","جمعية تعاونية","جمعية مهنية","وقف","شركة غير ربحية","شركة","جهة حكومية","أخرى"];
const ORG_SECTORS_UI=["القطاع غير الربحي","القطاع الخاص","القطاع الحكومي","القطاع الوقفي"];
const ORG_AREAS_UI=["اجتماعي وأسري","إغاثي","صحي","تعليمي","ديني ودعوي","تحفيظ القرآن","تنموي وتمكين","إسكاني","بيئي","ثقافي","شبابي ورياضي","رعاية الأيتام","ذوي الإعاقة","كبار السن","المرأة والطفل","تقني","مهني","إعلامي"];
const areasOf=o=>String(o.areas||"").split(/[،,]/).map(x=>x.trim()).filter(Boolean);
const REGIONS=["منطقة الرياض","منطقة مكة المكرمة","منطقة المدينة المنورة","منطقة القصيم","المنطقة الشرقية","منطقة عسير","منطقة تبوك","منطقة حائل","منطقة الحدود الشمالية","منطقة جازان","منطقة نجران","منطقة الباحة","منطقة الجوف"];
const ORG_FORM=[
 ["البيانات الأساسية",[["name","اسم المؤسسة",1,"w"],["code","الرمز المختصر (إنجليزي)",1,"",'dir="ltr" maxlength="12" placeholder="مثال: BIRR"'],["license","رقم الترخيص"],["licenseExpiry","انتهاء الترخيص",0,"",'type="date"'],["founded","تاريخ التأسيس",0,"",'type="date"']]],
 ["التصنيف والهوية",[["sector","القطاع",0,"","select:"+ORG_SECTORS_UI.join("|")],["type","نوع الكيان",0,"","select:"+ORG_TYPES_UI.join("|")],["areas","مجالات العمل",0,"w","areas"],["vision","الرؤية",0,"w","textarea"],["mission","الرسالة",0,"w","textarea"],["goals","الأهداف (هدف في كل سطر)",0,"w","textarea"]]],
 ["الموقع والتواصل",[["region","المنطقة",0,"","select:"+REGIONS.join("|")],["city","المدينة"],["district","الحي"],["postal","الرمز البريدي",0,"",'dir="ltr" inputmode="numeric" maxlength="5"'],["address","العنوان الوطني",0,"w"],["mapUrl","رابط الموقع على خرائط Google",0,"w",'dir="ltr" placeholder="https://maps.google.com/…"'],["branches","الفروع والمواقع الأخرى (فرع في كل سطر)",0,"w","textarea"],["phone","الهاتف",0,"",'dir="ltr"'],["email","البريد الرسمي",0,"",'dir="ltr" type="email"'],["website","الموقع الإلكتروني",0,"w",'dir="ltr"']]],
 ["الإدارة",[["manager","المدير التنفيذي"],["managerPhone","جوال المدير",0,"",'dir="ltr"'],["managerEmail","بريد المدير",0,"",'dir="ltr" type="email"'],["chair","رئيس مجلس الإدارة"]]],
 ["البيانات المالية والأرقام",[["bank","البنك"],["iban","الآيبان",0,"",'dir="ltr" placeholder="SA…"'],["employees","عدد الموظفين",0,"",'inputmode="numeric"'],["beneficiaries","عدد المستفيدين",0,"",'inputmode="numeric"'],["notes","ملاحظات",0,"w","textarea"]]]];
const ORG_IMPORT_COLS=[["name","اسم المؤسسة"],["code","الرمز المختصر"],["sector","القطاع"],["type","نوع الكيان"],["areas","مجالات العمل"],["vision","الرؤية"],["mission","الرسالة"],["goals","الأهداف"],["district","الحي"],["postal","الرمز البريدي"],["mapUrl","رابط الخريطة"],["branches","الفروع والمواقع"],["license","رقم الترخيص"],["licenseExpiry","انتهاء الترخيص"],["founded","تاريخ التأسيس"],["region","المنطقة"],["city","المدينة"],["address","العنوان"],["phone","الهاتف"],["email","البريد الرسمي"],["website","الموقع الإلكتروني"],["manager","المدير التنفيذي"],["managerPhone","جوال المدير"],["managerEmail","بريد المدير"],["chair","رئيس مجلس الإدارة"],["bank","البنك"],["iban","الآيبان"],["employees","عدد الموظفين"],["beneficiaries","عدد المستفيدين"],["adminUsername","اسم مستخدم المسؤول"],["adminName","اسم المسؤول"],["adminEmail","بريد المسؤول"],["notes","ملاحظات"]];
/* ---------- مبدّل المؤسسة في الشريط العلوي ---------- */
function orgSwitcherHTML(){
  if(!S.platform)return "";
  const cur=S.scope==="*"?"كل المؤسسات":orgName(S.scope);const L=(S.orgs||[]);const q=(ui.orgq||"").trim();
  const list=L.filter(o=>!q||(o.name+" "+o.code+" "+(o.city||"")).includes(q));
  return `<div class="dd orgdd ${ddOpen==="org"?"open":""}" data-dd="org"><button class="tn orgbtn" data-ddb="org" aria-haspopup="true" aria-expanded="${ddOpen==="org"}">${ico("building")}<span class="lbl"><small>المؤسسة</small><b>${esc(cur)}</b></span>${ico("chev")}</button>
   <div class="ddp" role="menu"><div class="ddh"><b>اختر المؤسسة</b><small>${NF.format(L.length)} مؤسسة في المنصة</small></div>
    <div class="orgsrch"><input id="orgq" placeholder="ابحث بالاسم أو الرمز أو المدينة" value="${esc(q)}"></div>
    <button class="ddi ${S.scope==="*"?"cur":""}" data-setorg="*">${ico("grid")}<span class="dtx"><b>كل المؤسسات</b><small>عرض مجمّع للاطلاع والتقارير</small></span></button>
    ${list.slice(0,60).map(o=>`<button class="ddi ${S.scope===o.id?"cur":""}" data-setorg="${esc(o.id)}"><span class="dic" style="--dc:${o.status==="suspended"?"#cf3f3f":"#0e7a5f"}">${ico("building")}</span><span class="dtx"><b>${esc(o.name)}</b><small>${esc(o.code)}${o.city?" · "+esc(o.city):""}${o.status==="suspended"?" · موقوفة":""}</small></span></button>`).join("")}
    <a class="ddf" href="#orgs">${ico("search")} فتح الكشاف ‹</a></div></div>`;
}
async function setOrg(id){S.org=id;try{localStorage.setItem("ds.org",id)}catch(e){}ddOpen=null;S.loaded=false;navDraft=null;permDraft=null;usersCache=null;orgsCache=null;render();
  try{await loadAll();toast(id==="*"?"تعرض الآن كل المؤسسات":"تعمل الآن داخل: "+orgName(id));if(R.v!=="orgs")location.hash="home"}catch(e){}}
/* ---------- الكشاف ---------- */
let orgsCache=null;
async function loadOrgs(){try{orgsCache=await call("listOrgs");schedule()}catch(e){if(e.code!=="AUTH")toast(e.message)}}
function orgFiltered(){const q=(ui.oq||"").trim(),st=ui.ost||"",ty=ui.oty||"",rg=ui.org2||"",ar=ui.oar||"",sc=ui.osc||"";
  return (orgsCache||[]).filter(o=>(!q||[o.name,o.code,o.city,o.region,o.manager,o.license,o.areas,o.vision,o.mission,o.goals,o.branches].join(" ").includes(q))&&(!st||o.status===st)&&(!ty||o.type===ty)&&(!rg||o.region===rg)&&(!ar||areasOf(o).includes(ar))&&(!sc||o.sector===sc))}
function viewOrgs(){
  if(!S.platform)return `${crumb([["الكشاف"]])}<div class="tw"><div class="empty"><b>الكشاف للمشرف العام لمنصة نافذ</b></div></div>`;
  if(!orgsCache){loadOrgs();return `${crumb([["الكشاف"]])}<div class="skel" style="height:300px"></div>`}
  const O=orgsCache,L=orgFiltered();const sum=k=>O.reduce((a,o)=>a+(+o.stats[k]||0),0);
  const sel=ui.osel||(ui.osel=new Set());const view=ui.oview||"cards";
  const byCount=(k,list)=>{const m={};list.forEach(o=>{const v=o[k]||"غير محدد";m[v]=(m[v]||0)+1});const e=Object.entries(m).sort((a,b)=>b[1]-a[1]);return{labels:e.map(x=>x[0]),series:[{name:"عدد المؤسسات",values:e.map(x=>x[1])}]}};
  const top=[...O].sort((a,b)=>b.stats.records-a.stats.records).slice(0,10);
  REPORTS.orgs=()=>({title:"كشاف المؤسسات",subtitle:`${NF.format(L.length)} مؤسسة`,landscape:true,
    blocks:[{type:"kpis",items:[["المؤسسات",O.length],["النشطة",O.filter(o=>o.status==="active").length],["المستخدمون",sum("users")],["المعاملات",sum("records")]]},
     {type:"table",title:"المؤسسات",head:["الرمز","المؤسسة","النوع","المنطقة","المدينة","الترخيص","المدير","الجوال","المستخدمون","المعاملات","المفتوحة","المتأخرة","التبرعات هذا العام","آخر نشاط","الحالة"],
      rows:L.map(o=>[o.code,o.name,o.type||"",o.region||"",o.city||"",o.license||"",o.manager||"",o.managerPhone||"",o.stats.users,o.stats.records,o.stats.open,o.stats.late,o.stats.donations,o.stats.lastActivity?o.stats.lastActivity.slice(0,10):"—",o.status==="active"?"نشطة":"موقوفة"])}],
    sheets:[{name:"المؤسسات",head:[...ORG_IMPORT_COLS.filter(c=>!c[0].startsWith("admin")).map(c=>c[1]),"الحالة","المستخدمون","المعاملات","المفتوحة","المتأخرة","التبرعات هذا العام","المصروفات هذا العام","تاريخ الإضافة"],
      rows:L.map(o=>[...ORG_IMPORT_COLS.filter(c=>!c[0].startsWith("admin")).map(c=>o[c[0]]||""),o.status==="active"?"نشطة":"موقوفة",o.stats.users,o.stats.records,o.stats.open,o.stats.late,o.stats.donations,o.stats.expenses,(o.created||"").slice(0,10)])}]});
  const card=o=>`<article class="ocard ${o.status}" style="--dc:${o.status==="suspended"?"#cf3f3f":"#0e7a5f"}">
    <header><label class="check osel"><input type="checkbox" data-osel="${esc(o.id)}" ${sel.has(o.id)?"checked":""} aria-label="تحديد ${esc(o.name)}"></label><span class="oic">${ico("building")}</span><div><h3>${esc(o.name)}</h3><small><span class="code">${esc(o.code)}</span>${o.type?" · "+esc(o.type):""}${o.city?" · "+esc(o.city):""}</small></div><span class="badge tone-${o.status==="active"?"good":"bad"}">${o.status==="active"?"نشطة":"موقوفة"}</span></header>
    <div class="ostats"><div><b>${NF.format(o.stats.users)}</b><span>مستخدم</span></div><div><b>${NF.format(o.stats.records)}</b><span>معاملة</span></div><div><b>${NF.format(o.stats.open)}</b><span>مفتوحة</span></div><div class="${o.stats.late?"bad":""}"><b>${NF.format(o.stats.late)}</b><span>متأخرة</span></div></div>
    ${areasOf(o).length?`<div class="areas">${areasOf(o).map(a=>`<span>${esc(a)}</span>`).join("")}</div>`:""}
    ${o.vision?`<p class="ovis">${ico("eye")} ${esc(o.vision)}</p>`:""}
    <dl class="okv">${o.sector?`<dt>القطاع</dt><dd>${esc(o.sector)}</dd>`:""}${o.branches?`<dt>الفروع</dt><dd>${esc(o.branches.split(/\n+/).filter(Boolean).length)} فرع${o.mapUrl?` · <a href="${esc(o.mapUrl)}" target="_blank" rel="noopener">الخريطة</a>`:""}</dd>`:o.mapUrl?`<dt>الموقع</dt><dd><a href="${esc(o.mapUrl)}" target="_blank" rel="noopener">فتح الخريطة</a></dd>`:""}${o.manager?`<dt>المدير</dt><dd>${esc(o.manager)}${o.managerPhone?` <span class="code" dir="ltr">${esc(o.managerPhone)}</span>`:""}</dd>`:""}${o.license?`<dt>الترخيص</dt><dd>${esc(o.license)}${o.licenseExpiry?` · ينتهي ${dFmt(o.licenseExpiry)}`:""}</dd>`:""}<dt>التبرعات هذا العام</dt><dd>${money(o.stats.donations)}</dd><dt>آخر نشاط</dt><dd>${o.stats.lastActivity?ago(o.stats.lastActivity):"لا نشاط بعد"}</dd><dt>المسؤولون</dt><dd class="code">${esc(o.stats.admins.join("، ")||"—")}</dd></dl>
    <footer><button class="btn sm pri" data-setorg="${esc(o.id)}">${ico("login")} دخول المؤسسة</button><button class="btn sm" data-oprof="${esc(o.id)}">${ico("idCard")} الملف</button><button class="btn sm" data-oedit="${esc(o.id)}">تعديل</button><button class="btn sm warn" data-opw="${esc(o.id)}">${ico("key")} كلمة مرور المسؤول</button>
     <a class="btn sm" href="${esc((S.appUrl?S.appUrl+"?page=site&org=":"site/?org=")+o.code)}" target="_blank" rel="noopener">${ico("WEB")} موقعها</a>${o.id==="main"?"":`<button class="btn sm ${o.status==="active"?"danger":"ok"}" data-ostat="${esc(o.id)}" data-v="${o.status==="active"?"suspended":"active"}">${o.status==="active"?"إيقاف":"تفعيل"}</button>`}</footer></article>`;
  const table=`<div class="tw"><table><thead><tr><th><input type="checkbox" data-oselall ${L.length&&L.every(o=>sel.has(o.id))?"checked":""} aria-label="تحديد الكل"></th><th>المؤسسة</th><th>النوع</th><th>المدينة</th><th>المدير</th><th>المستخدمون</th><th>المعاملات</th><th>المفتوحة</th><th>المتأخرة</th><th>التبرعات</th><th>آخر نشاط</th><th>الحالة</th><th></th></tr></thead><tbody>
   ${L.map(o=>`<tr><td><input type="checkbox" data-osel="${esc(o.id)}" ${sel.has(o.id)?"checked":""}></td><td class="t">${esc(o.name)}<span class="code">${esc(o.code)}</span></td><td>${esc(o.type||"—")}</td><td>${esc(o.city||"—")}</td><td>${esc(o.manager||"—")}</td><td class="num">${o.stats.users}</td><td class="num">${o.stats.records}</td><td class="num">${o.stats.open}</td><td class="num">${o.stats.late}</td><td class="num">${money(o.stats.donations)}</td><td class="num">${o.stats.lastActivity?ago(o.stats.lastActivity):"—"}</td><td><span class="badge tone-${o.status==="active"?"good":"bad"}">${o.status==="active"?"نشطة":"موقوفة"}</span></td><td><span class="flow"><button class="btn sm pri" data-setorg="${esc(o.id)}">دخول</button><button class="btn sm" data-oedit="${esc(o.id)}">تعديل</button></span></td></tr>`).join("")}</tbody></table></div>`;
  const W=[
   {id:"o-kpis",title:"مؤشرات المنصة",span:12,html:`<div class="kgrid okgrid">${[["المؤسسات",O.length,"#0e7a5f","building"],["النشطة",O.filter(o=>o.status==="active").length,"#1f8a4c","check"],["الموقوفة",O.filter(o=>o.status!=="active").length,"#cf3f3f","xcircle"],["المستخدمون",sum("users"),"#3157b8","people"],["المعاملات",sum("records"),"#6d3fc0","list"],["المفتوحة",sum("open"),"#d9702a","spin"],["المتأخرة",sum("late"),"#cf3f3f","alert"],["التبرعات هذا العام",sum("donations"),"#b98a14","coins",1]].map(([l,v,c,i,m])=>`<div class="kt" style="--t:${c}"><span class="ki">${ico(i)}</span><small>${l}</small><b>${m?NFc.format(v):NF.format(v)}${m?" <i>ر.س</i>":""}</b></div>`).join("")}</div>`},
   {id:"o-region",title:"المؤسسات حسب المنطقة",span:6,html:chartCard("o-region","المؤسسات حسب المنطقة","توزيع جغرافي","visit","#0e7a5f",byCount("region",O),{type:"hbar",pal:"brand"})},
   {id:"o-type",title:"المؤسسات حسب النوع",span:6,html:chartCard("o-type","المؤسسات حسب نوع الكيان","","building","#6d3fc0",byCount("type",O),{type:"donut",pal:"brand"})},
   {id:"o-area",title:"المؤسسات حسب مجالات العمل",span:6,html:chartCard("o-area","المؤسسات حسب مجالات العمل","المؤسسة قد تعمل في أكثر من مجال","star","#d9702a",(()=>{const m={};O.forEach(o=>areasOf(o).forEach(a=>m[a]=(m[a]||0)+1));const e=Object.entries(m).sort((a,b)=>b[1]-a[1]);return{labels:e.map(x=>x[0]),series:[{name:"المؤسسات",values:e.map(x=>x[1])}]}})(),{type:"bar",pal:"vivid"})},
   {id:"o-sector",title:"المؤسسات حسب القطاع",span:6,html:chartCard("o-sector","المؤسسات حسب القطاع","","grid","#3157b8",byCount("sector",O),{type:"pie",pal:"cool"})},
   {id:"o-activity",title:"الأكثر نشاطًا",span:6,html:chartCard("o-activity","الأكثر نشاطًا","عدد المعاملات في كل مؤسسة","activity","#3157b8",{labels:top.map(o=>o.name),series:[{name:"المعاملات",values:top.map(o=>o.stats.records)}],links:top.map(o=>"#orgs")},{type:"bar",pal:"cool"})},
   {id:"o-don",title:"التبرعات حسب المؤسسة",span:6,html:chartCard("o-don","التبرعات حسب المؤسسة","المعتمد هذا العام","coins","#b98a14",{labels:O.map(o=>o.name),series:[{name:"التبرعات",values:O.map(o=>o.stats.donations)}],money:true},{type:"treemap",pal:"warm",sort:"desc"})},
   {id:"o-list",title:"دليل المؤسسات",span:12,html:`<section class="box"><h3>دليل المؤسسات <small>${NF.format(L.length)} من ${NF.format(O.length)}</small></h3>
     <div class="filters"><input id="oq" type="search" placeholder="ابحث بالاسم أو الرمز أو المدينة أو المدير أو الترخيص" value="${esc(ui.oq||"")}">
      <select id="ost"><option value="">كل الحالات</option><option value="active" ${ui.ost==="active"?"selected":""}>نشطة</option><option value="suspended" ${ui.ost==="suspended"?"selected":""}>موقوفة</option></select>
      <select id="oty"><option value="">كل الأنواع</option>${ORG_TYPES_UI.map(t=>`<option ${ui.oty===t?"selected":""}>${t}</option>`).join("")}</select>
      <select id="org2"><option value="">كل المناطق</option>${REGIONS.map(t=>`<option ${ui.org2===t?"selected":""}>${t}</option>`).join("")}</select>
      <select id="oar"><option value="">كل المجالات</option>${ORG_AREAS_UI.map(t=>`<option ${ui.oar===t?"selected":""}>${t}</option>`).join("")}</select>
      <select id="osc"><option value="">كل القطاعات</option>${ORG_SECTORS_UI.map(t=>`<option ${ui.osc===t?"selected":""}>${t}</option>`).join("")}</select>
      <div class="seg"><button data-oview="cards" class="${view==="cards"?"on":""}">بطاقات</button><button data-oview="table" class="${view==="table"?"on":""}">جدول</button></div></div>
     ${sel.size?`<div class="banner">${NF.format(sel.size)} مؤسسة محددة <button class="btn sm warn" data-obulkpw>${ico("key")} إصدار كلمات مرور لمسؤوليها</button><button class="btn sm" data-oselclear>إلغاء التحديد</button></div>`:""}
     ${L.length?(view==="table"?table:`<div class="ogrid">${L.map(card).join("")}</div>`):`<div class="tw"><div class="empty"><b>لا مؤسسات مطابقة</b></div></div>`}</section>`}];
  return `${crumb([["الكشاف"]])}
   <div class="head"><div><h1>الكشاف: دليل المؤسسات</h1><p>كل مؤسسة تعمل في نافذ بحساباتها وبياناتها المنفصلة، وأنت تراها جميعًا من هنا.</p></div>
    <div class="actions"><button class="btn pri" data-onew>${ico("building")} مؤسسة جديدة</button><button class="btn" data-oimport>${ico("down")} استيراد من Excel</button><button class="btn" data-otpl>نموذج الاستيراد</button>${repBtn("orgs")}</div></div>
   ${layoutPage("orgs",W)}`;
}
function bindOrgs(main){
  main.querySelectorAll("[data-setorg]").forEach(b=>b.onclick=e=>{e.stopPropagation();setOrg(b.dataset.setorg)});
  if(R.v!=="orgs")return;
  const re=()=>{render()};
  const oq=$("#oq");if(oq)oq.oninput=()=>{ui.oq=oq.value;re()};
  [["#ost","ost"],["#oty","oty"],["#org2","org2"],["#oar","oar"],["#osc","osc"]].forEach(([s,k])=>{const e=$(s);if(e)e.onchange=()=>{ui[k]=e.value;re()}});
  main.querySelectorAll("[data-oview]").forEach(b=>b.onclick=()=>{ui.oview=b.dataset.oview;re()});
  main.querySelectorAll("[data-osel]").forEach(c=>c.onchange=()=>{c.checked?ui.osel.add(c.dataset.osel):ui.osel.delete(c.dataset.osel);re()});
  const all=main.querySelector("[data-oselall]");if(all)all.onchange=()=>{orgFiltered().forEach(o=>all.checked?ui.osel.add(o.id):ui.osel.delete(o.id));re()};
  const cl=main.querySelector("[data-oselclear]");if(cl)cl.onclick=()=>{ui.osel.clear();re()};
  const nw=main.querySelector("[data-onew]");if(nw)nw.onclick=()=>orgDialog(null);
  main.querySelectorAll("[data-oedit]").forEach(b=>b.onclick=()=>orgDialog(orgsCache.find(o=>o.id===b.dataset.oedit)));
  main.querySelectorAll("[data-oprof]").forEach(b=>b.onclick=()=>orgProfile(orgsCache.find(o=>o.id===b.dataset.oprof)));
  main.querySelectorAll("[data-ostat]").forEach(b=>b.onclick=()=>{const o=orgsCache.find(x=>x.id===b.dataset.ostat);const stop=b.dataset.v==="suspended";
    confirmBox(stop?"إيقاف المؤسسة":"تفعيل المؤسسة",stop?`سيتوقف دخول كل مستخدمي «${o.name}» فورًا، وتبقى بياناتهم محفوظة.`:`سيعود دخول مستخدمي «${o.name}».`,stop?"إيقاف":"تفعيل",async()=>{const d=await act("setOrgStatus",{id:o.id,status:b.dataset.v},stop?"أُوقفت المؤسسة":"فُعّلت المؤسسة");if(d){orgsCache=null;await refreshOrgs()}})});
  main.querySelectorAll("[data-opw]").forEach(b=>b.onclick=()=>{const o=orgsCache.find(x=>x.id===b.dataset.opw);const un=o.stats.admins[0];if(!un){toast("لا يوجد مسؤول لهذه المؤسسة");return}
    resetPw({username:un,name:"مسؤول "+o.name,email:o.managerEmail||""})});
  const bp=main.querySelector("[data-obulkpw]");if(bp)bp.onclick=()=>{const L=orgsCache.filter(o=>ui.osel.has(o.id));const users=L.flatMap(o=>o.stats.admins);
    modal(`<div class="dh"><h2>${ico("key")} إصدار كلمات مرور لمسؤولي ${NF.format(L.length)} مؤسسة</h2><button class="x" data-close aria-label="إغلاق">✕</button></div>
     <div class="db"><p style="margin-top:0">ستُصدر كلمة مرور مؤقتة جديدة لكل مسؤول (${NF.format(users.length)} حساب)، وتُلغى كلماتهم الحالية، ويُطلب منهم تغييرها عند أول دخول.</p>
     <label class="check"><input type="checkbox" id="bpMail" checked>إرسال الرابط واسم المستخدم وكلمة المرور إلى بريد كل مسؤول تلقائيًا</label></div>
     <div class="df"><button class="btn pri" id="bpGo">${ico("key")} إصدار</button><button class="btn" data-close>إلغاء</button></div>`,"sm");
    $("#bpGo").onclick=async()=>{$("#bpGo").disabled=true;try{const d=await call("bulkResetPasswords",{usernames:users,sendEmail:$("#bpMail").checked});closeModal();credsResult("كلمات المرور الجديدة",d.items.map(i=>({name:i.org,code:i.code,username:i.username,password:i.password,email:i.email,emailed:i.emailed})))}catch(e){toast(e.message);$("#bpGo").disabled=false}}};
  const tp=main.querySelector("[data-otpl]");if(tp)tp.onclick=()=>exportXlsx("نموذج استيراد المؤسسات",[{name:"المؤسسات",head:ORG_IMPORT_COLS.map(c=>c[1]),rows:[["جمعية البر الخيرية (مثال)","BIRR","جمعية خيرية","1234","2027-12-31","2010-05-01","منطقة المدينة المنورة","المدينة المنورة","حي قباء","0148000000","info@example.org","https://example.org","أ. خالد العتيبي","0551234567","manager@example.org","د. سعد الحربي","البنك الأهلي","SA0380000000608010167519","18","640","birr.admin","أ. خالد العتيبي","manager@example.org",""]]}]);
  const im=main.querySelector("[data-oimport]");if(im)im.onclick=()=>importOrgsDialog();
}
async function refreshOrgs(){await loadAll();await loadOrgs()}
function orgDialog(o){
  const isNew=!o;o=o||{type:"جمعية خيرية"};
  const fld=([k,l,req,w,ex])=>{ex=ex||"";const v=o[k]||"";
    if(ex.startsWith("select:"))return `<label data-f="${k}" class="${w||""}">${l}${req?' <span class="req">*</span>':""}<select id="of_${k}"><option value="">— اختر —</option>${ex.slice(7).split("|").map(x=>`<option ${v===x?"selected":""}>${x}</option>`).join("")}</select><span class="msg" hidden></span></label>`;
    if(ex==="textarea")return `<label data-f="${k}" class="${w||""}">${l}<textarea id="of_${k}" maxlength="2000">${esc(v)}</textarea><span class="msg" hidden></span></label>`;
    if(ex==="areas"){const cur=areasOf(o);return `<fieldset class="w areapick" data-f="${k}"><legend>${l}</legend>${ORG_AREAS_UI.map(a=>`<label class="achip"><input type="checkbox" value="${a}" ${cur.includes(a)?"checked":""}><span>${a}</span></label>`).join("")}<input type="hidden" id="of_${k}"></fieldset>`}
    return `<label data-f="${k}" class="${w||""}">${l}${req?' <span class="req">*</span>':""}<input id="of_${k}" value="${esc(v)}" ${ex}><span class="msg" hidden></span></label>`};
  modal(`<div class="dh"><h2>${ico("building")} ${isNew?"إضافة مؤسسة إلى نافذ":"تعديل بيانات "+esc(o.name)}</h2><button class="x" data-close aria-label="إغلاق">✕</button></div>
   <form id="orgF" novalidate><div class="db"><div class="form">
    ${ORG_FORM.map(([t,fs])=>`<div class="sep">${esc(t)}</div>${fs.map(fld).join("")}`).join("")}
    ${isNew?`<div class="sep">${ico("key")} حساب مسؤول المؤسسة</div>
     <label data-f="adminUsername">اسم المستخدم<input id="of_adminUsername" dir="ltr" placeholder="تلقائي: الرمز.admin" maxlength="30"><span class="hint">حروف إنجليزية صغيرة وأرقام و . _ -</span><span class="msg" hidden></span></label>
     <label data-f="adminName">اسم المسؤول<input id="of_adminName" placeholder="تلقائي: المدير التنفيذي" maxlength="80"><span class="msg" hidden></span></label>
     <label data-f="adminEmail" class="w">بريد المسؤول (تُرسل إليه بيانات الدخول)<input id="of_adminEmail" dir="ltr" type="email" placeholder="تلقائي: بريد المدير أو البريد الرسمي"><span class="msg" hidden></span></label>
     ${pwBlock().replace('<label data-f="password"','<label data-f="adminPassword"')}
     <label class="check w"><input id="of_mail" type="checkbox" checked>إرسال رابط النظام واسم المستخدم وكلمة المرور إلى بريد المسؤول تلقائيًا</label>`:""}
   </div></div><div class="df"><button class="btn pri" type="submit" id="ofBtn">${isNew?"إضافة المؤسسة وإنشاء حسابها":"حفظ"}</button><button class="btn" type="button" data-close>إلغاء</button></div></form>`,"");
  const getPw=isNew?bindPwBlock():null;
  $("#orgF").onsubmit=async e=>{e.preventDefault();
    document.querySelectorAll("#orgF label[data-f]").forEach(l=>{l.classList.remove("err");const m=l.querySelector(".msg");if(m)m.hidden=true});
    $("#of_areas").value=[...document.querySelectorAll(".areapick input:checked")].map(x=>x.value).join("، ");
    const p={};ORG_FORM.forEach(([,fs])=>fs.forEach(([k])=>{p[k]=$("#of_"+k).value.trim()}));if(!isNew)p.id=o.id;
    if(isNew){p.adminUsername=$("#of_adminUsername").value.trim().toLowerCase();p.adminName=$("#of_adminName").value.trim();p.adminEmail=$("#of_adminEmail").value.trim();const pw=getPw();p.adminPassword=pw.password;p.adminMustChange=pw.mustChange;p.sendEmail=$("#of_mail").checked}
    $("#ofBtn").disabled=true;
    try{const d=await call("saveOrg",p);closeModal();orgsCache=null;await refreshOrgs();
      if(d.admin)credsResult("أُضيفت «"+d.org.name+"»",[{name:d.org.name,code:d.org.code,username:d.admin.username,password:d.admin.password,email:d.admin.email,emailed:d.admin.emailed}]);else toast("حُفظت بيانات المؤسسة")}
    catch(err){$("#ofBtn").disabled=false;if(err.code==="AUTH")return;const f=err.field==="password"?"adminPassword":err.field;const l=f&&document.querySelector(`#orgF label[data-f="${f}"]`);
      if(l){l.classList.add("err");const m=l.querySelector(".msg");if(m){m.textContent=err.message;m.hidden=false}l.scrollIntoView({block:"center"})}else toast(err.message)}};
}
/** نتيجة إنشاء الحسابات: جدول بيانات الدخول مع نسخ وتصدير Excel ومشاركة. */
function credsResult(title,items,errors){
  const url=S.appUrl||location.href.split("#")[0];
  const txt=it=>`بيانات الدخول إلى منصة نافذ — ${it.name}\nالرابط: ${url}\nاسم المستخدم: ${it.username}\nكلمة المرور المؤقتة: ${it.password}\nسيُطلب منك تغييرها عند أول دخول.`;
  modal(`<div class="dh ok"><h2>${ico("check")} ${esc(title)}</h2><button class="x" data-close aria-label="إغلاق">✕</button></div>
   <div class="db"><p style="margin-top:0">${NF.format(items.length)} حساب جاهز.${items.some(i=>i.emailed)?` أُرسلت بيانات ${NF.format(items.filter(i=>i.emailed).length)} حساب إلى بريد أصحابها تلقائيًا.`:""} كلمات المرور لن تظهر مرة أخرى؛ صدّرها الآن إن احتجت.</p>
    <div class="tw"><table><thead><tr><th>المؤسسة</th><th>اسم المستخدم</th><th>كلمة المرور</th><th>البريد</th><th></th></tr></thead><tbody>
     ${items.map((it,i)=>`<tr><td class="t">${esc(it.name)}<span class="code">${esc(it.code||"")}</span></td><td class="code" dir="ltr">${esc(it.username)}</td><td class="code" dir="ltr"><b>${esc(it.password)}</b></td><td>${it.emailed?`<span class="badge tone-good">أُرسلت إلى ${esc(it.email)}</span>`:it.email?`<span class="badge tone-warn">لم تُرسل</span>`:`<small>لا بريد</small>`}</td><td><span class="flow"><button class="btn sm" data-cpi="${i}">نسخ</button><a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(txt(it))}">${ico("whats")}</a></span></td></tr>`).join("")}</tbody></table></div>
    ${errors&&errors.length?`<h3 style="color:var(--bad);font-size:14px">صفوف لم تُضف (${errors.length})</h3><div class="tw"><table><thead><tr><th>الصف</th><th>المؤسسة</th><th>السبب</th></tr></thead><tbody>${errors.map(e=>`<tr><td class="num">${e.row}</td><td>${esc(e.name||"—")}</td><td>${esc(e.message)}</td></tr>`).join("")}</tbody></table></div>`:""}
   </div><div class="df"><button class="btn pri" id="crX">${ico("grid")} تصدير Excel</button><button class="btn" id="crP">${ico("doc")} طباعة</button><button class="btn" data-close>تم</button></div>`,"");
  document.querySelectorAll("[data-cpi]").forEach(b=>b.onclick=()=>copyFallback(txt(items[+b.dataset.cpi]),"بيانات الدخول"));
  const head=["المؤسسة","الرمز","اسم المستخدم","كلمة المرور","البريد","أُرسلت بالبريد","الرابط"];const rows=items.map(i=>[i.name,i.code||"",i.username,i.password,i.email||"",i.emailed?"نعم":"لا",url]);
  $("#crX").onclick=()=>exportXlsx("بيانات دخول المؤسسات",[{name:"بيانات الدخول",head,rows},...(errors&&errors.length?[{name:"مرفوضة",head:["الصف","المؤسسة","السبب"],rows:errors.map(e=>[e.row,e.name||"",e.message])}]:[])]);
  $("#crP").onclick=()=>printReport({title:"بيانات دخول المؤسسات",subtitle:"سرّي: يُسلَّم لأصحابه فقط",blocks:[{type:"table",head,rows}],sign:false});
}
function importOrgsDialog(){
  modal(`<div class="dh"><h2>${ico("down")} استيراد المؤسسات من Excel</h2><button class="x" data-close aria-label="إغلاق">✕</button></div>
   <div class="db"><ol class="steps"><li>نزّل <a href="#" id="impTpl">نموذج الاستيراد</a> واملأ صفًا لكل مؤسسة. العمودان «اسم المؤسسة» و«الرمز المختصر» إلزاميان.</li><li>اختر الملف (xlsx أو csv).</li><li>راجع المعاينة ثم اضغط «استيراد». تُنشأ لكل مؤسسة حساب مسؤول بكلمة مرور تلقائية.</li></ol>
    <label class="btn" style="display:inline-flex">${ico("doc")} اختيار الملف<input id="impF" type="file" accept=".xlsx,.xls,.csv" hidden></label>
    <div id="impPrev"></div></div>
   <div class="df"><label class="check"><input type="checkbox" id="impMail" checked>إرسال بيانات الدخول إلى بريد كل مسؤول</label><button class="btn pri" id="impGo" disabled>استيراد</button><button class="btn" data-close>إلغاء</button></div>`,"");
  $("#impTpl").onclick=e=>{e.preventDefault();document.querySelector("[data-otpl]")?.click()};
  let rows=[];
  $("#impF").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const A=await readSheetFile(f);
    let hi=A.findIndex(r=>r.some(c=>String(c).trim()==="اسم المؤسسة"||String(c).trim()==="name"));if(hi<0)hi=0;const H=A[hi].map(c=>String(c).trim());
    const map=H.map(h=>{const c=ORG_IMPORT_COLS.find(x=>x[1]===h||x[0]===h);return c?c[0]:null});
    rows=A.slice(hi+1).filter(r=>r.some(c=>String(c).trim())).map(r=>{const o={};map.forEach((k,i)=>{if(k)o[k]=String(r[i]??"").trim()});return o});
    const bad=rows.filter(r=>!r.name||!r.code).length;
    $("#impPrev").innerHTML=`<p><b>${NF.format(rows.length)}</b> صف${bad?` · <span style="color:var(--bad)">${bad} بلا اسم أو رمز</span>`:""} · الأعمدة المعروفة: ${map.filter(Boolean).length} من ${H.length}</p>
     <div class="tw" style="max-height:260px;overflow:auto"><table><thead><tr><th>#</th><th>اسم المؤسسة</th><th>الرمز</th><th>المدينة</th><th>المدير</th><th>بريد المسؤول</th></tr></thead><tbody>${rows.slice(0,200).map((r,i)=>`<tr class="${!r.name||!r.code?"pri2":""}"><td class="num">${i+1}</td><td>${esc(r.name||"—")}</td><td class="code">${esc(r.code||"—")}</td><td>${esc(r.city||"")}</td><td>${esc(r.manager||"")}</td><td class="code">${esc(r.adminEmail||r.managerEmail||r.email||"")}</td></tr>`).join("")}</tbody></table></div>`;
    $("#impGo").disabled=!rows.length}catch(err){toast("تعذّرت قراءة الملف. استخدم نموذج الاستيراد بصيغة xlsx أو csv.")}};
  $("#impGo").onclick=async()=>{$("#impGo").disabled=true;$("#impGo").textContent="جارٍ الاستيراد…";
    try{const d=await call("importOrgs",{rows:rows.slice(0,500),sendEmail:$("#impMail").checked});closeModal();orgsCache=null;await refreshOrgs();
      credsResult(`استيراد المؤسسات: أُضيفت ${NF.format(d.done.length)}`,d.done.map(x=>({name:x.name,code:x.code,username:x.username,password:x.password,email:x.email,emailed:x.emailed})),d.errors)}
    catch(e){toast(e.message);$("#impGo").disabled=false;$("#impGo").textContent="استيراد"}};
}

/** ملف المؤسسة الكامل: الهوية والتصنيف والأهداف والمواقع والإحصاءات، مع طباعة وتصدير. */
function orgProfile(o){
  const kv=(t,items)=>`<section class="pf"><h3>${t}</h3><dl class="kv">${items.filter(x=>x[1]).map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join("")||"<dd class='muted'>لا بيانات.</dd>"}</dl></section>`;
  const lines=t=>String(t||"").split(/\n+/).filter(Boolean);
  modal(`<div class="dh"><h2>${ico("building")} ${esc(o.name)}</h2><button class="x" data-close aria-label="إغلاق">✕</button></div>
   <div class="db pfbody">
    <div class="pfhero"><span class="oic">${ico("building")}</span><div><b>${esc(o.name)}</b><small><span class="code">${esc(o.code)}</span> · ${esc([o.sector,o.type,o.city].filter(Boolean).join(" · "))}</small>${areasOf(o).length?`<div class="areas">${areasOf(o).map(a=>`<span>${esc(a)}</span>`).join("")}</div>`:""}</div><span class="badge tone-${o.status==="active"?"good":"bad"}">${o.status==="active"?"نشطة":"موقوفة"}</span></div>
    ${o.vision||o.mission?`<div class="vm2">${o.vision?`<div><b>${ico("eye")} الرؤية</b><p>${esc(o.vision)}</p></div>`:""}${o.mission?`<div><b>${ico("flag")} الرسالة</b><p>${esc(o.mission)}</p></div>`:""}</div>`:""}
    ${lines(o.goals).length?`<section class="pf"><h3>الأهداف</h3><ol class="goals">${lines(o.goals).map(g=>`<li>${esc(g)}</li>`).join("")}</ol></section>`:""}
    <div class="grid2">${kv("الترخيص والتأسيس",[["رقم الترخيص",esc(o.license||"")],["انتهاء الترخيص",o.licenseExpiry?dFmt(o.licenseExpiry):""],["التأسيس",o.founded?dFmt(o.founded):""],["رئيس مجلس الإدارة",esc(o.chair||"")]])}
     ${kv("الإدارة والتواصل",[["المدير التنفيذي",esc(o.manager||"")],["جوال المدير",o.managerPhone?`<span dir="ltr">${esc(o.managerPhone)}</span>`:""],["بريد المدير",esc(o.managerEmail||"")],["الهاتف",o.phone?`<span dir="ltr">${esc(o.phone)}</span>`:""],["البريد",esc(o.email||"")],["الموقع",o.website?`<a href="${esc(o.website)}" target="_blank" rel="noopener">${esc(o.website)}</a>`:""]])}
     ${kv("الموقع الجغرافي",[["المنطقة",esc(o.region||"")],["المدينة",esc(o.city||"")],["الحي",esc(o.district||"")],["الرمز البريدي",esc(o.postal||"")],["العنوان",esc(o.address||"")],["الخريطة",o.mapUrl?`<a href="${esc(o.mapUrl)}" target="_blank" rel="noopener">فتح على الخريطة</a>`:""]])}
     ${kv("الأرقام",[["الموظفون",o.employees?NF.format(o.employees):""],["المستفيدون",o.beneficiaries?NF.format(o.beneficiaries):""],["المستخدمون في نافذ",NF.format(o.stats.users)],["المعاملات",NF.format(o.stats.records)],["المفتوحة",NF.format(o.stats.open)],["التبرعات هذا العام",money(o.stats.donations)],["البنك",esc(o.bank||"")],["الآيبان",o.iban?`<span dir="ltr" class="code">${esc(o.iban)}</span>`:""]])}</div>
    ${lines(o.branches).length?`<section class="pf"><h3>الفروع والمواقع</h3><ul class="branches">${lines(o.branches).map(b=>`<li>${ico("visit")} ${esc(b)}</li>`).join("")}</ul></section>`:""}
    ${o.notes?`<section class="pf"><h3>ملاحظات</h3><p style="white-space:pre-line;margin:0">${esc(o.notes)}</p></section>`:""}
   </div><div class="df"><button class="btn pri" data-setorg="${esc(o.id)}">${ico("login")} دخول المؤسسة</button><button class="btn" id="pfP">${ico("doc")} طباعة / PDF</button><button class="btn" id="pfX">${ico("grid")} Excel</button><button class="btn" data-close>إغلاق</button></div>`,"");
  document.querySelectorAll("#modalRoot [data-setorg]").forEach(b=>b.onclick=()=>{closeModal();setOrg(b.dataset.setorg)});
  const items=ORG_IMPORT_COLS.filter(c=>!c[0].startsWith("admin")).map(c=>[c[1],o[c[0]]||""]).filter(x=>x[1]);
  const st=[["المستخدمون",o.stats.users],["المعاملات",o.stats.records],["المفتوحة",o.stats.open],["المتأخرة",o.stats.late],["التبرعات هذا العام",o.stats.donations],["المصروفات هذا العام",o.stats.expenses]];
  $("#pfP").onclick=()=>printReport({title:"ملف مؤسسة: "+o.name,subtitle:[o.sector,o.type,o.city].filter(Boolean).join(" · "),blocks:[{type:"kv",title:"البيانات",items},{type:"kpis",items:st.slice(0,4)},{type:"table",title:"الإحصاءات في نافذ",head:["المؤشر","القيمة"],rows:st}]});
  $("#pfX").onclick=()=>exportXlsx("ملف مؤسسة "+o.name,[{name:"البيانات",head:["البند","القيمة"],rows:items},{name:"الإحصاءات",head:["المؤشر","القيمة"],rows:st}]);
}
