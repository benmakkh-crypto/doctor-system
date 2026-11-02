/*
 * نظام نافذ — بيئة المتصفح للنسخة التجريبية (index.html)
 * تحاكي خدمات Google Apps Script داخل المتصفح، وتشغّل Code.gs وSchema.gs كما هما،
 * وتحفظ كل شيء في localStorage لهذا المتصفح فقط.
 */
(function () {
  "use strict";
  var KEY = "doctorSystem.demo.v3";

  /* ---------- SHA-256 متزامن (يحتاجه Utilities.computeDigest) ---------- */
  var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  function sha256(bytes) {
    var l = bytes.length, bl = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(bl);
    m.set(bytes); m[l] = 0x80;
    var bits = l * 8; for (var i = 0; i < 8; i++) m[bl - 1 - i] = (bits / Math.pow(2, 8 * i)) & 0xff;
    var h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w = new Array(64);
    for (var o = 0; o < bl; o += 64) {
      for (var t = 0; t < 16; t++) w[t] = (m[o + t * 4] << 24) | (m[o + t * 4 + 1] << 16) | (m[o + t * 4 + 2] << 8) | m[o + t * 4 + 3];
      for (t = 16; t < 64; t++) {
        var a = w[t - 15], b = w[t - 2];
        var s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        var s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var A = h[0], B = h[1], C = h[2], D = h[3], E = h[4], F = h[5], G = h[6], H = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7));
        var ch = (E & F) ^ (~E & G), t1 = (H + S1 + ch + K[t] + w[t]) | 0;
        var S0 = ((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10));
        var mj = (A & B) ^ (A & C) ^ (B & C), t2 = (S0 + mj) | 0;
        H = G; G = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
      }
      h[0] = (h[0] + A) | 0; h[1] = (h[1] + B) | 0; h[2] = (h[2] + C) | 0; h[3] = (h[3] + D) | 0;
      h[4] = (h[4] + E) | 0; h[5] = (h[5] + F) | 0; h[6] = (h[6] + G) | 0; h[7] = (h[7] + H) | 0;
    }
    var out = []; h.forEach(function (x) { out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); });
    return out;
  }
  var enc = new TextEncoder();
  function signed(arr) { return Array.prototype.map.call(arr, function (b) { return b > 127 ? b - 256 : b; }); }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = crypto.getRandomValues(new Uint8Array(1))[0] % 16; return (c === "x" ? r : (r & 3) | 8).toString(16); }); }

  /* ---------- الحالة المحفوظة ---------- */
  var st;
  try { st = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { st = null; }
  if (!st) st = { sheets: {}, props: {}, cache: {}, files: {}, id: 0 };
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); }
    catch (e) { console.warn("تعذّر الحفظ في المتصفح (المساحة ممتلئة؟)", e); }
  }
  function nid(p) { st.id++; return p + st.id; }

  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  Range.prototype.getValues = function () { var o = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) { var v = (this.sh.d[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v == null ? "" : v); } o.push(row); } return o; };
  Range.prototype.setValues = function (v) { var self = this; v.forEach(function (row, i) { var R = self.sh.ensure(self.r + i); row.forEach(function (x, j) { R[self.c - 1 + j] = x; }); }); return this; };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.setValue = function (x) { this.sh.ensure(this.r)[this.c - 1] = x; return this; };
  ["setFontWeight", "setBackground", "setFontColor", "setNumberFormat"].forEach(function (k) { Range.prototype[k] = function () { return this; }; });
  Range.prototype.createTextFinder = function (t) { var self = this; return { matchEntireCell: function () { return this; }, findNext: function () { for (var i = 0; i < self.nr; i++) { var v = (self.sh.d[self.r - 1 + i] || [])[self.c - 1]; if (String(v) === String(t)) return { getRow: function () { return self.r + i; } }; } return null; } }; };
  function Sheet(n) { if (!st.sheets[n]) st.sheets[n] = []; this.n = n; this.d = st.sheets[n]; }
  Sheet.prototype.ensure = function (r) { while (this.d.length < r) this.d.push([]); return this.d[r - 1]; };
  Sheet.prototype.getName = function () { return this.n; };
  Sheet.prototype.getLastRow = function () { return this.d.length; };
  Sheet.prototype.getMaxRows = function () { return 1000; };
  Sheet.prototype.getMaxColumns = function () { return 26; };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr, nc); };
  Sheet.prototype.appendRow = function (row) { this.d.push(row.slice()); };
  Sheet.prototype.deleteRow = function (r) { this.d.splice(r - 1, 1); };
  Sheet.prototype.setFrozenRows = function () { };
  var book = {
    getSheetByName: function (n) { return st.sheets[n] ? new Sheet(n) : null; },
    insertSheet: function (n) { return new Sheet(n); },
    getSheets: function () { return Object.keys(st.sheets).map(function (n) { return new Sheet(n); }); },
    deleteSheet: function (s) { delete st.sheets[s.n]; },
    getId: function () { return "DEMO-SHEET"; }, getUrl: function () { return "(جدول تجريبي داخل المتصفح)"; },
    setSpreadsheetLocale: function () { }, setSpreadsheetTimeZone: function () { }
  };
  function folder() { var id = nid("F"); return { getId: function () { return id; }, createFolder: function () { return folder(); },
    createFile: function (blob) { var fid = nid("D"); st.files[fid] = { b: btoa(String.fromCharCode.apply(null, blob.bytes.map(function (b) { return b < 0 ? b + 256 : b; }))), m: blob.mime }; return { getId: function () { return fid; } }; },
    getFiles: function () { return { hasNext: function () { return false; } }; } }; }

  var GAS = {
    Logger: { log: function (m) { console.log(m); } },
    SpreadsheetApp: { create: function () { return book; }, openById: function () { return book; } },
    PropertiesService: { getScriptProperties: function () { return {
      getProperty: function (k) { return st.props[k] == null ? null : st.props[k]; },
      setProperty: function (k, v) { st.props[k] = String(v); },
      deleteProperty: function (k) { delete st.props[k]; },
      getProperties: function () { return Object.assign({}, st.props); } }; } },
    CacheService: { getScriptCache: function () { return {
      get: function (k) { return st.cache[k] == null ? null : st.cache[k]; },
      put: function (k, v) { st.cache[k] = String(v); }, remove: function (k) { delete st.cache[k]; } }; } },
    LockService: { getScriptLock: function () { return { waitLock: function () { }, tryLock: function () { return true; }, releaseLock: function () { } }; } },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: function (a, s) { return signed(sha256(enc.encode(s))); },
      getUuid: uuid,
      base64Decode: function (s) { var b = atob(s), o = new Array(b.length); for (var i = 0; i < b.length; i++) { var c = b.charCodeAt(i); o[i] = c > 127 ? c - 256 : c; } return o; },
      base64Encode: function (a) { var s = ""; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i] < 0 ? a[i] + 256 : a[i]); return btoa(s); },
      newBlob: function (bytes, mime, name) { return { bytes: bytes, mime: mime, name: name }; },
      formatDate: function (d) { return d.toISOString().slice(0, 16).replace("T", " "); }
    },
    DriveApp: { createFolder: function () { return folder(); }, getFolderById: function () { return folder(); },
      getFileById: function (id) { return { moveTo: function () { }, makeCopy: function () { }, setTrashed: function () { delete st.files[id]; },
        getBlob: function () { var f = st.files[id] || { b: "" }; return { getBytes: function () { return GAS.Utilities.base64Decode(f.b); } }; } }; } },
    MailApp: { getRemainingDailyQuota: function () { return 100; }, sendEmail: function (o) { console.info("[بريد تجريبي لم يُرسل]", o.to, o.subject); } },
    ScriptApp: { getProjectTriggers: function () { return []; }, deleteTrigger: function () { },
      newTrigger: function () { var c = { timeBased: function () { return c; }, everyDays: function () { return c; }, atHour: function () { return c; }, create: function () { return c; } }; return c; },
      getService: function () { return { getUrl: function () { return location.href.split("#")[0]; } }; } },
    Session: { getEffectiveUser: function () { return { getEmail: function () { return "demo@example.org"; } }; } },
    HtmlService: {}
  };

  /* ---------- تحميل الخادم (يُحقن هنا عند البناء) ---------- */
  var SERVER = (new Function(Object.keys(GAS).join(","), "/*@@SERVER@@*/\nreturn {setup:setup,login:login,logout:logout,api:api,getPublicConfig:getPublicConfig,dailyBackup:dailyBackup};"))
    .apply(null, Object.keys(GAS).map(function (k) { return GAS[k]; }));

  /* ---------- أول تشغيل: حسابات وبيانات تجريبية ---------- */
  var DEMO = [
    { u: "zubair", p: "Demo2026", role: "مسؤول النظام" },
    { u: "sara", p: "Sara2026", role: "مساهم في التبرعات والكفالات" },
    { u: "view", p: "View2026", role: "مشاهد" }
  ];
  if (!st.props.SPREADSHEET_ID) {
    var msg = SERVER.setup();
    var tmp = /المؤقتة: (\S+)/.exec(msg)[1];
    var T = SERVER.login("zubair", tmp, false).data.token;
    SERVER.api(T, "changePassword", { current: tmp, next: "Demo2026" });
    SERVER.api(T, "saveSettings", { __org: "main", orgName: "جمعية تجريبية", threshold: 5000, sod: false, notify: false });
    SERVER.api(T, "addSamples", { __org: "main" });
    // مؤسسات إضافية لعرض «الكشاف»
    [{ name: "جمعية البر بالمدينة (مثال)", code: "BIRR", sector: "القطاع غير الربحي", type: "جمعية خيرية", areas: "اجتماعي وأسري، إغاثي، رعاية الأيتام", vision: "مجتمع متكافل لا يُترك فيه محتاج دون سند", mission: "خدمة الأسر المستحقة ببرامج كفالة وإغاثة وتمكين", goals: "كفالة 500 أسرة\nتمكين 100 أسرة منتجة\nتوزيع 3000 سلة غذائية سنويًا", branches: "فرع قباء\nفرع العوالي", region: "منطقة المدينة المنورة", city: "المدينة المنورة", manager: "أ. خالد العتيبي", managerPhone: "0551234567", license: "1234", employees: "18", beneficiaries: "640" },
     { name: "جمعية تراحم (مثال)", code: "TRH", sector: "القطاع غير الربحي", type: "جمعية خيرية", areas: "صحي، كبار السن، ذوي الإعاقة", vision: "رعاية كريمة لكل محتاج", mission: "رعاية صحية واجتماعية للمرضى وكبار السن", region: "منطقة الرياض", city: "الرياض", manager: "د. منى السبيعي", license: "2210", employees: "11", beneficiaries: "420" },
     { name: "وقف السقيا (مثال)", code: "SQY", sector: "القطاع الوقفي", type: "وقف", areas: "بيئي، تنموي وتمكين", vision: "ماء نقي لكل بيت", mission: "إنشاء مشاريع السقيا وصيانتها", region: "منطقة مكة المكرمة", city: "جدة", manager: "م. عبدالله الحربي", license: "3105", employees: "6", beneficiaries: "1500" }
    ].forEach(function (o, i) {
      var r = SERVER.api(T, "saveOrg", o);
      if (r.ok && i < 2) { SERVER.api(T, "addSamples", { __org: r.data.org.id }); }
    });
    [["sara", "سارة القحطاني", "contributor", [6, 10], "Sara2026"], ["view", "عضو مجلس الإدارة", "viewer", [], "View2026"]].forEach(function (x) {
      var r = SERVER.api(T, "saveUser", { __org: "main", org: "main", username: x[0], name: x[1], role: x[2], depts: x[3] });
      var t2 = SERVER.login(x[0], r.data.password, false).data.token;
      SERVER.api(t2, "changePassword", { current: r.data.password, next: x[4] });
      SERVER.logout(t2);
    });
    var mm = SERVER.api(T, "saveUser", { username: "member", name: "عضو منصة نافذ", role: "viewer", org: "*", phone: "0550000000" });
    if (mm.ok) { var t3 = SERVER.login("member", mm.data.password, false).data.token; SERVER.api(t3, "changePassword", { current: mm.data.password, next: "Member2026" }); SERVER.logout(t3); }
    SERVER.logout(T);
    persist();
  }

  /* ---------- google.script.run ---------- */
  function runner(h) {
    return new Proxy({}, { get: function (_, k) {
      if (k === "withSuccessHandler") return function (f) { return runner(Object.assign({}, h, { s: f })); };
      if (k === "withFailureHandler") return function (f) { return runner(Object.assign({}, h, { f: f })); };
      if (k === "withUserObject") return function () { return runner(h); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        setTimeout(function () {
          try {
            var out = SERVER[k].apply(null, args);
            persist();
            if (h.s) h.s(out == null ? null : JSON.parse(JSON.stringify(out)));
          } catch (e) { console.error(e); if (h.f) h.f(e); }
        }, 60);
      };
    } });
  }
  window.google = { script: { get run() { return runner({}); } } };

  /* ---------- أدوات النسخة التجريبية (من وحدة التحكم فقط: __DEMO__.reset()) ---------- */
  window.__DEMO__ = { accounts: DEMO, reset: function () { try { localStorage.removeItem(KEY); sessionStorage.clear(); localStorage.removeItem("ds.t"); } catch (e) { } location.reload(); } };
  // لوحة الحسابات التجريبية في بوابة الدخول مخفية بطلب المشرف العام؛ الحسابات تعمل كما هي.
})();
