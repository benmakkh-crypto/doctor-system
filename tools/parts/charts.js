/* ================= محرك المخططات =================
 * مخطط واحد بإعدادات يغيّرها المستخدم: النوع، والألوان، والترتيب، وعدد العناصر، والقيم، والمفتاح، والارتفاع.
 * البيانات: {labels:[], series:[{name, values:[], color}], colors?:[] لكل فئة, money?:bool, links?:[]}
 * الأنواع للفئات: bar, hbar, line, area, donut, pie, rose, radial, lollipop, funnel, treemap, cards, table
 * الأنواع لأكثر من سلسلة: line, area, bar (مجمّع), stacked, table
 */
const CH_TYPES1=[["bar","أعمدة","RPT"],["hbar","أشرطة أفقية","menu"],["line","خطي","trend"],["area","مساحة","activity"],["donut","حلقي","pie"],["pie","دائري","pie"],["rose","وردي قطبي","star"],["radial","حلقات متدرجة","gauge"],["lollipop","مصاصة","visit"],["funnel","قمعي","tray"],["treemap","خريطة شجرية","grid"],["cards","بطاقات أرقام","card"],["table","جدول","list"]];
const CH_TYPESN=[["line","خطي","trend"],["area","مساحة","activity"],["bar","أعمدة مجمّعة","RPT"],["stacked","أعمدة مكدّسة","box"],["table","جدول","list"]];
const PALS={brand:["#0e7a5f","#3157b8","#d9702a","#6d3fc0","#c2334d","#0b7fb3","#b98a14","#1f8f86","#8a5a2b","#5b4bc4","#4d7c0f","#b03a8c"],
 vivid:["#e63946","#f4a261","#2a9d8f","#457b9d","#8338ec","#ff006e","#3a86ff","#06d6a0","#ffbe0b","#fb5607","#118ab2","#ef476f"],
 pastel:["#8ecae6","#ffb4a2","#b5e48c","#cdb4db","#ffd166","#a0c4ff","#f4acb7","#99d98c","#bde0fe","#ffc8dd","#caffbf","#fdffb6"],
 warm:["#9d0208","#d00000","#dc2f02","#e85d04","#f48c06","#faa307","#ffba08","#c9184a","#ff4d6d","#a4133c","#ff758f","#800f2f"],
 cool:["#03045e","#023e8a","#0077b6","#0096c7","#00b4d8","#48cae4","#4361ee","#3a0ca3","#7209b7","#560bad","#0f766e","#14b8a6"],
 earth:["#606c38","#283618","#bc6c25","#dda15e","#8a5a2b","#a3b18a","#588157","#3a5a40","#b08968","#7f5539","#9c6644","#ddb892"],
 mono:["#0b3a30","#0e4d3f","#13664f","#1a7f63","#249877","#35b08b","#52c49f","#77d4b5","#9fe2ca","#c4efdd","#0a2e26","#062520"],
 status:null};
