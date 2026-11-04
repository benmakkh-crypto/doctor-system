// يدمج tools/taxonomy-ext.js في src/Schema.gs وtools/taxonomy.js دون المساس بأرقام الوحدات القائمة.
// الاستخدام: node tools/apply-ext.js  (آمن للتكرار: لا يضيف وحدة موجودة مرتين)
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const file = path.join(root, "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8");
const head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
const { NEW, PLAN } = require("./taxonomy-ext.js");

const norm = s => String(s).replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
  .replace(/[()\/\-–،,.]/g, " ").split(/\s+/).filter(Boolean).map(w => w.replace(/^(وال|بال|لل|ال)/, "")).filter(w => w !== "و").join(" ").replace(/^اداره /, "").trim();

// أوصاف تلقائية للوحدات الجديدة
function desc(n) {
  const rest = (p) => n.replace(p, "").trim();
  const R = [
    [/^قاعدة بيانات |^قواعد بيانات /, x => `كل سجلات ${rest(/^قاعدة بيانات |^قواعد بيانات /)} في مكان واحد مع البحث والتصفية والتصدير`],
    [/^(سجل|سجلات) /, x => `أرشيف ${rest(/^(سجل|سجلات) /)} بتواريخها ومن نفّذها`],
    [/^(إضافة|تسجيل|إنشاء|تقديم) /, x => `${n} ببياناته ومرفقاته، ثم متابعته في مساره`],
    [/^(اعتماد|اعتمادات|مراجعة) /, x => `مراجعة ${rest(/^(اعتماد|اعتمادات|مراجعة) /)} واتخاذ القرار مع الملاحظة`],
    [/^(تحديث|تعديل) /, x => `تعديل ${rest(/^(تحديث|تعديل) /)} مع حفظ سجل التغيير`],
    [/^(حذف|إلغاء) /, x => `${n} مع ذكر السبب وإمكانية الاستعادة من المحذوفات`],
    [/^(استعادة|فتح) /, x => `${n} وإعادته إلى العمل`],
    [/^(تقارير|تقرير) /, x => `تقارير ${rest(/^(تقارير|تقرير) /)} بالطباعة وPDF وExcel`],
    [/^إحصائيات /, x => `مؤشرات ومخططات ${rest(/^إحصائيات /)}`],
    [/^(أرشيف) /, x => `حفظ ${rest(/^أرشيف /)} وتصنيفها والرجوع إليها`],
    [/^(إصدار|تصدير) /, x => `${n} بتصميم معتمد وطباعته`],
    [/^(صرف|تسليم|تحصيل|استلام) /, x => `${n} بسند موثّق ومسار اعتماد`],
    [/^(طلب|طلبات) /, x => `${n} ومتابعة مسارها حتى القرار`],
    [/^(لوحة|خارطة|شجرة|تقويم) /, x => `${n}: نظرة شاملة تفاعلية`],
    [/^اسأل /, x => `مساعد ذكي يجيبك عن ${rest(/^اسأل مساعد /).replace(/ الذكي$/, "")} خطوة بخطوة`],
    [/^إدارة /, x => `إدارة ${rest(/^إدارة /)}: إضافة وتعديل ومتابعة`],
    [/المرفوضة|المرفوض/, x => `${n} مع سبب الرفض`],
    [/المكتملة|المنجزة|المعتمدة/, x => `${n} بعد إنجازها واعتمادها`],
  ];
  for (const [re, f] of R) if (re.test(n)) return f();
  return `${n} ضمن مسار المعاملات في نافذ`;
}

