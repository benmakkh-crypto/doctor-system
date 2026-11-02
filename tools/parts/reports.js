/* ================= التقارير: Excel وطباعة وPDF لكل جزء =================
 * exportXlsx: ملف Excel حقيقي (xlsx) من اليمين إلى اليسار عبر مكتبة SheetJS، ويرجع إلى CSV إن تعذّر تحميلها.
 * printReport: تقرير رسمي بترويسة الجهة وتاريخين وجدول وتوقيعات؛ يُطبع أو يُحفظ PDF من نافذة الطباعة.
 */
let XLSX_P=null;
function xlsxLib(){if(window.XLSX)return Promise.resolve(window.XLSX);if(XLSX_P)return XLSX_P;
  XLSX_P=new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=()=>window.XLSX?res(window.XLSX):rej();s.onerror=()=>{XLSX_P=null;rej()};document.head.appendChild(s)});return XLSX_P}
const fileSafe=t=>String(t||"تقرير").replace(/[\\/:*?"<>|]+/g,"-").slice(0,80);
async function exportXlsx(title,sheets){
  const orgN=S.cfg.orgName||"نافذ";const stamp=todayISO();
  try{const X=await xlsxLib();const wb=X.utils.book_new();wb.Workbook={Views:[{RTL:true}]};
    sheets.forEach((sh,k)=>{const aoa=[[title],[orgN+" · "+hFmt(stamp)+" · "+dFmt(stamp)],[],sh.head,...sh.rows];
      const ws=X.utils.aoa_to_sheet(aoa);ws["!cols"]=sh.head.map((h,i)=>({wch:Math.min(48,Math.max(10,String(h).length+2,...sh.rows.slice(0,200).map(r=>String(r[i]??"").length+2)))}));
      ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:Math.max(0,sh.head.length-1)}},{s:{r:1,c:0},e:{r:1,c:Math.max(0,sh.head.length-1)}}];ws["!views"]=[{RTL:true}];
      X.utils.book_append_sheet(wb,ws,String(sh.name||"ورقة"+(k+1)).replace(/[\[\]*?\/\\:]/g,"").slice(0,31))});
    X.writeFile(wb,`${fileSafe(title)}-${stamp}.xlsx`);toast("نُزّل ملف Excel")}
  catch(e){const sh=sheets[0];saveFile(`${fileSafe(title)}-${stamp}.csv`,"﻿"+[sh.head,...sh.rows].map(r=>r.map(csvCell).join(",")).join("\r\n"),"ملف Excel (CSV)")}
}
async function readSheetFile(file){
  const name=file.name.toLowerCase();
  if(name.endsWith(".csv")){const t=await file.text();const L=t.replace(/^﻿/,"").split(/\r?\n/).filter(x=>x.trim());const parse=l=>{const o=[];let c="",q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(q){if(ch==='"'&&l[i+1]==='"'){c+='"';i++}else if(ch==='"')q=false;else c+=ch}else if(ch===",") {o.push(c);c=""}else if(ch==='"')q=true;else c+=ch}o.push(c);return o};return L.map(parse)}
  const X=await xlsxLib();const wb=X.read(await file.arrayBuffer(),{type:"array"});return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:""});
}
function printReport(spec){
  const org=S.cfg.orgName||"منصة نافذ";const now=new Date();const iso=todayISO();
  const tbl=b=>`<table><thead><tr>${b.head.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${esc(typeof c==="number"?NF.format(c):c)}</td>`).join("")}</tr>`).join("")}</tbody>${b.foot?`<tfoot><tr>${b.foot.map(c=>`<td>${esc(typeof c==="number"?NF.format(c):c)}</td>`).join("")}</tr></tfoot>`:""}</table>`;
  const blk=b=>b.type==="table"?(b.title?`<h3>${esc(b.title)}</h3>`:"")+(b.rows.length?tbl(b):`<p class="muted">لا توجد بيانات.</p>`)
    :b.type==="kpis"?`<div class="kp">${b.items.map(([l,v])=>`<div><b>${esc(typeof v==="number"?NF.format(v):v)}</b><span>${esc(l)}</span></div>`).join("")}</div>`
    :b.type==="kv"?`${b.title?`<h3>${esc(b.title)}</h3>`:""}<table class="kv">${b.items.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`
    :b.type==="chart"?`<div class="ch">${b.html}</div>`:b.type==="text"?`${b.title?`<h3>${esc(b.title)}</h3>`:""}<p class="txt">${esc(b.text)}</p>`:b.html||"";
  const css=`@page{size:A4 ${spec.landscape?"landscape":"portrait"};margin:14mm 12mm 16mm}*{box-sizing:border-box}body{font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;color:#13211d;margin:0;font-size:11.5px;direction:rtl}
   .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0e4d3f;padding-bottom:10px;margin-bottom:6px}.hd .o{display:flex;gap:10px;align-items:center}.hd svg{width:46px;height:46px}.hd b{font-size:17px;display:block;color:#0e4d3f}.hd small{color:#5b6b66}
   .hd .d{text-align:left;font-size:11px;color:#5b6b66;line-height:1.7}.gold{height:3px;background:#deb24e;margin:-6px 0 14px}
   h1{font-size:19px;margin:0 0 4px;color:#0e4d3f}.sub{color:#5b6b66;margin:0 0 12px}h3{font-size:13px;margin:16px 0 6px;color:#0e4d3f;border-inline-start:4px solid #deb24e;padding-inline-start:8px}
   table{width:100%;border-collapse:collapse;margin:4px 0 8px;page-break-inside:auto}tr{page-break-inside:avoid}th{background:#0e4d3f;color:#fff;font-weight:600;padding:6px 7px;text-align:right;font-size:10.5px}td{padding:5px 7px;border-bottom:1px solid #e3e9e6;vertical-align:top}tbody tr:nth-child(even) td{background:#f5f8f7}
   tfoot td{font-weight:700;background:#fbf4e3;border-top:2px solid #deb24e}table.kv th{width:32%;background:#eef3f1;color:#13211d}
   .kp{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.kp div{border:1px solid #dfe7e3;border-top:3px solid #0e4d3f;border-radius:6px;padding:8px;text-align:center}.kp b{display:block;font-size:17px;color:#0e4d3f}.kp span{color:#5b6b66;font-size:10.5px}
   .ch{border:1px solid #e3e9e6;border-radius:8px;padding:8px;margin:8px 0;max-height:360px;overflow:hidden}.ch svg{width:100%;max-height:330px}.ch text{font-size:10px;fill:#5b6b66}.ch .grid{stroke:#e3e9e6}
   .muted{color:#5b6b66}.txt{white-space:pre-line}.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:34px;page-break-inside:avoid}.sig div{border-top:1px solid #13211d;padding-top:6px;text-align:center;color:#5b6b66}
   .ft{position:fixed;bottom:-10mm;inset-inline:0;display:flex;justify-content:space-between;font-size:9.5px;color:#7a8a85;border-top:1px solid #e3e9e6;padding-top:3px}`;
  const seal=`<svg viewBox="0 0 40 40"><g fill="none" stroke="#deb24e" stroke-width="1.6"><rect x="8" y="8" width="24" height="24" rx="1"/><rect x="8" y="8" width="24" height="24" rx="1" transform="rotate(45 20 20)"/></g><circle cx="20" cy="20" r="9" fill="#0e4d3f"/><text x="20" y="24.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">ن</text></svg>`;
  const html=`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(spec.title)}</title><style>${css}</style></head><body>
   <div class="hd"><div class="o">${seal}<div><b>${esc(org)}</b><small>منصة نافذ للإدارة المؤسسية</small></div></div><div class="d">${hFmt(iso)}<br>${dFmt(iso)} · ${new Intl.DateTimeFormat("ar-SA-u-nu-latn",{hour:"2-digit",minute:"2-digit"}).format(now)}<br>أعدّه: ${esc((S.meP&&S.meP.name)||"")}</div></div><div class="gold"></div>
   <h1>${esc(spec.title)}</h1>${spec.subtitle?`<p class="sub">${esc(spec.subtitle)}</p>`:""}
   ${spec.blocks.map(blk).join("")}
   ${spec.sign!==false?`<div class="sig"><div>المُعِد</div><div>المراجع</div><div>الاعتماد</div></div>`:""}
   <div class="ft"><span>${esc(org)} · ${esc(spec.title)}</span><span>طُبع من منصة نافذ · ${dFmt(iso)}</span></div></body></html>`;
  let f=document.getElementById("printFrame");if(f)f.remove();f=document.createElement("iframe");f.id="printFrame";f.setAttribute("aria-hidden","true");f.style.cssText="position:fixed;width:0;height:0;border:0;left:0;bottom:0";document.body.appendChild(f);
  const w=f.contentWindow;w.document.open();w.document.write(html);w.document.close();
  toast("اختر «حفظ بصيغة PDF» من نافذة الطباعة لحفظ التقرير ملف PDF");
  setTimeout(()=>{try{w.focus();w.print()}catch(e){const b=new Blob([html],{type:"text/html"});const u=URL.createObjectURL(b);window.open(u,"_blank")}},350);
}
/** زر التقرير الموحد: يعرض قائمة طباعة / PDF / Excel. key: مفتاح في REPORTS. */
const REPORTS={};
function repBtn(key,label){return `<span class="repg"><button class="btn sm" data-rep="${key}" data-fmt="print" title="طباعة التقرير">${ico("doc")} طباعة</button><button class="btn sm" data-rep="${key}" data-fmt="pdf" title="حفظ PDF">${ico("down")} PDF</button><button class="btn sm" data-rep="${key}" data-fmt="xlsx" title="تصدير Excel">${ico("grid")} Excel</button></span>`}
function runReport(key,fmt){const f=REPORTS[key];if(!f){toast("التقرير غير متاح");return}const sp=f();
  if(fmt==="xlsx"){exportXlsx(sp.title,sp.sheets||sp.blocks.filter(b=>b.type==="table").map((b,i)=>({name:b.title||("ورقة "+(i+1)),head:b.head,rows:b.rows})));return}
  printReport(sp)}
