/*
 * نظام نافذ — بيئة Node.js لاستضافة هوستنجر.
 * تحاكي خدمات Google Apps Script التي يستخدمها src/Code.gs، وتشغّل Code.gs وSchema.gs كما هما دون تعديل.
 * الحالة كلها (الجداول، والخصائص، والمرفقات) في كائن واحد تحفظه store.js في MySQL أو في ملف.
 */
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path"), crypto = require("crypto");

const SRC = path.join(__dirname, "..", "src");
const signed = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const unsigned = arr => Buffer.from(arr.map(b => (b < 0 ? b + 256 : b)));

function createRuntime(st, opts) {
  opts = opts || {};
  st.sheets = st.sheets || {}; st.props = st.props || {}; st.files = st.files || {}; st.id = st.id || 0;
  const cache = new Map(); // ذاكرة مؤقتة في الذاكرة مع مدة صلاحية، كـ CacheService
  const mailQueue = [];
  const nid = p => p + (++st.id);

  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  Range.prototype.getValues = function () { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.d[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v == null ? "" : v); } o.push(row); } return o; };
  Range.prototype.setValues = function (v) { v.forEach((row, i) => { const R = this.sh.ensure(this.r + i); row.forEach((x, j) => { R[this.c - 1 + j] = x instanceof Date ? x.toISOString() : x; }); }); this.sh.touch(); return this; };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.setValue = function (x) { this.sh.ensure(this.r)[this.c - 1] = x instanceof Date ? x.toISOString() : x; this.sh.touch(); return this; };
  ["setFontWeight", "setBackground", "setFontColor", "setNumberFormat", "setWrap", "setHorizontalAlignment"].forEach(k => { Range.prototype[k] = function () { return this; }; });
  Range.prototype.createTextFinder = function (t) { const self = this; return { matchEntireCell() { return this; }, findNext() { for (let i = 0; i < self.nr; i++) { const v = (self.sh.d[self.r - 1 + i] || [])[self.c - 1]; if (String(v) === String(t)) return { getRow: () => self.r + i }; } return null; } }; };

  const dirty = new Set();
  function Sheet(n) { if (!st.sheets[n]) { st.sheets[n] = []; dirty.add(n); } this.n = n; this.d = st.sheets[n]; }
  Sheet.prototype.touch = function () { dirty.add(this.n); };
  Sheet.prototype.ensure = function (r) { while (this.d.length < r) this.d.push([]); return this.d[r - 1]; };
  Sheet.prototype.getName = function () { return this.n; };
  Sheet.prototype.getLastRow = function () { return this.d.length; };
  Sheet.prototype.getLastColumn = function () { return this.d.reduce((m, r) => Math.max(m, r.length), 0); };
  Sheet.prototype.getMaxRows = function () { return Math.max(1000, this.d.length); };
  Sheet.prototype.getMaxColumns = function () { return 26; };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr, nc); };
  Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, this.d.length, this.getLastColumn()); };
  Sheet.prototype.appendRow = function (row) { this.d.push(row.map(x => (x instanceof Date ? x.toISOString() : x))); this.touch(); };
  Sheet.prototype.deleteRow = function (r) { this.d.splice(r - 1, 1); this.touch(); };
  Sheet.prototype.setFrozenRows = function () { };
  const book = {
    getSheetByName: n => (st.sheets[n] ? new Sheet(n) : null),
    insertSheet: n => new Sheet(n),
    getSheets: () => Object.keys(st.sheets).map(n => new Sheet(n)),
    deleteSheet: s => { delete st.sheets[s.n]; dirty.add(s.n); },
    getId: () => "NAFITH-DB", getUrl: () => "(قاعدة بيانات نافذ على هوستنجر)",
    setSpreadsheetLocale() { }, setSpreadsheetTimeZone() { }
  };
  const fileDirty = new Set();
  function folder() {
    const id = nid("F");
    return {
      getId: () => id, createFolder: () => folder(),
      createFile(blob) { const fid = nid("D"); st.files[fid] = { b: unsigned(blob.bytes).toString("base64"), m: blob.mime, n: blob.name }; fileDirty.add(fid); return { getId: () => fid }; },
      getFiles: () => ({ hasNext: () => false })
    };
  }

  const GAS = {
    Logger: { log: m => console.log("[Code.gs]", m) },
    SpreadsheetApp: { create: () => book, openById: () => book },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (st.props[k] == null ? null : st.props[k]),
      setProperty: (k, v) => { st.props[k] = String(v); dirty.add("__props"); },
      deleteProperty: k => { delete st.props[k]; dirty.add("__props"); },
      getProperties: () => Object.assign({}, st.props) }) },
    CacheService: { getScriptCache: () => ({
      get: k => { const e = cache.get(k); if (!e) return null; if (e.x < Date.now()) { cache.delete(k); return null; } return e.v; },
      put: (k, v, sec) => { cache.set(k, { v: String(v), x: Date.now() + 1000 * Math.min(21600, sec || 600) }); },
      remove: k => { cache.delete(k); } }) },
    LockService: { getScriptLock: () => ({ waitLock() { }, tryLock: () => true, releaseLock() { } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (a, s) => signed(crypto.createHash("sha256").update(String(s), "utf8").digest()),
      getUuid: () => crypto.randomUUID(),
      base64Decode: s => signed(Buffer.from(String(s), "base64")),
      base64Encode: a => unsigned(a).toString("base64"),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate(d, tz, fmt) {
        const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz || "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
        return String(fmt || "yyyy-MM-dd HH:mm").replace("yyyy", p.year).replace("MM", p.month).replace("dd", p.day).replace("HH", p.hour === "24" ? "00" : p.hour).replace("mm", p.minute).replace("ss", p.second);
      }
    },
    DriveApp: {
      createFolder: () => folder(), getFolderById: () => folder(),
      getFileById: id => ({
        moveTo() { }, makeCopy() { if (opts.onBackup) opts.onBackup(); },
        setTrashed() { delete st.files[id]; fileDirty.add(id); },
        getBlob: () => { const f = st.files[id] || { b: "" }; return { getBytes: () => signed(Buffer.from(f.b, "base64")) }; }
      })
    },
    MailApp: {
      getRemainingDailyQuota: () => (opts.mailer ? 100 : 0),
      sendEmail: o => { mailQueue.push(o); }
    },
    ScriptApp: {
      getProjectTriggers: () => [], deleteTrigger() { },
      newTrigger() { const c = { timeBased: () => c, everyDays: () => c, atHour: () => c, create: () => c }; return c; },
      getService: () => ({ getUrl: () => opts.appUrl || "" })
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => opts.ownerEmail || "info@nafithapp.com" }) },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL", DEFAULT: "DEFAULT" },
      createHtmlOutputFromFile(name) {
        const o = { name, title: "", setTitle(t) { o.title = t; return o; }, addMetaTag() { return o; }, setXFrameOptionsMode() { return o; } };
        return o;
      }
    },
    ContentService: { MimeType: { JSON: "application/json" }, createTextOutput: t => { const o = { text: t, setMimeType() { return o; } }; return o; } }
  };

  const ctx = vm.createContext(Object.assign({ console }, GAS));
  const code = fs.readFileSync(path.join(SRC, "Code.gs"), "utf8") + "\n" + fs.readFileSync(path.join(SRC, "Schema.gs"), "utf8") +
    "\nthis.__api={doGet,getPublicConfig,setup,login,logout,api,sitePublic,siteSubmit,platformPublic,dailyBackup,resetAdminPassword,APP_VERSION};";
  vm.runInContext(code, ctx, { filename: "Code.gs" });
  const api = ctx.__api;

  return {
    api, st,
    // ما تغيّر منذ آخر حفظ: أسماء الجداول، والخصائص، والمرفقات
    takeDirty() { const d = { sheets: [...dirty], files: [...fileDirty] }; dirty.clear(); fileDirty.clear(); return d; },
    takeMail() { return mailQueue.splice(0); }
  };
}

module.exports = { createRuntime };