const added = {}; let newMods = 0, newSecs = 0, newDepts = 0;
const codeIdx = c => S.G.findIndex(g => g.c === c);
for (const [target, sections] of PLAN) {
  let gi = typeof target === "number" ? target : codeIdx(target);
  if (gi < 0) { const d = NEW[target]; S.G.push({ n: d.n, s: d.s, c: d.c, d: d.d, items: [], col: d.col, en: d.en, ic: d.ic, sec: [], idesc: [] }); gi = S.G.length - 1; newDepts++; S.F[gi] = S.F[gi] || [{ k: "party", l: "الجهة أو الشخص", t: "text", col: 1 }, { k: "amount", l: "المبلغ", t: "money", col: 1 }]; }
  const g = S.G[gi]; g.sec = g.sec || []; g.idesc = g.idesc || [];
  const placed = new Set();
  for (const [title, names] of sections) {
    let sec = g.sec.find(s => norm(s[0]) === norm(title));
    if (!sec) { sec = [title, []]; g.sec.push(sec); newSecs++; }
    for (const name of names) {
      let idx = g.items.findIndex(it => norm(it) === norm(name));
      if (idx < 0) { g.items.push(name); g.idesc.push(desc(name)); idx = g.items.length - 1; newMods++; (added[gi] = added[gi] || []).push(idx); }
      if (placed.has(idx)) continue;
      g.sec.forEach(s => { s[1] = s[1].filter(m => m !== idx); });
      sec[1].push(idx); placed.add(idx);
    }
  }
  // العناوين القديمة الصغيرة التي لم ترد في الخطة: تُضم إلى أقرب عنوان جديد يشاركها كلمة
  const planT = new Set(sections.map(x => norm(x[0])));
  g.sec.filter(s => !planT.has(norm(s[0])) && s[1].length && s[1].length <= 2).forEach(s => {
    const w = norm(s[0]).split(" ").filter(x => x.length > 2);
    const to = g.sec.find(t => t !== s && planT.has(norm(t[0])) && norm(t[0]).split(" ").some(x => w.includes(x)));
    if (to) { to[1].push(...s[1]); s[1] = []; }
  });
  g.sec = g.sec.filter(s => s[1].length);
  // كل وحدة في عنوان واحد
  g.items.forEach((_, m) => { if (!g.sec.some(s => s[1].includes(m))) { let o = g.sec.find(s => s[0] === "وحدات أخرى"); if (!o) { o = ["وحدات أخرى", []]; g.sec.push(o); } o[1].push(m); } });
  while (g.idesc.length < g.items.length) g.idesc.push(desc(g.items[g.idesc.length]));
}
// خريطة تقارير لوحدات التقارير الجديدة
const RG = S.G[0]; S.REPORT_MAP = S.REPORT_MAP || [];
const K = [[/المستفيدين|التابعين|القرى/, [10, 13]], [/الموظفين/, [9]], [/المهام/, [4, codeIdx("BRD"), codeIdx("OFC")]], [/الكفالات|الكافلين|الأيتام/, [10]], [/الداعمين|التسويق/, [6]], [/الجمعية العمومية|الصادر والوارد/, [codeIdx("EXE")]],
  [/المشاريع/, [4]], [/الفعاليات|الشراكات|الزيارات/, [11, 5]], [/الموقع/, [3]], [/أوامر الصرف/, [codeIdx("BRD"), 7]], [/البرامج/, [5]], [/متابعة الحالات/, [4]], [/المقبوضات|المالية/, [7, 6]], [/طلبات الإعانة/, [10]]];
RG.items.forEach((n, m) => { if (S.REPORT_MAP[m] !== undefined) return; const hit = K.find(([re]) => re.test(n)); S.REPORT_MAP[m] = hit ? hit[1].filter(x => x > 0) : null; });

fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
// مزامنة tools/taxonomy.js مع المخطط
const T = S.G.map(g => ({ col: g.col, en: g.en, sec: g.sec, idesc: g.idesc }));
const tf = path.join(__dirname, "taxonomy.js");
const thead = fs.readFileSync(tf, "utf8").split("module.exports")[0];
fs.writeFileSync(tf, thead + "module.exports = " + JSON.stringify(T, null, 1) + ";\n");
const total = S.G.reduce((a, g) => a + g.items.length, 0);
console.log(`إدارات جديدة ${newDepts} · عناوين جديدة ${newSecs} · وحدات جديدة ${newMods} · الإجمالي ${S.G.length} إدارة و${total} وحدة`);
console.log("وحدات الموقع الجديدة:", JSON.stringify((added[3] || [])));
