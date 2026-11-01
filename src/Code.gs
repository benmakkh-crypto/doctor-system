/**
 * نظام الدكتور — الخادم (Google Apps Script)
 *
 * كل قراءة وكتابة تمر من هنا. الواجهة لا تلمس الجدول مباشرة، لذلك تُفرض
 * الصلاحيات وحد الاعتماد وفصل المهام والترقيم ومنع التكرار وسجل التدقيق
 * على الخادم، ولا يمكن تجاوزها من المتصفح.
 *
 * التثبيت: شغّل الدالة setup() مرة واحدة من المحرر، ثم انشر تطبيق ويب.
 */

const APP_VERSION = '3.0.1';
/** المشرف العام: أول حساب مسؤول يُنشأ عند التثبيت. كلمة مروره مؤقتة تظهر في سجل التنفيذ. */
const FIRST_ADMIN = { username: 'zubair', name: 'د.م. زبير الفضل', email: 'benmakkh@gmail.com' };
const SH = {
  users: 'المستخدمون',
  records: 'المعاملات',
  decisions: 'القرارات',
  settings: 'الإعدادات',
  audit: 'سجل_التدقيق',
  counters: 'العدادات',
  files: 'المرفقات'
};
const HEAD = {
  users: ['username', 'name', 'email', 'role', 'depts', 'active', 'salt', 'hash', 'failed', 'lockedUntil', 'mustChange', 'lastLogin', 'created'],
  records: ['id', 'no', 'g', 'm', 'status', 'deleted', 'updated', 'json'],
  decisions: ['id', 's', 'by', 'at', 'amt', 'note'],
  settings: ['key', 'value'],
  audit: ['at', 'user', 'action', 'recordId', 'no', 'detail'],
  counters: ['key', 'value'],
  files: ['id', 'recordId', 'name', 'mime', 'size', 'driveId', 'by', 'at']
};
const ROLES = { admin: 'مسؤول النظام', contributor: 'مساهم', viewer: 'مشاهد' };
const FINAL = ['مكتمل', 'مرفوض'];
const OPEN = ['جديد', 'قيد المتابعة', 'بانتظار الاعتماد'];
const SESSION_SEC = 6 * 3600;          // جلسة عادية: 6 ساعات
const REMEMBER_DAYS = 7;               // «تذكرني»: 7 أيام
const MAX_FAILED = 5;                  // محاولات قبل القفل
const LOCK_MIN = 15;                   // مدة القفل بالدقائق
const HASH_ROUNDS = 400;
const MAX_FILE = 5 * 1024 * 1024;      // 5 ميجابايت للمرفق
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const HIST_MAX = 60;

/* =====================================================================
 * نقطة الدخول
 * ===================================================================== */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('نظام الدكتور')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** معلومات عامة لشاشة الدخول (لا تتطلب جلسة). */
function getPublicConfig() {
  const ready = !!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  let org = '';
  if (ready) { try { org = getSettings_().orgName || ''; } catch (e) { org = ''; } }
  let sup = FIRST_ADMIN.name;
  if (ready) { try { sup = getSettings_().supervisor || sup; } catch (e) { } }
  return { ready: ready, orgName: org, supervisor: sup, version: APP_VERSION };
}

/* =====================================================================
 * التثبيت
 * ===================================================================== */
/**
 * شغّلها مرة واحدة من المحرر. تنشئ الجدول والمجلدات والنسخ الاحتياطي اليومي
 * وحساب المسؤول الأول، وتكتب كلمة المرور المؤقتة في سجل التنفيذ.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  const existing = props.getProperty('SPREADSHEET_ID');
  if (existing) ss = SpreadsheetApp.openById(existing);
  else {
    ss = SpreadsheetApp.create('قاعدة بيانات نظام الدكتور');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  Object.keys(SH).forEach(function (k) {
    let s = ss.getSheetByName(SH[k]);
    if (!s) s = ss.insertSheet(SH[k]);
    if (s.getLastRow() === 0) {
      s.getRange(1, 1, 1, HEAD[k].length).setValues([HEAD[k]]).setFontWeight('bold').setBackground('#0b4639').setFontColor('#ffffff');
      s.setFrozenRows(1);
    }
  });
  const keep = Object.keys(SH).map(function (k) { return SH[k]; });
  ss.getSheets().forEach(function (s) { if (keep.indexOf(s.getName()) < 0 && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s); });
  // نص خام في كل الخلايا: يمنع Sheets من تحويل المعرّفات والتواريخ إلى أرقام
  Object.keys(SH).forEach(function (k) { const s = ss.getSheetByName(SH[k]); s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns()).setNumberFormat('@'); });
  try { ss.setSpreadsheetTimeZone('Asia/Riyadh'); } catch (e) { }
  try { ss.setSpreadsheetLocale('ar_SA'); } catch (e) { }

  if (!props.getProperty('FOLDER_ID')) {
    const root = DriveApp.createFolder('نظام الدكتور');
    props.setProperty('FOLDER_ID', root.getId());
    props.setProperty('FILES_FOLDER_ID', root.createFolder('المرفقات').getId());
    props.setProperty('BACKUP_FOLDER_ID', root.createFolder('النسخ الاحتياطية').getId());
    DriveApp.getFileById(ss.getId()).moveTo(root);
  }

  if (!getSettings_().threshold) {
    putSetting_('threshold', 5000);
    putSetting_('sod', false);
    putSetting_('orgName', '');
    putSetting_('notify', true);
  }
  if (!getSettings_().supervisor) putSetting_('supervisor', FIRST_ADMIN.name);

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(2).create();

  const users = table_('users');
  let msg = 'الجدول: ' + ss.getUrl();
  if (!users.rows.length) {
    const pw = tempPassword_();
    addUser_({ username: FIRST_ADMIN.username, name: FIRST_ADMIN.name, email: FIRST_ADMIN.email, role: 'admin', depts: '', password: pw, mustChange: true });
    msg += '\nالمشرف العام: ' + FIRST_ADMIN.name + '\nاسم المستخدم: ' + FIRST_ADMIN.username + '\nكلمة المرور المؤقتة: ' + pw + '\n(سيُطلب تغييرها عند أول دخول)';
  }
  bumpRev_();
  Logger.log(msg);
  return msg;
}

/** يعيد تعيين كلمة مرور المشرف العام إن فُقدت. شغّلها من المحرر فقط. */
function resetAdminPassword() {
  const pw = tempPassword_();
  const u = findUser_(FIRST_ADMIN.username) || findUser_('admin');
  if (!u) throw new Error('لا يوجد حساب للمشرف العام. شغّل setup() أولًا.');
  setPassword_(u, pw, true);
  setUserCells_(u._row, { active: true, failed: 0, lockedUntil: '' });
  Logger.log('كلمة المرور المؤقتة الجديدة للمستخدم ' + u.username + ': ' + pw);
}