const PAL_NAMES={brand:"ألوان نافذ",vivid:"زاهية",pastel:"هادئة",warm:"دافئة",cool:"باردة",earth:"ترابية",mono:"تدرّج أخضر",status:"ألوان البيانات"};
function chPrefs(id,def){const P=(S.prefs&&S.prefs.charts)||{};return Object.assign({type:"bar",pal:"status",sort:"none",top:0,vals:true,legend:true,h:"m",pct:false},def||{},P[id]||{})}
function setChPref(id,k,v){S.prefs=S.prefs||{};S.prefs.charts=S.prefs.charts||{};S.prefs.charts[id]=Object.assign({},S.prefs.charts[id]||{},{[k]:v});savePrefsSoon();render()}
function chColors(d,o,n){const p=PALS[o.pal];if(!p)return d.colors&&d.colors.length?d.colors:PALS.brand;return Array.from({length:n},(_,i)=>p[i%p.length])}
const chFmt=(v,d)=>d.money?(Math.abs(v)>=1e4?NFc.format(v):NF.format(Math.round(v))):NF.format(Math.round(v*10)/10);
function chPrepare(d,o){
  let idx=d.labels.map((_,i)=>i);
  const tot=i=>d.series.reduce((a,s)=>a+(+s.values[i]||0),0);
  if(o.sort==="desc")idx.sort((a,b)=>tot(b)-tot(a));else if(o.sort==="asc")idx.sort((a,b)=>tot(a)-tot(b));else if(o.sort==="name")idx.sort((a,b)=>String(d.labels[a]).localeCompare(String(d.labels[b]),"ar"));
  if(o.top>0&&idx.length>o.top)idx=idx.slice(0,o.top);
  const cols=chColors(d,o,d.labels.length);
  return{labels:idx.map(i=>d.labels[i]),series:d.series.map(s=>({...s,values:idx.map(i=>+s.values[i]||0)})),colors:idx.map(i=>cols[i]),links:d.links?idx.map(i=>d.links[i]):null,money:d.money};
}
const chH={s:200,m:280,l:380,xl:500};
function chartSVG(d0,o){
  const d=chPrepare(d0,o);const multi=d.series.length>1;const H=chH[o.h]||280;
  const vals=d.series[0]?d.series[0].values:[];const sum=vals.reduce((a,b)=>a+b,0);
  if(!d.labels.length||!d.series.some(s=>s.values.some(v=>v)))return emptyDash("لا توجد بيانات لهذا المخطط","تتغير المخططات تلقائيًا عند إضافة معاملات.");
  const lbl=(t,n)=>{t=String(t);return t.length>n?t.slice(0,n-1)+"…":t};
  const valTxt=(v,i)=>o.pct&&sum?Math.round(v/sum*100)+"%":chFmt(v,d);
  const legend=()=>o.legend?`<div class="chlg">${multi?d.series.map((s,i)=>`<span><i style="background:${s.color||PALS.brand[i]}"></i>${esc(s.name)}</span>`).join(""):d.labels.map((l,i)=>`<span><i style="background:${d.colors[i]}"></i>${esc(lbl(l,22))}${o.vals?` <b>${valTxt(vals[i],i)}</b>`:""}</span>`).join("")}</div>`:"";
  const wrapA=(i,inner)=>d.links&&d.links[i]?`<a href="${d.links[i]}">${inner}</a>`:inner;
  const t=o.type;
  if(t==="table"){
    return `<div class="tw chtab"><table><thead><tr><th>البند</th>${d.series.map(s=>`<th>${esc(s.name||"القيمة")}</th>`).join("")}${multi?"":"<th>النسبة</th>"}</tr></thead><tbody>${d.labels.map((l,i)=>`<tr><td class="t"><i class="dotc" style="background:${d.colors[i]}"></i>${d.links&&d.links[i]?`<a href="${d.links[i]}">${esc(l)}</a>`:esc(l)}</td>${d.series.map(s=>`<td class="num">${chFmt(s.values[i],d)}${d.money?" ر.س":""}</td>`).join("")}${multi?"":`<td class="num">${sum?(vals[i]/sum*100).toFixed(1):0}%</td>`}</tr>`).join("")}</tbody>
     <tfoot><tr><td>الإجمالي</td>${d.series.map(s=>`<td class="num">${chFmt(s.values.reduce((a,b)=>a+b,0),d)}${d.money?" ر.س":""}</td>`).join("")}${multi?"":"<td class='num'>100%</td>"}</tr></tfoot></table></div>`;
  }
  if(t==="cards"&&!multi){return `<div class="chcards">${d.labels.map((l,i)=>wrapA(i,`<div style="--c:${d.colors[i]}"><b>${chFmt(vals[i],d)}${d.money?" <small>ر.س</small>":""}</b><span>${esc(l)}</span>${sum?`<em>${Math.round(vals[i]/sum*100)}%</em>`:""}</div>`)).join("")}</div>`}
  if((t==="hbar"||t==="lollipop")&&!multi){const mx=Math.max(1,...vals);return `<div class="chh ${t}">${d.labels.map((l,i)=>wrapA(i,`<div class="r" style="--c:${d.colors[i]}"><span class="l" title="${esc(l)}">${esc(l)}</span><span class="b"><em style="width:${vals[i]/mx*100}%"></em>${t==="lollipop"?`<i style="inset-inline-start:calc(${vals[i]/mx*100}% - 7px)"></i>`:""}</span><b>${o.vals?valTxt(vals[i],i):""}</b></div>`)).join("")}</div>`}
  if((t==="donut"||t==="pie")&&!multi){
    const R=90,cx=110,cy=110;let a0=-Math.PI/2;const arcs=vals.map((v,i)=>{if(!v)return"";const a1=a0+v/sum*Math.PI*2;const big=a1-a0>Math.PI?1:0;
      const p=sum===v?`M${cx} ${cy-R}A${R} ${R} 0 1 1 ${cx-.01} ${cy-R}Z`:`M${cx} ${cy}L${cx+R*Math.cos(a0)} ${cy+R*Math.sin(a0)}A${R} ${R} 0 ${big} 1 ${cx+R*Math.cos(a1)} ${cy+R*Math.sin(a1)}Z`;
      const mid=(a0+a1)/2;const tx=cx+R*.68*Math.cos(mid),ty=cy+R*.68*Math.sin(mid);a0=a1;
      return wrapA(i,`<path d="${p}" fill="${d.colors[i]}" stroke="var(--surface)" stroke-width="2"><title>${esc(d.labels[i])}: ${chFmt(v,d)}</title></path>${o.vals&&v/sum>.06&&t==="pie"?`<text x="${tx}" y="${ty+4}" text-anchor="middle" class="chin">${Math.round(v/sum*100)}%</text>`:""}`)}).join("");
    return `<div class="chpie"><svg viewBox="0 0 220 220" style="max-height:${H}px">${arcs}${t==="donut"?`<circle cx="${cx}" cy="${cy}" r="${R*.58}" fill="var(--surface)"/><text x="${cx}" y="${cy-4}" text-anchor="middle" class="rl">الإجمالي</text><text x="${cx}" y="${cy+20}" text-anchor="middle" class="rv">${chFmt(sum,d)}</text>`:""}</svg>${legend()}</div>`;
  }
  if(t==="rose"&&!multi){const n=vals.length,mx=Math.max(1,...vals),cx=110,cy=110;let out="";vals.forEach((v,i)=>{const a0=-Math.PI/2+i*2*Math.PI/n,a1=a0+2*Math.PI/n-.03,r=20+80*Math.sqrt(v/mx);
      out+=wrapA(i,`<path d="M${cx} ${cy}L${cx+r*Math.cos(a0)} ${cy+r*Math.sin(a0)}A${r} ${r} 0 0 1 ${cx+r*Math.cos(a1)} ${cy+r*Math.sin(a1)}Z" fill="${d.colors[i]}" opacity=".9"><title>${esc(d.labels[i])}: ${chFmt(v,d)}</title></path>`)});
    return `<div class="chpie"><svg viewBox="0 0 220 220" style="max-height:${H}px"><circle cx="110" cy="110" r="100" fill="none" stroke="var(--line)"/><circle cx="110" cy="110" r="60" fill="none" stroke="var(--line)" stroke-dasharray="3 3"/>${out}</svg>${legend()}</div>`}
  if(t==="radial"&&!multi){const mx=Math.max(1,...vals),n=Math.min(vals.length,8),step=Math.min(14,80/n);let out="";
    for(let i=0;i<n;i++){const r=96-i*(step+3),C=2*Math.PI*r;out+=`<circle cx="110" cy="110" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${step}"/>`+wrapA(i,`<circle cx="110" cy="110" r="${r}" fill="none" stroke="${d.colors[i]}" stroke-width="${step}" stroke-linecap="round" stroke-dasharray="${C*.75*vals[i]/mx} ${C}" transform="rotate(-90 110 110)"><title>${esc(d.labels[i])}: ${chFmt(vals[i],d)}</title></circle>`)}
    return `<div class="chpie"><svg viewBox="0 0 220 220" style="max-height:${H}px">${out}</svg>${legend()}</div>`}
  if(t==="funnel"&&!multi){const L=d.labels.map((l,i)=>({l,v:vals[i],c:d.colors[i],i})).sort((a,b)=>b.v-a.v);const mx=Math.max(1,L[0].v);
    return `<div class="chfun">${L.map(x=>wrapA(x.i,`<div style="--c:${x.c};width:${Math.max(18,x.v/mx*100)}%"><span>${esc(x.l)}</span><b>${valTxt(x.v)}</b></div>`)).join("")}</div>`}
  if(t==="treemap"&&!multi){const L=d.labels.map((l,i)=>({l,v:vals[i],c:d.colors[i],i})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);const W=600,Hh=H;
    const cells=[];(function lay(items,x,y,w,h,vert){if(!items.length)return;if(items.length===1){cells.push({...items[0],x,y,w,h});return}
      const tot=items.reduce((a,b)=>a+b.v,0);let acc=0,k=0;while(k<items.length-1&&acc+items[k].v<=tot/2){acc+=items[k].v;k++}if(k===0){acc=items[0].v;k=1}
      const f=acc/tot;if(vert){lay(items.slice(0,k),x,y,w*f,h,!vert);lay(items.slice(k),x+w*f,y,w*(1-f),h,!vert)}else{lay(items.slice(0,k),x,y,w,h*f,!vert);lay(items.slice(k),x,y+h*f,w,h*(1-f),!vert)}})(L,0,0,W,Hh,true);
    return `<div class="chart"><svg viewBox="0 0 ${W} ${Hh}" class="chtree">${cells.map(c=>wrapA(c.i,`<g><rect x="${W-c.x-c.w+1}" y="${c.y+1}" width="${Math.max(0,c.w-2)}" height="${Math.max(0,c.h-2)}" rx="6" fill="${c.c}"><title>${esc(c.l)}: ${chFmt(c.v,d)}</title></rect>${c.w>70&&c.h>34?`<text x="${W-c.x-8}" y="${c.y+22}" text-anchor="start" class="chin" style="text-anchor:start;direction:rtl">${esc(lbl(c.l,Math.floor(c.w/9)))}</text><text x="${W-c.x-8}" y="${c.y+40}" class="chin sm" style="direction:rtl">${valTxt(c.v)}</text>`:""}</g>`)).join("")}</svg></div>`}
  // محاور: أعمدة / خطي / مساحة / مكدّس
  const W=640,pl=10,pr=46,pt=18,pb=d.labels.length>8?64:40;const n=d.labels.length;
  const stack=t==="stacked";const tots=d.labels.map((_,i)=>d.series.reduce((a,s)=>a+s.values[i],0));
  const max=niceMax(Math.max(1,...(stack?tots:d.series.flatMap(s=>s.values))));
  const y=v=>pt+(H-pt-pb)*(1-v/max);const slot=(W-pl-pr)/n;const cx=i=>W-pr-slot*(i+.5);
  const grid=[0,.25,.5,.75,1].map(k=>`<line class="grid" x1="${pl}" x2="${W-pr}" y1="${y(max*k)}" y2="${y(max*k)}"/><text x="${W-pr+6}" y="${y(max*k)+4}">${NFc.format(max*k)}</text>`).join("");
  const xl=d.labels.map((l,i)=>n>8?`<text x="${cx(i)}" y="${H-pb+14}" text-anchor="end" transform="rotate(-35 ${cx(i)} ${H-pb+14})">${esc(lbl(l,14))}</text>`:`<text x="${cx(i)}" y="${H-pb+18}" text-anchor="middle">${esc(lbl(l,12))}</text>`).join("");
  const scol=(s,i)=>s.color||(multi?chColors(d0,o,d.series.length)[i]:null);
  let body="";
  if(t==="line"||t==="area"){
    d.series.forEach((s,si)=>{const c=multi?scol(s,si):(PALS[o.pal]||PALS.brand)[0];const path=s.values.map((v,i)=>`${i?"L":"M"}${cx(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
      if(t==="area")body+=`<path d="${path} L${cx(n-1)} ${y(0)} L${cx(0)} ${y(0)}Z" fill="${c}" opacity="${multi?.12:.18}"/>`;
      body+=`<path d="${path}" fill="none" stroke="${c}" stroke-width="2.6" ${si?`stroke-dasharray="${si===1?"7 4":"2 4"}"`:""}/>`+s.values.map((v,i)=>wrapA(i,`<circle cx="${cx(i)}" cy="${y(v)}" r="4" fill="var(--surface)" stroke="${multi?c:d.colors[i]}" stroke-width="2.4"><title>${esc(d.labels[i])} — ${esc(s.name||"")}: ${chFmt(v,d)}</title></circle>${o.vals&&!multi&&v?`<text x="${cx(i)}" y="${y(v)-9}" text-anchor="middle" class="lbl-strong">${valTxt(v,i)}</text>`:""}`)).join("")});
  }else{
    const k=stack?1:d.series.length;const bw=Math.min(46,slot*.7/k);
    d.labels.forEach((l,i)=>{let base=0;d.series.forEach((s,si)=>{const v=s.values[i];const c=multi?scol(s,si):d.colors[i];
      const x=stack?cx(i)-bw/2:cx(i)-bw*k/2+bw*(k-1-si);const y1=y(stack?base+v:v),y0=y(stack?base:0);
      body+=wrapA(i,`<rect x="${x}" y="${y1}" width="${bw-2}" height="${Math.max(0,y0-y1)}" rx="${stack?2:5}" fill="${c}"><title>${esc(l)}${multi?" — "+esc(s.name):""}: ${chFmt(v,d)}</title></rect>`);
      if(o.vals&&v&&!stack&&(k===1||bw>22))body+=`<text x="${x+bw/2-1}" y="${y1-5}" text-anchor="middle" class="lbl-strong">${valTxt(v,i)}</text>`;base+=v})});
  }
  return `<div class="chart dchart"><svg viewBox="0 0 ${W} ${H}" role="img">${grid}${body}${xl}</svg>${multi?legend():""}</div>`;
}
/** بطاقة مخطط مع زر الإعدادات. def: الإعدادات الافتراضية. */
function chartCard(id,title,sub,icon,tone,data,def,opts){
  const o=chPrefs(id,def);const multi=data.series.length>1;const types=multi?CH_TYPESN:CH_TYPES1;if(!types.some(x=>x[0]===o.type))o.type=types[0][0];
  const open=chOpen===id;
  const pop=open?`<div class="chpop" role="dialog" aria-label="إعدادات المخطط">
    <div class="chg"><b>نوع المخطط</b><div class="chtypes">${types.map(([k,l,ic])=>`<button data-ch="${id}" data-k="type" data-v="${k}" class="${o.type===k?"on":""}" title="${l}">${ico(ic)}<span>${l}</span></button>`).join("")}</div></div>
    <div class="chg"><b>الألوان</b><div class="chpals">${Object.keys(PALS).map(k=>`<button data-ch="${id}" data-k="pal" data-v="${k}" class="${o.pal===k?"on":""}" title="${PAL_NAMES[k]}"><span>${(PALS[k]||(data.colors&&data.colors.length?data.colors:PALS.brand)).slice(0,5).map(c=>`<i style="background:${c}"></i>`).join("")}</span>${PAL_NAMES[k]}</button>`).join("")}</div></div>
    <div class="chrow"><label>الترتيب<select data-ch="${id}" data-k="sort">${[["none","الأصلي"],["desc","الأكبر أولًا"],["asc","الأصغر أولًا"],["name","أبجدي"]].map(([k,l])=>`<option value="${k}" ${o.sort===k?"selected":""}>${l}</option>`).join("")}</select></label>
     <label>العدد<select data-ch="${id}" data-k="top">${[[0,"الكل"],[3,"أعلى 3"],[5,"أعلى 5"],[8,"أعلى 8"],[10,"أعلى 10"]].map(([k,l])=>`<option value="${k}" ${+o.top===k?"selected":""}>${l}</option>`).join("")}</select></label>
     <label>الارتفاع<select data-ch="${id}" data-k="h">${[["s","قصير"],["m","متوسط"],["l","طويل"],["xl","طويل جدًا"]].map(([k,l])=>`<option value="${k}" ${o.h===k?"selected":""}>${l}</option>`).join("")}</select></label></div>
    <div class="chrow"><label class="check"><input type="checkbox" data-ch="${id}" data-k="vals" ${o.vals?"checked":""}>إظهار القيم</label><label class="check"><input type="checkbox" data-ch="${id}" data-k="pct" ${o.pct?"checked":""}>نسب مئوية</label><label class="check"><input type="checkbox" data-ch="${id}" data-k="legend" ${o.legend?"checked":""}>المفتاح</label></div>
    <div class="chrow"><button class="btn sm" data-chreset="${id}">الإعدادات الافتراضية</button><button class="btn sm" data-chrep="${id}" data-fmt="xlsx">${ico("down")} Excel</button><button class="btn sm" data-chrep="${id}" data-fmt="print">${ico("doc")} طباعة / PDF</button></div></div>`:"";
  CH_DATA[id]={title,data};
  return dCard(title,sub,icon,tone,`<div class="chwrap">${chartSVG(data,o)}</div>${pop}`,Object.assign({},opts||{},{tool:`<button class="chbtn ${open?"on":""}" data-chopen="${id}" title="تغيير شكل المخطط" aria-expanded="${open}">${ico("sliders")}</button>`}));
}
const CH_DATA={};let chOpen=null;
function bindCharts(main){
  main.querySelectorAll("[data-chopen]").forEach(b=>b.onclick=e=>{e.stopPropagation();chOpen=chOpen===b.dataset.chopen?null:b.dataset.chopen;render()});
  main.querySelectorAll("button[data-ch]").forEach(b=>b.onclick=()=>setChPref(b.dataset.ch,b.dataset.k,b.dataset.v));
  main.querySelectorAll("select[data-ch]").forEach(e=>e.onchange=()=>setChPref(e.dataset.ch,e.dataset.k,e.dataset.k==="top"?+e.value:e.value));
  main.querySelectorAll("input[data-ch]").forEach(e=>e.onchange=()=>setChPref(e.dataset.ch,e.dataset.k,e.checked));
  main.querySelectorAll("[data-chreset]").forEach(b=>b.onclick=()=>{if(S.prefs&&S.prefs.charts)delete S.prefs.charts[b.dataset.chreset];savePrefsSoon();render()});
  main.querySelectorAll("[data-chrep]").forEach(b=>b.onclick=()=>{const c=CH_DATA[b.dataset.chrep];if(!c)return;const d=c.data;
    const head=["البند",...d.series.map(s=>s.name||"القيمة")];const rows=d.labels.map((l,i)=>[l,...d.series.map(s=>+s.values[i]||0)]);
    if(b.dataset.fmt==="xlsx")exportXlsx(c.title,[{name:"البيانات",head,rows}]);else printReport({title:c.title,blocks:[{type:"chart",html:main.querySelector(`[data-chopen="${b.dataset.chrep}"]`)?.closest(".dc")?.querySelector(".chwrap")?.innerHTML||""},{type:"table",head,rows}]})});
}
document.addEventListener("click",e=>{if(chOpen&&!e.target.closest(".chpop")&&!e.target.closest("[data-chopen]")){chOpen=null;render()}});
