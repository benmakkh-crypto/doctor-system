// يضيف «المصروفات التشغيلية» إلى إدارة «المالية والمحاسبة» (SCHEMA.G، رمزها FIN). آمن للتكرار.
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8"), head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
const g = S.G.find(x => x.c === "FIN"); if (!g) throw new Error("FIN department not found");
const MODS = [["لوحة المصروفات التشغيلية", "المعتمد والمدفوع والمتبقي والتنبيهات وتحليل البنود"], ["إدارة بيانات المصروفات", "إدخال المصروفات والدفعات والاعتمادات والبنود والسجل المجمع"], ["سجل المصروفات التشغيلية", "قائمة المصروفات بحالتي الاعتماد والسداد"], ["مصروف تشغيلي جديد", "تسجيل مصروف بفاتورته وموعد سداده"], ["اعتماد وسداد المصروفات", "قرارات الاعتماد وتسجيل السداد الفعلي"], ["بنود الصرف", "بنود الصرف ومراكز التكلفة والميزانيات"], ["تقارير المصروفات التشغيلية", "حسب البند والإدارة ومركز التكلفة والشهر وغير المدفوع"], ["طباعة كشف المصروفات", "كشف المصروفات لفترة وبطاقة المصروف"], ["إعدادات المصروفات التشغيلية", "الإدارات والمسؤولون وطرق الدفع والقواعد والترقيم"], ["دليل المصروفات التشغيلية", "ست خطوات لإدارة المصروفات التشغيلية"]];
const ids = MODS.map(([n, d]) => { let i = g.items.indexOf(n); if (i < 0) { g.items.push(n); g.idesc.push(d); i = g.items.length - 1; } else g.idesc[i] = d; return i; });
g.sec = g.sec.filter(s => s[0] !== "المصروفات التشغيلية"); const at = Math.max(0, g.sec.findIndex(s => s[0] === "إدارة المصروفات النقدية")); g.sec.splice(at, 0, ["المصروفات التشغيلية", ids]);
fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
console.log(`«${g.n}»: ${g.items.length} وحدة، منها ${ids.length} للمصروفات التشغيلية`);