/* =====================================================================
 * الوصول إلى الجدول
 * ===================================================================== */
let SS_ = null;
function ss_() {
  if (SS_) return SS_;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw err_('SETUP', 'النظام غير مثبّت بعد. شغّل الدالة setup() من محرر Apps Script.');
  SS_ = SpreadsheetApp.openById(id);
  return SS_;
}
function sheet_(k) { return ss_().getSheetByName(SH[k]); }
function table_(k) {
  const s = sheet_(k);
  const n = s.getLastRow();
  const head = HEAD[k];
  if (n < 2) return { sheet: s, rows: [] };
  const vals = s.getRange(2, 1, n - 1, head.length).getValues();
  return {
    sheet: s,
    rows: vals.map(function (r, i) {
      const o = { _row: i + 2 };
      head.forEach(function (h, j) { o[h] = r[j]; });
      return o;
    })
  };
}
function findRow_(k, id) {
  const s = sheet_(k);
  if (s.getLastRow() < 2) return 0;
  const hit = s.getRange(2, 1, s.getLastRow() - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

/* ---------- الإعدادات ---------- */
function getSettings_() {
  const o = {};
  table_('settings').rows.forEach(function (r) {
    try { o[r.key] = JSON.parse(r.value); } catch (e) { o[r.key] = r.value; }
  });
  return o;
}
function putSetting_(key, val) {
  const row = findRow_('settings', key);
  const s = sheet_('settings');
  if (row) s.getRange(row, 2).setValue(JSON.stringify(val));
  else s.appendRow([key, JSON.stringify(val)]);
}
function bumpRev_() {
  const p = PropertiesService.getScriptProperties();
  p.setProperty('REV', String(Date.now()));
}
function rev_() { return PropertiesService.getScriptProperties().getProperty('REV') || '0'; }

/* =====================================================================
 * المستخدمون وكلمات المرور
 * ===================================================================== */
function hex_(bytes) {
  return bytes.map(function (b) { const v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hashPw_(salt, pw) {
  let h = salt + '|' + pw;
  for (let i = 0; i < HASH_ROUNDS; i++) h = sha_(h + salt);
  return 'h' + h;
}
function safeEq_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function tempPassword_() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const raw = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (let i = 0; i < 12; i++) s += chars.charAt(parseInt(raw.substr(i * 2, 2), 16) % chars.length);
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8) + '7';
}
function checkPolicy_(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw err_('VALIDATION', 'كلمة المرور 8 أحرف على الأقل.');
  if (pw.length > 128) throw err_('VALIDATION', 'كلمة المرور طويلة جدًا.');
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/[0-9٠-٩]/.test(pw)) throw err_('VALIDATION', 'كلمة المرور يجب أن تحتوي على حروف وأرقام.');
}
function normUser_(u) { return String(u || '').trim().toLowerCase(); }
function findUser_(username) {
  const u = normUser_(username);
  const t = table_('users');
  for (let i = 0; i < t.rows.length; i++) if (String(t.rows[i].username).toLowerCase() === u) return t.rows[i];
  return null;
}
function setUserCells_(row, obj) {
  const s = sheet_('users');
  Object.keys(obj).forEach(function (k) {
    const c = HEAD.users.indexOf(k);
    if (c >= 0) s.getRange(row, c + 1).setValue(obj[k]);
  });
}
function setPassword_(u, pw, mustChange) {
  const salt = 's' + Utilities.getUuid().replace(/-/g, '');
  setUserCells_(u._row, { salt: salt, hash: hashPw_(salt, pw), mustChange: !!mustChange });
}
function addUser_(o) {
  const salt = 's' + Utilities.getUuid().replace(/-/g, '');
  sheet_('users').appendRow([normUser_(o.username), o.name, o.email || '', o.role, o.depts || '', true, salt, hashPw_(salt, o.password), 0, '', !!o.mustChange, '', new Date().toISOString()]);
}
function publicUser_(u) {
  return {
    username: String(u.username), name: String(u.name), email: String(u.email || ''), role: String(u.role),
    roleName: ROLES[u.role] || u.role, depts: parseDepts_(u.depts), active: u.active === true || u.active === 'TRUE',
    lastLogin: u.lastLogin ? String(u.lastLogin) : '', mustChange: u.mustChange === true || u.mustChange === 'TRUE'
  };
}
function parseDepts_(d) {
  return String(d || '').split(/[,،\s]+/).map(Number).filter(function (n) { return n > 0 && n < SCHEMA.G.length; });
}

/* =====================================================================
 * الجلسات
 * ===================================================================== */
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function tkey_(token) { return 's_' + sha_(String(token)).slice(0, 40); }

/** تسجيل الدخول. يعيد رمز الجلسة، أو رسالة عامة لا تكشف هل الاسم موجود. */
function login(username, password, remember) {
  const generic = { ok: false, code: 'AUTH', message: 'اسم المستخدم أو كلمة المرور غير صحيحة. يُقفل الحساب 15 دقيقة بعد 5 محاولات خاطئة.' };
  try {
    const uname = normUser_(username);
    if (!uname || !password) return generic;
    const cache = CacheService.getScriptCache();
    const tries = +(cache.get('try_' + uname) || 0);
    if (tries >= 20) return { ok: false, code: 'LOCKED', message: 'محاولات كثيرة. انتظر 15 دقيقة ثم أعد المحاولة.' };
    cache.put('try_' + uname, String(tries + 1), 900);

    const lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      const u = findUser_(uname);
      if (!u) { hashPw_('x', String(password)); return generic; }
      if (!(u.active === true || u.active === 'TRUE')) return { ok: false, code: 'DISABLED', message: 'هذا الحساب موقوف. تواصل مع مسؤول النظام.' };
      if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) {
        const min = Math.ceil((new Date(u.lockedUntil) - new Date()) / 60000);
        return { ok: false, code: 'LOCKED', message: 'الحساب مقفل مؤقتًا بعد محاولات خاطئة. أعد المحاولة بعد ' + min + ' دقيقة.' };
      }
      if (!safeEq_(hashPw_(String(u.salt), String(password)), u.hash)) {
        const f = (+u.failed || 0) + 1;
        if (f >= MAX_FAILED) {
          setUserCells_(u._row, { failed: 0, lockedUntil: new Date(Date.now() + LOCK_MIN * 60000).toISOString() });
          audit_(uname, 'قفل الحساب', '', '', MAX_FAILED + ' محاولات خاطئة');
          return { ok: false, code: 'LOCKED', message: 'أُقفل الحساب ' + LOCK_MIN + ' دقيقة بعد ' + MAX_FAILED + ' محاولات خاطئة.' };
        }
        setUserCells_(u._row, { failed: f });
        return generic;
      }
      setUserCells_(u._row, { failed: 0, lockedUntil: '', lastLogin: new Date().toISOString() });
      cache.remove('try_' + uname);
      const token = newToken_();
      const exp = Date.now() + (remember ? REMEMBER_DAYS * 86400000 : SESSION_SEC * 1000);
      saveSession_(token, uname, exp, !!remember);
      audit_(uname, 'تسجيل دخول', '', '', remember ? 'مع «تذكرني»' : '');
      return { ok: true, data: { token: token, mustChange: publicUser_(u).mustChange, name: String(u.name) } };
    } finally { lock.releaseLock(); }
  } catch (e) { return fail_(e); }
}
function saveSession_(token, uname, exp, persist) {
  const val = JSON.stringify({ u: uname, exp: exp, p: persist });
  CacheService.getScriptCache().put(tkey_(token), val, Math.min(SESSION_SEC, Math.max(60, Math.floor((exp - Date.now()) / 1000))));
  if (persist) PropertiesService.getScriptProperties().setProperty(tkey_(token), val);
}
function session_(token) {
  if (!token || typeof token !== 'string' || token.length > 100) throw err_('AUTH', 'انتهت الجلسة. سجّل الدخول مرة أخرى.');
  const k = tkey_(token);
  let raw = CacheService.getScriptCache().get(k);
  if (!raw) raw = PropertiesService.getScriptProperties().getProperty(k);
  if (!raw) throw err_('AUTH', 'انتهت الجلسة. سجّل الدخول مرة أخرى.');
  const s = JSON.parse(raw);
  if (s.exp < Date.now()) { endSession_(token); throw err_('AUTH', 'انتهت الجلسة. سجّل الدخول مرة أخرى.'); }
  const u = findUser_(s.u);
  if (!u || !(u.active === true || u.active === 'TRUE')) { endSession_(token); throw err_('AUTH', 'الحساب غير متاح. تواصل مع مسؤول النظام.'); }
  if (!s.p) { s.exp = Math.max(s.exp, Date.now() + SESSION_SEC * 1000); }
  CacheService.getScriptCache().put(k, JSON.stringify(s), SESSION_SEC);
  const pu = publicUser_(u); pu._row = u._row;
  return pu;
}
function endSession_(token) {
  const k = tkey_(token);
  CacheService.getScriptCache().remove(k);
  PropertiesService.getScriptProperties().deleteProperty(k);
}
function logout(token) { try { endSession_(token); } catch (e) { } return { ok: true }; }

