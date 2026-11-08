/*
 * حفظ بيانات نافذ على هوستنجر.
 * - MySQL (المستحسن): يكفي ضبط DB_HOST وDB_USER وDB_PASSWORD وDB_NAME في متغيرات بيئة التطبيق.
 *   كل جدول من جداول النظام صف واحد في جدول nafith_kv، وكل مرفق صف مستقل؛ فلا يُكتب إلا ما تغيّر.
 * - ملف JSON (للتجربة المحلية أو عند غياب قاعدة البيانات): DATA_DIR، الافتراضي ../nafith-data خارج مجلد التطبيق.
 */
"use strict";
const fs = require("fs"), path = require("path");

async function openStore(env) {
  if (env.DB_HOST && env.DB_USER && env.DB_NAME) return mysqlStore(env);
  return fileStore(env.DATA_DIR || defaultDir());
}
// على هوستنجر يُنشر كل إصدار في مجلد جديد (…/hbuilds/versions/<id>)؛ فنحفظ البيانات خارجه حتى تبقى بين عمليات النشر.
function defaultDir() {
  const m = /^(.*?)[\\/]hbuilds[\\/]/.exec(__dirname);
  return m ? path.join(m[1], "nafith-data") : path.join(__dirname, "..", "..", "nafith-data");
}

/* ---------- MySQL ---------- */
async function mysqlStore(env) {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({ host: env.DB_HOST, port: +env.DB_PORT || 3306, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, charset: "utf8mb4", connectionLimit: 3 });
  await pool.query("CREATE TABLE IF NOT EXISTS nafith_kv (k VARCHAR(191) PRIMARY KEY, v LONGTEXT NOT NULL, updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  await pool.query("CREATE TABLE IF NOT EXISTS nafith_backups (id INT AUTO_INCREMENT PRIMARY KEY, at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, v LONGTEXT NOT NULL) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  return {
    kind: "mysql",
    async load() {
      const [rows] = await pool.query("SELECT k, v FROM nafith_kv");
      const st = { sheets: {}, props: {}, files: {}, id: 0 };
      for (const r of rows) {
        if (r.k === "props") st.props = JSON.parse(r.v);
        else if (r.k === "meta") st.id = JSON.parse(r.v).id || 0;
        else if (r.k.startsWith("sheet:")) st.sheets[r.k.slice(6)] = JSON.parse(r.v);
        else if (r.k.startsWith("file:")) st.files[r.k.slice(5)] = JSON.parse(r.v);
      }
      return st;
    },
    async save(st, d) {
      const put = (k, v) => pool.query("INSERT INTO nafith_kv (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [k, JSON.stringify(v)]);
      const del = k => pool.query("DELETE FROM nafith_kv WHERE k = ?", [k]);
      for (const n of d.sheets) {
        if (n === "__props") await put("props", st.props);
        else if (st.sheets[n]) await put("sheet:" + n, st.sheets[n]); else await del("sheet:" + n);
      }
      for (const f of d.files) { if (st.files[f]) await put("file:" + f, st.files[f]); else await del("file:" + f); }
      await put("meta", { id: st.id });
    },
    async backup(st) {
      await pool.query("INSERT INTO nafith_backups (v) VALUES (?)", [JSON.stringify({ sheets: st.sheets, props: st.props, id: st.id })]);
      await pool.query("DELETE FROM nafith_backups WHERE id NOT IN (SELECT id FROM (SELECT id FROM nafith_backups ORDER BY id DESC LIMIT 30) t)");
    }
  };
}

/* ---------- ملف JSON ---------- */
function fileStore(dir) {
  fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
  const file = path.join(dir, "state.json");
  const write = (f, s) => { const tmp = f + ".tmp"; fs.writeFileSync(tmp, s); fs.renameSync(tmp, f); };
  return {
    kind: "file:" + dir,
    async load() { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return { sheets: {}, props: {}, files: {}, id: 0 }; } },
    async save(st) { write(file, JSON.stringify(st)); },
    async backup(st) {
      const b = path.join(dir, "backups");
      write(path.join(b, "nafith-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".json"), JSON.stringify({ sheets: st.sheets, props: st.props, id: st.id }));
      fs.readdirSync(b).sort().reverse().slice(30).forEach(f => fs.unlinkSync(path.join(b, f)));
    }
  };
}

module.exports = { openStore };
