/* ================= محرك التخطيط: إظهار وإخفاء وتحريك وتحجيم كل العناصر =================
 * كل صفحة تُعرض كقائمة عناصر {id,title,span,h,html}. تفضيلات المستخدم (ثم تخطيط المؤسسة الافتراضي) تحدد:
 * الترتيب، والمخفي، والعرض (من 12 عمودًا)، والارتفاع. وضع «تخصيص الصفحة» يُظهر أدوات كل عنصر.
 */
const SPANS=[[3,"ربع"],[4,"ثلث"],[6,"نصف"],[8,"ثلثان"],[9,"ثلاثة أرباع"],[12,"كامل"]];
const HEIGHTS=[["auto","تلقائي"],["s","قصير"],["m","متوسط"],["l","طويل"],["xl","طويل جدًا"]];
let editMode=false,dragW=null,prefsTimer=0;
function savePrefsSoon(){try{localStorage.setItem("ds.prefs."+(S.me||""),JSON.stringify(S.prefs||{}))}catch(e){}
  clearTimeout(prefsTimer);prefsTimer=setTimeout(()=>{call("savePrefs",{prefs:S.prefs||{}}).catch(()=>{})},900)}
function pageLay(page){const u=S.prefs&&S.prefs.layout&&S.prefs.layout[page];const o=S.cfg.layout&&S.cfg.layout[page];return u||o||{}}
function setPageLay(page,fn){S.prefs=S.prefs||{};S.prefs.layout=S.prefs.layout||{};const cur=JSON.parse(JSON.stringify(pageLay(page)));S.prefs.layout[page]=fn(cur)||cur;savePrefsSoon();render()}
/** يبني الصفحة من العناصر حسب التفضيلات. */
function layoutPage(page,widgets){
  const L=pageLay(page);const order=L.order||[];const hid=new Set(L.hidden||[]);const sz=L.size||{};
  const byId=Object.fromEntries(widgets.map(w=>[w.id,w]));
  const ids=[...order.filter(id=>byId[id]),...widgets.map(w=>w.id).filter(id=>!order.includes(id))];
  const shown=ids.filter(id=>!hid.has(id)),hidden=ids.filter(id=>hid.has(id));
  const cell=id=>{const w=byId[id];const s=sz[id]||{};const span=s.span||w.span||12,h=s.h||w.h||"auto";
    const tools=editMode?`<div class="wtools" role="toolbar" aria-label="أدوات ${esc(w.title)}">
      <span class="wgrip" title="اسحب لتغيير الموضع">${ico("grid")}</span><b>${esc(w.title)}</b>
      <button data-wmv="${id}" data-d="-1" title="تقديم">→</button><button data-wmv="${id}" data-d="1" title="تأخير">←</button>
      <select data-wspan="${id}" title="العرض">${SPANS.map(([v,l])=>`<option value="${v}" ${+span===v?"selected":""}>${l}</option>`).join("")}</select>
      <select data-wh="${id}" title="الارتفاع">${HEIGHTS.map(([v,l])=>`<option value="${v}" ${h===v?"selected":""}>${l}</option>`).join("")}</select>
      <button data-whide="${id}" class="wh" title="إخفاء">${ico("eye")} إخفاء</button></div>`:"";
    return `<div class="wcell s${span} h-${h} ${editMode?"edit":""}" data-w="${id}" ${editMode?`draggable="true"`:""}>${tools}<div class="wbody">${w.html}</div></div>`};
  const tray=editMode?`<div class="wtray"><div class="wtt">${ico("sliders")}<b>تخصيص الصفحة</b><small>اسحب العناصر لترتيبها، وغيّر عرضها وارتفاعها، أو أخفها. يُحفظ التخطيط لحسابك على كل أجهزتك.</small></div>
     ${hidden.length?`<div class="whid"><span>عناصر مخفية (${hidden.length}):</span>${hidden.map(id=>`<button data-wshow="${id}">${ico("eye")} ${esc(byId[id].title)}</button>`).join("")}</div>`:`<div class="whid"><span>لا عناصر مخفية.</span></div>`}
     <div class="wact"><button class="btn sm" data-wall="show">إظهار الكل</button><button class="btn sm" data-wreset="${page}">التخطيط الافتراضي</button>${S.admin&&S.scope!=="*"?`<button class="btn sm" data-wdef="${page}">${ico("check")} اعتماد كتخطيط افتراضي للمؤسسة</button>`:""}<button class="btn sm pri" data-wdone>تم</button></div></div>`:"";
  return `${tray}<div class="lay" data-page="${page}">${shown.map(cell).join("")}</div>`;
}
function bindLayout(main){
  const lay=main.querySelector(".lay");if(!lay)return;const page=lay.dataset.page;
  const ids=()=>[...lay.querySelectorAll("[data-w]")].map(e=>e.dataset.w);
  const allIds=()=>{const L=pageLay(page);const cur=ids();return [...cur,...(L.hidden||[]).filter(x=>!cur.includes(x))]};
  main.querySelectorAll("[data-wmv]").forEach(b=>b.onclick=()=>setPageLay(page,L=>{const o=allIds();const i=o.indexOf(b.dataset.wmv),j=i+ +b.dataset.d;if(j<0||j>=o.length)return L;[o[i],o[j]]=[o[j],o[i]];L.order=o;return L}));
  main.querySelectorAll("[data-wspan]").forEach(e=>e.onchange=()=>setPageLay(page,L=>{L.size=L.size||{};L.size[e.dataset.wspan]=Object.assign({},L.size[e.dataset.wspan],{span:+e.value});return L}));
  main.querySelectorAll("[data-wh]").forEach(e=>e.onchange=()=>setPageLay(page,L=>{L.size=L.size||{};L.size[e.dataset.wh]=Object.assign({},L.size[e.dataset.wh],{h:e.value});return L}));
  main.querySelectorAll("[data-whide]").forEach(b=>b.onclick=()=>setPageLay(page,L=>{L.hidden=[...new Set([...(L.hidden||[]),b.dataset.whide])];L.order=allIds();return L}));
  main.querySelectorAll("[data-wshow]").forEach(b=>b.onclick=()=>setPageLay(page,L=>{L.hidden=(L.hidden||[]).filter(x=>x!==b.dataset.wshow);return L}));
  const sa=main.querySelector("[data-wall]");if(sa)sa.onclick=()=>setPageLay(page,L=>{L.hidden=[];return L});
  const rs=main.querySelector("[data-wreset]");if(rs)rs.onclick=()=>{if(S.prefs&&S.prefs.layout)delete S.prefs.layout[page];savePrefsSoon();render()};
  const df=main.querySelector("[data-wdef]");if(df)df.onclick=async()=>{const all=Object.assign({},S.cfg.layout||{},{[page]:pageLay(page)});const d=await act("saveLayout",{layout:all},"اعتُمد التخطيط افتراضيًا لكل مستخدمي المؤسسة");if(d){S.cfg.layout=d.layout}};
  const dn=main.querySelector("[data-wdone]");if(dn)dn.onclick=()=>{editMode=false;render()};
  if(!editMode)return;
  lay.querySelectorAll("[data-w]").forEach(el=>{
    el.addEventListener("dragstart",e=>{dragW=el.dataset.w;el.classList.add("dragging");e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",dragW)}catch(x){}});
    el.addEventListener("dragend",()=>{el.classList.remove("dragging");lay.querySelectorAll(".dropb,.dropa").forEach(x=>x.classList.remove("dropb","dropa"))});
    el.addEventListener("dragover",e=>{if(!dragW||dragW===el.dataset.w)return;e.preventDefault();const r=el.getBoundingClientRect();const before=(e.clientX>r.left+r.width/2);el.classList.toggle("dropb",before);el.classList.toggle("dropa",!before)});
    el.addEventListener("dragleave",()=>el.classList.remove("dropb","dropa"));
    el.addEventListener("drop",e=>{e.preventDefault();if(!dragW||dragW===el.dataset.w)return;const before=el.classList.contains("dropb");const tgt=el.dataset.w,src=dragW;dragW=null;
      setPageLay(page,L=>{const o=allIds().filter(x=>x!==src);const i=o.indexOf(tgt);o.splice(before?i:i+1,0,src);L.order=o;return L})});
  });
}
/** زر «تخصيص الصفحة» يظهر في الصفحات التي تدعم التخطيط. */
const LAYOUT_PAGES=v=>["home","grp","mod","orgs"].includes(v);
function toggleEdit(){editMode=!editMode;chOpen=null;render();window.scrollTo({top:0,behavior:"smooth"})}