/* =====================================================================
 * واجهة البرمجة (كل طلبات الواجهة)
 * ===================================================================== */
function api(token, action, payload) {
  try {
    const me = session_(token);
    payload = payload || {};
    if (me.mustChange && action !== 'changePassword' && action !== 'me') throw err_('MUST_CHANGE', 'غيّر كلمة المرور المؤقتة أولًا.');
    const fn = ACTIONS[action];
    if (!fn) throw err_('VALIDATION', 'إجراء غير معروف.');
    const write = WRITE_ACTIONS.indexOf(action) >= 0;
    if (write && me.role === 'viewer' && action !== 'changePassword') throw err_('FORBIDDEN', 'صلاحيتك للعرض فقط.');
    let out;
    if (write) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) throw err_('BUSY', 'النظام مشغول بعمليات أخرى. أعد المحاولة بعد لحظات.');
      try { out = fn(me, payload); bumpRev_(); } finally { lock.releaseLock(); }
    } else out = fn(me, payload);
    return { ok: true, data: out, rev: rev_() };
  } catch (e) { return fail_(e); }
}
const WRITE_ACTIONS = ['create', 'update', 'status', 'route', 'escalate', 'deescalate', 'note', 'remove', 'restore', 'purge', 'emptyTrash',
  'saveSettings', 'saveUser', 'resetPassword', 'changePassword', 'upload', 'removeFile', 'importData', 'clearSamples', 'addSamples', 'backupNow'];

const ACTIONS = {
  me: function (me) { return clean_(me); },
  ping: function () { return { rev: rev_() }; },
  bootstrap: bootstrap_,
  create: actCreate_,
  update: actUpdate_,
  status: actStatus_,
  route: actRoute_,
  escalate: actEscalate_,
  deescalate: function (me, p) { return mutate_(me, p.id, function (r) { r.pri = 0; return ['إلغاء التصعيد', '']; }); },
  note: function (me, p) {
    const t = str_(p.text, SCHEMA.LIMITS.note);
    if (!t) throw err_('VALIDATION', 'اكتب نص الملاحظة.');
    return mutate_(me, p.id, function () { return ['ملاحظة متابعة', t]; });
  },
  remove: function (me, p) {
    return mutate_(me, p.id, function (r) { r.deleted = true; r.deletedAt = now_(); r.deletedBy = me.username; return ['نقل إلى المحذوفات', '']; }, { allowDeleted: true });
  },
  restore: function (me, p) {
    return mutate_(me, p.id, function (r) { delete r.deleted; delete r.deletedAt; delete r.deletedBy; return ['استعادة', '']; }, { allowDeleted: true });
  },
  purge: function (me, p) { needAdmin_(me); purge_(me, p.id); return { id: p.id }; },
  emptyTrash: function (me) {
    needAdmin_(me);
    const ids = loadRecords_().filter(function (r) { return r.deleted; }).map(function (r) { return r.id; });
    ids.forEach(function (id) { purge_(me, id); });
    return { count: ids.length };
  },
  saveSettings: function (me, p) {
    needAdmin_(me);
    const t = Number(p.threshold);
    if (!isFinite(t) || t < 0 || t > 1e10) throw err_('VALIDATION', 'حد الاعتماد يجب أن يكون رقمًا موجبًا.');
    putSetting_('orgName', str_(p.orgName, 120));
    putSetting_('threshold', t);
    putSetting_('sod', !!p.sod);
    putSetting_('notify', !!p.notify);
    audit_(me.username, 'تعديل الإعدادات', '', '', 'حد الاعتماد ' + t + (p.sod ? ' · فصل المهام' : ''));
    return getSettings_();
  },
  listUsers: function (me) { needAdmin_(me); return table_('users').rows.map(publicUser_); },
  saveUser: actSaveUser_,
  resetPassword: function (me, p) {
    needAdmin_(me);
    const u = findUser_(p.username);
    if (!u) throw err_('NOTFOUND', 'المستخدم غير موجود.');
    const pw = tempPassword_();
    setPassword_(u, pw, true);
    setUserCells_(u._row, { failed: 0, lockedUntil: '' });
    audit_(me.username, 'إعادة تعيين كلمة مرور', '', '', String(u.username));
    return { password: pw };
  },
  changePassword: function (me, p) {
    const u = findUser_(me.username);
    if (!safeEq_(hashPw_(String(u.salt), String(p.current || '')), u.hash)) throw err_('VALIDATION', 'كلمة المرور الحالية غير صحيحة.');
    checkPolicy_(p.next);
    if (p.next === p.current) throw err_('VALIDATION', 'اختر كلمة مرور مختلفة عن الحالية.');
    setPassword_(u, p.next, false);
    audit_(me.username, 'تغيير كلمة المرور', '', '', '');
    return { ok: true };
  },
  upload: actUpload_,
  getFile: actGetFile_,
  removeFile: actRemoveFile_,
  audit: function (me, p) {
    needAdmin_(me);
    const t = table_('audit').rows;
    const lim = Math.min(500, +p.limit || 200);
    return t.slice(-lim).reverse().map(function (r) { return { at: String(r.at), user: String(r.user), action: String(r.action), no: String(r.no), detail: String(r.detail) }; });
  },
  exportData: function (me) {
    needAdmin_(me);
    audit_(me.username, 'تصدير نسخة احتياطية', '', '', '');
    return { system: 'نظام الدكتور', version: APP_VERSION, exportedAt: now_(), settings: getSettings_(), records: loadRecords_().map(clean_), decisions: loadDecisions_() };
  },
  importData: actImport_,
  clearSamples: function (me) {
    needAdmin_(me);
    const ids = loadRecords_().filter(function (r) { return r.sample; }).map(function (r) { return r.id; });
    ids.forEach(function (id) { purge_(me, id); });
    return { count: ids.length };
  },
  addSamples: function (me) { needAdmin_(me); return { count: seedSamples_(me) }; },
  backupNow: function (me) { needAdmin_(me); const n = dailyBackup(); audit_(me.username, 'نسخة احتياطية يدوية', '', '', n); return { name: n }; }
};

