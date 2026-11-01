// محاكاة خدمات Google Apps Script بما يكفي لتشغيل Code.gs محليًا
const crypto = require("crypto"), fs = require("fs"), vm = require("vm");
function makeGas() {
  const props = {}, cache = {}, files = {}, mails = [];
  let idc = 0; const nid = p => p + (++idc);
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr: nr || 1, nc: nc || 1 }) }
    getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.d[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? "" : v) } o.push(row) } return o }
    setValues(v) { v.forEach((row, i) => { const R = this.sh.ensure(this.r + i); row.forEach((x, j) => R[this.c - 1 + j] = x) }); return this }
    getValue() { return this.getValues()[0][0] }
    setValue(x) { this.sh.ensure(this.r)[this.c - 1] = x; return this }
    setFontWeight() { return this } setBackground() { return this } setFontColor() { return this } setNumberFormat() { return this }
    createTextFinder(t) { const self = this; return { matchEntireCell() { return this }, findNext() { for (let i = 0; i < self.nr; i++) { const v = (self.sh.d[self.r - 1 + i] || [])[self.c - 1]; if (String(v) === String(t)) return { getRow: () => self.r + i } } return null } } }
  }
  class Sheet {
    constructor(n) { this.n = n; this.d = [] }
    ensure(r) { while (this.d.length < r) this.d.push([]); return this.d[r - 1] }
    getName() { return this.n } getLastRow() { return this.d.length } getMaxRows() { return 1000 } getMaxColumns() { return 26 }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc) }
    appendRow(row) { this.d.push(row.slice()) } deleteRow(r) { this.d.splice(r - 1, 1) } setFrozenRows() { }
  }
  const book = { id: "SS1", sheets: [new Sheet("Sheet1")],
    getSheetByName(n) { return this.sheets.find(s => s.n === n) || null }, insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s },
    getSheets() { return this.sheets }, deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s) }, getId() { return this.id }, getUrl() { return "https://docs.google.com/x" },
    setSpreadsheetLocale() { }, setSpreadsheetTimeZone() { } };
  const folder = () => { const id = nid("F"); return { getId: () => id, createFolder: () => folder(), createFile(blob) { const fid = nid("D"); files[fid] = blob; return { getId: () => fid } }, getFiles() { const a = []; return { hasNext: () => a.length > 0, next: () => a.shift() } } } };
  const g = {
    console, Logger: { log: m => g.__log.push(m) }, __log: [], __mails: mails, __book: book,
    SpreadsheetApp: { create: () => book, openById: () => book },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v) }, deleteProperty: k => { delete props[k] }, getProperties: () => ({ ...props }) }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = String(v) }, remove: k => { delete cache[k] } }) },
    LockService: { getScriptLock: () => ({ waitLock() { }, tryLock: () => true, releaseLock() { } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (a, s) => [...crypto.createHash("sha256").update(s, "utf8").digest()].map(b => b > 127 ? b - 256 : b),
      getUuid: () => crypto.randomUUID(),
      base64Decode: s => [...Buffer.from(s, "base64")].map(b => b > 127 ? b - 256 : b),
      base64Encode: a => Buffer.from(a.map(b => b < 0 ? b + 256 : b)).toString("base64"),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name, getBytes: () => bytes }),
      formatDate: d => d.toISOString()
    },
    DriveApp: { createFolder: () => folder(), getFolderById: () => folder(), getFileById: id => ({ moveTo() { }, makeCopy() { }, setTrashed() { delete files[id] }, getBlob: () => files[id] }) },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: o => mails.push(o) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() { }, newTrigger: () => { const c = { timeBased: () => c, everyDays: () => c, atHour: () => c, create: () => c }; return c }, getService: () => ({ getUrl: () => "https://script.google.com/macros/s/X/exec" }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => "owner@example.org" }) },
    HtmlService: {}
  };
  vm.createContext(g);
  const dir = require("path").join(__dirname, "../src/");
  // يحاكي تحميل Apps Script لكل الملفات في نطاق واحد
  vm.runInContext(fs.readFileSync(dir + "Code.gs", "utf8") + "\n" + fs.readFileSync(dir + "Schema.gs", "utf8") + "\nthis.__api={setup,login,logout,api,getPublicConfig,dailyBackup};", g);
  return g;
}
module.exports = { makeGas };
