// يكتب تعريف مركز الحوكمة (tools/gov-def.js) في src/Schema.gs تحت SCHEMA.GOV. آمن للتكرار.
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8");
const head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
delete require.cache[require.resolve("./gov-def.js")];
S.GOV = require("./gov-def.js");
fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
const n = S.GOV.standards.reduce((a, s) => a + s.ind.length, 0);
console.log(`مركز الحوكمة: ${Object.keys(S.GOV.docs).length} مستندًا في ${S.GOV.groups.length} مجموعات · ${S.GOV.standards.length} معايير · ${n} مؤشرًا`);