/* =====================================================================
 * تحميل البيانات
 * ===================================================================== */
let REC_CACHE_ = null;
function loadRecords_() {
  if (REC_CACHE_) return REC_CACHE_;
  REC_CACHE_ = table_('records').rows.map(function (row) {
    let r = {};
    try { r = JSON.parse(row.json); } catch (e) { r = {}; }
    r.id = String(row.id); r._row = row._row;
    return r;
  });
  return REC_CACHE_;
}
function loadDecisions_() {
  const o = {};
  table_('decisions').rows.forEach(function (r) { o[String(r.id)] = { s: String(r.s), by: String(r.by), at: String(r.at), amt: Number(r.amt), note: String(r.note || '') }; });
  return o;
}
function canSeeDept_(me, g) { return me.role === 'admin' || !me.depts.length || me.depts.indexOf(+g) >= 0; }
function maskRec_(r) {
  const c = JSON.parse(JSON.stringify(r));
  const defs = SCHEMA.F[c.g] || [];
  defs.forEach(function (d) {
    const v = c.f && c.f[d.k];
    if (!v) return;
    if (d.t === 'nid' || d.t === 'tel') { const s = String(v); c.f[d.k] = s.slice(0, 2) + '******' + s.slice(-2); }
    if (d.t === 'email') c.f[d.k] = String(v).replace(/^(.).*(@.*)$/, '$1***$2');
  });
  return c;
}
function clean_(r) { const c = JSON.parse(JSON.stringify(r)); delete c._row; return c; }
function bootstrap_(me) {
  const recs = loadRecords_().filter(function (r) { return canSeeDept_(me, r.g); }).map(function (r) { return clean_(me.role === 'viewer' ? maskRec_(r) : r); });
  const ids = {};
  recs.forEach(function (r) { ids[r.id] = 1; });
  const decAll = loadDecisions_(), dec = {};
  Object.keys(decAll).forEach(function (k) { if (ids[k]) dec[k] = decAll[k]; });
  const people = table_('users').rows.filter(function (u) { return u.active === true || u.active === 'TRUE'; })
    .map(function (u) { return { username: String(u.username), name: String(u.name), role: String(u.role), hasEmail: !!u.email }; });
  return { me: clean_(me), settings: getSettings_(), records: recs, decisions: dec, people: people, schema: SCHEMA, version: APP_VERSION, now: now_() };
}

/* =====================================================================
 * التحقق من المدخلات
 * ===================================================================== */
