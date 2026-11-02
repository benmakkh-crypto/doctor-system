// ينسخ مكتبة القوالب (tools/parts/themes.js) داخل Index.html وSite.html بين العلامتين
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const lib = fs.readFileSync(path.join(__dirname, "parts/themes.js"), "utf8").trim();
for (const f of ["src/Index.html", "src/Site.html"]) {
  const p = path.join(root, f); let s = fs.readFileSync(p, "utf8");
  const a = s.indexOf("/*@@THEMES@@*/"), b = s.indexOf("/*@@/THEMES@@*/");
  if (a >= 0 && b > a) s = s.slice(0, a) + lib + s.slice(b + "/*@@/THEMES@@*/".length);
  else { const i = s.indexOf("<script>") + "<script>".length; s = s.slice(0, i) + "\n" + lib + "\n" + s.slice(i); }
  fs.writeFileSync(p, s); console.log("synced", f);
}
