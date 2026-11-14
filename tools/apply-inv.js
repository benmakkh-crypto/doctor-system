// يضيف «حركة المخزون والأرصدة» إلى إدارة المستودعات (SCHEMA.G، رمزها WHS). آمن للتكرار.
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8"), head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
const g = S.G.find(x => x.c === "WHS"); if (!g) throw new Error("WHS department not found");
const MODS = [["لوحة المخزون", "الأصناف وإعادة الطلب وأحدث الحركات وتنبيهات المخزون"], ["إدارة بيانات المخزون", "إدخال الأصناف والحركات والتحويلات والجرد والمخازن والسجل المجمع"], ["أصناف المخزون", "قائمة الأصناف وأرصدتها وحالة المخزون"], ["حركة المخزون", "سجل مستندات الوارد والمنصرف والقيود المخزنية"], ["تحويل بين المخازن", "التحويلات المرحّلة بقيدين مرتبطين ومعايناتها"], ["الجرد والتسويات", "الجرد وفروقه واعتماد التسوية"], ["دليل المخازن", "المخازن ومواقعها ومسؤولوها"], ["تقارير المخزون", "الأرصدة حتى تاريخ والحركات والفروق"], ["طباعة أذونات المخزون", "إذن الوارد والصرف والتحويل ومحضر الجرد"], ["إعدادات المخزون", "التصنيفات والوحدات والأطراف والقواعد والترقيم"], ["دليل استخدام المخزون", "ست خطوات لضبط حركة المخزون"]];
const ids = MODS.map(([n, d]) => { let i = g.items.indexOf(n); if (i < 0) { g.items.push(n); g.idesc.push(d); i = g.items.length - 1; } else g.idesc[i] = d; return i; });
const old = g.sec.find(s => s[0] === "الأصناف والأرصدة"); const keep = old ? old[1].filter(i => !ids.includes(i)) : [];
g.sec = g.sec.filter(s => s[0] !== "الأصناف والأرصدة" && s[0] !== "حركة المخزون والأرصدة"); g.sec.unshift(["حركة المخزون والأرصدة", ids.concat(keep)]);
fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
console.log(`«${g.n}»: ${g.items.length} وحدة، منها ${ids.length} للمخزون`);