function bindReports(root){root.querySelectorAll("[data-rep]").forEach(b=>b.onclick=e=>{e.stopPropagation();runReport(b.dataset.rep,b.dataset.fmt)})}
/* ---------- مولّدات التقارير الجاهزة ---------- */
function recRows(list,g){
  const cols=g!=null&&F[g]?F[g]:[];const multi=S.scope==="*";
  const head=["الرقم","المعاملة",...(multi?["المؤسسة"]:[]),"الإدارة","الوحدة",...cols.map(c=>c.l),"الحالة","الأولوية","التاريخ","الاستحقاق","المسؤول"];
  const rows=list.map(r=>[r.no||"",r.title,...(multi?[orgName(r.org)]:[]),G[r.g]?.n||"",modName(r.g,r.m),...cols.map(c=>{const v=r.f?.[c.k];return v==null?"":c.t==="money"||c.t==="number"?+v:String(v)}),eff(r),PRI[pri(r)]?.n||"",r.date||"",r.due||"",whoFor(r)]);
  return{head,rows};
}
function recordsReport(title,list,g,subtitle){
  const {head,rows}=recRows(list,g);const sum=list.reduce((a,r)=>a+recSum(r),0);
  const st=STATUSES.map(s=>[s.n,list.filter(r=>eff(r)===s.n).length]);
  return{title,subtitle:subtitle||`${NF.format(list.length)} معاملة`,landscape:head.length>8,
    blocks:[{type:"kpis",items:[["عدد المعاملات",list.length],["مفتوحة",list.filter(isOpen).length],["متأخرة",list.filter(isLate).length],["إجمالي القيم (ر.س)",sum]]},
      {type:"table",title:"حسب الحالة",head:["الحالة","العدد"],rows:st},{type:"table",title:"المعاملات",head,rows}]};
}
function recordDoc(r){
  const defs=F[r.g]||[];const dec=S.dec[r.id];
  return{title:`معاملة ${r.no||""}: ${r.title}`,subtitle:`${G[r.g]?.n} · ${modName(r.g,r.m)}`,
   blocks:[{type:"kv",title:"البيانات الأساسية",items:[["رقم المعاملة",r.no||"—"],...(S.scope==="*"?[["المؤسسة",orgName(r.org)]]:[]),["الحالة",eff(r)],["الأولوية",PRI[pri(r)]?.n||""],["التاريخ",`${dFmt(r.date)} (${hFmt(r.date)})`],["الاستحقاق",r.due?dFmt(r.due):"—"],["المسؤول",whoFor(r)],["أنشأها",nameOf(r.createdBy)]]},
    ...(defs.length?[{type:"kv",title:"تفاصيل "+G[r.g]?.n,items:defs.map(d=>[d.l,r.f?.[d.k]==null||r.f[d.k]===""?"—":d.t==="money"?money(r.f[d.k]):String(r.f[d.k])])}]:[]),
    ...(r.notes?[{type:"text",title:"الملاحظات",text:r.notes}]:[]),
    ...(dec?[{type:"kv",title:"قرار الاعتماد",items:[["القرار",dec.s],["بواسطة",nameOf(dec.by)],["الوقت",tFmt(dec.at)],["المبلغ",money(dec.amt)],["الملاحظة",dec.note||"—"]]}]:[]),
    {type:"table",title:"سجل المعاملة",head:["الوقت","الإجراء","بواسطة","التفاصيل"],rows:(r.hist||[]).map(h=>[tFmt(h.at),histLabel(h),nameOf(h.by),h.t||""])}]};
}
