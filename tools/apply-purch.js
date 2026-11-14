// يضيف «المشتريات وطلبات الشراء» إلى إدارة المستودعات (SCHEMA.G، رمزها WHS). آمن للتكرار.
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8"), head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
const gi = S.G.findIndex(g => g.c === "WHS"); if (gi < 0) throw new Error("WHS department not found");
const g = S.G[gi];
const MODS = [["لوحة المشتريات", "متابعة طلبات الشراء والاعتماد والتوفير"], ["سجل طلبات الشراء", "جميع طلبات الشراء وموقفها الحالي"], ["طلب شراء جديد", "تسجيل الاحتياج والبنود وإرساله للاعتماد"], ["اعتماد طلبات الشراء", "مراجعة الطلبات وتسجيل قرار الاعتماد أو الإعادة أو الرفض"], ["متابعة التوفير", "ربط الطلب بالمورد وأمر الشراء ومتابعة الكميات المتبقية"], ["تسجيل استلام المشتريات", "إثبات المستلم من بنود الطلب دفعة دفعة"], ["دليل الموردين", "بيانات الموردين وتصنيفاتهم وتقييمهم"], ["تقارير المشتريات", "تقارير الطلبات حسب الإدارة والمورد والمتأخر والاستلام"], ["نماذج المشتريات والطباعة", "طلب الشراء وأمر الشراء ومحضر الاستلام"], ["إعدادات المشتريات", "القوائم ووحدات القياس والترقيم وقواعد المسار"]];
const ids = MODS.map(([n, d]) => { let i = g.items.indexOf(n); if (i < 0) { g.items.push(n); g.idesc.push(d); i = g.items.length - 1; } else g.idesc[i] = d; return i; });
g.sec = g.sec.filter(s => s[0] !== "المشتريات وطلبات الشراء"); g.sec.splice(1, 0, ["المشتريات وطلبات الشراء", ids]);
g.n = "المستودعات والمشتريات والعهد"; g.d = "الأصناف والمخزون وطلبات الشراء والموردون والأصول والعهد والجرد"; g.en = "Warehouses, Procurement & Custody";
fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
console.log(`«${g.n}» (${gi}): ${g.items.length} وحدة، منها ${ids.length} للمشتريات`);