function str_(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n) : ''; }
function date_(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T12:00:00')) ? v : ''; }
function now_() { return new Date().toISOString(); }
function recSum_(r) { return SCHEMA.MONEY_KEYS.reduce(function (a, k) { return a + (+(r.f && r.f[k]) || 0); }, 0); }
function requires_(r, cfg) { const t = +cfg.threshold || 0; return t > 0 && recSum_(r) >= t; }

function validate_(input, me, existingId) {
  const L = SCHEMA.LIMITS;
  const g = +input.g, m = +input.m;
  if (!(g > 0) || !SCHEMA.G[g] || SCHEMA.G[g].items[m] == null) throw err_('VALIDATION', 'اختر إدارة ووحدة صحيحتين.', 'g');
  if (!canSeeDept_(me, g)) throw err_('FORBIDDEN', 'ليست لديك صلاحية على إدارة ' + SCHEMA.G[g].n + '.');
  const out = { g: g, m: m };
  out.title = str_(input.title, L.title);
  if (!out.title) throw err_('VALIDATION', 'اكتب عنوانًا للمعاملة.', 'title');
  out.date = date_(input.date);
  if (!out.date) throw err_('VALIDATION', 'اختر التاريخ.', 'date');
  out.due = date_(input.due);
  if (out.due && out.due < out.date) throw err_('VALIDATION', 'تاريخ الاستحقاق قبل تاريخ المعاملة.', 'due');
  out.owner = str_(input.owner, L.text);
  out.notes = str_(input.notes, L.notes);
  out.pri = [0, 1, 2].indexOf(+input.pri) >= 0 ? +input.pri : 0;
  const f = {};
  const all = loadRecords_().filter(function (r) { return !r.deleted && r.g === g && r.id !== existingId; });
  (SCHEMA.F[g] || []).forEach(function (d) {
    let v = input.f ? input.f[d.k] : '';
    if (v == null) v = '';
    if (typeof v === 'number') v = String(v);
    v = str_(v, L.text);
    if (d.req && v === '') throw err_('VALIDATION', 'حقل «' + d.l + '» مطلوب.', d.k);
    if (v === '') return;
    if (d.t === 'tel' && !/^05\d{8}$/.test(v)) throw err_('VALIDATION', 'رقم الجوال يبدأ بـ 05 ويتكون من 10 أرقام.', d.k);
    if (d.t === 'nid' && !/^[12]\d{9}$/.test(v)) throw err_('VALIDATION', 'رقم الهوية 10 أرقام ويبدأ بـ 1 للمواطن أو 2 للمقيم.', d.k);
    if (d.t === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw err_('VALIDATION', 'صيغة البريد غير صحيحة.', d.k);
    if (d.t === 'select' && d.o.indexOf(v) < 0) throw err_('VALIDATION', 'اختر قيمة من القائمة في «' + d.l + '».', d.k);
    if (d.t === 'date' && !date_(v)) throw err_('VALIDATION', 'تاريخ غير صحيح في «' + d.l + '».', d.k);
    let val = v;
    if (['money', 'number', 'pct'].indexOf(d.t) >= 0) {
      const n = Number(v);
      if (!isFinite(n) || n < 0) throw err_('VALIDATION', 'أدخل رقمًا موجبًا في «' + d.l + '».', d.k);
      if (d.t === 'pct' && n > 100) throw err_('VALIDATION', 'النسبة بين 0 و100.', d.k);
      if (d.t === 'money' && n > 1e10) throw err_('VALIDATION', 'المبلغ أكبر من المعقول.', d.k);
      val = n;
    }
    if (d.uniq) {
      const dup = all.find(function (x) { return String(x.f && x.f[d.k] != null ? x.f[d.k] : '') === String(val); });
      if (dup) throw err_('VALIDATION', 'مسجّل مسبقًا في «' + dup.title + '» (' + (dup.no || '') + ').', d.k);
    }
    f[d.k] = val;
  });
  out.f = f;
  return out;
}

/* =====================================================================
 * الكتابة
 * ===================================================================== */
function nextNo_(g) {
  const year = new Date().getFullYear();
  const key = SCHEMA.G[g].c + '-' + year;
  const row = findRow_('counters', key);
  const s = sheet_('counters');
  let n = 1;
  if (row) { n = (+s.getRange(row, 2).getValue() || 0) + 1; s.getRange(row, 2).setValue(n); }
  else s.appendRow([key, 1]);
  return key + '-' + ('00000' + n).slice(-5);
}
function writeRec_(r) {
  const c = clean_(r);
  const line = [c.id, c.no || '', c.g, c.m, c.status, !!c.deleted, c.updated, JSON.stringify(c)];
  if (line[7].length > 45000) throw err_('VALIDATION', 'المعاملة كبيرة جدًا. اختصر الملاحظات.');
  const row = findRow_('records', c.id);
  if (row) sheet_('records').getRange(row, 1, 1, line.length).setValues([line]);
  else sheet_('records').appendRow(line);
  if (REC_CACHE_) {
    const copy = JSON.parse(JSON.stringify(c)); copy._row = row || sheet_('records').getLastRow();
    const i = REC_CACHE_.findIndex(function (x) { return x.id === c.id; });
    if (i >= 0) REC_CACHE_[i] = copy; else REC_CACHE_.push(copy);
  }
  return c;
}
function hist_(r, me, a, t, extra) {
  const h = { at: now_(), by: me.username, a: a };
  if (t) h.t = t;
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  r.hist = [h].concat(r.hist || []).slice(0, HIST_MAX);
}
function getRec_(me, id, opts) {
  const row = findRow_('records', id);
  if (!row) throw err_('NOTFOUND', 'المعاملة غير موجودة. ربما حذفها مستخدم آخر نهائيًا.');
  const v = sheet_('records').getRange(row, 1, 1, HEAD.records.length).getValues()[0];
  const r = JSON.parse(v[7]); r.id = String(v[0]); r._row = row;
  if (!canSeeDept_(me, r.g)) throw err_('FORBIDDEN', 'ليست لديك صلاحية على هذه الإدارة.');
  if (r.deleted && !(opts && opts.allowDeleted)) throw err_('VALIDATION', 'المعاملة في المحذوفات. استعدها أولًا.');
  return r;
}
/** يطبّق تغييرًا على أحدث نسخة من المعاملة تحت القفل، فلا يضيع تعديل متزامن. */
function mutate_(me, id, fn, opts) {
  const r = getRec_(me, id, opts);
  const res = fn(r) || [];
  r.updated = now_(); r.updatedBy = me.username;
  hist_(r, me, res[0] || 'تعديل', res[1] || '', res[2]);
  audit_(me.username, res[0] || 'تعديل', r.id, r.no, res[1] || '');
  return { record: writeRec_(r), decision: loadDecisions_()[r.id] || null };
}
function purge_(me, id) {
  const row = findRow_('records', id);
  if (!row) return;
  const v = sheet_('records').getRange(row, 1, 1, 2).getValues()[0];
  sheet_('records').deleteRow(row);
  REC_CACHE_ = null;
  const d = findRow_('decisions', id);
  if (d) sheet_('decisions').deleteRow(d);
  audit_(me.username, 'حذف نهائي', String(v[0]), String(v[1]), '');
}

function actCreate_(me, p) {
  const v = validate_(p, me, null);
  const cfg = getSettings_();
  const st = OPEN.indexOf(p.status) >= 0 ? p.status : 'جديد';
  const r = {
    id: Utilities.getUuid(), no: nextNo_(v.g), g: v.g, m: v.m, title: v.title, status: st, pri: v.pri, esc: 0,
    date: v.date, due: v.due, owner: v.owner, notes: v.notes, f: v.f,
    created: now_(), updated: now_(), createdBy: me.username, updatedBy: me.username, hist: [], files: []
  };
  if (p.copyOf) hist_(r, me, 'إنشاء (نسخة من ' + str_(p.copyOf, 40) + ')', '');
  else hist_(r, me, 'إنشاء', '');
  const split = splitCheck_(r, cfg);
  if (split) { r.flags = ['split']; hist_(r, me, 'تنبيه تجزئة', split); }
  audit_(me.username, 'إنشاء', r.id, r.no, r.title);
  const out = writeRec_(r);
  if (st === 'بانتظار الاعتماد') notifyAdmins_(r, 'معاملة جديدة بانتظار الاعتماد');
  return { record: out };
}
/** يكشف تقسيم مبلغ كبير إلى معاملات صغيرة للطرف نفسه خلال 7 أيام. */
function splitCheck_(r, cfg) {
  const t = +cfg.threshold || 0;
  const amt = recSum_(r);
  if (!t || !amt || amt >= t) return '';
  const keyDef = (SCHEMA.F[r.g] || []).find(function (d) { return d.t === 'nid'; }) || (SCHEMA.F[r.g] || []).find(function (d) { return d.req && d.t === 'text'; });
  if (!keyDef) return '';
  const key = r.f[keyDef.k];
  if (!key) return '';
  const from = new Date(new Date(r.date + 'T12:00:00').getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const near = loadRecords_().filter(function (x) { return !x.deleted && x.g === r.g && x.f && String(x.f[keyDef.k]) === String(key) && x.date >= from && x.date <= r.date; });
  const sum = near.reduce(function (a, x) { return a + recSum_(x); }, amt);
  if (near.length && sum >= t) return 'مجموع معاملات «' + key + '» خلال 7 أيام = ' + sum + ' ر.س، وهو يبلغ حد الاعتماد (' + t + ').';
  return '';
}
function actUpdate_(me, p) {
  const r = getRec_(me, p.id);
  if (p.base && r.updated !== p.base && !p.force) throw err_('CONFLICT', 'عدّل مستخدم آخر هذه المعاملة بعد أن فتحتها.');
  const cfg = getSettings_();
  const before = { sum: recSum_(r), title: r.title, f: JSON.stringify(r.f || {}), notes: r.notes || '', due: r.due || '', date: r.date, m: r.m, owner: r.owner || '', pri: +r.pri || 0 };
  const v = validate_(Object.assign({}, p, { g: r.g }), me, r.id);
  const ch = [];
  if (before.title !== v.title) ch.push('العنوان');
  if (before.f !== JSON.stringify(v.f)) ch.push('البيانات');
  if (before.notes !== v.notes) ch.push('الملاحظات');
  if (before.due !== v.due || before.date !== v.date) ch.push('التواريخ');
  if (before.m !== v.m) ch.push('الوحدة');
  if (before.owner !== v.owner) ch.push('المسؤول');
  if (before.pri !== v.pri) ch.push('الأولوية');
  Object.assign(r, { m: v.m, title: v.title, date: v.date, due: v.due, owner: v.owner, notes: v.notes, f: v.f, pri: v.pri });
  if (OPEN.indexOf(r.status) >= 0 && OPEN.indexOf(p.status) >= 0 && p.status !== r.status) { r.status = p.status; ch.push('الحالة'); }
  let extra = '';
  const dec = loadDecisions_()[r.id];
  if (dec && recSum_(r) !== before.sum && requires_(r, cfg)) {
    const d = findRow_('decisions', r.id); if (d) sheet_('decisions').deleteRow(d);
    r.status = 'بانتظار الاعتماد';
    extra = 'تغيّرت القيمة من ' + before.sum + ' إلى ' + recSum_(r) + ' بعد القرار، فعادت لانتظار الاعتماد.';
  } else if (!dec && FINAL.indexOf(r.status) >= 0 && requires_(r, cfg) && recSum_(r) !== before.sum) {
    r.status = 'بانتظار الاعتماد';
    extra = 'بلغت القيمة حد الاعتماد بعد التعديل، فتحولت لانتظار الاعتماد.';
  }
  r.updated = now_(); r.updatedBy = me.username;
  hist_(r, me, 'تعديل', (ch.length ? 'عُدّل: ' + ch.join('، ') : '') + (extra ? (ch.length ? ' — ' : '') + extra : ''));
  audit_(me.username, 'تعديل', r.id, r.no, ch.join('، ') + (extra ? ' | ' + extra : ''));
  return { record: writeRec_(r), decision: loadDecisions_()[r.id] || null };
}
function actStatus_(me, p) {
  const st = String(p.status || '');
  if (OPEN.indexOf(st) < 0 && FINAL.indexOf(st) < 0) throw err_('VALIDATION', 'حالة غير معروفة.');
  const r = getRec_(me, p.id);
  const cfg = getSettings_();
  const note = str_(p.note, SCHEMA.LIMITS.note);
  const need = requires_(r, cfg);
  const prev = r.status;
  if (prev === st) return { record: clean_(r), decision: loadDecisions_()[r.id] || null };
  if (st === 'مرفوض' && !note) throw err_('VALIDATION', 'اكتب سبب الرفض.');
  if (need && (FINAL.indexOf(st) >= 0 || FINAL.indexOf(prev) >= 0)) {
    if (me.role !== 'admin') throw err_('FORBIDDEN', 'القرار لمسؤولي النظام لأن القيمة ' + recSum_(r) + ' ر.س تبلغ حد الاعتماد.');
    if (cfg.sod && FINAL.indexOf(st) >= 0 && r.createdBy === me.username) throw err_('FORBIDDEN', 'فصل المهام مفعّل: لا يعتمد منشئ الطلب طلبه.');
  }
  let label;
  if (FINAL.indexOf(prev) >= 0 && OPEN.indexOf(st) >= 0) label = 'إعادة فتح';
  else if (st === 'بانتظار الاعتماد') label = 'رفع للاعتماد';
  else if (st === 'مكتمل') label = need ? 'اعتماد' : 'إكمال';
  else if (st === 'مرفوض') label = 'رفض';
  else label = 'نقل إلى «' + st + '»';
  r.status = st;
  if (FINAL.indexOf(st) >= 0) r.pri = 0;
  const drow = findRow_('decisions', r.id);
  if (drow) sheet_('decisions').deleteRow(drow);
  if (need && FINAL.indexOf(st) >= 0) sheet_('decisions').appendRow([r.id, st, me.username, now_(), recSum_(r), note]);
  r.updated = now_(); r.updatedBy = me.username;
  hist_(r, me, label, note);
  audit_(me.username, label, r.id, r.no, note);
  const out = writeRec_(r);
  if (st === 'بانتظار الاعتماد' && need) notifyAdmins_(r, 'معاملة بانتظار اعتمادك');
  if (FINAL.indexOf(st) >= 0 && r.createdBy && r.createdBy !== me.username) notifyUser_(r.createdBy, r, label === 'رفض' ? 'رُفضت معاملتك' : 'اكتملت معاملتك', note);
  return { record: out, decision: loadDecisions_()[r.id] || null };
}
function actRoute_(me, p) {
  const to = findUser_(p.to);
  if (!to || !(to.active === true || to.active === 'TRUE')) throw err_('VALIDATION', 'اختر مستخدمًا نشطًا.');
  const due = date_(p.due);
  const note = str_(p.note, SCHEMA.LIMITS.note);
  const res = mutate_(me, p.id, function (r) {
    if (FINAL.indexOf(r.status) >= 0) throw err_('VALIDATION', 'لا يمكن توجيه معاملة مغلقة. أعد فتحها أولًا.');
    r.to = String(to.username);
    if (due) { if (due < r.date) throw err_('VALIDATION', 'تاريخ الاستحقاق قبل تاريخ المعاملة.'); r.due = due; }
    if (r.status === 'جديد') r.status = 'قيد المتابعة';
    return ['توجيه', note, { to: String(to.username) }];
  });
  notifyUser_(String(to.username), res.record, 'وُجّهت إليك معاملة', note);
  return res;
}
function actEscalate_(me, p) {
  const lvl = +p.level === 2 ? 2 : 1;
  const note = str_(p.note, SCHEMA.LIMITS.note);
  if (!note) throw err_('VALIDATION', 'اكتب سبب التصعيد.');
  const res = mutate_(me, p.id, function (r) {
    if (FINAL.indexOf(r.status) >= 0) throw err_('VALIDATION', 'لا يمكن تصعيد معاملة مغلقة.');
    r.pri = lvl; r.esc = (+r.esc || 0) + 1;
    if (r.status === 'جديد') r.status = 'قيد المتابعة';
    return ['تصعيد إلى «' + SCHEMA.PRI[lvl].n + '»', note];
  });
  if (lvl === 2) notifyAdmins_(res.record, 'تصعيد حرج');
  if (res.record.to) notifyUser_(res.record.to, res.record, 'صُعّدت معاملة موجهة إليك', note);
  return res;
}

/* ---------- المستخدمون (للمسؤول) ---------- */
function actSaveUser_(me, p) {
  needAdmin_(me);
  const uname = normUser_(p.username);
  if (!/^[a-z0-9._-]{3,30}$/.test(uname)) throw err_('VALIDATION', 'اسم المستخدم 3–30 حرفًا إنجليزيًا صغيرًا أو أرقامًا أو . _ -', 'username');
  const name = str_(p.name, 80);
  if (!name) throw err_('VALIDATION', 'اكتب الاسم الكامل.', 'name');
  const email = str_(p.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err_('VALIDATION', 'صيغة البريد غير صحيحة.', 'email');
  if (!ROLES[p.role]) throw err_('VALIDATION', 'اختر الدور.', 'role');
  const depts = (Array.isArray(p.depts) ? p.depts : []).map(Number).filter(function (n) { return n > 0 && n < SCHEMA.G.length; }).join(',');
  const u = findUser_(uname);
  if (u) {
    if (uname === me.username && (p.role !== 'admin' || p.active === false)) throw err_('VALIDATION', 'لا يمكنك إزالة صلاحية المسؤول عن نفسك أو إيقاف حسابك.');
    if (u.role === 'admin' && p.role !== 'admin') {
      const admins = table_('users').rows.filter(function (x) { return x.role === 'admin' && (x.active === true || x.active === 'TRUE'); });
      if (admins.length <= 1) throw err_('VALIDATION', 'يجب أن يبقى مسؤول نظام واحد على الأقل.');
    }
    setUserCells_(u._row, { name: name, email: email, role: p.role, depts: depts, active: p.active !== false });
    audit_(me.username, 'تعديل مستخدم', '', '', uname + ' · ' + ROLES[p.role] + (p.active === false ? ' · موقوف' : ''));
    return { username: uname };
  }
  const pw = tempPassword_();
  addUser_({ username: uname, name: name, email: email, role: p.role, depts: depts, password: pw, mustChange: true });
  audit_(me.username, 'إضافة مستخدم', '', '', uname + ' · ' + ROLES[p.role]);
  return { username: uname, password: pw };
}

/* ---------- المرفقات ---------- */
function actUpload_(me, p) {
  const name = str_(p.name, 120).replace(/[\\/:*?"<>|]/g, '_');
  const mime = String(p.mime || '');
  if (FILE_TYPES.indexOf(mime) < 0) throw err_('VALIDATION', 'الأنواع المسموحة: PDF وJPG وPNG وWEBP.');
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (!bytes.length) throw err_('VALIDATION', 'الملف فارغ.');
  if (bytes.length > MAX_FILE) throw err_('VALIDATION', 'حجم الملف أكبر من 5 ميجابايت.');
  const r = getRec_(me, p.id);
  if ((r.files || []).length >= 15) throw err_('VALIDATION', 'الحد الأقصى 15 مرفقًا لكل معاملة.');
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, (r.no || r.id) + ' — ' + name));
  const fid = Utilities.getUuid();
  sheet_('files').appendRow([fid, r.id, name, mime, bytes.length, file.getId(), me.username, now_()]);
  return mutate_(me, r.id, function (x) {
    x.files = (x.files || []).concat([{ id: fid, name: name, mime: mime, size: bytes.length, by: me.username, at: now_() }]);
    return ['إرفاق ملف', name];
  });
}
function actGetFile_(me, p) {
  const row = findRow_('files', p.fileId);
  if (!row) throw err_('NOTFOUND', 'المرفق غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  getRec_(me, String(v[1]), { allowDeleted: true });
  if (me.role === 'viewer') throw err_('FORBIDDEN', 'المرفقات قد تحتوي بيانات شخصية؛ صلاحية المشاهد لا تشملها.');
  const blob = DriveApp.getFileById(String(v[5])).getBlob();
  audit_(me.username, 'تنزيل مرفق', String(v[1]), '', String(v[2]));
  return { name: String(v[2]), mime: String(v[3]), data: Utilities.base64Encode(blob.getBytes()) };
}
function actRemoveFile_(me, p) {
  const row = findRow_('files', p.fileId);
  if (!row) throw err_('NOTFOUND', 'المرفق غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  const res = mutate_(me, String(v[1]), function (x) {
    x.files = (x.files || []).filter(function (f) { return f.id !== p.fileId; });
    return ['حذف مرفق', String(v[2])];
  });
  try { DriveApp.getFileById(String(v[5])).setTrashed(true); } catch (e) { }
  sheet_('files').deleteRow(row);
  return res;
}

/* ---------- الاستيراد ---------- */
function actImport_(me, p) {
  needAdmin_(me);
  const list = Array.isArray(p.records) ? p.records.slice(0, 2000) : [];
  let added = 0, skipped = 0;
  list.forEach(function (x) {
    try {
      const v = validate_(x, me, typeof x.id === 'string' ? x.id : null);
      const exists = typeof x.id === 'string' && /^[A-Za-z0-9_\-]{1,80}$/.test(x.id) && findRow_('records', x.id);
      const r = exists ? getRec_(me, x.id, { allowDeleted: true }) : { id: Utilities.getUuid(), no: nextNo_(v.g), created: now_(), createdBy: me.username, hist: [], files: [] };
      Object.assign(r, v, { status: OPEN.indexOf(x.status) >= 0 ? x.status : (FINAL.indexOf(x.status) >= 0 ? 'بانتظار الاعتماد' : 'جديد'), updated: now_(), updatedBy: me.username });
      if (x.sample === true) r.sample = true;
      hist_(r, me, 'استيراد', FINAL.indexOf(x.status) >= 0 ? 'كانت «' + x.status + '»؛ القرارات لا تُستورد فتحتاج مراجعة.' : '');
      writeRec_(r); added++;
    } catch (e) { skipped++; }
  });
  audit_(me.username, 'استيراد', '', '', added + ' معاملة، تخطّي ' + skipped);
  return { added: added, skipped: skipped };
}

/* =====================================================================
 * التدقيق والإشعارات والنسخ الاحتياطي
 * ===================================================================== */
function audit_(user, action, id, no, detail) {
  try { sheet_('audit').appendRow([now_(), user || '', action, id || '', no || '', String(detail || '').slice(0, 500)]); } catch (e) { }
}
function needAdmin_(me) { if (me.role !== 'admin') throw err_('FORBIDDEN', 'هذا الإجراء لمسؤولي النظام فقط.'); }

function notifyUser_(username, r, subject, note) {
  try {
    if (!getSettings_().notify) return;
    const u = findUser_(username);
    if (!u || !u.email) return;
    sendMail_(String(u.email), subject, r, note);
  } catch (e) { }
}
function notifyAdmins_(r, subject) {
  try {
    if (!getSettings_().notify) return;
    table_('users').rows.filter(function (u) { return u.role === 'admin' && u.email && (u.active === true || u.active === 'TRUE'); })
      .forEach(function (u) { sendMail_(String(u.email), subject, r, ''); });
  } catch (e) { }
}
function sendMail_(to, subject, r, note) {
  if (MailApp.getRemainingDailyQuota() < 5) return;
  const url = ScriptApp.getService().getUrl() || '';
  const e = function (s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const html = '<div dir="rtl" style="font-family:Tahoma,Arial;font-size:14px;color:#13211d">' +
    '<h2 style="color:#0f5a4b;margin:0 0 8px">' + e(subject) + '</h2>' +
    '<p style="margin:0 0 4px"><b>' + e(r.title) + '</b></p>' +
    '<p style="margin:0 0 4px;color:#56675f">' + e(r.no) + ' · ' + e(SCHEMA.G[r.g].items[r.m]) + ' · ' + e(r.status) + '</p>' +
    (note ? '<p style="background:#ebf0ee;padding:8px 12px;border-radius:6px">' + e(note) + '</p>' : '') +
    (url ? '<p><a href="' + url + '" style="background:#0f5a4b;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">فتح النظام</a></p>' : '') +
    '<p style="color:#888;font-size:12px">رسالة آلية من نظام الدكتور.</p></div>';
  MailApp.sendEmail({ to: to, subject: 'نظام الدكتور: ' + subject + ' — ' + r.no, htmlBody: html, name: 'نظام الدكتور' });
}

/** نسخة احتياطية يومية (مُشغَّل زمني) تحتفظ بآخر 14 نسخة. */
function dailyBackup() {
  const props = PropertiesService.getScriptProperties();
  const folder = DriveApp.getFolderById(props.getProperty('BACKUP_FOLDER_ID'));
  const name = 'نسخة نظام الدكتور ' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH-mm');
  DriveApp.getFileById(props.getProperty('SPREADSHEET_ID')).makeCopy(name, folder);
  const files = [];
  const it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(14).forEach(function (f) { f.setTrashed(true); });
  // تنظيف الجلسات الدائمة المنتهية
  const all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('s_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < Date.now()) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
  return name;
}

/* =====================================================================
 * بيانات تجريبية (اختيارية)
 * ===================================================================== */
function seedSamples_(me) {
  const d = function (n) { return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); };
  const list = [
    [4, 0, 'مشروع السلال الغذائية الشهرية', 'قيد المتابعة', 60, { manager: 'م. سعد الغامدي', budget: 180000, progress: 45 }, 0],
    [4, 9, 'متابعة أسرة حي الصفا', 'قيد المتابعة', 12, { manager: 'الباحثة الاجتماعية', progress: 30 }, 1],
    [6, 6, 'تبرع عبر رابط الدفع', 'جديد', 1, { donor: 'فاعل خير', amount: 3000, method: 'رابط دفع', allocation: 'عام' }, 0],
    [6, 7, 'تبرع لمشروع السلال الغذائية', 'بانتظار الاعتماد', 13, { donor: 'مؤسسة أهلية (مثال)', amount: 12000, method: 'تحويل بنكي', allocation: 'مشروع السلال' }, 0],
    [7, 2, 'سند صرف فاتورة كهرباء المقر', 'قيد المتابعة', 2, { amount: 1840, account: 'مصروفات تشغيلية', costCenter: 'الإدارة العامة', method: 'تحويل بنكي' }, 0],
    [8, 4, 'حليب أطفال قارب انتهاء صلاحيته', 'قيد المتابعة', 5, { item: 'حليب أطفال', qty: 36, unit: 'حبة', expiry: d(-20), warehouse: 'المستودع الرئيسي' }, 2],
    [10, 14, 'طلب إعانة سكن', 'بانتظار الاعتماد', 7, { name: 'مستفيد (مثال)', family: 6, monthly: 1500 }, 0],
    [11, 1, 'تطوع في توزيع السلال', 'جديد', 1, { name: 'متطوعة (مثال)', opportunity: 'توزيع السلال', hours: 12 }, 0],
    [12, 2, 'اجتماع مجلس الإدارة', 'جديد', 0, { ref: 'مثال', responsible: 'أمين المجلس' }, 0]
  ];
  list.forEach(function (x) {
    const r = { id: Utilities.getUuid(), no: nextNo_(x[0]), g: x[0], m: x[1], title: x[2], status: x[3], pri: x[6], esc: x[6] ? 1 : 0, date: d(x[4]), due: x[4] > 10 ? d(x[4] - 14) : '', owner: '', notes: '', f: x[5], sample: true, created: now_(), updated: now_(), createdBy: me.username, updatedBy: me.username, hist: [], files: [] };
    hist_(r, me, 'إنشاء (مثال)', '');
    writeRec_(r);
  });
  audit_(me.username, 'إضافة بيانات تجريبية', '', '', list.length + ' معاملات');
  return list.length;
}

/* =====================================================================
 * الأخطاء
 * ===================================================================== */
function err_(code, message, field) { const e = new Error(message); e.code = code; e.field = field || ''; return e; }
function fail_(e) {
  if (e && e.code) return { ok: false, code: e.code, message: e.message, field: e.field || '' };
  console.error(e && e.stack ? e.stack : e);
  return { ok: false, code: 'SERVER', message: 'حدث خطأ في الخادم. أعد المحاولة، وإن تكرر فأبلغ مسؤول النظام.' };
}
