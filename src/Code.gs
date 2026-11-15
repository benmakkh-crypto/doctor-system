/**
 * نظام نافذ — الخادم (Google Apps Script)
 *
 * كل قراءة وكتابة تمر من هنا. الواجهة لا تلمس الجدول مباشرة، لذلك تُفرض
 * الصلاحيات وحد الاعتماد وفصل المهام والترقيم ومنع التكرار وسجل التدقيق
 * على الخادم، ولا يمكن تجاوزها من المتصفح.
 *
 * التثبيت: شغّل الدالة setup() مرة واحدة من المحرر، ثم انشر تطبيق ويب.
 */

const APP_VERSION = '4.22.2';
/** المشرف العام: أول حساب مسؤول يُنشأ عند التثبيت. كلمة مروره مؤقتة تظهر في سجل التنفيذ. */
const FIRST_ADMIN = { username: 'zubair', name: 'د.م. زبير الفضل', email: 'benmakkh@gmail.com' };
const SH = {
  users: 'المستخدمون',
  records: 'المعاملات',
  decisions: 'القرارات',
  settings: 'الإعدادات',
  audit: 'سجل_التدقيق',
  counters: 'العدادات',
  files: 'المرفقات',
  orgs: 'المؤسسات',
  gov: 'الحوكمة'
};
const HEAD = {
  users: ['username', 'name', 'email', 'role', 'depts', 'active', 'salt', 'hash', 'failed', 'lockedUntil', 'mustChange', 'lastLogin', 'created', 'org', 'prefs', 'phone', 'caps'],
  records: ['id', 'no', 'g', 'm', 'status', 'deleted', 'updated', 'json'],
  decisions: ['id', 's', 'by', 'at', 'amt', 'note'],
  settings: ['key', 'value'],
  audit: ['at', 'user', 'action', 'recordId', 'no', 'detail', 'org'],
  counters: ['key', 'value'],
  files: ['id', 'recordId', 'name', 'mime', 'size', 'driveId', 'by', 'at'],
  orgs: ['id', 'code', 'name', 'status', 'created', 'json'],
  gov: ['id', 'org', 'cycle', 'json']
};
/* ---------- تعدد المؤسسات ----------
 * كل معاملة ومستخدم وسطر تدقيق يحمل معرّف مؤسسته. المؤسسة النشطة في الطلب الحالي في CUR_ORG:
 * - لمستخدم المؤسسة: مؤسسته دائمًا.
 * - للمشرف العام للمنصة (org = '*'): المؤسسة التي يختارها، أو '*' لعرض كل المؤسسات.
 * الإعدادات نوعان: إعدادات المنصة (ورقة الإعدادات) وإعدادات المؤسسة (داخل ورقة المؤسسات)، والثانية تتقدم.
 */
let CUR_ORG = null;
const MAIN_ORG = 'main';
const ORG_KEYS = ['orgName', 'threshold', 'sod', 'notify', 'siteUrl', 'siteCity', 'sitePhone', 'siteEmail', 'siteAbout', 'publicStats', 'nav', 'layout', 'siteTheme', 'siteDraft', 'sysTheme', 'siteAboutTitle', 'siteValues', 'siteCommit', 'siteTagline'];
const ORG_TYPES = ['جمعية خيرية', 'مؤسسة أهلية', 'جمعية تعاونية', 'جمعية مهنية', 'وقف', 'شركة غير ربحية', 'شركة', 'جهة حكومية', 'أخرى'];
const ORG_SECTORS = ['القطاع غير الربحي', 'القطاع الخاص', 'القطاع الحكومي', 'القطاع الوقفي'];
const ORG_AREAS = ['اجتماعي وأسري', 'إغاثي', 'صحي', 'تعليمي', 'ديني ودعوي', 'تحفيظ القرآن', 'تنموي وتمكين', 'إسكاني', 'بيئي', 'ثقافي', 'شبابي ورياضي', 'رعاية الأيتام', 'ذوي الإعاقة', 'كبار السن', 'المرأة والطفل', 'تقني', 'مهني', 'إعلامي'];
const ROLES = { admin: 'مسؤول النظام', contributor: 'مساهم', viewer: 'مشاهد' };
// مدير النظام = المشرف العام: حساب منصة (org = '*') بدور admin، له كل الصلاحيات على كل المؤسسات.
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
function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'public') return json_(e.parameter.org ? sitePublic(e.parameter.org) : platformPublic());
  if (e && e.parameter && e.parameter.page === 'site') {
    return HtmlService.createHtmlOutputFromFile('Site')
      .setTitle(String((function () { try { if (!e.parameter.org) return 'نافذ — منصة إدارة الجمعيات والمؤسسات'; const o = siteOrg_(e.parameter.org); return o ? o.name : ''; } catch (x) { return ''; } })() || 'الموقع الإلكتروني'))
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('نافذ — منصة الإدارة المؤسسية')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // يسمح بفتح النظام داخل إطار (لوحة المتصفح المدمجة في التطبيقات، أو Google Sites)؛ بدونه تظهر صفحة بيضاء.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** معلومات عامة لشاشة الدخول (لا تتطلب جلسة). */
function getPublicConfig() {
  const ready = !!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  let org = '';
  if (ready) { try { migrate_(); const n = loadOrgs_().filter(function (o) { return o.status !== 'archived'; }); org = n.length === 1 ? n[0].name : (n.length > 1 ? 'منصة نافذ · ' + n.length + ' مؤسسة' : ''); } catch (e) { org = ''; } }
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
    ss = SpreadsheetApp.create('قاعدة بيانات نظام نافذ');
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
    const root = DriveApp.createFolder('نظام نافذ');
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
    addUser_({ username: FIRST_ADMIN.username, name: FIRST_ADMIN.name, email: FIRST_ADMIN.email, role: 'admin', depts: '', password: pw, mustChange: true, org: '*' });
    msg += '\nالمشرف العام: ' + FIRST_ADMIN.name + '\nاسم المستخدم: ' + FIRST_ADMIN.username + '\nكلمة المرور المؤقتة: ' + pw + '\n(سيُطلب تغييرها عند أول دخول)';
  }
  CUR_ORG = null; migrate_();
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
function platformSettings_() {
  const o = {};
  table_('settings').rows.forEach(function (r) {
    try { o[r.key] = JSON.parse(r.value); } catch (e) { o[r.key] = r.value; }
  });
  return o;
}
function getSettings_() {
  const o = platformSettings_();
  if (CUR_ORG && CUR_ORG !== '*') {
    const org = getOrg_(CUR_ORG);
    if (org) { const st = org.settings || {}; Object.keys(st).forEach(function (k) { o[k] = st[k]; }); o.orgName = org.name; o.orgCode = org.code; }
  } else if (CUR_ORG === '*') o.orgName = 'جميع المؤسسات';
  return o;
}
function putSetting_(key, val) {
  if (CUR_ORG && CUR_ORG !== '*' && ORG_KEYS.indexOf(key) >= 0) {
    const org = getOrg_(CUR_ORG);
    if (org) {
      org.settings = org.settings || {};
      if (val === null) delete org.settings[key]; else org.settings[key] = val;
      if (key === 'orgName' && val) org.name = String(val);
      saveOrgRow_(org);
      return;
    }
  }
  putPlatformSetting_(key, val);
}
function putPlatformSetting_(key, val) {
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

/* ---------- المؤسسات: التخزين ---------- */
let ORGS_CACHE_ = null;
function loadOrgs_() {
  if (ORGS_CACHE_) return ORGS_CACHE_;
  const s = sheet_('orgs');
  if (!s) return (ORGS_CACHE_ = []);
  ORGS_CACHE_ = table_('orgs').rows.map(function (r) {
    let j = {}; try { j = JSON.parse(r.json || '{}'); } catch (e) { j = {}; }
    j.id = String(r.id); j.code = String(r.code); j.name = String(r.name); j.status = String(r.status || 'active'); j.created = String(r.created || ''); j._row = r._row;
    return j;
  }).map(function (o, i) { return [o, i]; }).sort(function (a, b) {
    const x = typeof a[0].sort === 'number' ? a[0].sort : 1e6 + a[1], y = typeof b[0].sort === 'number' ? b[0].sort : 1e6 + b[1];
    return x - y;
  }).map(function (p) { return p[0]; });
  return ORGS_CACHE_;
}
function getOrg_(id) { return loadOrgs_().find(function (o) { return o.id === id; }) || null; }
function orgByCode_(code) { code = String(code || '').toUpperCase(); return loadOrgs_().find(function (o) { return o.code === code; }) || null; }
function saveOrgRow_(o) {
  try { CacheService.getScriptCache().remove('platform_pub_v1'); CacheService.getScriptCache().remove('public_v1_' + o.id); } catch (e) { }
  const c = JSON.parse(JSON.stringify(o)); delete c._row;
  const line = [c.id, c.code, c.name, c.status || 'active', c.created || now_(), JSON.stringify(c)];
  const row = findRow_('orgs', c.id);
  if (row) sheet_('orgs').getRange(row, 1, 1, line.length).setValues([line]);
  else sheet_('orgs').appendRow(line);
  ORGS_CACHE_ = null;
  try { CacheService.getScriptCache().remove('public_v1_' + c.id); } catch (e) { }
}
/** ترحيل لمرة واحدة إلى تعدد المؤسسات: ينشئ «المؤسسة الرئيسية» وينقل إليها الإعدادات والمستخدمين. آمن عند التكرار. */
function migrate_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA_V') === '3') return;
  const ss = ss_();
  if (props.getProperty('SCHEMA_V') === '2') {
    const us = ss.getSheetByName(SH.users);
    us.getRange(1, 1, 1, HEAD.users.length).setValues([HEAD.users]).setFontWeight('bold').setBackground('#0b4639').setFontColor('#ffffff');
    props.setProperty('SCHEMA_V', '3');
    return;
  }
  let s = ss.getSheetByName(SH.orgs);
  if (!s) s = ss.insertSheet(SH.orgs);
  ['users', 'audit', 'orgs'].forEach(function (k) {
    const sh = ss.getSheetByName(SH[k]);
    sh.getRange(1, 1, 1, HEAD[k].length).setValues([HEAD[k]]).setFontWeight('bold').setBackground('#0b4639').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
  s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns()).setNumberFormat('@');
  ORGS_CACHE_ = null;
  if (!getOrg_(MAIN_ORG)) {
    const ps = platformSettings_(), st = {};
    ORG_KEYS.forEach(function (k) { if (ps[k] !== undefined) st[k] = ps[k]; });
    if (st.threshold === undefined) st.threshold = 5000;
    if (st.notify === undefined) st.notify = true;
    saveOrgRow_({ id: MAIN_ORG, code: 'MAIN', name: ps.orgName || 'المؤسسة الرئيسية', status: 'active', created: now_(), type: 'جمعية خيرية', settings: st });
  }
  table_('users').rows.forEach(function (u) {
    if (String(u.org || '')) return;
    setUserCells_(u._row, { org: normUser_(u.username) === FIRST_ADMIN.username ? '*' : MAIN_ORG });
  });
  props.setProperty('SCHEMA_V', '3');
}

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
  sheet_('users').appendRow([normUser_(o.username), o.name, o.email || '', o.role, o.depts || '', true, salt, hashPw_(salt, o.password), 0, '', !!o.mustChange, '', new Date().toISOString(), o.org || MAIN_ORG, '', o.phone || '']);
}
function publicUser_(u) {
  return {
    username: String(u.username), name: String(u.name), email: String(u.email || ''), role: String(u.role),
    roleName: ROLES[u.role] || u.role, depts: parseDepts_(u.depts), active: u.active === true || u.active === 'TRUE',
    lastLogin: u.lastLogin ? String(u.lastLogin) : '', mustChange: u.mustChange === true || u.mustChange === 'TRUE',
    org: String(u.org || MAIN_ORG), phone: String(u.phone || ''), caps: parseCaps_(u.caps)
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
      migrate_();
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
      const uo = String(u.org || MAIN_ORG);
      if (uo !== '*') { const o = getOrg_(uo); if (!o || o.status === 'suspended') return { ok: false, code: 'DISABLED', message: 'حساب مؤسستك موقوف مؤقتًا. تواصل مع مدير النظام (المشرف العام) لمنصة نافذ.' }; }
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
  if (pu.org !== '*') { const o = getOrg_(pu.org); if (!o || o.status === 'suspended') { endSession_(token); throw err_('AUTH', 'حساب مؤسستك موقوف مؤقتًا.'); } }
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
    migrate_();
    const me = session_(token);
    payload = payload || {};
    CUR_ORG = scopeOrg_(me, payload);
    if (me.mustChange && action !== 'changePassword' && action !== 'me') throw err_('MUST_CHANGE', 'غيّر كلمة المرور المؤقتة أولًا.');
    const fn = ACTIONS[action];
    if (!fn) throw err_('VALIDATION', 'إجراء غير معروف.');
    const write = WRITE_ACTIONS.indexOf(action) >= 0;
    if (write && me.role === 'viewer' && action !== 'changePassword' && action !== 'savePrefs') throw err_('FORBIDDEN', 'صلاحيتك للعرض فقط.');
    if (write && CUR_ORG === '*' && ORG_REQUIRED.indexOf(action) >= 0) throw err_('VALIDATION', 'اختر مؤسسة من أعلى الصفحة أولًا، ثم نفّذ الإجراء داخلها.');
    let out;
    if (write) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) throw err_('BUSY', 'النظام مشغول بعمليات أخرى. أعد المحاولة بعد لحظات.');
      try { out = fn(me, payload); bumpRev_(); } finally { lock.releaseLock(); }
    } else out = fn(me, payload);
    return { ok: true, data: out, rev: rev_() };
  } catch (e) { return fail_(e); }
}
/** إجراءات تحتاج مؤسسة محددة (لا تُنفذ في عرض «كل المؤسسات»). */
const ORG_REQUIRED = ['wsSave', 'wsDraw', 'wsSet', 'wsSms', 'wsUpload', 'wsSamples', 'wsFile', 'pjSave', 'pjLedger', 'pjTask', 'pjKpi', 'pjAct', 'pjSup', 'pjSms', 'pjNeed', 'pjRh', 'pjSet', 'pjUpload', 'pjSamples', 'pjFile', 'saveTheme', 'create', 'importData', 'addSamples', 'clearSamples', 'emptyTrash', 'govUpload', 'govClear', 'govDocMeta', 'govAnswer', 'govCopy', 'govCustomDoc', 'astSaveAsset', 'astDelAsset', 'astSaveEmp', 'astDelEmp', 'astMove', 'astSet', 'astUpload', 'astSamples', 'astCount', 'prSave', 'prDecide', 'prSupply', 'prReceive', 'prClose', 'prDel', 'prSup', 'prSet', 'prUpload', 'prSamples', 'ctSave', 'ctDel', 'ctInst', 'ctPay', 'ctOb', 'ctChg', 'ctSet', 'ctUpload', 'ctSamples', 'invItem', 'invWh', 'invMov', 'invTr', 'invCount', 'invSet', 'invUpload', 'invSamples', 'exSave', 'exPay', 'exCat', 'exSet', 'exUpload', 'exSamples', 'tskSave', 'tskSet', 'tskSamples', 'fltVeh', 'fltDrv', 'fltTrip', 'fltFuel', 'fltMnt', 'fltSet', 'fltUpload', 'fltSamples'];
function isPlatform_(me) { return me.role === 'admin' && me.org === '*'; }
/** عضو المنصة: حساب على مستوى نافذ (org = '*') بأي دور؛ المشاهد منهم يطّلع على كل المؤسسات دون أي تعديل. */
function isPlatformMember_(me) { return me.org === '*'; }
function needPlatform_(me) { if (!isPlatform_(me)) throw err_('FORBIDDEN', 'هذا الإجراء لمدير النظام (المشرف العام) لمنصة نافذ فقط.'); }
function scopeOrg_(me, p) {
  if (me.org !== '*') return me.org || MAIN_ORG;
  const o = str_(p.__org, 40);
  if (o && o !== '*' && getOrg_(o)) return o;
  return '*';
}
/** هل المستخدم ضمن نطاق من يدير الحسابات؟ */
function inUserScope_(me, u) {
  const uo = String(u.org || MAIN_ORG);
  if (isPlatform_(me)) return CUR_ORG === '*' || uo === CUR_ORG || uo === '*';
  return uo === me.org;
}
const WRITE_ACTIONS = ['wsSave', 'wsDraw', 'wsSet', 'wsSms', 'wsUpload', 'wsSamples', 'pjSave', 'pjLedger', 'pjTask', 'pjKpi', 'pjAct', 'pjSup', 'pjSms', 'pjNeed', 'pjRh', 'pjSet', 'pjUpload', 'pjSamples', 'fltVeh', 'fltDrv', 'fltTrip', 'fltFuel', 'fltMnt', 'fltSet', 'fltUpload', 'fltSamples', 'tskSave', 'tskSet', 'tskSamples', 'exSave', 'exPay', 'exCat', 'exSet', 'exUpload', 'exSamples', 'invItem', 'invWh', 'invMov', 'invTr', 'invCount', 'invSet', 'invUpload', 'invSamples', 'ctSave', 'ctDel', 'ctInst', 'ctPay', 'ctOb', 'ctChg', 'ctSet', 'ctUpload', 'ctSamples', 'prSave', 'prDecide', 'prSupply', 'prReceive', 'prClose', 'prDel', 'prSup', 'prSet', 'prUpload', 'prSamples', 'astCount', 'astSaveAsset', 'astDelAsset', 'astSaveEmp', 'astDelEmp', 'astMove', 'astSet', 'astUpload', 'astSamples', 'saveOrg', 'setOrgStatus', 'importOrgs', 'orderOrgs', 'govUpload', 'govClear', 'govDocMeta', 'govAnswer', 'govCopy', 'govCustomDoc', 'treeSave', 'bulkResetPasswords', 'savePrefs', 'saveLayout', 'saveNav', 'saveTheme', 'create', 'update', 'status', 'route', 'escalate', 'deescalate', 'note', 'remove', 'restore', 'purge', 'emptyTrash',
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
    if (p.site) {
      putSetting_('siteUrl', str_(p.site.url, 300));
      putSetting_('siteCity', str_(p.site.city, 80));
      putSetting_('sitePhone', str_(p.site.phone, 30));
      putSetting_('siteEmail', str_(p.site.email, 120));
      putSetting_('siteAbout', str_(p.site.about, 1200));
      putSetting_('publicStats', p.site.stats !== false);
      if (p.site.aboutTitle !== undefined) putSetting_('siteAboutTitle', str_(p.site.aboutTitle, 120));
      if (p.site.values !== undefined) putSetting_('siteValues', str_(p.site.values, 300));
      if (p.site.commit !== undefined) putSetting_('siteCommit', str_(p.site.commit, 500));
      if (p.site.tagline !== undefined) putSetting_('siteTagline', str_(p.site.tagline, 120));
      try { CacheService.getScriptCache().remove('platform_pub_v1'); } catch (e) { }
      try { CacheService.getScriptCache().remove('public_v1_' + (CUR_ORG || MAIN_ORG)); } catch (e) { }
    }
    audit_(me.username, 'تعديل الإعدادات', '', '', 'حد الاعتماد ' + t + (p.sod ? ' · فصل المهام' : ''));
    return getSettings_();
  },
  listUsers: function (me) { needAdmin_(me); return table_('users').rows.filter(function (u) { return inUserScope_(me, u); }).map(publicUser_); },
  listOrgs: function (me) { if (!isPlatformMember_(me)) throw err_('FORBIDDEN', 'الكشاف لمنسوبي منصة نافذ فقط.'); return actListOrgs_(); },
  saveOrg: function (me, p) { needPlatform_(me); return actSaveOrg_(me, p); },
  setOrgStatus: function (me, p) {
    needPlatform_(me);
    const o = getOrg_(str_(p.id, 40)); if (!o) throw err_('NOTFOUND', 'المؤسسة غير موجودة.');
    if (['active', 'suspended', 'archived'].indexOf(p.status) < 0) throw err_('VALIDATION', 'حالة غير صحيحة.');
    if (o.id === MAIN_ORG && p.status !== 'active') throw err_('VALIDATION', 'لا يمكن إيقاف المؤسسة الرئيسية أو حذفها.');
    o.status = p.status; saveOrgRow_(o);
    audit_(me.username, { active: 'تفعيل مؤسسة', suspended: 'إيقاف مؤسسة', archived: 'حذف مؤسسة (أرشفة)' }[p.status], '', '', o.name);
    return orgPublic_(o);
  },
  importOrgs: function (me, p) { needPlatform_(me); return actImportOrgs_(me, p); },
  // ترتيب المؤسسات في الكشاف والبوابة: قائمة المعرّفات بالترتيب المطلوب
  orderOrgs: function (me, p) {
    needPlatform_(me);
    const ids = (Array.isArray(p.ids) ? p.ids : []).slice(0, 500).map(function (x) { return str_(x, 40); });
    ids.forEach(function (id, i) { const o = getOrg_(id); if (o && o.sort !== i) { o.sort = i; saveOrgRow_(o); } });
    ORGS_CACHE_ = null;
    audit_(me.username, 'ترتيب المؤسسات', '', '', ids.length + ' مؤسسة');
    return { ok: true };
  },
  bulkResetPasswords: function (me, p) {
    needAdmin_(me);
    const list = (Array.isArray(p.usernames) ? p.usernames : []).slice(0, 300).map(normUser_);
    const out = [];
    list.forEach(function (un) {
      const u = findUser_(un);
      if (!u || !inUserScope_(me, u) || un === me.username) return;
      const pw = tempPassword_();
      setPassword_(u, pw, true); setUserCells_(u._row, { failed: 0, lockedUntil: '' });
      const o = getOrg_(String(u.org || MAIN_ORG));
      const em = p.sendEmail && u.email ? sendCredentials_(String(u.email), String(u.name), o, un, pw, true, 'reset') : false;
      out.push({ username: un, name: String(u.name), org: o ? o.name : 'المنصة', code: o ? o.code : '', email: String(u.email || ''), phone: String(u.phone || ''), password: pw, emailed: em });
    });
    audit_(me.username, 'إصدار كلمات مرور جماعي', '', '', out.length + ' حساب');
    return { items: out };
  },
  savePrefs: function (me, p) {
    const j = JSON.stringify(p.prefs || {});
    if (j.length > 40000) throw err_('VALIDATION', 'إعدادات العرض كبيرة جدًا.');
    const u = findUser_(me.username); setUserCells_(u._row, { prefs: j });
    return { ok: true };
  },
  /** قالب الموقع (مسودة أو نشر) ومظهر النظام للمؤسسة */
  saveTheme: function (me, p) {
    const kind = p.kind === 'sys' ? 'sys' : 'site';
    if (kind === 'sys') {
      if (capLevel_(me, 'sys.theme') < 2) throw err_('FORBIDDEN', 'ليست لديك صلاحية تغيير مظهر النظام.');
      const t = p.theme ? { tpl: str_(p.theme.tpl, 30) } : null;
      if (t && !/^[a-z0-9-]{1,30}$/.test(t.tpl)) throw err_('VALIDATION', 'مظهر غير صحيح.');
      putSetting_('sysTheme', t);
      audit_(me.username, 'تغيير مظهر النظام', '', '', t ? t.tpl : 'الافتراضي');
      return { sysTheme: t };
    }
    const lv = capLevel_(me, 'site.tpl');
    if (lv < 2) throw err_('FORBIDDEN', 'ليست لديك صلاحية تعديل قالب الموقع.');
    if (p.publish && lv < 3) throw err_('FORBIDDEN', 'ليست لديك صلاحية نشر قالب الموقع. احفظه مسودةً ليعتمده المسؤول.');
    const t = p.theme === null ? null : cleanTheme_(p.theme);
    if (t && JSON.stringify(t).length > 6000) throw err_('VALIDATION', 'إعدادات القالب كبيرة جدًا.');
    putSetting_('siteDraft', t ? Object.assign({ by: me.username, at: now_() }, t) : null);
    if (p.publish) {
      putSetting_('siteTheme', t);
      try { CacheService.getScriptCache().remove('public_v1_' + (CUR_ORG || MAIN_ORG)); } catch (e) { }
    }
    audit_(me.username, p.publish ? 'نشر قالب الموقع' : 'حفظ مسودة قالب الموقع', '', '', t ? t.tpl : 'القالب الافتراضي');
    return { siteDraft: t, siteTheme: p.publish ? t : undefined };
  },
  saveLayout: function (me, p) {
    needAdmin_(me);
    if (CUR_ORG === '*') throw err_('VALIDATION', 'اختر مؤسسة لتعتمد لها التخطيط.');
    const j = p.layout ? JSON.stringify(p.layout) : '';
    if (j.length > 40000) throw err_('VALIDATION', 'التخطيط كبير جدًا.');
    putSetting_('layout', p.layout || null);
    audit_(me.username, p.layout ? 'اعتماد تخطيط افتراضي' : 'إلغاء التخطيط الافتراضي', '', '', '');
    return { layout: p.layout || null };
  },
  saveNav: actSaveNav_,
  saveUser: actSaveUser_,
  resetPassword: function (me, p) {
    needAdmin_(me);
    const u = findUser_(p.username);
    if (!u || !inUserScope_(me, u)) throw err_('NOTFOUND', 'المستخدم غير موجود.');
    // المسؤول يصدر كلمة مرور جديدة: يكتبها بنفسه أو تُولَّد تلقائيًا، ويختار هل يُلزم المستخدم بتغييرها.
    // كلمات المرور القديمة لا يمكن استرجاعها لأنها محفوظة مشفّرة باتجاه واحد.
    const manual = typeof p.password === 'string' && p.password !== '';
    const pw = manual ? p.password : tempPassword_();
    if (manual) checkPolicy_(pw);
    const must = p.mustChange !== false;
    setPassword_(u, pw, must);
    setUserCells_(u._row, { failed: 0, lockedUntil: '' });
    const emailed = p.sendEmail && u.email ? sendCredentials_(String(u.email), String(u.name), getOrg_(String(u.org || MAIN_ORG)), String(u.username), pw, must, 'reset') : false;
    audit_(me.username, manual ? 'تعيين كلمة مرور من المسؤول' : 'إعادة تعيين كلمة مرور', '', '', String(u.username) + (must ? ' · تغيير إلزامي' : ' · دون تغيير إلزامي') + (emailed ? ' · أُرسلت بالبريد' : ''));
    return { password: pw, mustChange: must, emailed: emailed, phone: String(u.phone || '') };
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
  govGet: actGovGet_,
  govUpload: actGovUpload_,
  govFile: actGovFile_,
  govClear: actGovClear_,
  govDocMeta: actGovDocMeta_,
  govAnswer: actGovAnswer_,
  govCopy: actGovCopy_,
  govCustomDoc: actGovCustomDoc_,
  astGet: actAstGet_, astSaveAsset: actAstSaveAsset_, astDelAsset: actAstDelAsset_, astSaveEmp: actAstSaveEmp_, astDelEmp: actAstDelEmp_, astMove: actAstMove_, astSet: actAstSet_, astUpload: actAstUpload_, astFile: actAstFile_, astSamples: actAstSamples_, astCount: actAstCount_,
  prGet: actPrGet_, prSave: actPrSave_, prDecide: actPrDecide_, prSupply: actPrSupply_, prReceive: actPrReceive_, prClose: actPrClose_, prDel: actPrDel_, prSup: actPrSup_, prSet: actPrSet_, prUpload: actPrUpload_, prFile: actPrFile_, prSamples: actPrSamples_,
  ctGet: actCtGet_, ctSave: actCtSave_, ctDel: actCtDel_, ctInst: actCtInst_, ctPay: actCtPay_, ctOb: actCtOb_, ctChg: actCtChg_, ctSet: actCtSet_, ctUpload: actCtUpload_, ctFile: actCtFile_, ctSamples: actCtSamples_,
  invGet: actInvGet_, invItem: actInvItem_, invWh: actInvWh_, invMov: actInvMov_, invTr: actInvTr_, invCount: actInvCount_, invSet: actInvSet_, invUpload: actInvUpload_, invFile: actInvFile_, invSamples: actInvSamples_,
  wsSave: actWsSave_, wsDraw: actWsDraw_, wsSet: actWsSet_, wsSms: actWsSms_, wsUpload: actWsUpload_, wsSamples: actWsSamples_, wsGet: actWsGet_, wsFile: actWsFile_,
  pjSave: actPjSave_, pjLedger: actPjLedger_, pjTask: actPjTask_, pjKpi: actPjKpi_, pjAct: actPjAct_, pjSup: actPjSup_, pjSms: actPjSms_, pjNeed: actPjNeed_, pjRh: actPjRh_, pjSet: actPjSet_, pjUpload: actPjUpload_, pjSamples: actPjSamples_, pjGet: actPjGet_, pjFile: actPjFile_,
  exGet: actExGet_, exSave: actExSave_, exPay: actExPay_, exCat: actExCat_, exSet: actExSet_, exUpload: actExUpload_, exFile: actExFile_, exSamples: actExSamples_, opsGet: actOpsGet_, tskGet: actTskGet_, tskSave: actTskSave_, tskSet: actTskSet_, tskSamples: actTskSamples_,
  fltGet: actFltGet_, fltVeh: actFltVeh_, fltDrv: actFltDrv_, fltTrip: actFltTrip_, fltFuel: actFltFuel_, fltMnt: actFltMnt_, fltSet: actFltSet_, fltUpload: actFltUpload_, fltFile: actFltFile_, fltSamples: actFltSamples_,
  treeGet: actTreeGet_,
  treeSave: actTreeSave_,
  removeFile: actRemoveFile_,
  audit: function (me, p) {
    needAdmin_(me);
    const t = table_('audit').rows.filter(function (r) { return CUR_ORG === '*' || String(r.org || MAIN_ORG) === CUR_ORG; });
    const lim = Math.min(500, +p.limit || 200);
    return t.slice(-lim).reverse().map(function (r) { return { at: String(r.at), user: String(r.user), action: String(r.action), no: String(r.no), detail: String(r.detail) }; });
  },
  exportData: function (me) {
    needAdmin_(me);
    audit_(me.username, 'تصدير نسخة احتياطية', '', '', '');
    return { system: 'نظام نافذ', version: APP_VERSION, exportedAt: now_(), settings: getSettings_(), records: loadRecords_().map(clean_), decisions: loadDecisions_() };
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
function loadAllRecords_() {
  if (REC_CACHE_) return REC_CACHE_;
  REC_CACHE_ = table_('records').rows.map(function (row) {
    let r = {};
    try { r = JSON.parse(row.json); } catch (e) { r = {}; }
    r.id = String(row.id); r._row = row._row; if (!r.org) r.org = MAIN_ORG;
    return r;
  });
  return REC_CACHE_;
}
/** معاملات المؤسسة النشطة فقط (أو كل المؤسسات للمشرف العام في عرض «الكل»). */
function loadRecords_() {
  const all = loadAllRecords_();
  if (!CUR_ORG || CUR_ORG === '*') return all;
  return all.filter(function (r) { return r.org === CUR_ORG; });
}
function loadDecisions_() {
  const o = {};
  table_('decisions').rows.forEach(function (r) { o[String(r.id)] = { s: String(r.s), by: String(r.by), at: String(r.at), amt: Number(r.amt), note: String(r.note || '') }; });
  return o;
}

/* ---------- صلاحيات الأجزاء: الموقع الإلكتروني والقوالب ومظهر النظام ----------
 * المستويات: 0 لا يرى، 1 اطلاع، 2 تعديل، 3 تعديل ونشر.
 * المسؤول يملك كل شيء. للمساهم والمشاهد قيم افتراضية، ويغيّرها المسؤول لكل مستخدم. */
const WEB_DEPT = 3;
const PARTS = {
  'site.tpl': { n: 'قوالب الموقع وهويته', max: 3, def: { contributor: 1, viewer: 1 } },
  'site.content': { n: 'محتوى الموقع', max: 2, mods: [0, 1, 4, 5, 7, 8, 9, 10, 22, 23, 24, 25, 26, 27, 28, 29, 30], def: { contributor: 2, viewer: 1 } },
  'site.forms': { n: 'النماذج والخدمات الإلكترونية', max: 2, mods: [2, 3, 6, 15, 31, 32, 33], def: { contributor: 2, viewer: 1 } },
  'site.design': { n: 'تصميم الموقع وظهوره', max: 2, mods: [11, 12, 13, 14, 16, 17, 18, 19, 20, 21], def: { contributor: 1, viewer: 1 } },
  'sys.theme': { n: 'مظهر النظام', max: 2, def: { contributor: 0, viewer: 0 } }
};
function parseCaps_(v) {
  let o = {}; try { o = v ? (typeof v === 'string' ? JSON.parse(v) : v) : {}; } catch (e) { o = {}; }
  const out = {};
  Object.keys(PARTS).forEach(function (k) { const n = Number(o && o[k]); if (isFinite(n) && n >= 0 && n <= PARTS[k].max && o[k] !== '' && o[k] != null) out[k] = n; });
  return out;
}
function capLevel_(me, part) {
  const P = PARTS[part]; if (!P) return 0;
  if (me.role === 'admin') return P.max;
  if (me.username === WEBSITE_ME.username) return 2;
  if (String(part).indexOf('site.') === 0 && !canSeeDept_(me, WEB_DEPT)) return 0;
  const c = me.caps || {};
  const lv = c[part] != null ? c[part] : (P.def[me.role] || 0);
  return me.role === 'viewer' ? Math.min(lv, 1) : lv;
}
function partOfMod_(m) {
  const ks = Object.keys(PARTS);
  for (let i = 0; i < ks.length; i++) { const P = PARTS[ks[i]]; if (P.mods && P.mods.indexOf(+m) >= 0) return ks[i]; }
  return null;
}
/** هل يرى المستخدم هذه المعاملة؟ الإدارة أولًا، ثم جزء الموقع إن كانت من الموقع. */
function canSeeRec_(me, r) {
  if (!canSeeDept_(me, r.g)) return false;
  if (+r.g === WEB_DEPT) { const pt = partOfMod_(r.m); if (pt && capLevel_(me, pt) < 1) return false; }
  return true;
}
function needPartEdit_(me, g, m) {
  if (+g !== WEB_DEPT) return;
  const pt = partOfMod_(m);
  if (pt && capLevel_(me, pt) < 2) throw err_('FORBIDDEN', 'ليست لديك صلاحية تعديل «' + PARTS[pt].n + '».');
}
function capsOut_(me) { const o = {}; Object.keys(PARTS).forEach(function (k) { o[k] = capLevel_(me, k); }); return o; }
const THEME_KEYS = ['tpl', 'g', 'g2', 'g3', 'gold', 'gold2', 'bg', 'hero', 'card', 'font', 'pat', 'radius', 'head', 'order', 'hide', 'heroTitle', 'heroLead'];
function cleanTheme_(t) {
  if (!t || typeof t !== 'object') return null;
  const o = {};
  THEME_KEYS.forEach(function (k) {
    const v = t[k]; if (v == null || v === '') return;
    if (k === 'order' || k === 'hide') { if (Array.isArray(v)) o[k] = v.slice(0, 20).map(function (x) { return str_(x, 20); }); return; }
    if (k === 'radius') { const n = Number(v); if (isFinite(n) && n >= 0 && n <= 32) o[k] = n; return; }
    if (['g', 'g2', 'g3', 'gold', 'gold2', 'bg'].indexOf(k) >= 0) { if (/^#[0-9a-fA-F]{6}$/.test(String(v))) o[k] = String(v); return; }
    if (k === 'heroTitle') { o[k] = str_(v, 120); return; }
    if (k === 'heroLead') { o[k] = str_(v, 400); return; }
    if (/^[a-z0-9-]{1,30}$/.test(String(v))) o[k] = String(v);
  });
  if (!o.tpl) throw err_('VALIDATION', 'اختر قالبًا.');
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
  const recs = loadRecords_().filter(function (r) { return canSeeRec_(me, r); }).map(function (r) { return clean_(me.role === 'viewer' ? maskRec_(r) : r); });
  const ids = {};
  recs.forEach(function (r) { ids[r.id] = 1; });
  const decAll = loadDecisions_(), dec = {};
  Object.keys(decAll).forEach(function (k) { if (ids[k]) dec[k] = decAll[k]; });
  const people = table_('users').rows.filter(function (u) { return (u.active === true || u.active === 'TRUE') && (CUR_ORG === '*' || String(u.org || MAIN_ORG) === CUR_ORG || String(u.org) === '*'); })
    .map(function (u) { return { username: String(u.username), name: String(u.name), role: String(u.role), hasEmail: !!u.email, org: String(u.org || MAIN_ORG) }; });
  const urow = findUser_(me.username);
  let prefs = null; try { prefs = urow && urow.prefs ? JSON.parse(urow.prefs) : null; } catch (e) { prefs = null; }
  const orgs = isPlatformMember_(me) ? loadOrgs_().map(orgPublic_) : (getOrg_(me.org) ? [orgPublic_(getOrg_(me.org))] : []);
  const meOut = clean_(me); meOut.platform = isPlatform_(me); meOut.member = isPlatformMember_(me); meOut.parts = capsOut_(me);
  return { me: meOut, scope: CUR_ORG, orgs: orgs, prefs: prefs, settings: getSettings_(), records: recs, decisions: dec, people: people, schema: schemaClient_(), version: APP_VERSION, now: now_(), appUrl: (function () { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } })() };
}

/* =====================================================================
 * التحقق من المدخلات
 * ===================================================================== */
function str_(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n) : ''; }
function date_(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T12:00:00')) ? v : ''; }
function now_() { return new Date().toISOString(); }
let SCHEMA_CLIENT_ = null;
/** المخطط المرسل للمتصفح عند كل تحميل: دون تعريف الحوكمة وقالب الهيكل (يُجلبان عند فتح صفحتيهما فقط). */
function schemaClient_() {
  if (!SCHEMA_CLIENT_) { SCHEMA_CLIENT_ = {}; Object.keys(SCHEMA).forEach(function (k) { if (k !== 'GOV' && k !== 'ORGTREE') SCHEMA_CLIENT_[k] = SCHEMA[k]; }); }
  return SCHEMA_CLIENT_;
}
function recSum_(r) { return SCHEMA.MONEY_KEYS.reduce(function (a, k) { return a + (+(r.f && r.f[k]) || 0); }, 0); }
function requires_(r, cfg) { const t = +cfg.threshold || 0; return t > 0 && recSum_(r) >= t; }

function validate_(input, me, existingId) {
  const L = SCHEMA.LIMITS;
  const g = +input.g, m = +input.m;
  if (!(g > 0) || !SCHEMA.G[g] || SCHEMA.G[g].items[m] == null) throw err_('VALIDATION', 'اختر إدارة ووحدة صحيحتين.', 'g');
  if (!canSeeDept_(me, g)) throw err_('FORBIDDEN', 'ليست لديك صلاحية على إدارة ' + SCHEMA.G[g].n + '.');
  needPartEdit_(me, g, m);
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
  const ckey = (CUR_ORG && CUR_ORG !== '*' && CUR_ORG !== MAIN_ORG ? CUR_ORG + '|' : '') + key;
  const row = findRow_('counters', ckey);
  const s = sheet_('counters');
  let n = 1;
  if (row) { n = (+s.getRange(row, 2).getValue() || 0) + 1; s.getRange(row, 2).setValue(n); }
  else s.appendRow([ckey, 1]);
  return key + '-' + ('00000' + n).slice(-5);
}
function writeRec_(r) {
  if (!r.org) r.org = (CUR_ORG && CUR_ORG !== '*') ? CUR_ORG : MAIN_ORG;
  if (+r.g === 3 || +r.g === 5) { try { CacheService.getScriptCache().remove('public_v1_' + r.org); } catch (e) { } } // محتوى الموقع العام يتحدث فورًا
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
  const r = JSON.parse(v[7]); r.id = String(v[0]); r._row = row; if (!r.org) r.org = MAIN_ORG;
  if (CUR_ORG && CUR_ORG !== '*' && r.org !== CUR_ORG) throw err_('NOTFOUND', 'المعاملة غير موجودة.');
  if (CUR_ORG === '*') CUR_ORG = r.org; // المشرف العام يعمل على المعاملة في سياق مؤسستها
  if (!canSeeRec_(me, r)) throw err_('FORBIDDEN', 'ليست لديك صلاحية على هذه المعاملة.');
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


/* ---------- تخصيص القوائم والعناوين (للمسؤول والمشرف العام) ----------
 * يغيّر طريقة العرض فقط: أسماء الإدارات والعناوين الفرعية والوحدات وترتيبها وأيقوناتها وألوانها وإخفاءها.
 * أرقام الإدارات والوحدات لا تتغير، فتبقى المعاملات المحفوظة مرتبطة بوحداتها.
 */
function actSaveNav_(me, p) {
  needAdmin_(me);
  if (p && p.reset) { putSetting_('nav', null); audit_(me.username, 'استعادة القوائم الافتراضية', '', '', ''); return { nav: null }; }
  const G = SCHEMA.G, out = { order: [], d: {}, sec: {}, mod: {} };
  const icon = function (v) { v = str_(v, 20); return /^[A-Za-z]{1,20}$/.test(v) ? v : ''; };
  const color = function (v) { v = str_(v, 7); return /^#[0-9a-fA-F]{6}$/.test(v) ? v : ''; };
  const order = Array.isArray(p.order) ? p.order.map(Number) : [];
  const seen = {};
  order.forEach(function (g) { if (g >= 0 && g < G.length && !seen[g]) { seen[g] = 1; out.order.push(g); } });
  G.forEach(function (_, g) { if (!seen[g]) out.order.push(g); });
  const d = p.d || {}, sec = p.sec || {}, mod = p.mod || {};
  G.forEach(function (grp, g) {
    const x = d[g] || {};
    const o = {};
    const n = str_(x.n, 60); if (n) o.n = n;
    const i = icon(x.i); if (i) o.i = i;
    const c = color(x.c); if (c) o.c = c;
    if (x.h === true && g !== 0) o.h = true;
    if (Object.keys(o).length) out.d[g] = o;
    if (Array.isArray(sec[g])) {
      const used = {}, list = [];
      sec[g].slice(0, 20).forEach(function (s) {
        if (!Array.isArray(s)) return;
        const t = str_(s[0], 50) || 'عنوان فرعي';
        const ms = (Array.isArray(s[2]) ? s[2] : []).map(Number).filter(function (m) { return m >= 0 && m < grp.items.length && !used[m] && (used[m] = 1); });
        list.push([t, icon(s[1]), ms]);
      });
      const rest = grp.items.map(function (_, m) { return m; }).filter(function (m) { return !used[m]; });
      if (rest.length) list.push(['وحدات أخرى', '', rest]);
      out.sec[g] = list.filter(function (s) { return s[2].length; });
    }
  });
  Object.keys(mod).slice(0, 400).forEach(function (k) {
    const mm = /^(\d+)-(\d+)$/.exec(k); if (!mm) return;
    const g = +mm[1], m = +mm[2]; if (!G[g] || G[g].items[m] == null) return;
    const x = mod[k] || {}, o = {};
    const n = str_(x.n, 70); if (n) o.n = n;
    const i = icon(x.i); if (i) o.i = i;
    if (x.h === true) o.h = true;
    if (Object.keys(o).length) out.mod[k] = o;
  });
  putSetting_('nav', out);
  audit_(me.username, 'تخصيص القوائم والعناوين', '', '', Object.keys(out.d).length + ' إدارة · ' + Object.keys(out.mod).length + ' وحدة');
  return { nav: out };
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
  const phone = str_(p.phone, 24).replace(/[\s-]/g, '').replace(/^\+?966/, '0');
  if (phone && !/^05\d{8}$/.test(phone)) throw err_('VALIDATION', 'رقم الجوال يبدأ بـ 05 ويتكون من 10 أرقام.', 'phone');
  const depts = (Array.isArray(p.depts) ? p.depts : []).map(Number).filter(function (n) { return n > 0 && n < SCHEMA.G.length; }).join(',');
  const u = findUser_(uname);
  if (u && !inUserScope_(me, u)) throw err_('VALIDATION', 'اسم المستخدم مستخدم في مؤسسة أخرى. اختر اسمًا مختلفًا.', 'username');
  // مؤسسة الحساب: مستخدم المؤسسة لا ينشئ إلا داخل مؤسسته، والمشرف العام يحدد المؤسسة أو يضيف مشرفًا للمنصة
  let org = me.org;
  if (isPlatform_(me)) {
    org = str_(p.org, 40) || (CUR_ORG !== '*' ? CUR_ORG : MAIN_ORG);
    if (org !== '*' && !getOrg_(org)) throw err_('VALIDATION', 'اختر مؤسسة الحساب.', 'org');
    if (org === '*' && p.role === 'contributor') throw err_('VALIDATION', 'حسابات المنصة: مسؤول للمنصة، أو «عضو منصة نافذ» للاطلاع فقط.', 'role');
  }
  if (u) {
    if (uname === me.username && (p.role !== 'admin' || p.active === false)) throw err_('VALIDATION', 'لا يمكنك إزالة صلاحية المسؤول عن نفسك أو إيقاف حسابك.');
    if (u.role === 'admin' && p.role !== 'admin') {
      const admins = table_('users').rows.filter(function (x) { return x.role === 'admin' && (x.active === true || x.active === 'TRUE') && String(x.org || MAIN_ORG) === String(u.org || MAIN_ORG); });
      if (admins.length <= 1) throw err_('VALIDATION', 'يجب أن يبقى مسؤول نظام واحد على الأقل.');
    }
    const cells = { name: name, email: email, role: p.role, depts: depts, active: p.active !== false, phone: phone };
    if (p.caps !== undefined) cells.caps = JSON.stringify(parseCaps_(p.caps));
    if (isPlatform_(me) && str_(p.org, 40) && uname !== me.username) cells.org = org;
    setUserCells_(u._row, cells);
    audit_(me.username, 'تعديل مستخدم', '', '', uname + ' · ' + ROLES[p.role] + (p.active === false ? ' · موقوف' : ''));
    return { username: uname };
  }
  const manual = typeof p.password === 'string' && p.password !== '';
  const pw = manual ? p.password : tempPassword_();
  if (manual) { try { checkPolicy_(pw); } catch (e) { e.field = 'password'; throw e; } }
  const must = p.mustChange !== false;
  addUser_({ username: uname, name: name, email: email, role: p.role, depts: depts, password: pw, mustChange: must, org: org, phone: phone });
  const emailed = p.sendEmail && email ? sendCredentials_(email, name, getOrg_(org), uname, pw, must, 'welcome') : false;
  audit_(me.username, 'إضافة مستخدم', '', '', uname + ' · ' + ROLES[p.role] + (manual ? ' · كلمة مرور من المسؤول' : ''));
  return { username: uname, password: pw, mustChange: must, emailed: emailed, phone: phone };
}
/** يرسل بيانات الدخول (الرابط واسم المستخدم وكلمة المرور) إلى بريد صاحب الحساب. */
function sendCredentials_(to, name, org, username, pw, must, kind) {
  try {
    if (MailApp.getRemainingDailyQuota() < 2) return false;
    const url = (function () { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } })();
    const e = function (x) { return String(x || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    const orgName = org ? org.name : 'منصة نافذ';
    const title = kind === 'reset' ? 'كلمة مرور جديدة لحسابك في نافذ' : 'مرحبًا بكم في منصة نافذ';
    const html = '<div dir="rtl" style="font-family:Tahoma,Arial;font-size:15px;color:#13211d;max-width:560px">' +
      '<div style="background:#0e4d3f;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;border-bottom:3px solid #deb24e"><b style="font-size:20px">نافذ</b><br><span style="opacity:.85">منصة الإدارة المؤسسية للجمعيات</span></div>' +
      '<div style="border:1px solid #dfe7e3;border-top:0;padding:20px 22px;border-radius:0 0 12px 12px">' +
      '<p style="margin:0 0 10px">السلام عليكم ' + e(name) + '،</p>' +
      '<p style="margin:0 0 14px">' + (kind === 'reset' ? 'أُصدرت كلمة مرور جديدة لحسابك' : 'أُنشئ حساب ' + e(orgName) + ' في منصة نافذ') + '. بيانات الدخول:</p>' +
      '<table style="border-collapse:collapse;width:100%;margin:0 0 14px"><tr><td style="padding:8px;background:#f2f6f4;width:40%">الجهة</td><td style="padding:8px;border-bottom:1px solid #eee"><b>' + e(orgName) + (org ? ' (' + e(org.code) + ')' : '') + '</b></td></tr>' +
      '<tr><td style="padding:8px;background:#f2f6f4">اسم المستخدم</td><td style="padding:8px;border-bottom:1px solid #eee;direction:ltr;text-align:right"><b style="font-family:Consolas,monospace;font-size:16px">' + e(username) + '</b></td></tr>' +
      '<tr><td style="padding:8px;background:#f2f6f4">كلمة المرور' + (must ? ' المؤقتة' : '') + '</td><td style="padding:8px;direction:ltr;text-align:right"><b style="font-family:Consolas,monospace;font-size:16px">' + e(pw) + '</b></td></tr></table>' +
      (url ? '<p style="margin:0 0 16px"><a href="' + url + '" style="background:#0e4d3f;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;display:inline-block">الدخول إلى نافذ</a></p><p style="margin:0 0 12px;font-size:12px;color:#5b6b66;direction:ltr;text-align:right">' + e(url) + '</p>' : '') +
      (must ? '<p style="margin:0 0 8px;color:#9a6f00">سيُطلب منك اختيار كلمة مرور خاصة بك عند أول دخول.</p>' : '') +
      '<p style="margin:0;font-size:12px;color:#888">لا تشارك هذه البيانات مع أحد. إن لم تطلب هذا الحساب فتجاهل الرسالة وأبلغ المشرف العام.</p></div></div>';
    MailApp.sendEmail({ to: to, subject: 'نافذ: ' + title + ' — ' + orgName, htmlBody: html, name: 'منصة نافذ' });
    return true;
  } catch (err) { console.error(err); return false; }
}


/* ---------- المؤسسات: الكشاف والإضافة والاستيراد (للمشرف العام) ---------- */
const ORG_FIELDS = [
  ['name', 'اسم المؤسسة', 120, true], ['code', 'الرمز المختصر', 12, true], ['type', 'نوع الكيان', 40], ['license', 'رقم الترخيص', 40],
  ['licenseExpiry', 'انتهاء الترخيص', 10], ['founded', 'تاريخ التأسيس', 10], ['region', 'المنطقة', 60], ['city', 'المدينة', 60],
  ['address', 'العنوان', 200], ['phone', 'الهاتف', 20], ['email', 'البريد', 120], ['website', 'الموقع', 200],
  ['manager', 'المدير التنفيذي', 80], ['managerPhone', 'جوال المدير', 20], ['managerEmail', 'بريد المدير', 120],
  ['chair', 'رئيس مجلس الإدارة', 80], ['bank', 'البنك', 60], ['iban', 'الآيبان', 34], ['employees', 'عدد الموظفين', 6],
  ['beneficiaries', 'عدد المستفيدين', 8], ['notes', 'ملاحظات', 1000],
  ['sector', 'القطاع', 40], ['vision', 'الرؤية', 600], ['mission', 'الرسالة', 800], ['goals', 'الأهداف', 2000],
  ['areas', 'مجالات العمل', 600], ['branches', 'الفروع والمواقع', 1500], ['mapUrl', 'رابط الموقع على الخريطة', 400], ['district', 'الحي', 80], ['postal', 'الرمز البريدي', 10]
];
function orgPublic_(o) {
  const c = JSON.parse(JSON.stringify(o)); delete c._row; delete c.settings; return c;
}
function cleanOrg_(p, existing) {
  const o = existing ? JSON.parse(JSON.stringify(existing)) : {};
  ORG_FIELDS.forEach(function (f) {
    if (p[f[0]] === undefined) return;
    let v = p[f[0]]; if (typeof v === 'number') v = String(v);
    o[f[0]] = str_(v, f[2]);
  });
  o.code = String(o.code || '').toUpperCase();
  if (!o.name) throw err_('VALIDATION', 'اكتب اسم المؤسسة.', 'name');
  if (!/^[A-Z][A-Z0-9]{1,11}$/.test(o.code)) throw err_('VALIDATION', 'الرمز المختصر حروف إنجليزية كبيرة وأرقام (2–12)، ويبدأ بحرف.', 'code');
  const dup = orgByCode_(o.code); if (dup && (!existing || dup.id !== existing.id)) throw err_('VALIDATION', 'الرمز «' + o.code + '» مستخدم لمؤسسة أخرى.', 'code');
  if (o.type && ORG_TYPES.indexOf(o.type) < 0) o.type = 'أخرى';
  if (o.sector && ORG_SECTORS.indexOf(o.sector) < 0) o.sector = '';
  if (o.areas) o.areas = o.areas.split(/[،,;|\n]+/).map(function (x) { return x.trim(); }).filter(function (x, i, a) { return x && ORG_AREAS.indexOf(x) >= 0 && a.indexOf(x) === i; }).join('، ');
  if (o.mapUrl && !/^https?:\/\//.test(o.mapUrl)) throw err_('VALIDATION', 'رابط الخريطة يبدأ بـ https://', 'mapUrl');
  if (o.postal && !/^\d{5}$/.test(o.postal)) throw err_('VALIDATION', 'الرمز البريدي 5 أرقام.', 'postal');
  if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) throw err_('VALIDATION', 'صيغة بريد المؤسسة غير صحيحة.', 'email');
  if (o.managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.managerEmail)) throw err_('VALIDATION', 'صيغة بريد المدير غير صحيحة.', 'managerEmail');
  ['phone', 'managerPhone'].forEach(function (k) { if (o[k] && !/^0\d{8,11}$|^\+?\d{9,15}$/.test(o[k].replace(/[\s-]/g, ''))) throw err_('VALIDATION', 'رقم هاتف غير صحيح في «' + (k === 'phone' ? 'الهاتف' : 'جوال المدير') + '».', k); });
  ['licenseExpiry', 'founded'].forEach(function (k) { if (o[k] && !date_(o[k])) throw err_('VALIDATION', 'التاريخ بصيغة YYYY-MM-DD.', k); });
  ['employees', 'beneficiaries'].forEach(function (k) { if (o[k] && !/^\d+$/.test(o[k])) throw err_('VALIDATION', 'أدخل رقمًا صحيحًا.', k); });
  if (o.iban) { o.iban = o.iban.replace(/\s/g, '').toUpperCase(); if (!/^SA\d{22}$/.test(o.iban)) throw err_('VALIDATION', 'الآيبان السعودي يبدأ بـ SA ويتكون من 24 خانة.', 'iban'); }
  return o;
}
/** ينشئ مؤسسة جديدة ومسؤولها الأول بكلمة مرور تلقائية. */
function createOrg_(me, p) {
  const o = cleanOrg_(p, null);
  o.id = 'o' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  o.status = 'active'; o.created = now_();
  o.settings = { threshold: 5000, sod: false, notify: true, publicStats: true };
  let un = normUser_(p.adminUsername || (o.code.toLowerCase() + '.admin'));
  if (!/^[a-z0-9._-]{3,30}$/.test(un)) throw err_('VALIDATION', 'اسم مستخدم المسؤول غير صالح.', 'adminUsername');
  if (findUser_(un)) throw err_('VALIDATION', 'اسم المستخدم «' + un + '» موجود. اختر اسمًا آخر للمسؤول.', 'adminUsername');
  // كلمة المرور: يكتبها المشرف العام أو تُولَّد تلقائيًا
  const manual = typeof p.adminPassword === 'string' && p.adminPassword !== '';
  const pw = manual ? p.adminPassword : tempPassword_();
  if (manual) { try { checkPolicy_(pw); } catch (e) { e.field = 'adminPassword'; throw e; } }
  const must = p.adminMustChange !== false;
  const aEmail = str_(p.adminEmail, 120) || o.managerEmail || o.email || '';
  if (aEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(aEmail)) throw err_('VALIDATION', 'صيغة بريد المسؤول غير صحيحة.', 'adminEmail');
  const aName = str_(p.adminName, 80) || o.manager || ('مسؤول ' + o.name);
  saveOrgRow_(o);
  const aPhone = str_(p.adminPhone, 24).replace(/[\s-]/g, '').replace(/^\+?966/, '0') || (/^05\d{8}$/.test(String(o.managerPhone || '')) ? o.managerPhone : '');
  if (aPhone && !/^05\d{8}$/.test(aPhone)) throw err_('VALIDATION', 'جوال المسؤول يبدأ بـ 05 ويتكون من 10 أرقام.', 'adminPhone');
  addUser_({ username: un, name: aName, email: aEmail, role: 'admin', depts: '', password: pw, mustChange: must, org: o.id, phone: aPhone });
  const emailed = p.sendEmail !== false && aEmail ? sendCredentials_(aEmail, aName, o, un, pw, must, 'welcome') : false;
  audit_(me.username, 'إضافة مؤسسة', '', '', o.code + ' · ' + o.name + (emailed ? ' · أُرسلت بيانات الدخول إلى ' + aEmail : ''));
  return { org: orgPublic_(o), admin: { username: un, name: aName, email: aEmail, phone: aPhone, password: pw, mustChange: must, emailed: emailed } };
}
function actSaveOrg_(me, p) {
  if (!p.id) return createOrg_(me, p);
  const ex = getOrg_(str_(p.id, 40)); if (!ex) throw err_('NOTFOUND', 'المؤسسة غير موجودة.');
  const o = cleanOrg_(p, ex);
  saveOrgRow_(o);
  audit_(me.username, 'تعديل مؤسسة', '', '', o.code + ' · ' + o.name);
  return { org: orgPublic_(o) };
}
function actImportOrgs_(me, p) {
  const rows = Array.isArray(p.rows) ? p.rows.slice(0, 500) : [];
  const done = [], errors = [];
  rows.forEach(function (r, i) {
    try { const x = createOrg_(me, Object.assign({}, r || {}, { sendEmail: p.sendEmail !== false })); done.push({ row: i + 2, name: x.org.name, code: x.org.code, username: x.admin.username, password: x.admin.password, email: x.admin.email, phone: x.admin.phone, emailed: x.admin.emailed }); }
    catch (e) { errors.push({ row: i + 2, name: str_(r && r.name, 120), message: e.message }); }
  });
  audit_(me.username, 'استيراد مؤسسات', '', '', done.length + ' مضافة · ' + errors.length + ' مرفوضة');
  return { done: done, errors: errors };
}
function actListOrgs_() {
  const all = loadAllRecords_(), users = table_('users').rows;
  const thisYear = String(new Date().getFullYear());
  const today = now_().slice(0, 10);
  return loadOrgs_().map(function (o) {
    const R = all.filter(function (r) { return r.org === o.id && !r.deleted; });
    const open = R.filter(function (r) { return OPEN.indexOf(r.status) >= 0; });
    const U = users.filter(function (u) { return String(u.org || MAIN_ORG) === o.id; });
    const last = R.reduce(function (a, r) { return r.updated > a ? r.updated : a; }, '');
    const x = orgPublic_(o);
    x.stats = {
      users: U.length, activeUsers: U.filter(function (u) { return u.active === true || u.active === 'TRUE'; }).length,
      admins: U.filter(function (u) { return u.role === 'admin'; }).map(function (u) { return String(u.username); }),
      records: R.length, open: open.length, pending: R.filter(function (r) { return r.status === 'بانتظار الاعتماد'; }).length,
      late: open.filter(function (r) { return r.due && r.due < today; }).length,
      done: R.filter(function (r) { return r.status === 'مكتمل'; }).length,
      donations: R.filter(function (r) { return r.g === 6 && r.status === 'مكتمل' && String(r.date).indexOf(thisYear) === 0; }).reduce(function (a, r) { return a + recSum_(r); }, 0),
      expenses: R.filter(function (r) { return r.g === 7 && r.status === 'مكتمل' && String(r.date).indexOf(thisYear) === 0; }).reduce(function (a, r) { return a + recSum_(r); }, 0),
      beneficiaries: R.filter(function (r) { return r.g === 10; }).length,
      lastActivity: last
    };
    return x;
  });
}


/* =====================================================================
 * مركز الحوكمة: مكتبة مستندات مؤسسية مشتركة بين المؤشرات (يُرفع المستند مرة واحدة ويخدم كل مؤشر يحتاجه)،
 * ودورات تقييم سنوية، وتقييم ذاتي لكل مؤشر. التعريف في SCHEMA.GOV، والحالة لكل مؤسسة ودورة صف في ورقة «الحوكمة».
 * ===================================================================== */
const GOV_TYPES = FILE_TYPES.concat(['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.ms-excel']);
const GOV_ANS = ['full', 'part', 'none', 'na'];
function govSheet_() {
  let s = sheet_('gov');
  if (!s) { s = ss_().insertSheet(SH.gov); s.getRange(1, 1, 1, HEAD.gov.length).setValues([HEAD.gov]); s.setFrozenRows(1); }
  return s;
}
function govCycle_(c) { c = str_(String(c || ''), 8); return /^(20\d\d|_lib)$/.test(c) ? c : String(new Date().getFullYear()); }
function govLoad_(org, cycle) {
  const s = govSheet_(), id = org + '|' + cycle;
  const row = findRow_('gov', id);
  if (!row) return { _row: 0, docs: {}, ans: {} };
  let j = {}; try { j = JSON.parse(String(s.getRange(row, 4).getValue() || '{}')); } catch (e) { j = {}; }
  j.docs = j.docs || {}; j.ans = j.ans || {}; j._row = row; return j;
}
function govSave_(org, cycle, st) {
  const s = govSheet_(), id = org + '|' + cycle; const c = JSON.parse(JSON.stringify(st)); delete c._row;
  const line = [id, org, cycle, JSON.stringify(c)];
  const row = st._row || findRow_('gov', id);
  if (row) s.getRange(row, 1, 1, line.length).setValues([line]); else s.appendRow(line);
}
function govNeedOrg_() { if (!CUR_ORG || CUR_ORG === '*') throw err_('VALIDATION', 'اختر مؤسسة من أعلى الصفحة أولًا.'); return CUR_ORG; }
function govLib_(org) { return govLoad_(org, '_lib').docs || {}; }
function govDocExists_(org, key) { return !!(SCHEMA.GOV.docs[key] || govLib_(org)[key]); }
/** نسبة الجاهزية والامتثال لمؤسسة في دورة: تُستخدم في المركز وفي نظرة المشرف العام. */
function govScore_(org, cycle, st) {
  st = st || govLoad_(org, cycle);
  const ready = function (k) { const d = st.docs[k]; return !!(d && (d.fid || d.na)); };
  const out = { standards: [], ready: 0, total: 0, comp: 0, compN: 0 };
  SCHEMA.GOV.standards.forEach(function (S) {
    let r = 0, t = 0, cs = 0, cn = 0;
    S.ind.forEach(function (I) {
      I.docs.forEach(function (k) { t++; if (ready(k)) r++; });
      const a = st.ans[I.id] && st.ans[I.id].v;
      if (a && a !== 'na') { cn++; cs += a === 'full' ? 1 : a === 'part' ? 0.5 : 0; }
    });
    out.standards.push({ id: S.id, ready: r, total: t, comp: cn ? Math.round(cs / cn * 100) : null, answered: cn, ind: S.ind.length });
    out.ready += r; out.total += t; out.comp += cs; out.compN += cn;
  });
  out.readyPct = out.total ? Math.round(out.ready / out.total * 100) : 0;
  out.compPct = out.compN ? Math.round(out.comp / out.compN * 100) : null;
  return out;
}
function actGovGet_(me, p) {
  const cycle = govCycle_(p.cycle);
  if (!CUR_ORG || CUR_ORG === '*') {
    if (!isPlatformMember_(me)) throw err_('FORBIDDEN', 'غير مسموح.');
    return { overview: loadOrgs_().filter(function (o) { return o.status !== 'archived'; }).map(function (o) { const sc = govScore_(o.id, cycle); return { id: o.id, code: o.code, name: o.name, readyPct: sc.readyPct, compPct: sc.compPct, ready: sc.ready, total: sc.total }; }), cycle: cycle, def: SCHEMA.GOV };
  }
  const st = govLoad_(CUR_ORG, cycle);
  const cycles = govSheet_().getLastRow() > 1 ? table_('gov').rows.filter(function (r) { return r.org === CUR_ORG && r.cycle !== '_lib'; }).map(function (r) { return String(r.cycle); }) : [];
  if (cycles.indexOf(cycle) < 0) cycles.push(cycle);
  const docs = {}; Object.keys(st.docs).forEach(function (k) { const d = st.docs[k]; docs[k] = { name: d.name, mime: d.mime, size: d.size, by: d.by, at: d.at, exp: d.exp || '', note: d.note || '', na: !!d.na, naWhy: d.naWhy || '', has: !!d.fid, hist: (d.hist || []).length }; });
  return { cycle: cycle, cycles: cycles.sort().reverse(), def: SCHEMA.GOV, lib: govLib_(CUR_ORG), docs: docs, ans: st.ans, score: govScore_(CUR_ORG, cycle, st) };
}
function actGovUpload_(me, p) {
  const org = govNeedOrg_(), cycle = govCycle_(p.cycle), key = str_(p.key, 60);
  if (!govDocExists_(org, key)) throw err_('VALIDATION', 'مستند غير معروف.');
  const name = str_(p.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'مستند';
  const mime = String(p.mime || '');
  if (GOV_TYPES.indexOf(mime) < 0) throw err_('VALIDATION', 'الأنواع المسموحة: PDF وWord وExcel وصور JPG/PNG/WEBP.');
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (!bytes.length) throw err_('VALIDATION', 'الملف فارغ.');
  if (bytes.length > MAX_FILE * 2) throw err_('VALIDATION', 'حجم الملف أكبر من 10 ميجابايت.');
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, 'حوكمة ' + cycle + ' — ' + name));
  const fid = Utilities.getUuid();
  sheet_('files').appendRow([fid, 'gov:' + org + ':' + cycle + ':' + key, name, mime, bytes.length, file.getId(), me.username, now_()]);
  const st = govLoad_(org, cycle), old = st.docs[key] || {};
  const hist = (old.hist || []); if (old.fid) hist.unshift({ fid: old.fid, name: old.name, at: old.at, by: old.by });
  st.docs[key] = { fid: fid, name: name, mime: mime, size: bytes.length, by: me.username, at: now_(), exp: str_(p.exp, 10) || old.exp || '', note: str_(p.note, 300) || old.note || '', hist: hist.slice(0, 5) };
  govSave_(org, cycle, st);
  audit_(me.username, old.fid ? 'تحديث مستند حوكمة' : 'رفع مستند حوكمة', '', '', name);
  return actGovGet_(me, { cycle: cycle });
}
function actGovFile_(me, p) {
  const org = govNeedOrg_(), cycle = govCycle_(p.cycle), key = str_(p.key, 60);
  if (me.role === 'viewer') throw err_('FORBIDDEN', 'صلاحية المشاهد لا تشمل تنزيل المستندات.');
  const d = govLoad_(org, cycle).docs[key];
  if (!d || !d.fid) throw err_('NOTFOUND', 'لم يُرفع هذا المستند بعد.');
  const row = findRow_('files', d.fid); if (!row) throw err_('NOTFOUND', 'الملف غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  if (String(v[1]).indexOf('gov:' + org + ':') !== 0) throw err_('FORBIDDEN', 'غير مسموح.');
  audit_(me.username, 'تنزيل مستند حوكمة', '', '', String(v[2]));
  return { name: String(v[2]), mime: String(v[3]), data: Utilities.base64Encode(DriveApp.getFileById(String(v[5])).getBlob().getBytes()) };
}
function actGovClear_(me, p) {
  const org = govNeedOrg_(), cycle = govCycle_(p.cycle), key = str_(p.key, 60);
  const st = govLoad_(org, cycle), d = st.docs[key];
  if (d) { delete st.docs[key]; govSave_(org, cycle, st); audit_(me.username, 'إزالة مستند حوكمة', '', '', d.name || key); }
  return actGovGet_(me, { cycle: cycle });
}
function actGovDocMeta_(me, p) {
  const org = govNeedOrg_(), cycle = govCycle_(p.cycle), key = str_(p.key, 60);
  if (!govDocExists_(org, key)) throw err_('VALIDATION', 'مستند غير معروف.');
  const st = govLoad_(org, cycle), d = st.docs[key] || {};
  if (p.exp !== undefined) d.exp = /^\d{4}-\d\d-\d\d$/.test(String(p.exp)) ? String(p.exp) : '';
  if (p.note !== undefined) d.note = str_(p.note, 300);
  if (p.na !== undefined) { d.na = !!p.na; d.naWhy = d.na ? str_(p.naWhy, 200) : ''; if (d.na && !d.naWhy) throw err_('VALIDATION', 'اذكر سبب عدم الانطباق.', 'naWhy'); }
  if (!d.fid && !d.na && !d.exp && !d.note) delete st.docs[key]; else st.docs[key] = d;
  govSave_(org, cycle, st);
  return actGovGet_(me, { cycle: cycle });
}
function actGovAnswer_(me, p) {
  const org = govNeedOrg_(), cycle = govCycle_(p.cycle), id = str_(p.ind, 10);
  if (!SCHEMA.GOV.standards.some(function (S) { return S.ind.some(function (I) { return I.id === id; }); })) throw err_('VALIDATION', 'مؤشر غير معروف.');
  const v = String(p.v || '');
  if (v && GOV_ANS.indexOf(v) < 0) throw err_('VALIDATION', 'إجابة غير صحيحة.');
  const st = govLoad_(org, cycle);
  if (!v && !str_(p.note, 600)) delete st.ans[id]; else st.ans[id] = { v: v, note: str_(p.note, 600), by: me.username, at: now_() };
  govSave_(org, cycle, st);
  return actGovGet_(me, { cycle: cycle });
}
/** نسخ المستندات الثابتة من دورة سابقة (اللائحة، السياسات، العقود…) دون مضاعفة الملفات. */
function actGovCopy_(me, p) {
  const org = govNeedOrg_(), from = govCycle_(p.from), to = govCycle_(p.to);
  if (from === to) throw err_('VALIDATION', 'اختر دورة مختلفة.');
  const a = govLoad_(org, from), b = govLoad_(org, to); let n = 0;
  const keys = Array.isArray(p.keys) && p.keys.length ? p.keys.map(function (k) { return str_(k, 60); }) : Object.keys(a.docs);
  keys.forEach(function (k) { const d = a.docs[k]; if (d && (d.fid || d.na) && !b.docs[k]) { b.docs[k] = JSON.parse(JSON.stringify(d)); b.docs[k].hist = []; b.docs[k].copied = from; n++; } });
  govSave_(org, to, b);
  audit_(me.username, 'نسخ مستندات الحوكمة', '', '', from + ' ← ' + to + ' (' + n + ')');
  const out = actGovGet_(me, { cycle: to }); out.copied = n; return out;
}
/* ================= إدارة العهد (الأصول والعهد الشخصية) =================
 * حالة واحدة لكل مؤسسة في ورقة «الحوكمة» بالدورة '_assets':
 * { set, assets[], emps[], moves[] }. الحركات لا تُحذف، والأصل يتبع آخر حركة. */
const AST_ST = { store: 'بالمخزن', custody: 'بعهدة موظف', maint: 'بالصيانة', out: 'مستبعد' };
function astDefaults_() {
  const L = function (a, c) { return a.map(function (n, i) { return { id: 'd' + (i + 1), n: n, c: c[i % c.length] }; }); };
  const C = ['#2f6fdf', '#e08a1e', '#7b5ce0', '#13a06f', '#d64545', '#0b6e8f'];
  return { orgName: '', officer: '', depts: L(['الموارد البشرية', 'المالية', 'المشتريات', 'المشاريع', 'تقنية المعلومات', 'الخدمات العامة'], C),
    locs: L(['المقر الرئيسي', 'الفرع الأول', 'المخزن الرئيسي', 'مركز الصيانة'], C), cats: L(['أجهزة تقنية', 'أجهزة مكتبية', 'أثاث', 'أدوات', 'مركبات'], ['#7b5ce0', '#2f6fdf', '#e08a1e', '#13a06f', '#0b6e8f']),
    conds: L(['جيد', 'يحتاج صيانة', 'تالف'], ['#13a06f', '#e08a1e', '#d64545']), acc: ['كابل الطاقة', 'دليل الاستخدام', 'الشاحن', 'الحقيبة', 'الملحقات الأخرى'],
    aPre: 'A-', aNext: 1, mPre: 'M-', mNext: 1, ePre: 'E-', eNext: 1, cPre: 'C-', cNext: 1, warrantyDays: 30, warnDays: 7, reqForm: true, allowOpen: true, currency: 'ريال' };
}
function astLoad_(org) {
  const st = govLoad_(org, '_assets'); const d = astDefaults_();
  st.set = Object.assign(d, st.set || {}); st.assets = st.assets || []; st.emps = st.emps || []; st.moves = st.moves || []; st.counts = st.counts || []; return st;
}
function astNeed_() { return govNeedOrg_(); }
function astCanW_(me) { if (me.role === 'viewer') throw err_('FORBIDDEN', 'صلاحيتك للعرض فقط.'); }
function astAdmin_(me) { if (me.role !== 'admin') throw err_('FORBIDDEN', 'هذا الإجراء لمسؤول النظام فقط.'); }
function astPad_(n, w) { return String(n).padStart(w, '0'); }
function astOut_(st, extra) { const o = { set: st.set, assets: st.assets, emps: st.emps, moves: st.moves, counts: st.counts || [], sts: AST_ST }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
function astList_(L, id) { return (L || []).filter(function (x) { return x.id === id; })[0]; }
function astMoveAdd_(st, me, m) {
  m.id = 'm' + Utilities.getUuid().replace(/-/g, '').slice(0, 10); m.no = st.set.mPre + astPad_(st.set.mNext++, 4); m.by = me.username; m.at = now_();
  st.moves.unshift(m); if (st.moves.length > 5000) st.moves.length = 5000; return m;
}
function actAstGet_(me) {
  if (!CUR_ORG || CUR_ORG === '*') return aggOrgs_(me, astLoad_, ['assets', 'emps', 'moves', 'counts'], { sts: AST_ST });

  const st = astLoad_(astNeed_()); if (!st.set.orgName) st.set.orgName = String(getSettings_().orgName || ''); return astOut_(st);
}
function today_() { return Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd'); }
function astClean_(x, keys) { const o = {}; keys.forEach(function (k) { const v = x[k[0]]; if (k[1] === 'n') { const n = Number(v); if (v !== '' && v != null && isFinite(n)) o[k[0]] = Math.max(0, n); } else { const s = str_(String(v == null ? '' : v), k[1] || 200); if (s) o[k[0]] = s; } }); return o; }
const AST_AK = [['no', 30], ['name', 120], ['cat', 20], ['brand', 120], ['model', 120], ['sn', 80], ['date', 10], ['cost', 'n'], ['loc', 20], ['dept', 20], ['cond', 20], ['note', 1000], ['icon', 20], ['warranty', 10], ['supplier', 120], ['life', 'n'], ['salvage', 'n'], ['tag', 60], ['program', 120]];
const AST_EK = [['no', 30], ['name', 120], ['dept', 20], ['loc', 20], ['title', 120], ['phone', 30], ['email', 120], ['nid', 30]];
function actAstSaveAsset_(me, p) {
  astCanW_(me); const org = astNeed_(), st = astLoad_(org), x = p.item || {};
  const c = astClean_(x, AST_AK);
  if (!c.name) throw err_('VALIDATION', 'اسم الأصل مطلوب.'); if (!c.cat) throw err_('VALIDATION', 'التصنيف مطلوب.'); if (!c.loc) throw err_('VALIDATION', 'الموقع مطلوب.');
  let a = x.id ? astList_(st.assets, String(x.id)) : null;
  if (c.no && st.assets.some(function (y) { return y.no === c.no && (!a || y.id !== a.id); })) throw err_('VALIDATION', 'رقم الأصل ' + c.no + ' مستخدم لأصل آخر.');
  if (c.sn && st.assets.some(function (y) { return y.sn === c.sn && (!a || y.id !== a.id); })) throw err_('VALIDATION', 'الرقم التسلسلي ' + c.sn + ' مسجّل لأصل آخر.');
  if (a) {
    const keep = { id: a.id, status: a.status, holder: a.holder, due: a.due, issued: a.issued, files: a.files || [], sample: a.sample, created: a.created, missing: a.missing, counted: a.counted };
    let ns = keep.status; if (p.status && keep.status !== 'custody' && ['store', 'maint', 'out'].indexOf(p.status) >= 0) ns = p.status;
    const old = a.status; Object.keys(a).forEach(function (k) { delete a[k]; }); Object.assign(a, c, keep); if (!a.no) a.no = st.set.aPre + astPad_(st.set.aNext++, 4); a.status = ns;
    if (ns !== old) astMoveAdd_(st, me, { type: 'status', asset: a.id, from: { st: old }, to: { st: ns, loc: a.loc }, date: today_(), cond: a.cond || '', note: str_(p.why, 300) });
    audit_(me.username, 'تعديل أصل', '', a.no, a.name);
  } else {
    a = Object.assign(c, { id: 'a' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), status: ['store', 'maint'].indexOf(p.status) >= 0 ? p.status : 'store', holder: '', files: [], created: now_() });
    if (!a.no) a.no = st.set.aPre + astPad_(st.set.aNext++, 4);
    st.assets.unshift(a); astMoveAdd_(st, me, { type: 'add', asset: a.id, to: { loc: a.loc, st: a.status }, date: a.date || today_(), cond: a.cond || '' });
    audit_(me.username, 'إضافة أصل', '', a.no, a.name);
  }
  govSave_(org, '_assets', st); return astOut_(st, { id: a.id });
}
function actAstDelAsset_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = astLoad_(org), a = astList_(st.assets, String(p.id || ''));
  if (!a) throw err_('NOTFOUND', 'الأصل غير موجود.'); if (a.status === 'custody') throw err_('VALIDATION', 'الأصل بعهدة موظف؛ استلمه أولًا ثم احذفه.');
  st.assets = st.assets.filter(function (x) { return x !== a; }); audit_(me.username, 'حذف أصل', '', a.no, a.name); govSave_(org, '_assets', st); return astOut_(st);
}
function actAstSaveEmp_(me, p) {
  astCanW_(me); const org = astNeed_(), st = astLoad_(org), x = p.item || {}, c = astClean_(x, AST_EK);
  if (!c.name) throw err_('VALIDATION', 'اسم الموظف مطلوب.');
  let e = x.id ? astList_(st.emps, String(x.id)) : null;
  if (c.no && st.emps.some(function (y) { return y.no === c.no && (!e || y.id !== e.id); })) throw err_('VALIDATION', 'الرقم الوظيفي ' + c.no + ' مستخدم.');
  if (e) { const id = e.id, sm = e.sample; Object.keys(e).forEach(function (k) { delete e[k]; }); Object.assign(e, c, { id: id, sample: sm }); if (!e.no) e.no = st.set.ePre + astPad_(st.set.eNext++, 3); }
  else { e = Object.assign(c, { id: 'e' + Utilities.getUuid().replace(/-/g, '').slice(0, 10) }); if (!e.no) e.no = st.set.ePre + astPad_(st.set.eNext++, 3); st.emps.push(e); }
  audit_(me.username, 'حفظ موظف (العهد)', '', e.no, e.name); govSave_(org, '_assets', st); return astOut_(st, { id: e.id });
}
function actAstDelEmp_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = astLoad_(org), e = astList_(st.emps, String(p.id || ''));
  if (!e) throw err_('NOTFOUND', 'الموظف غير موجود.');
  if (st.assets.some(function (a) { return a.status === 'custody' && a.holder === e.id; })) throw err_('VALIDATION', 'لدى الموظف عهد قائمة؛ استلمها أو انقلها أولًا.');
  st.emps = st.emps.filter(function (x) { return x !== e; }); govSave_(org, '_assets', st); return astOut_(st);
}
function actAstMove_(me, p) {
  astCanW_(me); const org = astNeed_(), st = astLoad_(org), S = st.set, t = String(p.type || '');
  const a = astList_(st.assets, String(p.asset || '')); if (!a) throw err_('VALIDATION', 'اختر الأصل.');
  const date = str_(p.date, 10) || today_(), due = str_(p.due, 10), cond = str_(p.cond, 20), note = str_(p.note, 600), by = str_(p.issuer, 120);
  if (due && due < date) throw err_('VALIDATION', 'تاريخ الإعادة المتوقعة قبل تاريخ الحركة.');
  if ((t === 'issue' || t === 'transfer') && !due && !S.allowOpen) throw err_('VALIDATION', 'حدّد تاريخ الإعادة المتوقعة (الإعدادات لا تسمح بعهدة مفتوحة).');
  let m;
  if (t === 'issue') {
    if (a.status !== 'store') throw err_('VALIDATION', 'لا يُسلَّم إلا أصل موجود بالمخزن. حالته الآن: ' + AST_ST[a.status] + '.');
    const e = astList_(st.emps, String(p.emp || '')); if (!e) throw err_('VALIDATION', 'اختر المستلم.');
    m = astMoveAdd_(st, me, { type: 'issue', asset: a.id, from: { loc: a.loc }, to: { emp: e.id, dept: e.dept || '', loc: str_(p.loc, 20) || e.loc || a.loc }, date: date, due: due, cond: cond || a.cond || '', purpose: str_(p.purpose, 200), issuer: by, note: note });
    a.status = 'custody'; a.holder = e.id; a.due = due; a.issued = date; a.loc = m.to.loc; if (cond) a.cond = cond;
  } else if (t === 'transfer') {
    if (a.status !== 'custody') throw err_('VALIDATION', 'النقل يكون لأصل بعهدة موظف.');
    const e = astList_(st.emps, String(p.emp || '')); if (!e) throw err_('VALIDATION', 'اختر المستلم الجديد.');
    if (e.id === a.holder) throw err_('VALIDATION', 'المستلم الجديد هو نفسه المستلم الحالي.');
    const fe = astList_(st.emps, a.holder) || {};
    m = astMoveAdd_(st, me, { type: 'transfer', asset: a.id, from: { emp: a.holder, dept: fe.dept || '', loc: a.loc }, to: { emp: e.id, dept: str_(p.dept, 20) || e.dept || '', loc: str_(p.loc, 20) || e.loc || a.loc }, date: date, due: due, cond: cond || a.cond || '', reason: str_(p.reason, 200), issuer: by, note: note });
    a.holder = e.id; a.due = due; a.issued = date; a.loc = m.to.loc; if (cond) a.cond = cond;
  } else if (t === 'return') {
    if (a.status !== 'custody') throw err_('VALIDATION', 'الاستلام يكون لأصل بعهدة موظف.');
    const ns = ['store', 'maint', 'out'].indexOf(p.status) >= 0 ? p.status : 'store', fe = astList_(st.emps, a.holder) || {};
    const acc = Array.isArray(p.acc) ? p.acc.slice(0, 20).map(function (x) { return str_(String(x), 60); }).filter(Boolean) : [];
    m = astMoveAdd_(st, me, { type: 'return', asset: a.id, from: { emp: a.holder, dept: fe.dept || '', loc: a.loc }, to: { loc: str_(p.loc, 20) || a.loc, st: ns }, date: date, cond: cond || a.cond || '', receiver: by, acc: acc, issuedAt: a.issued || '', dueWas: a.due || '', note: note });
    a.status = ns; a.holder = ''; a.due = ''; a.issued = ''; a.loc = m.to.loc; if (cond) a.cond = cond;
  } else throw err_('VALIDATION', 'نوع حركة غير معروف.');
  if (a.sample) m.sample = true;
  audit_(me.username, { issue: 'تسليم عهدة', transfer: 'نقل عهدة', return: 'استلام عهدة' }[t], '', m.no, a.no + ' ' + a.name);
  govSave_(org, '_assets', st); return astOut_(st, { move: m.id });
}
function actAstSet_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = astLoad_(org), x = p.set || {}, s = st.set;
  const lst = function (L, max) { return (Array.isArray(L) ? L : []).slice(0, max || 60).map(function (o, i) { return { id: str_(String(o.id || ''), 20).replace(/[^A-Za-z0-9_-]/g, '') || ('x' + i + Date.now().toString(36)), n: str_(String(o.n || ''), 80), c: /^#[0-9a-fA-F]{6}$/.test(o.c) ? o.c : '#2f6fdf' }; }).filter(function (o) { return o.n; }); };
  ['depts', 'locs', 'cats', 'conds'].forEach(function (k) { if (x[k]) { const v = lst(x[k]); if (!v.length) throw err_('VALIDATION', 'لا تترك القائمة فارغة.'); s[k] = v; } });
  if (x.acc) s.acc = (Array.isArray(x.acc) ? x.acc : []).slice(0, 20).map(function (v) { return str_(String(v), 60); }).filter(Boolean);
  ['orgName', 'officer', 'currency'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 120); });
  ['aPre', 'mPre', 'ePre', 'cPre'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 8) || s[k]; });
  ['aNext', 'mNext', 'eNext', 'cNext'].forEach(function (k) { const n = parseInt(x[k], 10); if (n > 0 && n < 1e7) s[k] = n; });
  if (x.warrantyDays != null) s.warrantyDays = Math.max(0, Math.min(365, parseInt(x.warrantyDays, 10) || 0));
  if (x.warnDays != null) s.warnDays = Math.max(0, Math.min(90, parseInt(x.warnDays, 10) || 0));
  ['reqForm', 'allowOpen'].forEach(function (k) { if (x[k] != null) s[k] = !!x[k]; });
  audit_(me.username, 'إعدادات إدارة العهد', '', '', ''); govSave_(org, '_assets', st); return astOut_(st);
}
function actAstUpload_(me, p) {
  astCanW_(me); const org = astNeed_(), st = astLoad_(org), kind = p.kind === 'asset' ? 'asset' : 'move';
  const tgt = astList_(kind === 'asset' ? st.assets : st.moves, String(p.id || '')); if (!tgt) throw err_('NOTFOUND', 'العنصر غير موجود.');
  const name = str_(p.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'مستند', mime = String(p.mime || '');
  if (GOV_TYPES.indexOf(mime) < 0) throw err_('VALIDATION', 'الأنواع المسموحة: PDF وWord وExcel وصور JPG/PNG/WEBP.');
  const bytes = Utilities.base64Decode(String(p.data || '')); if (!bytes.length) throw err_('VALIDATION', 'الملف فارغ.'); if (bytes.length > MAX_FILE * 2) throw err_('VALIDATION', 'حجم الملف أكبر من 10 ميجابايت.');
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, 'عهد — ' + name)), fid = Utilities.getUuid();
  sheet_('files').appendRow([fid, 'ast:' + org + ':' + tgt.id, name, mime, bytes.length, file.getId(), me.username, now_()]);
  const f = { fid: fid, name: name, mime: mime, size: bytes.length, at: now_(), by: me.username };
  if (kind === 'asset') { tgt.files = (tgt.files || []); tgt.files.unshift(f); tgt.files = tgt.files.slice(0, 10); } else tgt.form = f;
  audit_(me.username, 'إرفاق مستند عهدة', '', tgt.no || '', name); govSave_(org, '_assets', st); return astOut_(st);
}
function actAstFile_(me, p) {
  const org = astNeed_(); if (me.role === 'viewer') throw err_('FORBIDDEN', 'صلاحية المشاهد لا تشمل تنزيل المستندات.');
  const row = findRow_('files', String(p.fid || '')); if (!row) throw err_('NOTFOUND', 'الملف غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  if (String(v[1]).indexOf('ast:' + org + ':') !== 0) throw err_('FORBIDDEN', 'غير مسموح.');
  return { name: String(v[2]), mime: String(v[3]), data: Utilities.base64Encode(DriveApp.getFileById(String(v[5])).getBlob().getBytes()) };
}
/** جرد الأصول: جلسة لكل جرد، تُعتمد فتُحدَّث حالة الأصول وتُسجَّل الفروقات حركات. */
function actAstCount_(me, p) {
  astCanW_(me); const org = astNeed_(), st = astLoad_(org), S = st.set, op = String(p.op || '');
  if (op === 'start') {
    const loc = str_(p.loc, 20); const L = st.assets.filter(function (a) { return a.status !== 'out' && (!loc || a.loc === loc); });
    if (!L.length) throw err_('VALIDATION', 'لا توجد أصول في هذا النطاق للجرد.');
    if (st.counts.some(function (c) { return c.status === 'open' && (c.loc || '') === loc; })) throw err_('VALIDATION', 'يوجد جرد مفتوح لنفس الموقع؛ أكمله أو احذفه أولًا.');
    const items = {}; L.forEach(function (a) { items[a.id] = { f: null, cond: a.cond || '', loc: a.loc || '', holder: a.holder || '' }; });
    const c = { id: 'c' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.cPre + astPad_(S.cNext++, 4), date: str_(p.date, 10) || today_(), loc: loc, team: str_(p.team, 200), note: str_(p.note, 300), status: 'open', items: items, by: me.username, at: now_() };
    st.counts.unshift(c); audit_(me.username, 'بدء جرد أصول', '', c.no, String(L.length)); govSave_(org, '_assets', st); return astOut_(st, { id: c.id });
  }
  const c = astList_(st.counts, String(p.id || '')); if (!c) throw err_('NOTFOUND', 'الجرد غير موجود.');
  if (op === 'del') { astAdmin_(me); if (c.status !== 'open') throw err_('VALIDATION', 'لا يُحذف جرد معتمد.'); st.counts = st.counts.filter(function (x) { return x !== c; }); govSave_(org, '_assets', st); return astOut_(st); }
  if (c.status !== 'open') throw err_('VALIDATION', 'الجرد معتمد ولا يقبل التعديل.');
  if (op === 'save' || op === 'approve') {
    const it = p.items || {}; Object.keys(it).forEach(function (k) { if (!c.items[k]) return; const v = it[k] || {}; c.items[k].f = v.f === true || v.f === 1 ? 1 : v.f === false || v.f === 0 ? 0 : null; if (v.cond != null) c.items[k].cond = str_(String(v.cond), 20); c.items[k].note = str_(String(v.note || ''), 200); });
    if (p.team != null) c.team = str_(p.team, 200); if (p.note != null) c.note = str_(p.note, 300);
  }
  if (op === 'approve') {
    astAdmin_(me); const pend = Object.keys(c.items).filter(function (k) { return c.items[k].f == null; });
    if (pend.length) throw err_('VALIDATION', 'بقي ' + pend.length + ' أصلًا لم يُحدَّد وجوده؛ أكمل الجرد قبل الاعتماد.');
    let miss = 0, chg = 0;
    Object.keys(c.items).forEach(function (k) { const a = astList_(st.assets, k), v = c.items[k]; if (!a) return;
      a.counted = c.date;
      if (v.f === 0) { if (!a.missing) { miss++; a.missing = c.no; astMoveAdd_(st, me, { type: 'count', asset: a.id, to: { st: a.status, loc: a.loc }, date: c.date, cond: a.cond || '', note: 'غير موجود في الجرد ' + c.no + (v.note ? ' — ' + v.note : '') }); } }
      else { const was = a.missing; delete a.missing; if (v.cond && v.cond !== a.cond) { chg++; astMoveAdd_(st, me, { type: 'count', asset: a.id, to: { st: a.status, loc: a.loc }, date: c.date, cond: v.cond, note: 'تحديث الحالة في الجرد ' + c.no + (v.note ? ' — ' + v.note : '') }); a.cond = v.cond; } else if (was) astMoveAdd_(st, me, { type: 'count', asset: a.id, to: { st: a.status, loc: a.loc }, date: c.date, cond: a.cond || '', note: 'وُجد في الجرد ' + c.no }); } });
    c.status = 'approved'; c.appBy = me.username; c.appAt = now_(); c.res = { total: Object.keys(c.items).length, missing: Object.keys(c.items).filter(function (k) { return c.items[k].f === 0; }).length, changed: chg };
    audit_(me.username, 'اعتماد جرد أصول', '', c.no, 'مفقود ' + miss + ' · تغيّرت حالته ' + chg);
  }
  govSave_(org, '_assets', st); return astOut_(st, { id: c.id });
}
/** بيانات توضيحية للتجربة: تُعلَّم sample وتُمسح بزر واحد. */
function actAstSamples_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = astLoad_(org), S = st.set;
  if (p.clear) { st.assets = st.assets.filter(function (a) { return !a.sample; }); st.emps = st.emps.filter(function (e) { return !e.sample; }); st.moves = st.moves.filter(function (m) { return !m.sample; }); st.counts = st.counts.filter(function (c) { return !c.sample; }); govSave_(org, '_assets', st); return astOut_(st); }
  if (st.assets.some(function (a) { return a.sample; })) throw err_('VALIDATION', 'البيانات التوضيحية مضافة من قبل.');
  const d = function (n) { const x = new Date(); x.setDate(x.getDate() + n); return Utilities.formatDate(x, 'Asia/Riyadh', 'yyyy-MM-dd'); };
  const D = S.depts, L = S.locs, C = S.cats;
  const emps = [['أحمد الشهري', 0, 0], ['سارة العتيبي', 1, 1], ['خالد القحطاني', 2, 0], ['نورة الدوسري', 3, 0], ['محمد الزهراني', 4, 0], ['ريم الحربي', 5, 1]].map(function (r) {
    const e = { id: 'e' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.ePre + astPad_(S.eNext++, 3), name: r[0], dept: (D[r[1] % D.length] || {}).id || '', loc: (L[r[2] % L.length] || {}).id || '', title: 'موظف', sample: true }; st.emps.push(e); return e; });
  const items = [['حاسب محمول', 0, 'laptop', 'Dell Latitude 5440', 4800], ['شاشة', 0, 'monitor', 'Samsung 27"', 950], ['جهاز لوحي', 0, 'tablet', 'iPad 10', 1900], ['طابعة', 1, 'printer', 'HP LaserJet', 1300], ['مكتب', 2, 'desk', 'مكتب خشبي 160سم', 1200], ['حاسب محمول', 0, 'laptop', 'Lenovo ThinkPad', 4500], ['هاتف عمل', 0, 'phone', 'iPhone 13', 2600], ['كرسي مكتبي', 2, 'chair', 'كرسي طبي', 650], ['جهاز عرض', 1, 'projector', 'Epson EB', 2200], ['حاسب مكتبي', 0, 'pc', 'HP ProDesk', 3300], ['مثقاب كهربائي', 3, 'tool', 'Bosch', 420], ['ماسح ضوئي', 1, 'scanner', 'Canon', 780]];
  const store = (L.filter(function (l) { return /مخزن/.test(l.n); })[0] || L[0] || {}).id || '';
  const maint = (L.filter(function (l) { return /صيانة/.test(l.n); })[0] || L[0] || {}).id || '';
  const good = (S.conds[0] || {}).id || '';
  items.forEach(function (r, i) {
    const a = { id: 'a' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.aPre + astPad_(S.aNext++, 4), name: r[0], cat: (C[r[1] % C.length] || {}).id || '', icon: r[2], brand: r[3], sn: 'SN-' + astPad_(1000 + i, 4), date: d(-200 - i * 60), cost: r[4], life: r[1] === 2 ? 10 : 4, salvage: Math.round(r[4] * 0.1), warranty: d(i === 0 ? 20 : 400 - i * 30), loc: store, dept: (D[i % D.length] || {}).id || '', cond: good, status: 'store', holder: '', files: [], sample: true, created: now_() };
    st.assets.push(a); astMoveAdd_(st, me, { type: 'add', asset: a.id, to: { loc: store, st: 'store' }, date: a.date, cond: good, sample: true });
  });
  const A = st.assets.filter(function (a) { return a.sample; }), E = emps;
  const iss = function (a, e, date, due) { const m = astMoveAdd_(st, me, { type: 'issue', asset: a.id, from: { loc: a.loc }, to: { emp: e.id, dept: e.dept, loc: e.loc }, date: date, due: due, cond: a.cond, purpose: 'مهام العمل', issuer: S.officer || 'مسؤول العهد', sample: true }); a.status = 'custody'; a.holder = e.id; a.due = due; a.issued = date; a.loc = e.loc; return m; };
  iss(A[0], E[0], d(-16), d(14)); iss(A[1], E[1], d(-30), d(-3)); iss(A[2], E[2], d(-12), d(3)); iss(A[3], E[3], d(-45), d(-9)); iss(A[6], E[0], d(-60), d(5)); iss(A[7], E[0], d(-120), ''); iss(A[9], E[4], d(-20), d(40));
  const tr = astMoveAdd_(st, me, { type: 'transfer', asset: A[1].id, from: { emp: E[1].id, dept: E[1].dept, loc: E[1].loc }, to: { emp: E[5].id, dept: E[5].dept, loc: E[5].loc }, date: d(-5), due: d(-3), cond: A[1].cond, reason: 'تغيير مهام العمل', issuer: S.officer || 'مسؤول العهد', sample: true }); A[1].holder = E[5].id; A[1].issued = d(-5); A[1].loc = E[5].loc;
  iss(A[4], E[5], d(-90), d(-40));
  astMoveAdd_(st, me, { type: 'return', asset: A[4].id, from: { emp: E[5].id, dept: E[5].dept, loc: A[4].loc }, to: { loc: store, st: 'store' }, date: d(-2), cond: good, receiver: S.officer || 'مسؤول العهد', acc: S.acc.slice(0, 2), issuedAt: d(-90), dueWas: d(-40), sample: true }); A[4].status = 'store'; A[4].holder = ''; A[4].due = ''; A[4].loc = store;
  A[11].status = 'maint'; A[11].loc = maint; A[11].cond = (S.conds[1] || {}).id || good; astMoveAdd_(st, me, { type: 'status', asset: A[11].id, from: { st: 'store' }, to: { st: 'maint', loc: maint }, date: d(-4), cond: A[11].cond, note: 'عطل في وحدة التغذية', sample: true });
  audit_(me.username, 'إضافة بيانات توضيحية للعهد', '', '', ''); govSave_(org, '_assets', st); return astOut_(st);
}

/* ================= طلبات الشراء =================
 * حالة واحدة لكل مؤسسة في ورقة «الحوكمة» بالدورة '_purch': { set, reqs[], sups[], rcv[] }.
 * المسار: مسودة ← بانتظار الاعتماد ← (معاد للاستكمال | مرفوض | قيد التوفير) ← استلام جزئي ← مغلق. */
const PR_ST = { draft: 'مسودة', pending: 'بانتظار الاعتماد', returned: 'معاد للاستكمال', rejected: 'مرفوض', supply: 'قيد التوفير', partial: 'استلام جزئي', closed: 'مغلق' };
function prDefaults_() {
  const L = function (a, c) { return a.map(function (n, i) { return { id: 'd' + (i + 1), n: n, c: c[i % c.length] }; }); };
  return { orgName: '', officer: '', approver: '', depts: L(['الموارد البشرية', 'المالية', 'المشتريات', 'المشاريع', 'تقنية المعلومات', 'الخدمات العامة'], ['#2f6fdf', '#e08a1e', '#7b5ce0', '#13a06f', '#d64545', '#0b6e8f']),
    units: L(['جهاز', 'قطعة', 'علبة', 'رزمة', 'كرتون', 'لتر', 'كيلو', 'خدمة'], ['#2f6fdf', '#e08a1e', '#0b6e8f', '#b07a12']), pris: [{ id: 'high', n: 'عالية', c: '#d64545' }, { id: 'normal', n: 'عادية', c: '#e08a1e' }, { id: 'low', n: 'منخفضة', c: '#64748b' }],
    scats: L(['مستلزمات مكتبية', 'أثاث', 'أجهزة تقنية', 'صيانة', 'خدمات', 'مواد غذائية'], ['#2f6fdf', '#e08a1e', '#7b5ce0', '#13a06f', '#0b6e8f', '#b07a12']),
    rPre: 'PR-', rNext: 1, oPre: 'PO-', oNext: 1, cPre: 'RC-', cNext: 1, sPre: 'SUP-', sNext: 1, warnDays: 3, partial: true, reqJust: true, reqFile: false, currency: 'ريال', sod: true };
}
function prLoad_(org) { const st = govLoad_(org, '_purch'); st.set = Object.assign(prDefaults_(), st.set || {}); st.reqs = st.reqs || []; st.sups = st.sups || []; st.rcv = st.rcv || []; return st; }
function prOut_(st, extra) { const o = { set: st.set, reqs: st.reqs, sups: st.sups, rcv: st.rcv, sts: PR_ST }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
function prLog_(r, me, act, note) { r.log = r.log || []; r.log.unshift({ at: now_(), by: me.username, act: act, note: str_(String(note || ''), 300) }); if (r.log.length > 60) r.log.length = 60; }
function prLines_(L) { return (Array.isArray(L) ? L : []).slice(0, 60).map(function (x) { const q = Number(x.qty); return { desc: str_(String(x.desc || ''), 160), spec: str_(String(x.spec || ''), 300), unit: str_(String(x.unit || ''), 20), qty: isFinite(q) && q > 0 ? Math.round(q * 100) / 100 : 0, price: Math.max(0, Number(x.price) || 0), rcv: 0, asset: !!x.asset }; }).filter(function (x) { return x.desc; }); }
function actPrGet_(me) {
  if (!CUR_ORG || CUR_ORG === '*') return aggOrgs_(me, prLoad_, ['reqs', 'sups', 'rcv'], { sts: PR_ST });

  const st = prLoad_(astNeed_()); if (!st.set.orgName) st.set.orgName = String(getSettings_().orgName || ''); return prOut_(st);
}
function actPrSave_(me, p) {
  astCanW_(me); const org = astNeed_(), st = prLoad_(org), S = st.set, x = p.item || {};
  let r = x.id ? astList_(st.reqs, String(x.id)) : null;
  if (r && ['draft', 'returned'].indexOf(r.status) < 0) throw err_('VALIDATION', 'لا يُعدَّل الطلب بعد إرساله للاعتماد إلا إذا أُعيد للاستكمال.');
  if (r && r.by !== me.username && me.role !== 'admin') throw err_('FORBIDDEN', 'يعدّل الطلب مقدّمه أو مسؤول النظام.');
  const lines = prLines_(x.lines), submit = !!p.submit;
  const c = { dept: str_(x.dept, 20), requester: str_(x.requester, 120), date: str_(x.date, 10) || today_(), need: str_(x.need, 10), title: str_(x.title, 160), just: str_(x.just, 1000), pri: str_(x.pri, 20) || 'normal', est: Math.max(0, Number(x.est) || 0), note: str_(x.note, 1000), sup: str_(x.sup, 20) };
  if (!c.title) throw err_('VALIDATION', 'اكتب وصف الاحتياج.');
  if (submit) {
    if (!c.dept) throw err_('VALIDATION', 'اختر الإدارة الطالبة.'); if (!c.need) throw err_('VALIDATION', 'حدّد تاريخ الاحتياج.'); if (c.need < c.date) throw err_('VALIDATION', 'تاريخ الاحتياج قبل تاريخ الطلب.');
    if (!lines.length) throw err_('VALIDATION', 'أضف بندًا واحدًا على الأقل.'); if (lines.some(function (l) { return !(l.qty > 0); })) throw err_('VALIDATION', 'حدّد الكمية لكل بند.');
    if (S.reqJust && !c.just) throw err_('VALIDATION', 'اكتب مبرر الطلب (الإعدادات تلزم به).');
    if (S.reqFile && !((r && r.files || []).length) && !p.hasFile) throw err_('VALIDATION', 'أرفق مستندًا للطلب (الإعدادات تلزم به).');
  }
  if (r) { Object.assign(r, c); r.lines = lines; } else { r = Object.assign(c, { id: 'r' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.rPre + astPad_(S.rNext++, 4), status: 'draft', lines: lines, files: [], by: me.username, at: now_(), log: [] }); st.reqs.unshift(r); prLog_(r, me, 'إنشاء الطلب'); }
  if (submit) { r.status = 'pending'; r.sent = now_(); prLog_(r, me, 'إرسال للاعتماد'); audit_(me.username, 'إرسال طلب شراء للاعتماد', '', r.no, r.title); } else prLog_(r, me, 'حفظ مسودة');
  govSave_(org, '_purch', st); return prOut_(st, { id: r.id });
}
function actPrDecide_(me, p) {
  astCanW_(me); const org = astNeed_(), st = prLoad_(org), r = astList_(st.reqs, String(p.id || '')), d = String(p.decision || '');
  if (!r) throw err_('NOTFOUND', 'الطلب غير موجود.'); if (r.status !== 'pending') throw err_('VALIDATION', 'الطلب ليس بانتظار الاعتماد.');
  if (st.set.sod && r.by === me.username && me.role !== 'admin') throw err_('FORBIDDEN', 'لا يعتمد مقدّم الطلب طلبه (فصل المهام).');
  const note = str_(p.note, 600); if ((d === 'return' || d === 'reject') && !note) throw err_('VALIDATION', 'اكتب سبب ' + (d === 'reject' ? 'الرفض' : 'الإعادة') + ' في ملاحظات القرار.');
  const map = { approve: 'supply', return: 'returned', reject: 'rejected' }; if (!map[d]) throw err_('VALIDATION', 'قرار غير معروف.');
  r.status = map[d]; r.dec = { d: d, by: str_(p.approver, 120) || me.username, user: me.username, date: str_(p.date, 10) || today_(), note: note, at: now_() };
  prLog_(r, me, { approve: 'اعتماد الطلب', return: 'إعادة للاستكمال', reject: 'رفض الطلب' }[d], note);
  audit_(me.username, { approve: 'اعتماد طلب شراء', return: 'إعادة طلب شراء', reject: 'رفض طلب شراء' }[d], '', r.no, note); govSave_(org, '_purch', st); return prOut_(st);
}
function actPrSupply_(me, p) {
  astCanW_(me); const org = astNeed_(), st = prLoad_(org), S = st.set, r = astList_(st.reqs, String(p.id || ''));
  if (!r) throw err_('NOTFOUND', 'الطلب غير موجود.'); if (['supply', 'partial'].indexOf(r.status) < 0) throw err_('VALIDATION', 'متابعة التوفير للطلبات المعتمدة فقط.');
  const sup = str_(p.sup, 20); if (sup && !astList_(st.sups, sup)) throw err_('VALIDATION', 'المورد غير موجود.');
  let po = str_(p.po, 30); if (!po && p.newPo) po = S.oPre + astPad_(S.oNext++, 4);
  r.sp = { officer: str_(p.officer, 120), sup: sup, po: po, eta: str_(p.eta, 10), note: str_(p.note, 600), at: now_() }; if (sup) r.sup = sup;
  prLog_(r, me, 'تحديث التوفير', [po, p.eta].filter(Boolean).join(' · ')); govSave_(org, '_purch', st); return prOut_(st);
}
function actPrReceive_(me, p) {
  astCanW_(me); const org = astNeed_(), st = prLoad_(org), S = st.set, r = astList_(st.reqs, String(p.id || ''));
  if (!r) throw err_('NOTFOUND', 'الطلب غير موجود.'); if (['supply', 'partial'].indexOf(r.status) < 0) throw err_('VALIDATION', 'الاستلام للطلبات المعتمدة قيد التوفير فقط.');
  const q = p.q || {}; let tot = 0; const got = [];
  r.lines.forEach(function (l, i) { const v = Math.max(0, Number(q[i]) || 0); if (!v) return; if (v > l.qty - l.rcv + 1e-9) throw err_('VALIDATION', 'الكمية الواردة للبند «' + l.desc + '» أكبر من المتبقي (' + (l.qty - l.rcv) + ').'); got.push({ i: i, q: v }); tot += v; });
  if (!tot) throw err_('VALIDATION', 'أدخل الكمية الواردة لبند واحد على الأقل.');
  const remainAfter = r.lines.reduce(function (s, l, i) { const g = got.filter(function (x) { return x.i === i; })[0]; return s + (l.qty - l.rcv - (g ? g.q : 0)); }, 0);
  if (remainAfter > 1e-9 && !S.partial) throw err_('VALIDATION', 'الإعدادات لا تسمح بالاستلام الجزئي؛ استلم الكميات كاملة.');
  got.forEach(function (x) { r.lines[x.i].rcv = Math.round((r.lines[x.i].rcv + x.q) * 100) / 100; });
  const c = { id: 'c' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.cPre + astPad_(S.cNext++, 4), req: r.id, date: str_(p.date, 10) || today_(), sup: str_(p.sup, 20) || r.sup || (r.sp || {}).sup || '', po: str_(p.po, 30) || (r.sp || {}).po || '', receiver: str_(p.receiver, 120), insp: str_(p.insp, 40) || 'مقبول', note: str_(p.note, 600), got: got, by: me.username, at: now_() };
  if (r.sample) c.sample = true;
  st.rcv.unshift(c); r.status = remainAfter > 1e-9 ? 'partial' : 'closed'; if (r.status === 'closed') { r.closed = now_(); prLog_(r, me, 'إغلاق تلقائي بعد اكتمال البنود'); }
  prLog_(r, me, 'تسجيل استلام ' + c.no, got.map(function (x) { return r.lines[x.i].desc + ' ×' + x.q; }).join('، '));
  // إضافة البنود المستلمة إلى سجل الأصول (إدارة العهد)
  let made = 0;
  if (p.toAssets) { const as = astLoad_(org), cat = str_(p.cat, 20) || (as.set.cats[0] || {}).id || '', loc = str_(p.loc, 20) || ((as.set.locs.filter(function (l) { return /مخزن/.test(l.n); })[0] || as.set.locs[0]) || {}).id || '';
    got.forEach(function (x) { const l = r.lines[x.i]; if (!l.asset) return; for (let k = 0; k < Math.min(50, Math.floor(x.q)); k++) { const a = { id: 'a' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: as.set.aPre + astPad_(as.set.aNext++, 4), name: l.desc, brand: l.spec ? l.spec.slice(0, 120) : '', cat: cat, loc: loc, dept: '', cond: (as.set.conds[0] || {}).id || '', date: c.date, cost: l.price || undefined, supplier: (astList_(st.sups, c.sup) || {}).name || '', status: 'store', holder: '', files: [], created: now_(), note: 'من طلب الشراء ' + r.no + ' — استلام ' + c.no }; if (r.sample) a.sample = true; as.assets.unshift(a); astMoveAdd_(as, me, { type: 'add', asset: a.id, to: { loc: loc, st: 'store' }, date: c.date, cond: a.cond, note: 'استلام مشتريات ' + c.no, sample: r.sample }); made++; } });
    if (made) { govSave_(org, '_assets', as); c.assets = made; } }
  audit_(me.username, 'تسجيل استلام مشتريات', '', c.no, r.no); govSave_(org, '_purch', st); return prOut_(st, { rid: c.id, assets: made });
}
function actPrClose_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = prLoad_(org), r = astList_(st.reqs, String(p.id || ''));
  if (!r) throw err_('NOTFOUND', 'الطلب غير موجود.'); if (['supply', 'partial'].indexOf(r.status) < 0) throw err_('VALIDATION', 'يُغلق يدويًا الطلب قيد التوفير أو المستلم جزئيًا فقط.');
  const note = str_(p.note, 300); if (!note) throw err_('VALIDATION', 'اكتب سبب الإغلاق قبل اكتمال البنود.');
  r.status = 'closed'; r.closed = now_(); r.shortClose = note; prLog_(r, me, 'إغلاق يدوي', note); govSave_(org, '_purch', st); return prOut_(st);
}
function actPrDel_(me, p) {
  astCanW_(me); const org = astNeed_(), st = prLoad_(org), r = astList_(st.reqs, String(p.id || ''));
  if (!r) throw err_('NOTFOUND', 'الطلب غير موجود.'); if (['draft', 'returned'].indexOf(r.status) < 0) throw err_('VALIDATION', 'يُحذف الطلب المسودة أو المعاد فقط؛ الطلبات المرسلة تبقى في السجل.');
  if (r.by !== me.username && me.role !== 'admin') throw err_('FORBIDDEN', 'يحذف الطلب مقدّمه أو مسؤول النظام.');
  st.reqs = st.reqs.filter(function (x) { return x !== r; }); audit_(me.username, 'حذف طلب شراء', '', r.no, r.title); govSave_(org, '_purch', st); return prOut_(st);
}
function actPrSup_(me, p) {
  astCanW_(me); const org = astNeed_(), st = prLoad_(org), x = p.item || {};
  if (p.del) { astAdmin_(me); const s0 = astList_(st.sups, String(p.del)); if (!s0) throw err_('NOTFOUND', 'المورد غير موجود.'); if (st.reqs.some(function (r) { return (r.sup === s0.id || (r.sp || {}).sup === s0.id) && ['supply', 'partial'].indexOf(r.status) >= 0; })) throw err_('VALIDATION', 'للمورد طلبات قيد التوفير؛ عطّله بدل حذفه.'); st.sups = st.sups.filter(function (y) { return y !== s0; }); govSave_(org, '_purch', st); return prOut_(st); }
  const c = astClean_(x, [['no', 30], ['name', 160], ['cat', 20], ['contact', 120], ['phone', 30], ['email', 120], ['cr', 30], ['vat', 30], ['city', 80], ['address', 300], ['iban', 40], ['note', 600], ['rating', 'n']]);
  c.active = x.active !== false && x.active !== 'false' && x.active !== 0;
  if (!c.name) throw err_('VALIDATION', 'اسم المورد مطلوب.');
  let s = x.id ? astList_(st.sups, String(x.id)) : null;
  if (c.no && st.sups.some(function (y) { return y.no === c.no && (!s || y.id !== s.id); })) throw err_('VALIDATION', 'رقم المورد مستخدم.');
  if (s) { const id = s.id, sm = s.sample; Object.keys(s).forEach(function (k) { delete s[k]; }); Object.assign(s, c, { id: id, sample: sm }); if (!s.no) s.no = st.set.sPre + astPad_(st.set.sNext++, 3); }
  else { s = Object.assign(c, { id: 's' + Utilities.getUuid().replace(/-/g, '').slice(0, 10) }); if (!s.no) s.no = st.set.sPre + astPad_(st.set.sNext++, 3); st.sups.push(s); }
  audit_(me.username, 'حفظ مورد', '', s.no, s.name); govSave_(org, '_purch', st); return prOut_(st, { id: s.id });
}
function actPrSet_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = prLoad_(org), x = p.set || {}, s = st.set;
  const lst = function (L) { return (Array.isArray(L) ? L : []).slice(0, 60).map(function (o, i) { return { id: str_(String(o.id || ''), 20).replace(/[^A-Za-z0-9_-]/g, '') || ('x' + i + Date.now().toString(36)), n: str_(String(o.n || ''), 80), c: /^#[0-9a-fA-F]{6}$/.test(o.c) ? o.c : '#2f6fdf' }; }).filter(function (o) { return o.n; }); };
  ['depts', 'units', 'pris', 'scats'].forEach(function (k) { if (x[k]) { const v = lst(x[k]); if (!v.length) throw err_('VALIDATION', 'لا تترك القائمة فارغة.'); s[k] = v; } });
  ['orgName', 'officer', 'approver', 'currency'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 120); });
  ['rPre', 'oPre', 'cPre', 'sPre'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 8) || s[k]; });
  ['rNext', 'oNext', 'cNext', 'sNext'].forEach(function (k) { const n = parseInt(x[k], 10); if (n > 0 && n < 1e7) s[k] = n; });
  if (x.warnDays != null) s.warnDays = Math.max(0, Math.min(60, parseInt(x.warnDays, 10) || 0));
  ['partial', 'reqJust', 'reqFile', 'sod'].forEach(function (k) { if (x[k] != null) s[k] = !!x[k]; });
  audit_(me.username, 'إعدادات المشتريات', '', '', ''); govSave_(org, '_purch', st); return prOut_(st);
}
function actPrUpload_(me, p) {
  astCanW_(me); const org = astNeed_(), st = prLoad_(org), kind = p.kind === 'rcv' ? 'rcv' : 'req';
  const t = astList_(kind === 'rcv' ? st.rcv : st.reqs, String(p.id || '')); if (!t) throw err_('NOTFOUND', 'العنصر غير موجود.');
  const name = str_(p.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'مستند', mime = String(p.mime || '');
  if (GOV_TYPES.indexOf(mime) < 0) throw err_('VALIDATION', 'الأنواع المسموحة: PDF وWord وExcel وصور JPG/PNG/WEBP.');
  const bytes = Utilities.base64Decode(String(p.data || '')); if (!bytes.length) throw err_('VALIDATION', 'الملف فارغ.'); if (bytes.length > MAX_FILE * 2) throw err_('VALIDATION', 'حجم الملف أكبر من 10 ميجابايت.');
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, 'مشتريات — ' + name)), fid = Utilities.getUuid();
  sheet_('files').appendRow([fid, 'pr:' + org + ':' + t.id, name, mime, bytes.length, file.getId(), me.username, now_()]);
  const f = { fid: fid, name: name, mime: mime, size: bytes.length, at: now_(), by: me.username };
  if (kind === 'rcv') t.form = f; else { t.files = t.files || []; t.files.unshift(f); t.files = t.files.slice(0, 12); prLog_(t, me, 'إرفاق مستند', name); }
  govSave_(org, '_purch', st); return prOut_(st);
}
function actPrFile_(me, p) {
  const org = astNeed_(); if (me.role === 'viewer') throw err_('FORBIDDEN', 'صلاحية المشاهد لا تشمل تنزيل المستندات.');
  const row = findRow_('files', String(p.fid || '')); if (!row) throw err_('NOTFOUND', 'الملف غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  if (String(v[1]).indexOf('pr:' + org + ':') !== 0) throw err_('FORBIDDEN', 'غير مسموح.');
  return { name: String(v[2]), mime: String(v[3]), data: Utilities.base64Encode(DriveApp.getFileById(String(v[5])).getBlob().getBytes()) };
}
function actPrSamples_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = prLoad_(org), S = st.set;
  if (p.clear) { st.reqs = st.reqs.filter(function (r) { return !r.sample; }); st.sups = st.sups.filter(function (x) { return !x.sample; }); st.rcv = st.rcv.filter(function (x) { return !x.sample; }); govSave_(org, '_purch', st); return prOut_(st); }
  if (st.reqs.some(function (r) { return r.sample; })) throw err_('VALIDATION', 'البيانات التوضيحية مضافة من قبل.');
  const d = function (n) { const x = new Date(); x.setDate(x.getDate() + n); return Utilities.formatDate(x, 'Asia/Riyadh', 'yyyy-MM-dd'); }, D = S.depts, U = S.units, C = S.scats;
  const sups = [['مؤسسة الإمداد المكتبي', 0], ['شركة الأثاث الحديث', 1], ['مركز الصيانة المتكاملة', 3], ['تقنيات المستقبل', 2], ['خدمات النخبة', 4]].map(function (r, i) { const s = { id: 's' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.sPre + astPad_(S.sNext++, 3), name: r[0], cat: (C[r[1]] || {}).id || '', contact: 'مسؤول المبيعات', phone: '05000000' + (10 + i), active: i !== 4, rating: 4 - (i % 2), sample: true }; st.sups.push(s); return s; });
  const mk = function (title, di, need, pri, lines, status, extra) { const r = { id: 'r' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.rPre + astPad_(S.rNext++, 4), dept: (D[di % D.length] || {}).id || '', requester: ['أحمد الشهري', 'سارة العتيبي', 'خالد القحطاني', 'نورة الدوسري', 'محمد الزهراني'][di % 5], date: d(need - 8), need: d(need), title: title, just: 'احتياج تشغيلي لـ' + title, pri: pri, est: 0, status: status, lines: lines.map(function (l) { return { desc: l[0], spec: l[1], unit: (U[l[2]] || {}).id || '', qty: l[3], price: l[4] || 0, rcv: l[5] || 0, asset: !!l[6] }; }), files: [], by: me.username, at: now_(), log: [{ at: now_(), by: me.username, act: 'إنشاء الطلب' }], sample: true }; r.est = r.lines.reduce(function (s, l) { return s + l.qty * l.price; }, 0); Object.assign(r, extra || {}); st.reqs.unshift(r); return r; };
  mk('أدوات صيانة', 5, 9, 'high', [['مفكات متعددة', 'طقم 12 قطعة', 1, 3, 85]], 'pending');
  mk('أدوات مكتبية', 3, 8, 'normal', [['دباسات', 'حجم متوسط', 1, 10, 12], ['أقلام', 'أزرق', 2, 20, 9]], 'pending');
  mk('أحبار طابعات', 2, -6, 'normal', [['حبر HP 85A', 'أصلي', 1, 6, 160, 6]], 'closed', { sup: sups[0].id, sp: { officer: 'مسؤول المشتريات', sup: sups[0].id, po: S.oPre + astPad_(S.oNext++, 4), eta: d(-8) }, dec: { d: 'approve', by: 'مسؤول الاعتماد', date: d(-14) }, closed: now_() });
  mk('كراسي مكتبية', 0, 7, 'normal', [['كرسي مكتبي', 'ظهر شبكي مع مسند', 1, 10, 450, 6, true]], 'partial', { sup: sups[1].id, sp: { officer: 'مسؤول المشتريات', sup: sups[1].id, po: S.oPre + astPad_(S.oNext++, 4), eta: d(1) }, dec: { d: 'approve', by: 'مسؤول الاعتماد', date: d(-6) } });
  mk('مستلزمات طباعة', 1, -2, 'normal', [['ورق A4', '80 جرام', 3, 20, 22]], 'supply', { sup: sups[0].id, sp: { officer: 'مسؤول المشتريات', sup: sups[0].id, po: S.oPre + astPad_(S.oNext++, 4), eta: d(-2) }, dec: { d: 'approve', by: 'مسؤول الاعتماد', date: d(-9) } });
  mk('تجهيز أجهزة مكتبية', 4, 4, 'high', [['حاسب محمول مكتبي', 'معالج حديث، ذاكرة 16GB، قرص SSD', 0, 2, 4200, 0, true], ['شاشة 24 بوصة', 'شاشة LED بدقة عالية', 0, 4, 780, 0, true]], 'pending');
  mk('أثاث قاعة الاجتماعات', 3, 20, 'low', [['طاولة اجتماعات', '12 مقعدًا', 1, 1, 3800, 0, true]], 'rejected', { dec: { d: 'reject', by: 'مسؤول الاعتماد', date: d(-1), note: 'لا توجد ميزانية معتمدة هذا الربع' } });
  mk('مواد نظافة', 5, 12, 'normal', [['منظف أرضيات', '4 لتر', 5, 6, 35]], 'draft');
  audit_(me.username, 'إضافة بيانات توضيحية للمشتريات', '', '', ''); govSave_(org, '_purch', st); return prOut_(st);
}

/* ================= العقود والالتزامات =================
 * حالة واحدة لكل مؤسسة في ورقة «الحوكمة» بالدورة '_ctr': { set, cts[], obs[], pays[], chgs[] }.
 * الأطراف: قائمة الإعدادات + موردو المشتريات (_purch). الدفعات المجدولة داخل العقد (insts) والسداد في pays. */
const CT_ST = { draft: 'مسودة', active: 'نشط', suspended: 'موقوف', closed: 'مغلق', terminated: 'مفسوخ' };
function ctDefaults_() {
  const L = function (a, c) { return a.map(function (n, i) { return { id: 'd' + (i + 1), n: n, c: c[i % c.length] }; }); }, C = ['#2f6fdf', '#e08a1e', '#13a06f', '#7b5ce0', '#d64545', '#0b6e8f'];
  return { orgName: '', types: L(['خدمات', 'توريد', 'صيانة', 'استشارات', 'إيجار', 'أخرى'], C), otypes: L(['تسليم مستند', 'تقديم تقرير', 'فحص وتحقق', 'اجتماع متابعة', 'تسليم أعمال', 'أخرى'], C),
    parties: [], owners: [], depts: L(['المشاريع', 'المالية', 'المشتريات', 'الخدمات العامة', 'تقنية المعلومات', 'الموارد البشرية'], C), methods: L(['تحويل بنكي', 'شيك', 'نقدي', 'بطاقة'], C), ctypes: L(['تعديل مالي', 'تعديل زمني', 'تعديل زمني ومالي', 'تعديل نطاق'], C),
    cPre: 'CT-', cNext: 1, oPre: 'OBL-', oNext: 1, iPre: 'INS-', iNext: 1, pPre: 'PAY-', pNext: 1, gPre: 'CHG-', gNext: 1, warnDays: 30, obWarn: 3, reqProof: true, currency: 'ريال' };
}
function ctLoad_(org) { const st = govLoad_(org, '_ctr'); st.set = Object.assign(ctDefaults_(), st.set || {}); ['cts', 'obs', 'pays', 'chgs'].forEach(function (k) { st[k] = st[k] || []; }); return st; }
function ctOut_(st, org, extra) { const ps = prLoad_(org).sups.map(function (s) { return { id: s.id, n: s.name, no: s.no, active: s.active !== false, sup: 1 }; });
  const o = { set: st.set, cts: st.cts, obs: st.obs, pays: st.pays, chgs: st.chgs, sups: ps, sts: CT_ST }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
function ctLog_(c, me, act, note) { c.log = c.log || []; c.log.unshift({ at: now_(), by: me.username, act: act, note: str_(String(note || ''), 300) }); if (c.log.length > 80) c.log.length = 80; }
function ctNum_(v) { const n = Number(v); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; }
function actCtGet_(me) {
  if (!CUR_ORG || CUR_ORG === '*') return aggOrgs_(me, ctLoad_, ['cts', 'obs', 'pays', 'chgs'], { sts: CT_ST, sups: aggSups_(me) });

  const org = astNeed_(), st = ctLoad_(org); if (!st.set.orgName) st.set.orgName = String(getSettings_().orgName || ''); return ctOut_(st, org);
}
function actCtSave_(me, p) {
  astCanW_(me); const org = astNeed_(), st = ctLoad_(org), S = st.set, x = p.item || {};
  let c = x.id ? astList_(st.cts, String(x.id)) : null;
  if (c && ['closed', 'terminated'].indexOf(c.status) >= 0 && !p.status) throw err_('VALIDATION', 'العقد مغلق ولا يُعدَّل.');
  const v = { party: str_(x.party, 24), title: str_(x.title, 200), type: str_(x.type, 20), start: str_(x.start, 10), end: str_(x.end, 10), dept: str_(x.dept, 20), owner: str_(x.owner, 20), note: str_(x.note, 1000), ref: str_(x.ref, 60), scope: str_(x.scope, 2000), guarantee: str_(x.guarantee, 200), renew: !!x.renew };
  if (!p.status) {
    if (!v.title) throw err_('VALIDATION', 'اكتب وصف العقد.'); if (!v.party) throw err_('VALIDATION', 'اختر الطرف الثاني.'); if (!v.start || !v.end) throw err_('VALIDATION', 'حدّد تاريخي البداية والنهاية.'); if (v.end < v.start) throw err_('VALIDATION', 'تاريخ النهاية قبل تاريخ البداية.');
    if (c && c.status !== 'draft' && ctNum_(x.value) !== c.value) throw err_('VALIDATION', 'قيمة العقد النشط تُعدَّل عبر طلب تغيير معتمد.');
  }
  const act = p.activate ? 'active' : null;
  if (c) {
    if (!p.status) { if (c.status !== 'draft') { delete v.start; if (c.end !== v.end) throw err_('VALIDATION', 'تاريخ نهاية العقد النشط يُعدَّل عبر طلب تغيير معتمد.'); delete v.end; } else v.value = ctNum_(x.value); Object.assign(c, v); ctLog_(c, me, 'تعديل بيانات العقد'); }
  } else { c = Object.assign(v, { id: 'k' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.cPre + astPad_(S.cNext++, 4), value: ctNum_(x.value), status: 'draft', insts: [], files: [], by: me.username, at: now_(), log: [] }); st.cts.unshift(c); ctLog_(c, me, 'إنشاء العقد'); }
  const ns = p.status || act;
  if (ns) {
    if (!CT_ST[ns]) throw err_('VALIDATION', 'حالة غير معروفة.');
    if (ns === 'active' && !(c.value > 0)) throw err_('VALIDATION', 'حدّد قيمة العقد قبل تفعيله.');
    if ((ns === 'closed' || ns === 'terminated')) { astAdmin_(me); const note = str_(p.note, 300); if (!note) throw err_('VALIDATION', 'اكتب سبب ' + (ns === 'closed' ? 'الإغلاق' : 'الفسخ') + '.'); if (ns === 'closed' && st.obs.some(function (b) { return b.ct === c.id && b.status === 'open'; }) && !p.force) throw err_('VALIDATION', 'للعقد التزامات مفتوحة؛ أكملها أو ألغها قبل الإغلاق.'); c.closeNote = note; c.closed = now_(); }
    const old = c.status; c.status = ns; ctLog_(c, me, 'تغيير الحالة: ' + CT_ST[old] + ' ← ' + CT_ST[ns], p.note);
  }
  audit_(me.username, 'حفظ عقد', '', c.no, c.title); govSave_(org, '_ctr', st); return ctOut_(st, org, { id: c.id });
}
function actCtDel_(me, p) { astCanW_(me); const org = astNeed_(), st = ctLoad_(org), c = astList_(st.cts, String(p.id || '')); if (!c) throw err_('NOTFOUND', 'العقد غير موجود.'); if (c.status !== 'draft') throw err_('VALIDATION', 'يُحذف العقد المسودة فقط.'); st.cts = st.cts.filter(function (x) { return x !== c; }); st.obs = st.obs.filter(function (b) { return b.ct !== c.id; }); audit_(me.username, 'حذف عقد', '', c.no, c.title); govSave_(org, '_ctr', st); return ctOut_(st, org); }
function actCtInst_(me, p) {
  astCanW_(me); const org = astNeed_(), st = ctLoad_(org), S = st.set, c = astList_(st.cts, String(p.id || '')); if (!c) throw err_('NOTFOUND', 'العقد غير موجود.');
  if (['closed', 'terminated'].indexOf(c.status) >= 0) throw err_('VALIDATION', 'العقد مغلق.');
  const L = (Array.isArray(p.insts) ? p.insts : []).slice(0, 120).map(function (x) { return { id: str_(String(x.id || ''), 24), due: str_(x.due, 10), amount: ctNum_(x.amount), note: str_(x.note, 200) }; }).filter(function (x) { return x.due && x.amount > 0; });
  const sum = L.reduce(function (s, x) { return s + x.amount; }, 0); if (sum - c.value > 0.01) throw err_('VALIDATION', 'مجموع الدفعات (' + sum + ') أكبر من قيمة العقد (' + c.value + ').');
  const old = c.insts || [], paid = function (id) { return st.pays.filter(function (y) { return y.inst === id; }).reduce(function (s, y) { return s + y.amount; }, 0); };
  old.forEach(function (o) { const pd = paid(o.id); if (pd > 0) { const n = L.filter(function (x) { return x.id === o.id; })[0]; if (!n) throw err_('VALIDATION', 'لا تُحذف الدفعة ' + o.no + ' لوجود سداد عليها.'); if (n.amount < pd) throw err_('VALIDATION', 'قيمة الدفعة ' + o.no + ' أقل من المسدَّد عليها.'); } });
  c.insts = L.sort(function (a, b) { return a.due < b.due ? -1 : 1; }).map(function (x) { const o = x.id && old.filter(function (y) { return y.id === x.id; })[0]; return { id: o ? o.id : 'i' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: o ? o.no : S.iPre + astPad_(S.iNext++, 4), due: x.due, amount: x.amount, note: x.note }; });
  ctLog_(c, me, 'تحديث جدول الدفعات', c.insts.length + ' دفعة'); govSave_(org, '_ctr', st); return ctOut_(st, org);
}
function actCtPay_(me, p) {
  astCanW_(me); const org = astNeed_(), st = ctLoad_(org), S = st.set, c = astList_(st.cts, String(p.ct || '')); if (!c) throw err_('NOTFOUND', 'العقد غير موجود.');
  if (c.status !== 'active' && c.status !== 'suspended') throw err_('VALIDATION', 'يُسجَّل السداد للعقد النشط فقط.');
  const ins = (c.insts || []).filter(function (i) { return i.id === String(p.inst || ''); })[0]; if (!ins) throw err_('VALIDATION', 'اختر الدفعة المجدولة.');
  const amt = ctNum_(p.amount); if (!(amt > 0)) throw err_('VALIDATION', 'أدخل مبلغ السداد.');
  const paid = st.pays.filter(function (y) { return y.inst === ins.id; }).reduce(function (s, y) { return s + y.amount; }, 0);
  if (amt - (ins.amount - paid) > 0.01) throw err_('VALIDATION', 'المبلغ أكبر من المتبقي على الدفعة (' + (ins.amount - paid) + ').');
  const y = { id: 'y' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.pPre + astPad_(S.pNext++, 4), ct: c.id, inst: ins.id, date: str_(p.date, 10) || today_(), amount: amt, method: str_(p.method, 20), ref: str_(p.ref, 60), note: str_(p.note, 300), by: me.username, at: now_() };
  if (c.sample) y.sample = true; st.pays.unshift(y); ctLog_(c, me, 'تسجيل سداد ' + y.no, ins.no + ' · ' + amt); audit_(me.username, 'تسجيل سداد عقد', '', y.no, c.no + ' ' + amt);
  govSave_(org, '_ctr', st); return ctOut_(st, org, { id: y.id });
}
function actCtOb_(me, p) {
  astCanW_(me); const org = astNeed_(), st = ctLoad_(org), S = st.set, x = p.item || {};
  if (p.del) { astAdmin_(me); const b0 = astList_(st.obs, String(p.del)); if (!b0) throw err_('NOTFOUND', 'الالتزام غير موجود.'); if (b0.status === 'done') throw err_('VALIDATION', 'لا يُحذف التزام مكتمل.'); st.obs = st.obs.filter(function (b) { return b !== b0; }); govSave_(org, '_ctr', st); return ctOut_(st, org); }
  let b = x.id ? astList_(st.obs, String(x.id)) : null;
  if (p.follow) { if (!b) throw err_('NOTFOUND', 'الالتزام غير موجود.'); const n = str_(p.follow, 400); if (!n) throw err_('VALIDATION', 'اكتب ملاحظة المتابعة.'); b.fol = b.fol || []; b.fol.unshift({ at: now_(), by: me.username, note: n }); govSave_(org, '_ctr', st); return ctOut_(st, org, { id: b.id }); }
  if (p.done != null) {
    if (!b) throw err_('NOTFOUND', 'الالتزام غير موجود.');
    if (p.done) { if (S.reqProof && !b.proof && !p.hasFile) throw err_('VALIDATION', 'أرفق مستند الإثبات قبل تحديد الالتزام مكتملًا (الإعدادات تلزم به).'); b.status = 'done'; b.doneAt = str_(p.date, 10) || today_(); b.doneBy = me.username; }
    else if (p.cancel) { const n = str_(p.note, 300); if (!n) throw err_('VALIDATION', 'اكتب سبب الإلغاء.'); b.status = 'cancelled'; b.cancelNote = n; }
    else { b.status = 'open'; delete b.doneAt; }
    govSave_(org, '_ctr', st); return ctOut_(st, org, { id: b.id });
  }
  const c = astList_(st.cts, str_(x.ct, 24)); if (!c) throw err_('VALIDATION', 'اختر العقد.');
  const v = { ct: c.id, type: str_(x.type, 20), title: str_(x.title, 200), party: str_(x.party, 24), owner: str_(x.owner, 20), due: str_(x.due, 10), note: str_(x.note, 600), side: x.side === 'us' ? 'us' : 'them' };
  if (!v.title) throw err_('VALIDATION', 'اكتب وصف الالتزام.'); if (!v.due) throw err_('VALIDATION', 'حدّد موعد الالتزام.');
  if (b) { if (b.status === 'done') throw err_('VALIDATION', 'الالتزام مكتمل ولا يُعدَّل.'); Object.assign(b, v); }
  else { b = Object.assign(v, { id: 'b' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.oPre + astPad_(S.oNext++, 4), status: 'open', by: me.username, at: now_(), fol: [] }); if (c.sample) b.sample = true; st.obs.unshift(b); ctLog_(c, me, 'إضافة التزام ' + b.no, b.title); }
  govSave_(org, '_ctr', st); return ctOut_(st, org, { id: b.id });
}
function actCtChg_(me, p) {
  astCanW_(me); const org = astNeed_(), st = ctLoad_(org), S = st.set, x = p.item || {};
  let g = x.id ? astList_(st.chgs, String(x.id)) : null;
  if (p.decide) {
    astAdmin_(me); if (!g) throw err_('NOTFOUND', 'التغيير غير موجود.'); if (g.status !== 'pending') throw err_('VALIDATION', 'التغيير ليس بانتظار الاعتماد.');
    const c = astList_(st.cts, g.ct); const d = String(p.decide);
    if (d === 'approve') {
      if (g.newEnd && g.newEnd < c.start) throw err_('VALIDATION', 'تاريخ النهاية المقترح قبل بداية العقد.');
      const oldV = c.value, oldE = c.end; c.value = Math.round((c.value + (g.delta || 0)) * 100) / 100; if (c.value < 0) throw err_('VALIDATION', 'القيمة الناتجة سالبة.'); if (g.newEnd) c.end = g.newEnd;
      g.applied = { oldValue: oldV, oldEnd: oldE, newValue: c.value, newEnd: c.end }; ctLog_(c, me, 'اعتماد التغيير ' + g.no, 'القيمة ' + oldV + ' ← ' + c.value + (g.newEnd ? ' · النهاية ' + oldE + ' ← ' + c.end : ''));
    } else if (d !== 'reject') throw err_('VALIDATION', 'قرار غير معروف.'); else if (!str_(p.note, 300)) throw err_('VALIDATION', 'اكتب سبب الرفض.');
    g.status = d === 'approve' ? 'approved' : 'rejected'; g.dec = { by: str_(p.approver, 120) || me.username, date: str_(p.date, 10) || today_(), note: str_(p.note, 300), user: me.username };
    audit_(me.username, d === 'approve' ? 'اعتماد تغيير عقد' : 'رفض تغيير عقد', '', g.no, c.no); govSave_(org, '_ctr', st); return ctOut_(st, org, { id: g.id });
  }
  const c = astList_(st.cts, str_(x.ct, 24)); if (!c) throw err_('VALIDATION', 'اختر العقد.'); if (['closed', 'terminated'].indexOf(c.status) >= 0) throw err_('VALIDATION', 'العقد مغلق.');
  if (g && g.status !== 'draft') throw err_('VALIDATION', 'التغيير مُرسل ولا يُعدَّل.');
  const v = { ct: c.id, type: str_(x.type, 20), title: str_(x.title, 200), reason: str_(x.reason, 1000), reqBy: str_(x.reqBy, 120), date: str_(x.date, 10) || today_(), delta: Math.round((Number(x.delta) || 0) * 100) / 100, newEnd: str_(x.newEnd, 10) };
  if (!v.reason) throw err_('VALIDATION', 'اكتب سبب التغيير.'); if (!v.delta && !v.newEnd && !str_(x.scope, 10)) throw err_('VALIDATION', 'حدّد قيمة الزيادة أو النقص أو تاريخ النهاية المقترح.');
  if (g) Object.assign(g, v); else { g = Object.assign(v, { id: 'g' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.gPre + astPad_(S.gNext++, 4), status: 'draft', by: me.username, at: now_(), files: [] }); if (c.sample) g.sample = true; st.chgs.unshift(g); }
  if (p.submit) { g.status = 'pending'; ctLog_(c, me, 'طلب تغيير ' + g.no, g.title); }
  govSave_(org, '_ctr', st); return ctOut_(st, org, { id: g.id });
}
function actCtSet_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = ctLoad_(org), x = p.set || {}, s = st.set;
  const lst = function (L) { return (Array.isArray(L) ? L : []).slice(0, 80).map(function (o, i) { return { id: str_(String(o.id || ''), 20).replace(/[^A-Za-z0-9_-]/g, '') || ('x' + i + Date.now().toString(36)), n: str_(String(o.n || ''), 120), c: /^#[0-9a-fA-F]{6}$/.test(o.c) ? o.c : '#2f6fdf', off: !!o.off, phone: str_(String(o.phone || ''), 30), email: str_(String(o.email || ''), 120) }; }).filter(function (o) { return o.n; }); };
  ['types', 'otypes', 'parties', 'owners', 'depts', 'methods', 'ctypes'].forEach(function (k) { if (x[k]) { const v = lst(x[k]); if (!v.length && ['parties', 'owners'].indexOf(k) < 0) throw err_('VALIDATION', 'لا تترك القائمة فارغة.'); s[k] = v; } });
  ['orgName', 'currency'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 120); });
  ['cPre', 'oPre', 'iPre', 'pPre', 'gPre'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 8) || s[k]; });
  ['cNext', 'oNext', 'iNext', 'pNext', 'gNext'].forEach(function (k) { const n = parseInt(x[k], 10); if (n > 0 && n < 1e7) s[k] = n; });
  if (x.warnDays != null) s.warnDays = Math.max(0, Math.min(365, parseInt(x.warnDays, 10) || 0)); if (x.obWarn != null) s.obWarn = Math.max(0, Math.min(60, parseInt(x.obWarn, 10) || 0));
  if (x.reqProof != null) s.reqProof = !!x.reqProof;
  audit_(me.username, 'إعدادات العقود', '', '', ''); govSave_(org, '_ctr', st); return ctOut_(st, org);
}
function actCtUpload_(me, p) {
  astCanW_(me); const org = astNeed_(), st = ctLoad_(org), K = { ct: 'cts', ob: 'obs', pay: 'pays', chg: 'chgs' }[p.kind]; if (!K) throw err_('VALIDATION', 'نوع غير معروف.');
  const t = astList_(st[K], String(p.id || '')); if (!t) throw err_('NOTFOUND', 'العنصر غير موجود.');
  const name = str_(p.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'مستند', mime = String(p.mime || '');
  if (GOV_TYPES.indexOf(mime) < 0) throw err_('VALIDATION', 'الأنواع المسموحة: PDF وWord وExcel وصور JPG/PNG/WEBP.');
  const bytes = Utilities.base64Decode(String(p.data || '')); if (!bytes.length) throw err_('VALIDATION', 'الملف فارغ.'); if (bytes.length > MAX_FILE * 2) throw err_('VALIDATION', 'حجم الملف أكبر من 10 ميجابايت.');
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, 'عقود — ' + name)), fid = Utilities.getUuid();
  sheet_('files').appendRow([fid, 'ct:' + org + ':' + t.id, name, mime, bytes.length, file.getId(), me.username, now_()]);
  const f = { fid: fid, name: name, mime: mime, size: bytes.length, at: now_(), by: me.username };
  if (p.kind === 'ob') t.proof = f; else if (p.kind === 'pay') t.file = f; else { t.files = t.files || []; t.files.unshift(f); t.files = t.files.slice(0, 15); }
  if (p.kind === 'ct') ctLog_(t, me, 'إرفاق مستند', name);
  govSave_(org, '_ctr', st); return ctOut_(st, org);
}
function actCtFile_(me, p) {
  const org = astNeed_(); if (me.role === 'viewer') throw err_('FORBIDDEN', 'صلاحية المشاهد لا تشمل تنزيل المستندات.');
  const row = findRow_('files', String(p.fid || '')); if (!row) throw err_('NOTFOUND', 'الملف غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  if (String(v[1]).indexOf('ct:' + org + ':') !== 0) throw err_('FORBIDDEN', 'غير مسموح.');
  return { name: String(v[2]), mime: String(v[3]), data: Utilities.base64Encode(DriveApp.getFileById(String(v[5])).getBlob().getBytes()) };
}
function actCtSamples_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = ctLoad_(org), S = st.set;
  if (p.clear) { ['cts', 'obs', 'pays', 'chgs'].forEach(function (k) { st[k] = st[k].filter(function (x) { return !x.sample; }); }); S.parties = S.parties.filter(function (x) { return !/^sp/.test(x.id); }); S.owners = S.owners.filter(function (x) { return !/^so/.test(x.id); }); govSave_(org, '_ctr', st); return ctOut_(st, org); }
  if (st.cts.some(function (c) { return c.sample; })) throw err_('VALIDATION', 'البيانات التوضيحية مضافة من قبل.');
  const d = function (n) { const x = new Date(); x.setDate(x.getDate() + n); return Utilities.formatDate(x, 'Asia/Riyadh', 'yyyy-MM-dd'); }, id = function (pre) { return pre + Utilities.getUuid().replace(/-/g, '').slice(0, 10); };
  const P = [['شركة الخدمات المتكاملة', '#2f6fdf'], ['مؤسسة الدعم الفني', '#e08a1e'], ['شركة الصيانة الحديثة', '#13a06f'], ['مكتب الاستشارات الإدارية', '#7b5ce0']].map(function (r, i) { const o = { id: 'sp' + i + Date.now().toString(36), n: r[0], c: r[1] }; S.parties.push(o); return o; });
  const O = [['مسؤول العقود', '#0b6e8f'], ['مدير المشاريع', '#c2334d']].map(function (r, i) { const o = { id: 'so' + i + Date.now().toString(36), n: r[0], c: r[1] }; S.owners.push(o); return o; });
  const T = S.types, D = S.depts, OT = S.otypes;
  const mk = function (party, title, type, start, end, value, status, dept, owner, insts) { const c = { id: id('k'), no: S.cPre + astPad_(S.cNext++, 4), party: party.id, title: title, type: (T[type] || {}).id, start: d(start), end: d(end), value: value, status: status, dept: (D[dept] || {}).id, owner: owner.id, insts: insts.map(function (x) { return { id: id('i'), no: S.iPre + astPad_(S.iNext++, 4), due: d(x[0]), amount: x[1] }; }), files: [], by: me.username, at: now_(), log: [{ at: now_(), by: me.username, act: 'إنشاء العقد' }], sample: true }; st.cts.unshift(c); return c; };
  const c1 = mk(P[2], 'عقد خدمات سابقة للصيانة', 2, -400, -40, 20000, 'closed', 3, O[0], [[-300, 10000], [-60, 10000]]);
  const c2 = mk(P[1], 'خدمات دعم فني', 0, -280, 80, 40000, 'active', 4, O[1], [[-200, 20000], [40, 20000]]);
  const c3 = mk(P[0], 'خدمات تشغيل ونظافة', 0, -45, 320, 60000, 'active', 0, O[0], [[-10, 20000], [20, 20000], [50, 20000]]);
  mk(P[3], 'استشارات تطوير الحوكمة', 3, 10, 200, 30000, 'draft', 0, O[1], []);
  const pay = function (c, k, amt, dd) { const y = { id: id('y'), no: S.pPre + astPad_(S.pNext++, 4), ct: c.id, inst: c.insts[k].id, date: d(dd), amount: amt, method: (S.methods[0] || {}).id, ref: 'TRX-' + (1000 + S.pNext), by: me.username, at: now_(), sample: true }; st.pays.unshift(y); };
  pay(c1, 0, 10000, -298); pay(c1, 1, 10000, -58); pay(c2, 0, 20000, -195); pay(c3, 0, 15000, -12);
  const ob = function (c, title, type, due, status, side) { const b = { id: id('b'), no: S.oPre + astPad_(S.oNext++, 4), ct: c.id, type: (OT[type] || {}).id, title: title, party: c.party, owner: c.owner, due: d(due), status: status, side: side || 'them', by: me.username, at: now_(), fol: [], sample: true }; if (status === 'done') b.doneAt = d(due - 1); st.obs.unshift(b); };
  ob(c2, 'تحديث خطة الدعم', 4, -20, 'done'); ob(c2, 'تسليم تقرير الدعم', 1, -10, 'done'); ob(c2, 'مراجعة مستوى الدعم', 3, 8, 'open', 'us');
  ob(c3, 'تسليم خطة العمل', 4, -12, 'done'); ob(c3, 'فحص الخدمة', 2, 4, 'open', 'us'); ob(c3, 'تسليم تقرير التشغيل', 1, -2, 'open');
  st.chgs.unshift({ id: id('g'), no: S.gPre + astPad_(S.gNext++, 4), ct: c3.id, type: (S.ctypes[2] || {}).id, title: 'تمديد نطاق الخدمة', reason: 'إضافة مبنى جديد لنطاق الخدمة', reqBy: O[0].n, date: d(-1), delta: 5000, newEnd: d(350), status: 'pending', by: me.username, at: now_(), files: [], sample: true });
  audit_(me.username, 'إضافة بيانات توضيحية للعقود', '', '', ''); govSave_(org, '_ctr', st); return ctOut_(st, org);
}

/* ================= حركة المخزون (4.16) ================= */
const INV_TYPES = { open: ['افتتاحي', 1], in: ['وارد', 1], out: ['منصرف', -1], adjp: ['تسوية زيادة', 1], adjm: ['تسوية نقص', -1], tin: ['تحويل وارد', 1], tout: ['تحويل صادر', -1] };
function invDefaults_() {
  const L = function (a, c) { return a.map(function (n, i) { return { id: 'd' + (i + 1), n: n, c: c[i % c.length] }; }); }, C = ['#2f6fdf', '#e08a1e', '#13a06f', '#7b5ce0', '#d64545', '#0b6e8f'];
  return { orgName: '', cats: L(['مستلزمات مكتبية', 'مواد تعبئة', 'قطع غيار', 'مواد خام', 'مواد غذائية', 'مواد نظافة'], C),
    units: [{ id: 'u1', n: 'قطعة', dec: 0 }, { id: 'u2', n: 'رزمة', dec: 0 }, { id: 'u3', n: 'علبة', dec: 0 }, { id: 'u4', n: 'كرتون', dec: 0 }, { id: 'u5', n: 'متر', dec: 2 }, { id: 'u6', n: 'كيلوجرام', dec: 3 }, { id: 'u7', n: 'لتر', dec: 2 }],
    parties: [], owners: [], reasons: L(['فرق جرد', 'تلف', 'انتهاء صلاحية', 'تصحيح إدخال', 'أخرى'], C), locs: L(['المقر', 'الفرع', 'الخدمات'], C),
    iPre: 'IT-', iNext: 1, mPre: 'MOV-', mNext: 1, tPre: 'TR-', tNext: 1, cPre: 'CNT-', cNext: 1, wPre: 'WH-', wNext: 1, noNeg: true, reqRef: true, reqFile: false, defWh: '', days: 28 };
}
function invLoad_(org) { const st = govLoad_(org, '_inv'); st.set = Object.assign(invDefaults_(), st.set || {}); ['items', 'whs', 'movs', 'trs', 'counts'].forEach(function (k) { st[k] = st[k] || []; }); st.seq = st.seq || 0; return st; }
function invOut_(st, org, extra) { const ps = prLoad_(org).sups.map(function (s) { return { id: s.id, n: s.name, no: s.no, kind: 'sup', active: s.active !== false, ext: 1 }; });
  const o = { set: st.set, items: st.items, whs: st.whs, movs: st.movs, trs: st.trs, counts: st.counts, sups: ps, types: INV_TYPES }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
function invLog_(x, me, act, note) { x.log = x.log || []; x.log.unshift({ at: now_(), by: me.username, act: act, note: str_(String(note || ''), 300) }); if (x.log.length > 40) x.log.length = 40; }
function invId_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function invUnit_(st, it) { return astList_(st.set.units, it.unit) || { n: '', dec: 0 }; }
function invQty_(st, it, v) { const n = Number(v), dec = invUnit_(st, it).dec || 0; if (!isFinite(n) || n <= 0) throw err_('VALIDATION', 'أدخل كمية أكبر من صفر.'); const f = Math.pow(10, dec), r = Math.round(n * f) / f; if (Math.abs(r - n) > 1e-9) throw err_('VALIDATION', 'وحدة «' + invUnit_(st, it).n + '» تقبل ' + (dec ? dec + ' منازل عشرية' : 'أعدادًا صحيحة') + ' فقط.'); return r; }
function invBal_(st, item, wh, asOf) { let b = 0; st.movs.forEach(function (m) { if (m.status === 'posted' && m.item === item && m.wh === wh && (!asOf || m.date <= asOf)) b += m.dir * m.qty; }); return Math.round(b * 1000) / 1000; }
// يتحقق أن الرصيد الجاري لم يصبح سالبًا في أي تاريخ بعد الترحيل
function invCheck_(st, item, wh) { if (!st.set.noNeg) return; const L = st.movs.filter(function (m) { return m.status === 'posted' && m.item === item && m.wh === wh; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.dir - b.dir) || (a.seq - b.seq); });
  let b = 0; for (let i = 0; i < L.length; i++) { b = Math.round((b + L[i].dir * L[i].qty) * 1000) / 1000; if (b < -1e-9) { const it = astList_(st.items, item) || {}, w = astList_(st.whs, wh) || {}; throw err_('VALIDATION', 'الرصيد غير كافٍ: «' + (it.name || '') + '» في ' + (w.code || '') + ' يصبح ' + b + ' بتاريخ ' + L[i].date + '. منع الرصيد السالب مفعّل.'); } } }
function invNeedItem_(st, id) { const it = astList_(st.items, String(id || '')); if (!it) throw err_('VALIDATION', 'اختر الصنف.'); return it; }
function invNeedWh_(st, id, active) { const w = astList_(st.whs, String(id || '')); if (!w) throw err_('VALIDATION', 'اختر المخزن.'); if (active && w.status === 'stopped') throw err_('VALIDATION', 'المخزن ' + w.code + ' موقوف.'); return w; }
function invMk_(st, me, o) { const S = st.set; const m = Object.assign({ id: invId_('m'), no: S.mPre + astPad_(S.mNext++, 4), status: 'posted', seq: ++st.seq, by: me.username, at: now_(), files: [] }, o); m.dir = INV_TYPES[m.type][1]; st.movs.unshift(m); return m; }

function actInvGet_(me) {
  if (!CUR_ORG || CUR_ORG === '*') return aggOrgs_(me, invLoad_, ['items', 'whs', 'movs', 'trs', 'counts'], { types: INV_TYPES, sups: aggSups_(me) });

  const org = astNeed_(), st = invLoad_(org); if (!st.set.orgName) st.set.orgName = String(getSettings_().orgName || ''); return invOut_(st, org);
}
function actInvItem_(me, p) {
  astCanW_(me); const org = astNeed_(), st = invLoad_(org), S = st.set, x = p.item || {};
  let it = x.id ? astList_(st.items, String(x.id)) : null;
  if (p.del) { astAdmin_(me); if (!it) throw err_('NOTFOUND', 'الصنف غير موجود.'); if (st.movs.some(function (m) { return m.item === it.id; }) || st.counts.some(function (c) { return c.lines.some(function (l) { return l.item === it.id; }); })) throw err_('VALIDATION', 'للصنف حركات؛ أوقفه بدل حذفه.'); st.items = st.items.filter(function (y) { return y !== it; }); audit_(me.username, 'حذف صنف', '', it.code, it.name); govSave_(org, '_inv', st); return invOut_(st, org); }
  const v = { name: str_(x.name, 160), cat: str_(x.cat, 20), unit: str_(x.unit, 20), reorder: Math.max(0, Number(x.reorder) || 0), status: x.status === 'stopped' ? 'stopped' : 'active', desc: str_(x.desc, 500), supplier: str_(x.supplier, 24), note: str_(x.note, 1000), barcode: str_(x.barcode, 60), max: Math.max(0, Number(x.max) || 0), loc: str_(x.loc, 60) };
  if (!v.name) throw err_('VALIDATION', 'اكتب اسم الصنف.'); if (!astList_(S.units, v.unit)) throw err_('VALIDATION', 'اختر وحدة القياس.');
  if (st.items.some(function (y) { return y !== it && y.name === v.name && y.unit === v.unit; })) throw err_('VALIDATION', 'يوجد صنف بالاسم والوحدة نفسيهما.');
  if (it) { if (it.unit !== v.unit && st.movs.some(function (m) { return m.item === it.id; })) throw err_('VALIDATION', 'لا تتغير وحدة صنف له حركات؛ أنشئ صنفًا جديدًا.'); Object.assign(it, v); invLog_(it, me, 'تعديل الصنف'); }
  else { it = Object.assign(v, { id: invId_('t'), code: str_(x.code, 30) || S.iPre + astPad_(S.iNext++, 4), files: [], by: me.username, at: now_(), log: [] }); if (st.items.some(function (y) { return y.code === it.code && y !== it; })) throw err_('VALIDATION', 'رمز الصنف مستخدم.'); st.items.unshift(it); invLog_(it, me, 'تعريف الصنف'); }
  audit_(me.username, 'حفظ صنف', '', it.code, it.name); govSave_(org, '_inv', st); return invOut_(st, org, { id: it.id });
}
function actInvWh_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = invLoad_(org), S = st.set, x = p.item || {};
  let w = x.id ? astList_(st.whs, String(x.id)) : null;
  if (p.del) { if (!w) throw err_('NOTFOUND', 'المخزن غير موجود.'); if (st.movs.some(function (m) { return m.wh === w.id; }) || st.trs.some(function (t) { return t.from === w.id || t.to === w.id; }) || st.counts.some(function (c) { return c.wh === w.id; })) throw err_('VALIDATION', 'للمخزن حركات؛ أوقفه بدل حذفه.'); st.whs = st.whs.filter(function (y) { return y !== w; }); if (S.defWh === w.id) S.defWh = ''; govSave_(org, '_inv', st); return invOut_(st, org); }
  const v = { name: str_(x.name, 120), loc: str_(x.loc, 20), owner: str_(x.owner, 24), status: x.status === 'stopped' ? 'stopped' : 'active', note: str_(x.note, 500), phone: str_(x.phone, 30) };
  if (!v.name) throw err_('VALIDATION', 'اكتب اسم المخزن.');
  if (w) Object.assign(w, v); else { w = Object.assign(v, { id: invId_('w'), code: S.wPre + astPad_(S.wNext++, 3), at: now_(), by: me.username }); st.whs.push(w); if (!S.defWh) S.defWh = w.id; }
  if (p.def) S.defWh = w.id; audit_(me.username, 'حفظ مخزن', '', w.code, w.name); govSave_(org, '_inv', st); return invOut_(st, org, { id: w.id });
}
// الحركات: افتتاحي/وارد/منصرف/تسوية — مسودة أو ترحيل، والمرحَّلة تُصحَّح بعكس موثق فقط
function actInvMov_(me, p) {
  astCanW_(me); const org = astNeed_(), st = invLoad_(org), S = st.set, x = p.item || {};
  let m = x.id ? astList_(st.movs, String(x.id)) : null;
  if (p.del) { if (!m) throw err_('NOTFOUND', 'الحركة غير موجودة.'); if (m.status !== 'draft') throw err_('VALIDATION', 'الحركة المرحَّلة لا تُحذف؛ صحّحها بعكس موثق.'); st.movs = st.movs.filter(function (y) { return y !== m; }); govSave_(org, '_inv', st); return invOut_(st, org); }
  if (p.reverse) {
    if (!m) throw err_('NOTFOUND', 'الحركة غير موجودة.'); if (m.status !== 'posted' || m.reversed || m.revOf) throw err_('VALIDATION', 'لا يمكن عكس هذه الحركة.'); if (m.tr) throw err_('VALIDATION', 'حركة التحويل تُعكس من شاشة التحويل.'); if (m.cnt) throw err_('VALIDATION', 'تسوية الجرد تُصحَّح بجرد جديد.');
    const note = str_(p.note, 300); if (!note) throw err_('VALIDATION', 'اكتب سبب العكس.');
    const r = invMk_(st, me, { date: str_(p.date, 10) || today_(), type: m.dir > 0 ? (m.type === 'open' ? 'adjm' : 'adjm') : 'adjp', item: m.item, wh: m.wh, qty: m.qty, ref: m.no, party: m.party, owner: m.owner, note: 'عكس ' + m.no + ' — ' + note, revOf: m.id });
    if (r.date < m.date) throw err_('VALIDATION', 'تاريخ العكس قبل تاريخ الحركة.'); m.reversed = r.id; invLog_(m, me, 'عكس موثق بالحركة ' + r.no, note);
    invCheck_(st, m.item, m.wh); audit_(me.username, 'عكس حركة مخزون', '', m.no, r.no); govSave_(org, '_inv', st); return invOut_(st, org, { id: r.id });
  }
  if (m && m.status !== 'draft') throw err_('VALIDATION', 'الحركة المرحَّلة لا تُعدَّل؛ التصحيح بعكس موثق.');
  const type = String(x.type || ''); if (['open', 'in', 'out', 'adjp', 'adjm'].indexOf(type) < 0) throw err_('VALIDATION', 'اختر نوع الحركة.');
  const it = invNeedItem_(st, x.item), w = invNeedWh_(st, x.wh, true); if (it.status === 'stopped' && type !== 'out' && type !== 'adjm') throw err_('VALIDATION', 'الصنف موقوف.');
  const v = { type: type, date: str_(x.date, 10) || today_(), item: it.id, wh: w.id, qty: invQty_(st, it, x.qty), ref: str_(x.ref, 60), party: str_(x.party, 24), owner: str_(x.owner, 24), note: str_(x.note, 500), reason: str_(x.reason, 20) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) throw err_('VALIDATION', 'تاريخ غير صحيح.'); if (v.date > today_()) throw err_('VALIDATION', 'لا تُسجَّل حركة بتاريخ مستقبلي.');
  if (type === 'open' && st.movs.some(function (y) { return y !== m && y.type === 'open' && y.item === it.id && y.wh === w.id && !y.reversed; })) throw err_('VALIDATION', 'للصنف رصيد افتتاحي في هذا المخزن.');
  if ((type === 'adjp' || type === 'adjm') && !v.reason) throw err_('VALIDATION', 'اختر سبب التسوية.');
  if (p.post) { if (S.reqRef && !v.ref && type !== 'open') throw err_('VALIDATION', 'مرجع المستند إلزامي (من الإعدادات).'); if (S.reqFile && !(m && m.files && m.files.length) && !p.hasFile) throw err_('VALIDATION', 'إرفاق ملف المستند إلزامي (من الإعدادات).'); }
  if (m) { Object.assign(m, v); m.dir = INV_TYPES[type][1]; } else { m = Object.assign(v, { id: invId_('m'), no: S.mPre + astPad_(S.mNext++, 4), status: 'draft', seq: ++st.seq, by: me.username, at: now_(), files: [], dir: INV_TYPES[type][1] }); st.movs.unshift(m); }
  if (p.post) { m.status = 'posted'; m.posted = now_(); m.poster = me.username; invLog_(m, me, 'ترحيل'); invCheck_(st, m.item, m.wh); } else invLog_(m, me, 'حفظ مسودة');
  audit_(me.username, p.post ? 'ترحيل حركة مخزون' : 'مسودة حركة مخزون', '', m.no, INV_TYPES[type][0]); govSave_(org, '_inv', st); return invOut_(st, org, { id: m.id });
}
function actInvTr_(me, p) {
  astCanW_(me); const org = astNeed_(), st = invLoad_(org), S = st.set, x = p.item || {};
  let t = x.id ? astList_(st.trs, String(x.id)) : null;
  if (p.del) { if (!t) throw err_('NOTFOUND', 'التحويل غير موجود.'); if (t.status !== 'draft') throw err_('VALIDATION', 'التحويل المرحَّل لا يُحذف؛ استخدم العكس.'); st.trs = st.trs.filter(function (y) { return y !== t; }); govSave_(org, '_inv', st); return invOut_(st, org); }
  if (p.reverse) {
    if (!t || t.status !== 'posted') throw err_('VALIDATION', 'لا يمكن عكس هذا التحويل.'); const note = str_(p.note, 300); if (!note) throw err_('VALIDATION', 'اكتب سبب العكس.'); const dt = str_(p.date, 10) || today_(); if (dt < t.date) throw err_('VALIDATION', 'تاريخ العكس قبل تاريخ التحويل.');
    t.lines.forEach(function (l) { invMk_(st, me, { date: dt, type: 'tout', item: l.item, wh: t.to, qty: l.qty, ref: t.no, owner: t.owner, note: 'عكس ' + t.no + ' — ' + note, tr: t.id, rev: 1 }); invMk_(st, me, { date: dt, type: 'tin', item: l.item, wh: t.from, qty: l.qty, ref: t.no, owner: t.owner, note: 'عكس ' + t.no + ' — ' + note, tr: t.id, rev: 1 }); invCheck_(st, l.item, t.to); });
    t.status = 'reversed'; t.revNote = note; invLog_(t, me, 'عكس التحويل', note); govSave_(org, '_inv', st); return invOut_(st, org, { id: t.id });
  }
  if (t && t.status !== 'draft') throw err_('VALIDATION', 'التحويل المرحَّل لا يُعدَّل.');
  const fw = invNeedWh_(st, x.from, true), tw = invNeedWh_(st, x.to, true); if (fw.id === tw.id) throw err_('VALIDATION', 'المخزن المصدر والوجهة متطابقان.');
  const seen = {}, lines = (Array.isArray(x.lines) ? x.lines : []).slice(0, 60).filter(function (l) { return l && l.item; }).map(function (l) { const it = invNeedItem_(st, l.item); if (seen[it.id]) throw err_('VALIDATION', 'الصنف «' + it.name + '» مكرر.'); seen[it.id] = 1; return { item: it.id, qty: invQty_(st, it, l.qty), note: str_(l.note, 200) }; });
  if (!lines.length) throw err_('VALIDATION', 'أضف بندًا واحدًا على الأقل.');
  const v = { date: str_(x.date, 10) || today_(), from: fw.id, to: tw.id, lines: lines, ref: str_(x.ref, 60), owner: str_(x.owner, 24), note: str_(x.note, 500) }; if (v.date > today_()) throw err_('VALIDATION', 'لا يُسجَّل تحويل بتاريخ مستقبلي.');
  if (t) Object.assign(t, v); else { t = Object.assign(v, { id: invId_('r'), no: S.tPre + astPad_(S.tNext++, 4), status: 'draft', by: me.username, at: now_(), files: [], log: [] }); st.trs.unshift(t); }
  if (p.post) { t.movs = []; t.lines.forEach(function (l) { const a = invMk_(st, me, { date: t.date, type: 'tout', item: l.item, wh: t.from, qty: l.qty, ref: t.no, owner: t.owner, note: l.note || t.note, tr: t.id }); const b = invMk_(st, me, { date: t.date, type: 'tin', item: l.item, wh: t.to, qty: l.qty, ref: t.no, owner: t.owner, note: l.note || t.note, tr: t.id }); l.out = a.no; l.inn = b.no; t.movs.push(a.id, b.id); invCheck_(st, l.item, t.from); }); t.status = 'posted'; t.posted = now_(); invLog_(t, me, 'ترحيل التحويل'); }
  else invLog_(t, me, 'حفظ مسودة');
  audit_(me.username, p.post ? 'ترحيل تحويل مخزني' : 'مسودة تحويل', '', t.no, fw.code + '→' + tw.code); govSave_(org, '_inv', st); return invOut_(st, org, { id: t.id });
}
// الجرد: مسودة ← بانتظار اعتماد التسوية ← معتمد (يُرحّل فروق التسوية) أو مرفوض
function actInvCount_(me, p) {
  astCanW_(me); const org = astNeed_(), st = invLoad_(org), S = st.set, x = p.item || {};
  let c = x.id ? astList_(st.counts, String(x.id)) : null;
  if (p.del) { if (!c) throw err_('NOTFOUND', 'الجرد غير موجود.'); if (c.status === 'approved') throw err_('VALIDATION', 'الجرد المعتمد لا يُحذف.'); st.counts = st.counts.filter(function (y) { return y !== c; }); govSave_(org, '_inv', st); return invOut_(st, org); }
  if (p.decide) {
    astAdmin_(me); if (!c || c.status !== 'pending') throw err_('VALIDATION', 'الجرد ليس بانتظار الاعتماد.'); const d = String(p.decide);
    if (d === 'reject') { const n = str_(p.note, 300); if (!n) throw err_('VALIDATION', 'اكتب سبب الرفض.'); c.status = 'rejected'; c.dec = { by: me.username, at: now_(), note: n }; invLog_(c, me, 'رفض التسوية', n); }
    else if (d === 'approve') {
      c.adj = []; c.lines.forEach(function (l) { const book = invBal_(st, l.item, c.wh, c.date); l.book = book; l.diff = Math.round((l.actual - book) * 1000) / 1000; if (Math.abs(l.diff) > 1e-9) { const m = invMk_(st, me, { date: c.date, type: l.diff > 0 ? 'adjp' : 'adjm', item: l.item, wh: c.wh, qty: Math.abs(l.diff), ref: c.no, owner: c.owner, reason: c.reason, note: 'تسوية جرد ' + c.no, cnt: c.id }); l.mov = m.no; c.adj.push(m.id); } });
      c.lines.forEach(function (l) { invCheck_(st, l.item, c.wh); }); c.status = 'approved'; c.dec = { by: str_(p.approver, 120) || me.username, at: now_(), note: str_(p.note, 300), date: str_(p.date, 10) || today_() }; invLog_(c, me, 'اعتماد التسوية', c.adj.length + ' حركة تسوية');
    } else throw err_('VALIDATION', 'قرار غير معروف.');
    audit_(me.username, 'قرار جرد', '', c.no, d); govSave_(org, '_inv', st); return invOut_(st, org, { id: c.id });
  }
  if (c && ['draft', 'rejected'].indexOf(c.status) < 0) throw err_('VALIDATION', 'الجرد مُرسل للاعتماد ولا يُعدَّل.');
  const w = invNeedWh_(st, x.wh, true), date = str_(x.date, 10) || today_(); if (date > today_()) throw err_('VALIDATION', 'لا يُسجَّل جرد بتاريخ مستقبلي.');
  const seen = {}, lines = (Array.isArray(x.lines) ? x.lines : []).slice(0, 300).filter(function (l) { return l && l.item; }).map(function (l) { const it = invNeedItem_(st, l.item); if (seen[it.id]) throw err_('VALIDATION', 'الصنف «' + it.name + '» مكرر.'); seen[it.id] = 1; const a = l.actual === '' || l.actual == null ? null : Number(l.actual); if (a != null && (!isFinite(a) || a < 0)) throw err_('VALIDATION', 'الكمية الفعلية لا تكون سالبة.'); const book = invBal_(st, it.id, w.id, date); return { item: it.id, book: book, actual: a, diff: a == null ? null : Math.round((a - book) * 1000) / 1000, note: str_(l.note, 200) }; });
  if (!lines.length) throw err_('VALIDATION', 'أضف أصناف الجرد.');
  const v = { wh: w.id, date: date, lines: lines, reason: str_(x.reason, 20), owner: str_(x.owner, 24), note: str_(x.note, 1000), team: str_(x.team, 300) };
  if (p.submit) { if (lines.some(function (l) { return l.actual == null; })) throw err_('VALIDATION', 'أدخل الكمية الفعلية لكل الأصناف.'); if (lines.some(function (l) { return l.diff; }) && !v.reason) throw err_('VALIDATION', 'اختر سبب الفرق.'); }
  if (c) Object.assign(c, v); else { c = Object.assign(v, { id: invId_('c'), no: S.cPre + astPad_(S.cNext++, 4), status: 'draft', by: me.username, at: now_(), files: [], log: [] }); st.counts.unshift(c); }
  if (p.submit) { c.status = 'pending'; invLog_(c, me, 'إرسال للاعتماد'); } else { if (c.status === 'rejected') c.status = 'draft'; invLog_(c, me, 'حفظ الجرد'); }
  govSave_(org, '_inv', st); return invOut_(st, org, { id: c.id });
}
function actInvSet_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = invLoad_(org), x = p.set || {}, s = st.set;
  const lst = function (L) { return (Array.isArray(L) ? L : []).slice(0, 80).map(function (o, i) { return { id: str_(String(o.id || ''), 20).replace(/[^A-Za-z0-9_-]/g, '') || ('x' + i + Date.now().toString(36)), n: str_(String(o.n || ''), 120), c: /^#[0-9a-fA-F]{6}$/.test(o.c) ? o.c : '#2f6fdf', off: !!o.off, kind: o.kind === 'out' ? 'out' : o.kind === 'sup' ? 'sup' : '', dec: Math.max(0, Math.min(4, parseInt(o.dec, 10) || 0)) }; }).filter(function (o) { return o.n; }); };
  ['cats', 'units', 'parties', 'owners', 'reasons', 'locs'].forEach(function (k) { if (!x[k]) return; const v = lst(x[k]); if (!v.length && ['parties', 'owners'].indexOf(k) < 0) throw err_('VALIDATION', 'لا تترك القائمة فارغة.');
    if (k === 'units') { s.units.forEach(function (u) { const n = v.filter(function (y) { return y.id === u.id; })[0]; const used = st.items.some(function (it) { return it.unit === u.id && st.movs.some(function (m) { return m.item === it.id; }); }); if (used && (!n || n.dec !== (u.dec || 0))) throw err_('VALIDATION', 'الوحدة «' + u.n + '» مستخدمة في حركات؛ لا تُحذف ولا تتغير دقتها.'); }); }
    if (['cats', 'units', 'reasons', 'locs'].indexOf(k) >= 0) { const field = { cats: 'cat', units: 'unit' }[k]; if (field) s[k].forEach(function (o) { if (!v.some(function (y) { return y.id === o.id; }) && st.items.some(function (it) { return it[field] === o.id; })) throw err_('VALIDATION', '«' + o.n + '» مستخدم في أصناف؛ عطّله بدل حذفه.'); }); }
    s[k] = v; });
  if (x.orgName != null) s.orgName = str_(String(x.orgName), 120);
  ['iPre', 'mPre', 'tPre', 'cPre', 'wPre'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 8) || s[k]; });
  ['iNext', 'mNext', 'tNext', 'cNext', 'wNext'].forEach(function (k) { const n = parseInt(x[k], 10); if (n > 0 && n < 1e7) s[k] = n; });
  ['noNeg', 'reqRef', 'reqFile'].forEach(function (k) { if (x[k] != null) s[k] = !!x[k]; }); if (x.days != null) s.days = Math.max(1, Math.min(365, parseInt(x.days, 10) || 28)); if (x.defWh != null && (x.defWh === '' || astList_(st.whs, x.defWh))) s.defWh = String(x.defWh);
  audit_(me.username, 'إعدادات المخزون', '', '', ''); govSave_(org, '_inv', st); return invOut_(st, org);
}
function actInvUpload_(me, p) {
  astCanW_(me); const org = astNeed_(), st = invLoad_(org), K = { item: 'items', mov: 'movs', tr: 'trs', cnt: 'counts' }[p.kind]; if (!K) throw err_('VALIDATION', 'نوع غير معروف.');
  const t = astList_(st[K], String(p.id || '')); if (!t) throw err_('NOTFOUND', 'العنصر غير موجود.');
  const name = str_(p.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'مستند', mime = String(p.mime || '');
  if (GOV_TYPES.indexOf(mime) < 0) throw err_('VALIDATION', 'الأنواع المسموحة: PDF وWord وExcel وصور JPG/PNG/WEBP.');
  const bytes = Utilities.base64Decode(String(p.data || '')); if (!bytes.length) throw err_('VALIDATION', 'الملف فارغ.'); if (bytes.length > MAX_FILE * 2) throw err_('VALIDATION', 'حجم الملف أكبر من 10 ميجابايت.');
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, 'مخزون — ' + name)), fid = Utilities.getUuid();
  sheet_('files').appendRow([fid, 'inv:' + org + ':' + t.id, name, mime, bytes.length, file.getId(), me.username, now_()]);
  t.files = t.files || []; t.files.unshift({ fid: fid, name: name, mime: mime, size: bytes.length, at: now_(), by: me.username }); t.files = t.files.slice(0, 15);
  govSave_(org, '_inv', st); return invOut_(st, org);
}
function actInvFile_(me, p) {
  const org = astNeed_(); if (me.role === 'viewer') throw err_('FORBIDDEN', 'صلاحية المشاهد لا تشمل تنزيل المستندات.');
  const row = findRow_('files', String(p.fid || '')); if (!row) throw err_('NOTFOUND', 'الملف غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  if (String(v[1]).indexOf('inv:' + org + ':') !== 0) throw err_('FORBIDDEN', 'غير مسموح.');
  return { name: String(v[2]), mime: String(v[3]), data: Utilities.base64Encode(DriveApp.getFileById(String(v[5])).getBlob().getBytes()) };
}
function actInvSamples_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = invLoad_(org), S = st.set;
  if (p.clear) { const W = {}, I = {}; st.whs.forEach(function (w) { if (w.sample) W[w.id] = 1; }); st.items.forEach(function (i) { if (i.sample) I[i.id] = 1; });
    st.movs = st.movs.filter(function (m) { return !m.sample && !I[m.item] && !W[m.wh]; }); st.trs = st.trs.filter(function (t) { return !t.sample; }); st.counts = st.counts.filter(function (c) { return !c.sample; }); st.items = st.items.filter(function (i) { return !i.sample; }); st.whs = st.whs.filter(function (w) { return !w.sample; });
    S.parties = S.parties.filter(function (x) { return !/^vp/.test(x.id); }); S.owners = S.owners.filter(function (x) { return !/^vo/.test(x.id); }); if (W[S.defWh]) S.defWh = (st.whs[0] || {}).id || ''; govSave_(org, '_inv', st); return invOut_(st, org); }
  if (st.items.some(function (c) { return c.sample; })) throw err_('VALIDATION', 'البيانات التوضيحية مضافة من قبل.');
  const d = function (n) { const x = new Date(); x.setDate(x.getDate() + n); return Utilities.formatDate(x, 'Asia/Riyadh', 'yyyy-MM-dd'); };
  const O = ['أمين المخزن الرئيسي', 'أمين مخزن الفرع', 'مسؤول الخدمات'].map(function (n, i) { const o = { id: 'vo' + i + Date.now().toString(36), n: n, c: ['#0b6e8f', '#e08a1e', '#7b5ce0'][i] }; S.owners.push(o); return o; });
  const P = [['مؤسسة التوريدات المكتبية', 'sup'], ['مكتب الخدمات العامة', 'out'], ['قسم البرامج', 'out']].map(function (r, i) { const o = { id: 'vp' + i + Date.now().toString(36), n: r[0], kind: r[1], c: ['#2f6fdf', '#13a06f', '#c2334d'][i] }; S.parties.push(o); return o; });
  const W = [['المخزن الرئيسي', 0, 0], ['الفرع الأول', 1, 1], ['مخزن الخدمات', 2, 2]].map(function (r) { const w = { id: invId_('w'), code: S.wPre + astPad_(S.wNext++, 3), name: r[0], loc: (S.locs[r[1]] || {}).id || '', owner: O[r[2]].id, status: 'active', at: now_(), by: me.username, sample: true }; st.whs.push(w); return w; }); if (!S.defWh) S.defWh = W[0].id;
  const U = function (n) { return (S.units.filter(function (u) { return u.n === n; })[0] || S.units[0]).id; }, Cc = function (i) { return (S.cats[i] || S.cats[0]).id; };
  const I = [['ورق طباعة A4', 'رزمة', 0, 20, 'ورق طباعة أبيض مقاس A4'], ['أحبار طابعة', 'علبة', 0, 10, ''], ['ملفات علاقية', 'قطعة', 0, 15, ''], ['أقلام جاف', 'علبة', 0, 10, ''], ['ملفات أرشفة', 'قطعة', 0, 10, ''], ['أكياس تعبئة', 'كرتون', 1, 5, ''], ['شريط لاصق', 'قطعة', 1, 12, ''], ['مصابيح LED', 'قطعة', 2, 6, ''], ['أسلاك كهربائية', 'متر', 2, 50, ''], ['منظف أرضيات', 'لتر', 5, 20, ''], ['قفازات', 'علبة', 5, 8, ''], ['سكر', 'كيلوجرام', 4, 25, '']].map(function (r) { const it = { id: invId_('t'), code: S.iPre + astPad_(S.iNext++, 4), name: r[0], unit: U(r[1]), cat: Cc(r[2]), reorder: r[3], desc: r[4], status: 'active', supplier: r[2] === 0 ? P[0].id : '', files: [], at: now_(), by: me.username, log: [], sample: true }; st.items.unshift(it); return it; });
  I[7].status = 'stopped';
  const mv = function (dd, type, it, w, q, ref, party, owner, extra) { return invMk_(st, me, Object.assign({ date: d(dd), type: type, item: it.id, wh: w.id, qty: q, ref: ref, party: party ? party.id : '', owner: (owner || O[0]).id, note: 'بيان توضيحي', sample: true }, extra || {})); };
  const opens = [[0, 0, 100], [0, 1, 0], [1, 0, 12], [2, 0, 20], [2, 1, 0], [3, 0, 10], [4, 0, 8], [5, 2, 6], [6, 2, 20], [7, 2, 10], [8, 2, 120.5], [9, 2, 30], [10, 2, 4], [11, 0, 40]];
  opens.forEach(function (o) { if (o[2]) mv(-17, 'open', I[o[0]], W[o[1]], o[2], 'OPEN-' + I[o[0]].code + '-' + W[o[1]].code, null, O[o[1]]); });
  mv(-15, 'out', I[0], W[0], 15, 'ISS-0220', P[1]); mv(-14, 'in', I[0], W[0], 20, 'REC-0040', P[0]); mv(-14, 'out', I[1], W[0], 4, 'ISS-0039', P[1]); mv(-13, 'out', I[3], W[0], 3, 'ISS-0041', P[2]); mv(-12, 'out', I[4], W[0], 3, 'ISS-0042', P[2]);
  mv(-11, 'out', I[2], W[0], 6, 'ISS-0043', P[1]); mv(-10, 'in', I[11], W[0], 10, 'REC-0044', P[0]); mv(-9, 'out', I[9], W[2], 12, 'ISS-0045', P[1], O[2]); mv(-8, 'out', I[8], W[2], 85.25, 'ISS-0046', P[1], O[2]); mv(-7, 'out', I[10], W[2], 4, 'ISS-0047', P[1], O[2]); mv(-6, 'out', I[5], W[2], 2, 'ISS-0048', P[2], O[2]);
  const tr = { id: invId_('r'), no: S.tPre + astPad_(S.tNext++, 4), date: d(-16), from: W[0].id, to: W[1].id, lines: [{ item: I[0].id, qty: 15 }, { item: I[2].id, qty: 10 }], owner: O[0].id, ref: 'TRF-0012', note: 'تزويد الفرع', status: 'draft', by: me.username, at: now_(), files: [], log: [], sample: true, movs: [] };
  tr.lines.forEach(function (l) { const a = mv(-16, 'tout', astList_(st.items, l.item), W[0], l.qty, tr.no, null, O[0], { tr: tr.id }), b = mv(-16, 'tin', astList_(st.items, l.item), W[1], l.qty, tr.no, null, O[1], { tr: tr.id }); l.out = a.no; l.inn = b.no; tr.movs.push(a.id, b.id); });
  mv(-5, 'out', I[2], W[1], 10, 'ISS-0216', P[2], O[1]);
  tr.status = 'posted'; tr.posted = now_(); st.trs.unshift(tr);
  st.movs.unshift({ id: invId_('m'), no: S.mPre + astPad_(S.mNext++, 4), date: d(-1), type: 'in', dir: 1, item: I[1].id, wh: W[0].id, qty: 6, ref: 'REC-0050', party: P[0].id, owner: O[0].id, note: 'وارد بانتظار الترحيل', status: 'draft', seq: ++st.seq, by: me.username, at: now_(), files: [], sample: true });
  const cdate = d(-3), cl = [[0, 87], [1, 8]].map(function (r) { const b = invBal_(st, I[r[0]].id, W[0].id, cdate); return { item: I[r[0]].id, book: b, actual: r[1], diff: r[1] - b }; });
  st.counts.unshift({ id: invId_('c'), no: S.cPre + astPad_(S.cNext++, 4), wh: W[0].id, date: cdate, lines: cl, reason: (S.reasons[0] || {}).id, owner: O[0].id, note: 'جرد دوري للمخزن الرئيسي', team: 'أمين المخزن، المراجع الداخلي', status: 'pending', by: me.username, at: now_(), files: [], log: [], sample: true });
  audit_(me.username, 'إضافة بيانات توضيحية للمخزون', '', '', ''); govSave_(org, '_inv', st); return invOut_(st, org);
}

/* ================= المصروفات التشغيلية (4.17) ================= */
const EX_ST = { draft: 'مسودة', pending: 'بانتظار الاعتماد', returned: 'معاد للاستكمال', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغى' };
function exDefaults_() {
  const L = function (a, c) { return a.map(function (n, i) { return { id: 'd' + (i + 1), n: n, c: c[i % c.length] }; }); }, C = ['#2f6fdf', '#e08a1e', '#13a06f', '#7b5ce0', '#d64545', '#0b6e8f'];
  return { orgName: '', currency: 'ريال', classes: L(['مكتبية', 'تشغيلية', 'خدمات', 'اشتراكات'], C), depts: L(['الإدارة المالية', 'الخدمات', 'المشتريات', 'الإدارة العامة'], C), methods: L(['تحويل بنكي', 'بطاقة ائتمانية', 'نقدي', 'شيك'], C),
    cats: [], ccs: [], owners: [], parties: [], reqs: [], ePre: 'EX-', eNext: 1, pPre: 'PAY-', pNext: 1, bPre: 'BND-', bNext: 1, cPre: 'CC-', cNext: 1, warnDays: 3, reqInvoice: true, sod: true };
}
function exLoad_(org) { const st = govLoad_(org, '_exp'); st.set = Object.assign(exDefaults_(), st.set || {}); ['exps', 'pays'].forEach(function (k) { st[k] = st[k] || []; }); return st; }
function exOut_(st, org, extra) { const ps = prLoad_(org).sups.map(function (s) { return { id: s.id, n: s.name, no: s.no, active: s.active !== false, ext: 1 }; });
  const o = { set: st.set, exps: st.exps, pays: st.pays, sups: ps, sts: EX_ST }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
function exLog_(x, me, act, note) { x.log = x.log || []; x.log.unshift({ at: now_(), by: me.username, act: act, note: str_(String(note || ''), 300) }); if (x.log.length > 60) x.log.length = 60; }
function exPaid_(st, id) { return Math.round(st.pays.filter(function (y) { return y.exp === id; }).reduce(function (a, y) { return a + y.amount; }, 0) * 100) / 100; }
function exNum_(v) { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; }
function actExGet_(me) {
  if (!CUR_ORG || CUR_ORG === '*') return aggOrgs_(me, exLoad_, ['exps', 'pays'], { sts: EX_ST, sups: aggSups_(me) });

  const org = astNeed_(), st = exLoad_(org); if (!st.set.orgName) st.set.orgName = String(getSettings_().orgName || ''); return exOut_(st, org);
}
// المصروف: مسودة ← بانتظار الاعتماد ← معتمد/مرفوض/معاد للاستكمال، والملغى للمعتمد غير المسدد
function actExSave_(me, p) {
  astCanW_(me); const org = astNeed_(), st = exLoad_(org), S = st.set, x = p.item || {};
  let e = x.id ? astList_(st.exps, String(x.id)) : null;
  if (p.del) { if (!e) throw err_('NOTFOUND', 'المصروف غير موجود.'); if (['draft', 'returned', 'rejected'].indexOf(e.status) < 0) throw err_('VALIDATION', 'الحذف المباشر للمسودة أو المعاد أو المرفوض فقط.'); if (exPaid_(st, e.id)) throw err_('VALIDATION', 'الحذف المباشر غير متاح مع دفعات مسجلة.'); st.exps = st.exps.filter(function (y) { return y !== e; }); audit_(me.username, 'حذف مصروف', '', e.no, ''); govSave_(org, '_exp', st); return exOut_(st, org); }
  if (p.decide) {
    astAdmin_(me); if (!e) throw err_('NOTFOUND', 'المصروف غير موجود.'); const d = String(p.decide), note = str_(p.note, 300);
    if (d === 'cancel') { if (e.status !== 'approved') throw err_('VALIDATION', 'الإلغاء للمصروف المعتمد فقط.'); if (exPaid_(st, e.id)) throw err_('VALIDATION', 'لا يُلغى مصروف عليه دفعات مسجلة.'); if (!note) throw err_('VALIDATION', 'اكتب سبب الإلغاء.'); e.status = 'cancelled'; exLog_(e, me, 'إلغاء المصروف', note); }
    else { if (e.status !== 'pending') throw err_('VALIDATION', 'المصروف ليس بانتظار الاعتماد.'); if (S.sod && e.by === me.username && !p.self) throw err_('VALIDATION', 'فصل المهام مفعّل: لا يعتمد منشئ المصروف مصروفه.');
      if (['approve', 'reject', 'return'].indexOf(d) < 0) throw err_('VALIDATION', 'قرار غير معروف.'); if (d !== 'approve' && !note) throw err_('VALIDATION', 'اكتب سبب ' + (d === 'reject' ? 'الرفض' : 'الإعادة') + '.');
      e.status = { approve: 'approved', reject: 'rejected', return: 'returned' }[d]; e.dec = { by: str_(p.approver, 24) || '', user: me.username, date: str_(p.date, 10) || today_(), note: note }; exLog_(e, me, { approve: 'اعتماد المصروف', reject: 'رفض المصروف', return: 'إعادة للاستكمال' }[d], note); }
    audit_(me.username, 'قرار مصروف', '', e.no, d); govSave_(org, '_exp', st); return exOut_(st, org, { id: e.id });
  }
  if (e && ['draft', 'returned'].indexOf(e.status) < 0) throw err_('VALIDATION', 'المصروف ' + EX_ST[e.status] + ' ولا يُعدَّل.');
  const v = { date: str_(x.date, 10) || today_(), dept: str_(x.dept, 20), cc: str_(x.cc, 20), cat: str_(x.cat, 20), desc: str_(x.desc, 300), party: str_(x.party, 24), invoice: str_(x.invoice, 60), invDate: str_(x.invDate, 10), amount: exNum_(x.amount), due: str_(x.due, 10), requester: str_(x.requester, 24), note: str_(x.note, 1000) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) throw err_('VALIDATION', 'تاريخ غير صحيح.');
  if (v.due && v.due < v.date) throw err_('VALIDATION', 'موعد السداد قبل تاريخ المصروف.');
  if (p.submit) {
    const c = astList_(S.cats, v.cat); if (!c) throw err_('VALIDATION', 'اختر بند الصرف.'); if (c.status === 'stopped') throw err_('VALIDATION', 'البند «' + c.n + '» موقوف ولا يُستخدم في إدخالات جديدة.');
    if (!v.amount) throw err_('VALIDATION', 'أدخل مبلغًا أكبر من صفر.'); if (!v.desc) throw err_('VALIDATION', 'اكتب وصف المصروف.'); if (!v.dept) throw err_('VALIDATION', 'اختر الإدارة.');
    if (S.reqInvoice && !(e && e.files && e.files.length) && !p.hasFile) throw err_('VALIDATION', 'إرفاق الفاتورة إلزامي (من الإعدادات).');
  }
  if (e) { Object.assign(e, v); exLog_(e, me, 'تعديل البيانات'); }
  else { e = Object.assign(v, { id: 'x' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.ePre + astPad_(S.eNext++, 4), status: 'draft', by: me.username, at: now_(), files: [], log: [] }); st.exps.unshift(e); exLog_(e, me, 'تسجيل المصروف'); }
  if (p.submit) { e.status = 'pending'; e.sent = now_(); exLog_(e, me, 'إرسال للاعتماد'); }
  audit_(me.username, 'حفظ مصروف', '', e.no, e.desc); govSave_(org, '_exp', st); return exOut_(st, org, { id: e.id });
}
function actExPay_(me, p) {
  astCanW_(me); const org = astNeed_(), st = exLoad_(org), S = st.set;
  if (p.del) { astAdmin_(me); const y = astList_(st.pays, String(p.id || '')); if (!y) throw err_('NOTFOUND', 'الدفعة غير موجودة.'); const note = str_(p.note, 300); if (!note) throw err_('VALIDATION', 'اكتب سبب حذف الدفعة.'); const e = astList_(st.exps, y.exp); st.pays = st.pays.filter(function (z) { return z !== y; }); if (e) exLog_(e, me, 'حذف الدفعة ' + y.no, note); audit_(me.username, 'حذف دفعة مصروف', '', y.no, note); govSave_(org, '_exp', st); return exOut_(st, org); }
  const e = astList_(st.exps, String(p.exp || '')); if (!e) throw err_('VALIDATION', 'اختر المصروف.'); if (e.status !== 'approved') throw err_('VALIDATION', 'الاعتماد لا يعني السداد: يُسدَّد المصروف المعتمد فقط.');
  const amt = exNum_(p.amount), rem = Math.round((e.amount - exPaid_(st, e.id)) * 100) / 100; if (!amt) throw err_('VALIDATION', 'أدخل مبلغ السداد.'); if (amt > rem + 0.001) throw err_('VALIDATION', 'المبلغ أكبر من المتبقي (' + rem + ').');
  const date = str_(p.date, 10) || today_(); if (date > today_()) throw err_('VALIDATION', 'لا يُسجَّل سداد بتاريخ مستقبلي.'); if (e.dec && e.dec.date && date < e.dec.date) throw err_('VALIDATION', 'تاريخ السداد قبل تاريخ الاعتماد.');
  if (!str_(p.method, 20)) throw err_('VALIDATION', 'اختر طريقة السداد.');
  const y = { id: 'y' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: S.pPre + astPad_(S.pNext++, 4), exp: e.id, date: date, amount: amt, method: str_(p.method, 20), ref: str_(p.ref, 60), payer: str_(p.payer, 24), note: str_(p.note, 300), by: me.username, at: now_() };
  st.pays.unshift(y); exLog_(e, me, 'تسجيل سداد', y.no + ' بمبلغ ' + amt); audit_(me.username, 'سداد مصروف', '', e.no, y.no); govSave_(org, '_exp', st); return exOut_(st, org, { id: y.id });
}
function actExCat_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = exLoad_(org), S = st.set, x = p.item || {}, K = p.kind === 'cc' ? 'ccs' : 'cats';
  let c = x.id ? astList_(S[K], String(x.id)) : null;
  if (p.del) { if (!c) throw err_('NOTFOUND', 'غير موجود.'); if (st.exps.some(function (e) { return e[K === 'cats' ? 'cat' : 'cc'] === c.id; }) || (K === 'ccs' && S.cats.some(function (b) { return b.cc === c.id; }))) throw err_('VALIDATION', 'مستخدم في سجلات؛ أوقفه بدل حذفه.'); S[K] = S[K].filter(function (y) { return y !== c; }); govSave_(org, '_exp', st); return exOut_(st, org); }
  const v = K === 'cats' ? { n: str_(x.n, 120), cls: str_(x.cls, 20), cc: str_(x.cc, 20), owner: str_(x.owner, 24), status: x.status === 'stopped' ? 'stopped' : 'active', budget: Math.max(0, Number(x.budget) || 0), note: str_(x.note, 300), icon: str_(x.icon, 20) } : { n: str_(x.n, 120), dept: str_(x.dept, 20), status: x.status === 'stopped' ? 'stopped' : 'active' };
  if (!v.n) throw err_('VALIDATION', 'اكتب الاسم.'); if (K === 'cats') { if (!v.cls) throw err_('VALIDATION', 'اختر التصنيف.'); if (!v.cc) throw err_('VALIDATION', 'اختر مركز التكلفة.'); if (!v.owner) throw err_('VALIDATION', 'اختر المسؤول.'); }
  const code = str_(x.code, 20).toUpperCase(); if (S[K].some(function (y) { return y !== c && y.n === v.n; })) throw err_('VALIDATION', 'الاسم مستخدم.');
  if (c) { if (code && code !== c.code) throw err_('VALIDATION', 'الرمز ثابت ولا يتغير بعد الإنشاء.'); Object.assign(c, v); }
  else { const cd = code || (K === 'cats' ? S.bPre + astPad_(S.bNext++, 3) : S.cPre + astPad_(S.cNext++, 3)); if (S[K].some(function (y) { return y.code === cd; })) throw err_('VALIDATION', 'الرمز مستخدم.'); c = Object.assign(v, { id: (K === 'cats' ? 'b' : 'q') + Utilities.getUuid().replace(/-/g, '').slice(0, 8), code: cd }); S[K].push(c); }
  audit_(me.username, K === 'cats' ? 'حفظ بند صرف' : 'حفظ مركز تكلفة', '', c.code, c.n); govSave_(org, '_exp', st); return exOut_(st, org, { id: c.id });
}
function actExSet_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = exLoad_(org), x = p.set || {}, s = st.set;
  const lst = function (L) { return (Array.isArray(L) ? L : []).slice(0, 80).map(function (o, i) { return { id: str_(String(o.id || ''), 20).replace(/[^A-Za-z0-9_-]/g, '') || ('x' + i + Date.now().toString(36)), n: str_(String(o.n || ''), 120), c: /^#[0-9a-fA-F]{6}$/.test(o.c) ? o.c : '#2f6fdf', off: !!o.off, title: str_(String(o.title || ''), 80), dept: str_(String(o.dept || ''), 20), kind: o.kind === 'ben' ? 'ben' : 'sup' }; }).filter(function (o) { return o.n; }); };
  ['classes', 'depts', 'methods', 'owners', 'parties', 'reqs'].forEach(function (k) { if (!x[k]) return; const v = lst(x[k]); if (!v.length && ['classes', 'depts', 'methods'].indexOf(k) >= 0) throw err_('VALIDATION', 'لا تترك القائمة فارغة.');
    const used = { depts: function (id) { return st.exps.some(function (e) { return e.dept === id; }) || s.ccs.some(function (c) { return c.dept === id; }); }, classes: function (id) { return s.cats.some(function (c) { return c.cls === id; }); }, methods: function (id) { return st.pays.some(function (y) { return y.method === id; }); } }[k];
    if (used) s[k].forEach(function (o) { if (!v.some(function (y) { return y.id === o.id; }) && used(o.id)) throw err_('VALIDATION', '«' + o.n + '» مستخدم؛ عطّله بدل حذفه.'); }); s[k] = v; });
  ['orgName', 'currency'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 120); });
  ['ePre', 'pPre', 'bPre', 'cPre'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 8) || s[k]; });
  ['eNext', 'pNext', 'bNext', 'cNext'].forEach(function (k) { const n = parseInt(x[k], 10); if (n > 0 && n < 1e7) s[k] = n; });
  if (x.warnDays != null) s.warnDays = Math.max(0, Math.min(60, parseInt(x.warnDays, 10) || 0)); ['reqInvoice', 'sod'].forEach(function (k) { if (x[k] != null) s[k] = !!x[k]; });
  audit_(me.username, 'إعدادات المصروفات', '', '', ''); govSave_(org, '_exp', st); return exOut_(st, org);
}
function actExUpload_(me, p) {
  astCanW_(me); const org = astNeed_(), st = exLoad_(org), K = { exp: 'exps', pay: 'pays' }[p.kind]; if (!K) throw err_('VALIDATION', 'نوع غير معروف.');
  const t = astList_(st[K], String(p.id || '')); if (!t) throw err_('NOTFOUND', 'العنصر غير موجود.');
  const name = str_(p.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'مستند', mime = String(p.mime || '');
  if (GOV_TYPES.indexOf(mime) < 0) throw err_('VALIDATION', 'الأنواع المسموحة: PDF وWord وExcel وصور JPG/PNG/WEBP.');
  const bytes = Utilities.base64Decode(String(p.data || '')); if (!bytes.length) throw err_('VALIDATION', 'الملف فارغ.'); if (bytes.length > MAX_FILE * 2) throw err_('VALIDATION', 'حجم الملف أكبر من 10 ميجابايت.');
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, 'مصروفات — ' + name)), fid = Utilities.getUuid();
  sheet_('files').appendRow([fid, 'ex:' + org + ':' + t.id, name, mime, bytes.length, file.getId(), me.username, now_()]);
  const f = { fid: fid, name: name, mime: mime, size: bytes.length, at: now_(), by: me.username, kind: str_(p.ftype, 30) || (p.kind === 'pay' ? 'إشعار سداد' : 'فاتورة') };
  if (p.kind === 'pay') t.file = f; else { t.files = t.files || []; t.files.unshift(f); t.files = t.files.slice(0, 15); exLog_(t, me, 'إرفاق مستند', name); }
  govSave_(org, '_exp', st); return exOut_(st, org);
}
function actExFile_(me, p) {
  const org = astNeed_(); if (me.role === 'viewer') throw err_('FORBIDDEN', 'صلاحية المشاهد لا تشمل تنزيل المستندات.');
  const row = findRow_('files', String(p.fid || '')); if (!row) throw err_('NOTFOUND', 'الملف غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  if (String(v[1]).indexOf('ex:' + org + ':') !== 0) throw err_('FORBIDDEN', 'غير مسموح.');
  return { name: String(v[2]), mime: String(v[3]), data: Utilities.base64Encode(DriveApp.getFileById(String(v[5])).getBlob().getBytes()) };
}
function actExSamples_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = exLoad_(org), S = st.set;
  if (p.clear) { const ids = {}; st.exps.forEach(function (e) { if (e.sample) ids[e.id] = 1; }); st.exps = st.exps.filter(function (e) { return !e.sample; }); st.pays = st.pays.filter(function (y) { return !ids[y.exp]; });
    ['cats', 'ccs', 'owners', 'parties', 'reqs'].forEach(function (k) { S[k] = S[k].filter(function (x) { return !x.sample; }); }); govSave_(org, '_exp', st); return exOut_(st, org); }
  if (st.exps.some(function (c) { return c.sample; })) throw err_('VALIDATION', 'البيانات التوضيحية مضافة من قبل.');
  const d = function (n) { const x = new Date(); x.setDate(x.getDate() + n); return Utilities.formatDate(x, 'Asia/Riyadh', 'yyyy-MM-dd'); }, id = function (pre) { return pre + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }, D = S.depts;
  const O = [['المدير المالي', 0], ['محاسب أول', 1], ['منسق مصروفات', 2]].map(function (r, i) { const o = { id: id('eo'), n: 'مسؤول ' + astPad_(i + 1, 3), title: r[0], dept: (D[r[1]] || {}).id, c: '#0b6e8f', sample: true, off: i === 2 }; S.owners.push(o); return o; });
  const P = [['مؤسسة التوريدات المكتبية', 'sup'], ['شركة الصيانة المتكاملة', 'sup'], ['مطبعة الإتقان', 'sup'], ['مزود الخدمات السحابية', 'sup']].map(function (r) { const o = { id: id('ep'), n: r[0], kind: r[1], c: '#2f6fdf', sample: true }; S.parties.push(o); return o; });
  const RQ = ['طالب 001 — الخدمات', 'طالب 002 — المالية'].map(function (n) { const o = { id: id('er'), n: n, c: '#7b5ce0', sample: true }; S.reqs.push(o); return o; });
  const CC = [['المبنى الرئيسي', 0], ['الفرع الشمالي', 0], ['المشاريع', 1]].map(function (r) { const o = { id: id('q'), code: S.cPre + astPad_(S.cNext++, 3), n: r[0], dept: (D[r[1]] || {}).id, status: 'active', sample: true }; S.ccs.push(o); return o; });
  const B = [['مستلزمات مكتبية', 0, 0, 'cart'], ['صيانة', 1, 0, 'tools'], ['خدمات', 2, 2, 'handshake'], ['طباعة', 0, 1, 'doc'], ['اشتراكات', 3, 2, 'repeat']].map(function (r, i) { const o = { id: id('b'), code: S.bPre + astPad_(S.bNext++, 3), n: r[0], cls: (S.classes[r[1]] || {}).id, cc: CC[r[2]].id, owner: O[i % 2].id, status: 'active', budget: [12000, 10000, 10000, 3000, 5000][i], icon: r[3], sample: true }; S.cats.push(o); return o; });
  const mk = function (dd, cat, amt, dept, desc, party, status, due, extra) { const e = Object.assign({ id: id('x'), no: S.ePre + astPad_(S.eNext++, 4), date: d(dd), dept: (D[dept] || {}).id, cc: B[cat].cc, cat: B[cat].id, desc: desc, party: P[party].id, invoice: 'INV-' + (140 + S.eNext), invDate: d(dd), amount: amt, due: d(due), requester: RQ[dept % 2].id, note: '', status: status, by: 'sample', at: now_(), files: [], log: [{ at: now_(), by: me.username, act: 'تسجيل المصروف', note: '' }], sample: true }, extra || {}); if (status === 'approved') e.dec = { by: O[0].id, user: me.username, date: d(dd + 1), note: 'مطابق للفاتورة' }; st.exps.unshift(e); return e; };
  const pay = function (e, amt, dd, m) { st.pays.unshift({ id: id('y'), no: S.pPre + astPad_(S.pNext++, 4), exp: e.id, date: d(dd), amount: amt, method: (S.methods[m || 0] || {}).id, ref: 'TRX-' + (5000 + S.pNext), payer: O[1].id, note: '', by: me.username, at: now_() }); exLog_(e, me, 'تسجيل سداد', amt); };
  const e1 = mk(-26, 0, 7800, 0, 'مستلزمات مكتبية للربع', 0, 'approved', -12); pay(e1, 6300, -18);
  const e2 = mk(-20, 1, 7200, 1, 'صيانة دورية للمكيفات', 1, 'approved', -8); pay(e2, 5700, -12);
  const e3 = mk(-17, 2, 4000, 3, 'خدمات تنظيف شهرية', 1, 'approved', -5); pay(e3, 2900, -10);
  const e4 = mk(-15, 2, 3800, 3, 'خدمات حراسة', 1, 'approved', 6); pay(e4, 2700, -9, 2);
  mk(-12, 4, 600, 3, 'اشتراك خدمات سحابية', 3, 'approved', 10);
  const e6 = mk(-11, 1, 800, 1, 'خدمات صيانة الطابعات', 1, 'approved', -1); pay(e6, 300, -6);
  mk(-10, 3, 450, 2, 'مواد طباعة', 2, 'pending', 8); mk(-9, 0, 300, 0, 'قرطاسية', 0, 'pending', 9);
  const e9 = mk(-8, 0, 1200, 0, 'احتياجات المكتب', 0, 'approved', 2); pay(e9, 700, -5);
  mk(-6, 3, 350, 2, 'طباعة نماذج', 2, 'returned', 12, { dec: { by: O[0].id, user: me.username, date: d(-5), note: 'أرفق عرض السعر' } }); mk(-4, 1, 950, 1, 'قطع غيار', 1, 'pending', 14); mk(-2, 4, 500, 3, 'تجديد اشتراك', 3, 'draft', 20);
  audit_(me.username, 'إضافة بيانات توضيحية للمصروفات', '', '', ''); govSave_(org, '_exp', st); return exOut_(st, org);
}

/* ================= متابعة المهام (4.18) ================= */
const TSK_ST = { new: 'جديدة', doing: 'قيد التنفيذ', hold: 'معلقة', done: 'مكتملة', cancel: 'ملغاة' };
function tskDefaults_() {
  const L = function (a) { return a.map(function (n, i) { return { id: 'd' + (i + 1), n: n }; }); };
  return { orgName: '', senders: L(['الإدارة العليا', 'المشتريات', 'الشؤون القانونية', 'الموارد البشرية', 'إدارة التشغيل', 'الجودة']), concerned: L(['إدارة التشغيل', 'الإدارة المالية', 'تقنية المعلومات', 'الموارد البشرية', 'الشؤون القانونية']),
    sections: L(['العمليات', 'تقنية المعلومات', 'المالية', 'الموارد البشرية', 'المشتريات']), emps: [], stl: { new: 'تم الاستلام', doing: 'العمل جارٍ', hold: 'بانتظار إجراء', done: 'تم التسليم الفعلي', cancel: 'تُستبعد من نسبة الإنجاز' }, rPre: '', rNext: 1, soonDays: 7 };
}
function tskLoad_(org) { const st = govLoad_(org, '_tsk'); st.set = Object.assign(tskDefaults_(), st.set || {}); st.tasks = st.tasks || []; return st; }
function tskOut_(st, extra) { const o = { set: st.set, tasks: st.tasks, sts: TSK_ST }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
function actTskGet_(me) {
  if (!CUR_ORG || CUR_ORG === '*') return aggOrgs_(me, tskLoad_, ['tasks'], { sts: TSK_ST });

  const org = astNeed_(), st = tskLoad_(org); if (!st.set.orgName) st.set.orgName = String(getSettings_().orgName || ''); return tskOut_(st);
}
function actTskSave_(me, p) {
  astCanW_(me); const org = astNeed_(), st = tskLoad_(org), S = st.set, x = p.item || {};
  let t = x.id ? astList_(st.tasks, String(x.id)) : null;
  if (p.del) { if (!t) throw err_('NOTFOUND', 'المهمة غير موجودة.'); if (t.status === 'done') astAdmin_(me); st.tasks = st.tasks.filter(function (y) { return y !== t; }); audit_(me.username, 'حذف مهمة', '', t.ref, t.title); govSave_(org, '_tsk', st); return tskOut_(st); }
  const D = function (k) { const v = str_(x[k], 10); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err_('VALIDATION', 'تاريخ غير صحيح.'); return v; };
  const v = { title: str_(x.title, 200), sender: str_(x.sender, 20), letterDate: D('letterDate'), recvDate: D('recvDate'), concerned: str_(x.concerned, 20), section: str_(x.section, 20), emp: str_(x.emp, 20), sendDate: D('sendDate'), due: D('due'), delivered: D('delivered'), status: TSK_ST[x.status] ? String(x.status) : 'new', note: str_(x.note, 500) };
  if (!v.title) throw err_('VALIDATION', 'اكتب اسم المهمة.');
  if (v.emp) { const e = astList_(S.emps, v.emp); if (!e) throw err_('VALIDATION', 'الموظف غير موجود.'); if (v.section && e.sec && e.sec !== v.section) throw err_('VALIDATION', 'الموظف «' + e.n + '» لا يتبع القسم المختار.'); if (!v.section) v.section = e.sec || ''; }
  if (v.letterDate && v.recvDate && v.recvDate < v.letterDate) throw err_('VALIDATION', 'تاريخ الاستلام قبل تاريخ الخطاب.');
  if (v.recvDate && v.due && v.due < v.recvDate) throw err_('VALIDATION', 'الموعد النهائي قبل تاريخ الاستلام.');
  if (v.delivered) { if (v.delivered > today_()) throw err_('VALIDATION', 'لا يكون التسليم الفعلي بتاريخ مستقبلي.'); if (v.recvDate && v.delivered < v.recvDate) throw err_('VALIDATION', 'التسليم الفعلي قبل تاريخ الاستلام.'); if (v.status !== 'cancel') v.status = 'done'; }
  if (v.status === 'cancel' && !v.note) throw err_('VALIDATION', 'اكتب سبب الإلغاء في الملاحظات.');
  if (t) Object.assign(t, v, { upd: now_(), updBy: me.username });
  else { const ref = str_(x.ref, 30) || (S.rPre || '') + astPad_(S.rNext++, 6); if (st.tasks.some(function (y) { return y.ref === ref; })) throw err_('VALIDATION', 'الرقم المرجعي مستخدم.'); t = Object.assign(v, { id: 't' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), ref: ref, by: me.username, at: now_() }); st.tasks.unshift(t); }
  govSave_(org, '_tsk', st); return tskOut_(st, { id: t.id });
}
function actTskSet_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = tskLoad_(org), x = p.set || {}, s = st.set;
  const lst = function (L) { return (Array.isArray(L) ? L : []).slice(0, 120).map(function (o, i) { return { id: str_(String(o.id || ''), 20).replace(/[^A-Za-z0-9_-]/g, '') || ('x' + i + Date.now().toString(36)), n: str_(String(o.n || ''), 120), sec: str_(String(o.sec || ''), 20) }; }).filter(function (o) { return o.n; }); };
  const used = { senders: 'sender', concerned: 'concerned', sections: 'section', emps: 'emp' };
  Object.keys(used).forEach(function (k) { if (!x[k]) return; const v = lst(x[k]); s[k].forEach(function (o) { if (!v.some(function (y) { return y.id === o.id; }) && st.tasks.some(function (t) { return t[used[k]] === o.id; })) throw err_('VALIDATION', '«' + o.n + '» مستخدم في مهام؛ لا يُحذف.'); }); s[k] = v; });
  if (x.stl) Object.keys(TSK_ST).forEach(function (k) { if (x.stl[k] != null) s.stl[k] = str_(String(x.stl[k]), 80); });
  if (x.orgName != null) s.orgName = str_(String(x.orgName), 120); if (x.rPre != null) s.rPre = str_(String(x.rPre), 8);
  const n = parseInt(x.rNext, 10); if (n > 0 && n < 1e9) s.rNext = n; if (x.soonDays != null) s.soonDays = Math.max(1, Math.min(60, parseInt(x.soonDays, 10) || 7));
  audit_(me.username, 'إعدادات المهام', '', '', ''); govSave_(org, '_tsk', st); return tskOut_(st);
}
function actTskSamples_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = tskLoad_(org), S = st.set;
  if (p.clear) { st.tasks = st.tasks.filter(function (t) { return !t.sample; }); S.emps = S.emps.filter(function (e) { return !e.sample; }); govSave_(org, '_tsk', st); return tskOut_(st); }
  if (st.tasks.some(function (t) { return t.sample; })) throw err_('VALIDATION', 'البيانات التوضيحية مضافة من قبل.');
  const d = function (n) { const x = new Date(); x.setDate(x.getDate() + n); return Utilities.formatDate(x, 'Asia/Riyadh', 'yyyy-MM-dd'); }, SC = S.sections;
  const E = [['أحمد', 0], ['محمد', 0], ['عمر', 0], ['خالد', 1], ['منى', 2], ['نورا', 3], ['سارة', 4]].map(function (r, i) { const o = { id: 'se' + i + Date.now().toString(36), n: r[0], sec: (SC[r[1]] || {}).id, sample: true }; S.emps.push(o); return o; });
  const titles = ['اعتماد خطة الصيانة', 'مراجعة أوامر الشراء', 'تحديث سجل العقود', 'تسليم تقرير المصروفات', 'مراجعة صلاحيات النظام', 'إعداد خطة التدريب', 'تحديث دليل الإجراءات', 'تحديث قائمة الموردين', 'جرد المستودع الرئيسي', 'إعداد ميزانية الربع', 'مراجعة عقود الإيجار', 'تحديث بيانات الموظفين', 'تقرير الأداء الشهري', 'صيانة الشبكة', 'تجهيز قاعة الاجتماعات', 'مراجعة سياسة الخصوصية', 'أرشفة المراسلات', 'تحديث لوحة المؤشرات', 'إعداد محضر اللجنة', 'متابعة طلبات التوظيف'];
  const plan = [[-20, 0, 13, null, 'doing'], [-17, 1, 9, null, 'hold'], [-14, 2, 16, null, 'doing'], [-13, 4, 14, null, 'new'], [-25, 3, 16, 15, 'done'], [-23, 5, 17, 17, 'done'], [-24, 6, 14, 16, 'done'], [-11, 6, 6, null, 'cancel'],
    [-60, 0, 20, 18, 'done'], [-55, 4, 15, 15, 'done'], [-50, 2, 10, 14, 'done'], [-45, 5, 20, null, 'doing'], [-40, 3, 25, 22, 'done'], [-35, 3, 12, null, 'doing'], [-9, 1, 10, null, 'new'], [-8, 6, 20, null, 'hold'], [-90, 5, 15, 12, 'done'], [-80, 3, 10, 11, 'done'], [-5, 4, 4, null, 'doing'], [-3, 5, 12, null, 'new']];
  plan.forEach(function (r, i) { const e = E[r[1]], recv = r[0], t = { id: 't' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), ref: astPad_(S.rNext++, 6), title: titles[i], sender: (S.senders[i % S.senders.length] || {}).id, letterDate: d(recv - 1), recvDate: d(recv), concerned: (S.concerned[i % S.concerned.length] || {}).id, section: e.sec, emp: e.id, sendDate: d(recv + 1), due: d(recv + r[2]), delivered: r[3] != null ? d(recv + r[3]) : '', status: r[4], note: r[4] === 'cancel' ? 'بناء على التوجيه.' : '', by: me.username, at: now_(), sample: true }; st.tasks.unshift(t); });
  audit_(me.username, 'إضافة بيانات توضيحية للمهام', '', '', ''); govSave_(org, '_tsk', st); return tskOut_(st);
}

/* ================= إدارة السير والإركاب: المركبات وحركتها (4.19) ================= */
function fltDefaults_() {
  const L = function (a, c) { return a.map(function (r, i) { return { id: 'd' + (i + 1), n: r[0], code: r[1] || '', c: c[i % c.length] }; }); }, C = ['#13a06f', '#2f6fdf', '#e08a1e', '#7b5ce0', '#d64545', '#0b6e8f'];
  return { orgName: '', currency: 'ريال', distUnit: 'كم', fuelUnit: 'لتر', depts: L([['الإدارة العامة', 'DEP-01'], ['إدارة التشغيل', 'DEP-02'], ['إدارة الصيانة', 'DEP-03'], ['الإدارة المالية', 'DEP-04'], ['الخدمات', 'DEP-05'], ['المشاريع', 'DEP-06']], C),
    types: L([['شاحنة', 'TRUCK'], ['حافلة صغيرة', 'VAN'], ['سيارة', 'CAR'], ['مركبة نقل', 'PICKUP'], ['أخرى', 'OTHER']], C), locs: L([['المقر'], ['الفرع'], ['موقع 001']], C), purposes: L([['نقل مستندات'], ['نقل موظفين'], ['نقل مواد'], ['زيارة ميدانية'], ['خدمة مستفيدين'], ['أخرى']], C),
    mtypes: L([['صيانة دورية'], ['تجديد مستند'], ['تجديد رخصة المركبة'], ['فحص دوري'], ['تأمين'], ['إصلاح عطل'], ['تغيير إطارات']], C),
    vPre: 'VH-', vNext: 1, tPre: 'TR-', tNext: 1, fPre: 'FL-', fNext: 1, dPre: 'DR-', dNext: 1, mPre: 'MN-', mNext: 1, warnDays: 7, noOverlap: true };
}
function fltLoad_(org) { const st = govLoad_(org, '_flt'); st.set = Object.assign(fltDefaults_(), st.set || {}); ['vehs', 'drivers', 'trips', 'fuels', 'mnts'].forEach(function (k) { st[k] = st[k] || []; }); return st; }
function fltOut_(st, extra) { const o = { set: st.set, vehs: st.vehs, drivers: st.drivers, trips: st.trips, fuels: st.fuels, mnts: st.mnts }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
function fltId_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function fltLog_(x, me, act, note) { x.log = x.log || []; x.log.unshift({ at: now_(), by: me.username, act: act, note: str_(String(note || ''), 300) }); if (x.log.length > 40) x.log.length = 40; }
function fltOdo_(st, vid) { let m = 0; const v = astList_(st.vehs, vid); if (v) m = v.odo0 || 0; st.trips.forEach(function (t) { if (t.veh === vid) m = Math.max(m, t.outOdo || 0, t.backOdo || 0); }); st.fuels.forEach(function (f) { if (f.veh === vid) m = Math.max(m, f.odo || 0); }); return m; }
function fltNum_(v) { const n = Number(v); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; }
function fltDT_(v) { const s = str_(v, 16).replace(' ', 'T'); if (s && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw err_('VALIDATION', 'صيغة التاريخ والوقت غير صحيحة.'); return s; }
function actFltGet_(me) {
  if (!CUR_ORG || CUR_ORG === '*') return aggOrgs_(me, fltLoad_, ['vehs', 'drivers', 'trips', 'fuels', 'mnts']);

  const org = astNeed_(), st = fltLoad_(org); if (!st.set.orgName) st.set.orgName = String(getSettings_().orgName || ''); return fltOut_(st);
}
function actFltVeh_(me, p) {
  astCanW_(me); const org = astNeed_(), st = fltLoad_(org), S = st.set, x = p.item || {};
  let v = x.id ? astList_(st.vehs, String(x.id)) : null;
  if (p.del) { astAdmin_(me); if (!v) throw err_('NOTFOUND', 'المركبة غير موجودة.'); if (st.trips.some(function (t) { return t.veh === v.id; }) || st.fuels.some(function (f) { return f.veh === v.id; }) || st.mnts.some(function (m) { return m.veh === v.id; })) throw err_('VALIDATION', 'للمركبة سجلات؛ أوقفها بدل حذفها.'); st.vehs = st.vehs.filter(function (y) { return y !== v; }); govSave_(org, '_flt', st); return fltOut_(st); }
  const val = { plate: str_(x.plate, 30), type: str_(x.type, 20), model: str_(x.model, 80), year: parseInt(x.year, 10) || '', dept: str_(x.dept, 20), status: ['ready', 'maint', 'stopped'].indexOf(x.status) >= 0 ? x.status : 'ready', color: str_(x.color, 30), vin: str_(x.vin, 40), loc: str_(x.loc, 20), note: str_(x.note, 1000) };
  if (!val.plate) throw err_('VALIDATION', 'اكتب رقم اللوحة.'); if (!val.type) throw err_('VALIDATION', 'اختر نوع المركبة.');
  if (st.vehs.some(function (y) { return y !== v && y.plate === val.plate; })) throw err_('VALIDATION', 'رقم اللوحة مسجّل لمركبة أخرى.');
  if (val.year && (val.year < 1950 || val.year > new Date().getFullYear() + 1)) throw err_('VALIDATION', 'سنة الصنع غير صحيحة.');
  if (v) { if (val.status !== v.status && st.trips.some(function (t) { return t.veh === v.id && t.status === 'open'; }) && val.status !== 'ready') throw err_('VALIDATION', 'المركبة في رحلة جارية؛ سجّل العودة أولًا.'); Object.assign(v, val); fltLog_(v, me, 'تعديل بيانات المركبة'); }
  else { v = Object.assign(val, { id: fltId_('v'), code: S.vPre + astPad_(S.vNext++, 4), odo0: fltNum_(x.odo0), added: today_(), by: me.username, at: now_(), files: [], log: [] }); st.vehs.unshift(v); fltLog_(v, me, 'إضافة المركبة'); }
  audit_(me.username, 'حفظ مركبة', '', v.code, v.plate); govSave_(org, '_flt', st); return fltOut_(st, { id: v.id });
}
function actFltDrv_(me, p) {
  astCanW_(me); const org = astNeed_(), st = fltLoad_(org), S = st.set, x = p.item || {};
  let d = x.id ? astList_(st.drivers, String(x.id)) : null;
  if (p.del) { astAdmin_(me); if (!d) throw err_('NOTFOUND', 'السائق غير موجود.'); if (st.trips.some(function (t) { return t.driver === d.id; })) throw err_('VALIDATION', 'للسائق رحلات؛ اجعله غير نشط بدل حذفه.'); st.drivers = st.drivers.filter(function (y) { return y !== d; }); govSave_(org, '_flt', st); return fltOut_(st); }
  const val = { name: str_(x.name, 120), status: x.status === 'inactive' ? 'inactive' : 'active', phone: str_(x.phone, 30), docDate: str_(x.docDate, 10), licExp: str_(x.licExp, 10), loc: str_(x.loc, 20), note: str_(x.note, 500) };
  if (!val.name) throw err_('VALIDATION', 'اكتب اسم السائق.');
  if (d && val.status === 'inactive' && st.trips.some(function (t) { return t.driver === d.id && t.status === 'open'; })) throw err_('VALIDATION', 'السائق في رحلة جارية.');
  const code = str_(x.code, 20);
  if (d) Object.assign(d, val); else { const cd = code || S.dPre + astPad_(S.dNext++, 3); if (st.drivers.some(function (y) { return y.code === cd; })) throw err_('VALIDATION', 'كود السائق مستخدم.'); d = Object.assign(val, { id: fltId_('r'), code: cd, at: now_() }); st.drivers.unshift(d); }
  govSave_(org, '_flt', st); return fltOut_(st, { id: d.id });
}
// الرحلة: الخروج (جارية) ثم العودة (مكتملة)
function actFltTrip_(me, p) {
  astCanW_(me); const org = astNeed_(), st = fltLoad_(org), S = st.set, x = p.item || {};
  let t = x.id ? astList_(st.trips, String(x.id)) : null;
  if (p.del) { astAdmin_(me); if (!t) throw err_('NOTFOUND', 'الرحلة غير موجودة.'); const note = str_(p.note, 300); if (!note) throw err_('VALIDATION', 'اكتب سبب الحذف.'); st.trips = st.trips.filter(function (y) { return y !== t; }); audit_(me.username, 'حذف رحلة', '', t.no, note); govSave_(org, '_flt', st); return fltOut_(st); }
  if (p.back) {
    if (!t || t.status !== 'open') throw err_('VALIDATION', 'الرحلة ليست جارية.'); const at = fltDT_(x.backAt), odo = fltNum_(x.backOdo);
    if (!at) throw err_('VALIDATION', 'حدّد تاريخ ووقت العودة.'); if (at < t.outAt) throw err_('VALIDATION', 'العودة قبل الخروج.'); if (at.slice(0, 10) > today_()) throw err_('VALIDATION', 'لا تُسجَّل عودة بتاريخ مستقبلي.');
    if (!(odo > 0)) throw err_('VALIDATION', 'أدخل عداد العودة.'); if (odo < t.outOdo) throw err_('VALIDATION', 'عداد العودة أقل من عداد الخروج (' + t.outOdo + ').');
    t.backAt = at; t.backOdo = odo; t.dist = Math.round((odo - t.outOdo) * 100) / 100; t.status = 'done'; if (x.note) t.note = str_(x.note, 500); fltLog_(t, me, 'تسجيل العودة', t.dist + ' ' + S.distUnit);
    govSave_(org, '_flt', st); return fltOut_(st, { id: t.id });
  }
  if (t && t.status !== 'open') throw err_('VALIDATION', 'الرحلة مكتملة ولا تُعدَّل.');
  const v = astList_(st.vehs, str_(x.veh, 24)); if (!v) throw err_('VALIDATION', 'اختر المركبة.'); const d = astList_(st.drivers, str_(x.driver, 24)); if (!d) throw err_('VALIDATION', 'اختر السائق.');
  if (v.status !== 'ready') throw err_('VALIDATION', 'المركبة ' + v.code + ' ' + (v.status === 'maint' ? 'تحت الصيانة' : 'موقوفة') + '.'); if (d.status !== 'active') throw err_('VALIDATION', 'السائق غير نشط.');
  if (S.noOverlap) { if (st.trips.some(function (y) { return y !== t && y.status === 'open' && y.veh === v.id; })) throw err_('VALIDATION', 'منع التداخل مفعّل: المركبة في رحلة جارية.'); if (st.trips.some(function (y) { return y !== t && y.status === 'open' && y.driver === d.id; })) throw err_('VALIDATION', 'منع التداخل مفعّل: السائق في رحلة جارية.'); }
  const outAt = fltDT_(x.outAt); if (!outAt) throw err_('VALIDATION', 'حدّد تاريخ ووقت الخروج.'); if (outAt.slice(0, 10) > today_()) throw err_('VALIDATION', 'لا يُسجَّل خروج بتاريخ مستقبلي.');
  const outOdo = fltNum_(x.outOdo), last = t ? 0 : fltOdo_(st, v.id); if (!(outOdo > 0)) throw err_('VALIDATION', 'أدخل عداد الخروج.'); if (outOdo < last) throw err_('VALIDATION', 'عداد الخروج أقل من آخر قراءة موثقة (' + last + ').');
  const val = { veh: v.id, driver: d.id, purpose: str_(x.purpose, 20), from: str_(x.from, 20), to: str_(x.to, 20), toText: str_(x.toText, 120), outAt: outAt, outOdo: outOdo, note: str_(x.note, 500) };
  if (!val.from || !(val.to || val.toText)) throw err_('VALIDATION', 'حدّد مكان الانطلاق والوجهة.');
  if (t) Object.assign(t, val); else { t = Object.assign(val, { id: fltId_('t'), no: S.tPre + astPad_(S.tNext++, 4), status: 'open', by: me.username, at: now_(), log: [] }); st.trips.unshift(t); fltLog_(t, me, 'تسجيل الخروج'); }
  audit_(me.username, 'رحلة مركبة', '', t.no, v.code); govSave_(org, '_flt', st); return fltOut_(st, { id: t.id });
}
function actFltFuel_(me, p) {
  astCanW_(me); const org = astNeed_(), st = fltLoad_(org), S = st.set, x = p.item || {};
  if (p.del) { astAdmin_(me); const f = astList_(st.fuels, String(x.id || '')); if (!f) throw err_('NOTFOUND', 'غير موجود.'); st.fuels = st.fuels.filter(function (y) { return y !== f; }); govSave_(org, '_flt', st); return fltOut_(st); }
  const v = astList_(st.vehs, str_(x.veh, 24)); if (!v) throw err_('VALIDATION', 'اختر المركبة.');
  const date = str_(x.date, 10) || today_(); if (date > today_()) throw err_('VALIDATION', 'لا تُسجَّل تعبئة بتاريخ مستقبلي.');
  const odo = fltNum_(x.odo), lit = fltNum_(x.liters); if (!(lit > 0)) throw err_('VALIDATION', 'أدخل كمية الوقود.'); if (!(odo > 0)) throw err_('VALIDATION', 'أدخل قراءة العداد.');
  let prev = st.fuels.filter(function (f) { return f.veh === v.id && f.date <= date; }).reduce(function (m, f) { return Math.max(m, f.odo); }, v.odo0 || 0); st.trips.forEach(function (t) { if (t.veh !== v.id) return; if (t.outAt && t.outAt.slice(0, 10) <= date) prev = Math.max(prev, t.outOdo || 0); if (t.backAt && t.backAt.slice(0, 10) <= date) prev = Math.max(prev, t.backOdo || 0); }); if (odo < prev) throw err_('VALIDATION', 'قراءة العداد أقل من قراءة سابقة (' + prev + ').');
  const f = { id: fltId_('f'), no: S.fPre + astPad_(S.fNext++, 4), veh: v.id, date: date, odo: odo, liters: lit, amount: fltNum_(x.amount), full: !!x.full && x.full !== '0', station: str_(x.station, 80), by: me.username, at: now_(), files: [] };
  st.fuels.unshift(f); govSave_(org, '_flt', st); return fltOut_(st, { id: f.id });
}
function actFltMnt_(me, p) {
  astCanW_(me); const org = astNeed_(), st = fltLoad_(org), S = st.set, x = p.item || {};
  let m = x.id ? astList_(st.mnts, String(x.id)) : null;
  const syncVeh = function (vid) { const v = astList_(st.vehs, vid); if (!v || v.status === 'stopped') return; const open = st.mnts.some(function (y) { return y.veh === vid && y.started && !y.done; }); if (open) v.status = 'maint'; else if (v.status === 'maint') v.status = 'ready'; };
  if (p.del) { if (!m) throw err_('NOTFOUND', 'غير موجود.'); if (m.done) astAdmin_(me); st.mnts = st.mnts.filter(function (y) { return y !== m; }); syncVeh(m.veh); govSave_(org, '_flt', st); return fltOut_(st); }
  if (p.start) { if (!m || m.done) throw err_('VALIDATION', 'لا يمكن بدء هذه الصيانة.'); if (st.trips.some(function (t) { return t.veh === m.veh && t.status === 'open'; })) throw err_('VALIDATION', 'المركبة في رحلة جارية؛ سجّل العودة أولًا.'); m.started = today_(); fltLog_(m, me, 'إدخال المركبة للصيانة'); syncVeh(m.veh); govSave_(org, '_flt', st); return fltOut_(st, { id: m.id }); }
  if (p.done) { if (!m || m.done) throw err_('VALIDATION', 'الصيانة منجزة مسبقًا أو غير موجودة.'); const dd = str_(x.done, 10) || today_(); if (dd > today_()) throw err_('VALIDATION', 'لا يكون الإنجاز بتاريخ مستقبلي.'); m.done = dd; m.cost = fltNum_(x.cost != null ? x.cost : m.cost); if (x.resp) m.resp = str_(x.resp, 120); if (x.docRef) m.docRef = str_(x.docRef, 60);
    fltLog_(m, me, 'تأكيد الإنجاز'); syncVeh(m.veh);
    if (x.nextDue) { const n = { id: fltId_('m'), no: S.mPre + astPad_(S.mNext++, 4), veh: m.veh, type: m.type, desc: m.desc, due: str_(x.nextDue, 10), cost: 0, resp: m.resp, docRef: '', by: me.username, at: now_(), files: [], log: [] }; st.mnts.unshift(n); }
    govSave_(org, '_flt', st); return fltOut_(st, { id: m.id }); }
  if (m && m.done) throw err_('VALIDATION', 'الصيانة منجزة ولا تُعدَّل.');
  const v = astList_(st.vehs, str_(x.veh, 24)); if (!v) throw err_('VALIDATION', 'اختر المركبة.');
  const val = { veh: v.id, type: str_(x.type, 20), desc: str_(x.desc, 300), due: str_(x.due, 10), cost: fltNum_(x.cost), resp: str_(x.resp, 120), docRef: str_(x.docRef, 60) };
  if (!val.type) throw err_('VALIDATION', 'اختر نوع الصيانة أو التجديد.'); if (!/^\d{4}-\d{2}-\d{2}$/.test(val.due)) throw err_('VALIDATION', 'حدّد الموعد المعتمد.');
  if (m) Object.assign(m, val); else { m = Object.assign(val, { id: fltId_('m'), no: S.mPre + astPad_(S.mNext++, 4), by: me.username, at: now_(), files: [], log: [] }); st.mnts.unshift(m); fltLog_(m, me, 'إضافة متابعة'); }
  govSave_(org, '_flt', st); return fltOut_(st, { id: m.id });
}
function actFltSet_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = fltLoad_(org), x = p.set || {}, s = st.set;
  const lst = function (L) { return (Array.isArray(L) ? L : []).slice(0, 80).map(function (o, i) { return { id: str_(String(o.id || ''), 20).replace(/[^A-Za-z0-9_-]/g, '') || ('x' + i + Date.now().toString(36)), n: str_(String(o.n || ''), 120), code: str_(String(o.code || ''), 20), c: /^#[0-9a-fA-F]{6}$/.test(o.c) ? o.c : '#2f6fdf', off: !!o.off }; }).filter(function (o) { return o.n; }); };
  const used = { depts: function (id) { return st.vehs.some(function (v) { return v.dept === id; }); }, types: function (id) { return st.vehs.some(function (v) { return v.type === id; }); }, locs: function (id) { return st.trips.some(function (t) { return t.from === id || t.to === id; }) || st.drivers.some(function (d) { return d.loc === id; }); }, purposes: function (id) { return st.trips.some(function (t) { return t.purpose === id; }); }, mtypes: function (id) { return st.mnts.some(function (m) { return m.type === id; }); } };
  Object.keys(used).forEach(function (k) { if (!x[k]) return; const v = lst(x[k]); if (!v.length) throw err_('VALIDATION', 'لا تترك القائمة فارغة.'); s[k].forEach(function (o) { if (!v.some(function (y) { return y.id === o.id; }) && used[k](o.id)) throw err_('VALIDATION', '«' + o.n + '» مستخدم؛ عطّله بدل حذفه.'); }); s[k] = v; });
  ['orgName', 'currency', 'distUnit', 'fuelUnit'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 120) || s[k]; });
  ['vPre', 'tPre', 'fPre', 'dPre', 'mPre'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 8) || s[k]; });
  ['vNext', 'tNext', 'fNext', 'dNext', 'mNext'].forEach(function (k) { const n = parseInt(x[k], 10); if (n > 0 && n < 1e7) s[k] = n; });
  if (x.warnDays != null) s.warnDays = Math.max(1, Math.min(90, parseInt(x.warnDays, 10) || 7)); if (x.noOverlap != null) s.noOverlap = !!x.noOverlap;
  audit_(me.username, 'إعدادات المركبات', '', '', ''); govSave_(org, '_flt', st); return fltOut_(st);
}
function actFltUpload_(me, p) {
  astCanW_(me); const org = astNeed_(), st = fltLoad_(org), K = { veh: 'vehs', fuel: 'fuels', mnt: 'mnts', drv: 'drivers' }[p.kind]; if (!K) throw err_('VALIDATION', 'نوع غير معروف.');
  const t = astList_(st[K], String(p.id || '')); if (!t) throw err_('NOTFOUND', 'العنصر غير موجود.');
  const name = str_(p.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'مستند', mime = String(p.mime || '');
  if (GOV_TYPES.indexOf(mime) < 0) throw err_('VALIDATION', 'الأنواع المسموحة: PDF وWord وExcel وصور JPG/PNG/WEBP.');
  const bytes = Utilities.base64Decode(String(p.data || '')); if (!bytes.length) throw err_('VALIDATION', 'الملف فارغ.'); if (bytes.length > MAX_FILE * 2) throw err_('VALIDATION', 'حجم الملف أكبر من 10 ميجابايت.');
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, 'مركبات — ' + name)), fid = Utilities.getUuid();
  sheet_('files').appendRow([fid, 'flt:' + org + ':' + t.id, name, mime, bytes.length, file.getId(), me.username, now_()]);
  t.files = t.files || []; t.files.unshift({ fid: fid, name: name, mime: mime, size: bytes.length, at: now_(), by: me.username }); t.files = t.files.slice(0, 15);
  govSave_(org, '_flt', st); return fltOut_(st);
}
function actFltFile_(me, p) {
  const org = astNeed_(); if (me.role === 'viewer') throw err_('FORBIDDEN', 'صلاحية المشاهد لا تشمل تنزيل المستندات.');
  const row = findRow_('files', String(p.fid || '')); if (!row) throw err_('NOTFOUND', 'الملف غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  if (String(v[1]).indexOf('flt:' + org + ':') !== 0) throw err_('FORBIDDEN', 'غير مسموح.');
  return { name: String(v[2]), mime: String(v[3]), data: Utilities.base64Encode(DriveApp.getFileById(String(v[5])).getBlob().getBytes()) };
}
function actFltSamples_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = fltLoad_(org), S = st.set;
  if (p.clear) { const V = {}; st.vehs.forEach(function (v) { if (v.sample) V[v.id] = 1; }); ['trips', 'fuels', 'mnts'].forEach(function (k) { st[k] = st[k].filter(function (x) { return !V[x.veh]; }); }); st.vehs = st.vehs.filter(function (v) { return !v.sample; }); st.drivers = st.drivers.filter(function (d) { return !d.sample; }); govSave_(org, '_flt', st); return fltOut_(st); }
  if (st.vehs.some(function (v) { return v.sample; })) throw err_('VALIDATION', 'البيانات التوضيحية مضافة من قبل.');
  const d = function (n, h) { const x = new Date(); x.setDate(x.getDate() + n); return Utilities.formatDate(x, 'Asia/Riyadh', 'yyyy-MM-dd') + (h != null ? 'T' + String(h).padStart(2, '0') + ':00' : ''); }, T = S.types, D = S.depts, Lc = S.locs, P = S.purposes, MT = S.mtypes;
  const V = [[2, 4, 12000, 'أبيض'], [3, 0, 24500, 'فضي'], [2, 5, 31000, 'أزرق'], [0, 1, 54000, 'أبيض'], [1, 4, 8800, 'رمادي'], [2, 0, 15200, 'أسود']].map(function (r, i) { const v = { id: fltId_('v'), code: S.vPre + astPad_(S.vNext++, 4), plate: 'لوحة تجريبية ' + astPad_(i + 1, 3), type: (T[r[0]] || {}).id, model: ['تويوتا كامري', 'هيونداي H1', 'نيسان صني', 'إيسوزو NPR', 'تويوتا هايس', 'كيا K5'][i], year: 2020 + (i % 6), dept: (D[r[1]] || {}).id, status: i === 2 ? 'maint' : 'ready', color: r[3], vin: '', loc: (Lc[0] || {}).id, odo0: r[2], note: i === 0 ? 'خاضعة لبرنامج الصيانة الدورية وحالتها العامة جيدة.' : '', added: d(-120), by: me.username, at: now_(), files: [], log: [], sample: true }; st.vehs.push(v); return v; });
  const R = ['001', '002', '003', '004', '005'].map(function (n, i) { const r = { id: fltId_('r'), code: S.dPre + astPad_(S.dNext++, 3), name: 'سائق ' + n, status: i === 4 ? 'inactive' : 'active', phone: '', docDate: d(-200 - i * 30), licExp: d(300 - i * 50), loc: (Lc[i % 2] || {}).id, note: '', at: now_(), sample: true }; st.drivers.push(r); return r; });
  const trip = function (vi, ri, day, h, odo, back, to, pu) { const t = { id: fltId_('t'), no: S.tPre + astPad_(S.tNext++, 4), veh: V[vi].id, driver: R[ri].id, purpose: (P[pu] || {}).id, from: (Lc[0] || {}).id, to: (Lc[to] || {}).id, toText: '', outAt: d(day, h), outOdo: odo, status: back ? 'done' : 'open', by: me.username, at: now_(), log: [], note: '' }; if (back) { t.backAt = d(day, h + back[0]); t.backOdo = odo + back[1]; t.dist = back[1]; } st.trips.unshift(t); };
  trip(1, 2, -6, 10, 24210, [1, 60], 1, 2); trip(0, 1, -5, 8, 11720, [2, 120], 2, 0); trip(3, 0, -4, 7, 53600, [5, 180], 1, 2); trip(5, 3, -3, 9, 15020, [3, 90], 2, 3); trip(1, 2, -2, 10, 24270, [1, 60], 1, 0); trip(4, 3, 0, 8, 8800, [2, 40], 1, 1); trip(0, 0, 0, 9, 12000, null, 1, 0); trip(3, 1, 0, 11, 54000, null, 2, 2);
  const fuel = function (vi, day, odo, lit, amt, full) { st.fuels.unshift({ id: fltId_('f'), no: S.fPre + astPad_(S.fNext++, 4), veh: V[vi].id, date: d(day), odo: odo, liters: lit, amount: amt, full: full, station: 'محطة توضيحية', by: me.username, at: now_(), files: [] }); };
  fuel(1, -9, 24100, 30, 36, true); fuel(1, -1, 24500, 20, 24, false); fuel(0, -6, 11700, 35, 42, true); fuel(0, -1, 11990, 20, 24, false); fuel(3, -5, 53550, 60, 72, true); fuel(3, -2, 53800, 40, 48, true);
  const mnt = function (vi, mi, due, desc, started, done, cost) { st.mnts.unshift({ id: fltId_('m'), no: S.mPre + astPad_(S.mNext++, 4), veh: V[vi].id, type: (MT[mi] || {}).id, desc: desc, due: d(due), cost: cost || 0, resp: 'مسؤول الحركة', docRef: mi === 2 ? 'DOC-2026-011' : '', started: started ? d(-1) : '', done: done ? d(done) : '', by: me.username, at: now_(), files: [], log: [] }); };
  mnt(2, 0, 0, 'صيانة دورية للمركبة', 1); mnt(0, 2, 4, 'تجديد رخصة المركبة'); mnt(1, 3, 9, 'فحص دوري حسب الوثيقة'); mnt(5, 4, 6, 'تجديد التأمين'); mnt(3, 0, -30, 'صيانة دورية', 0, -29, 850); mnt(4, 6, 40, 'تغيير الإطارات');
  audit_(me.username, 'إضافة بيانات توضيحية للمركبات', '', '', ''); govSave_(org, '_flt', st); return fltOut_(st);
}

/* ================= ملخص الأنظمة التشغيلية للوحة الرئيسية (4.17) ================= */
function opsSum_(org) {
  const T = today_(), a = govLoad_(org, '_assets'), pr = prLoad_(org), ct = ctLoad_(org), iv = invLoad_(org), ex = exLoad_(org);
  const A = a.assets || [], R = pr.reqs || [];
  const bal = {}; iv.movs.forEach(function (m) { if (m.status === 'posted') bal[m.item] = (bal[m.item] || 0) + m.dir * m.qty; });
  const act = iv.items.filter(function (i) { return i.status !== 'stopped'; }), out = act.filter(function (i) { return (bal[i.id] || 0) <= 0; }).length, low = act.filter(function (i) { const b = bal[i.id] || 0; return b > 0 && i.reorder > 0 && b <= i.reorder; }).length;
  const paid = {}; ex.pays.forEach(function (y) { paid[y.exp] = (paid[y.exp] || 0) + y.amount; }); const EA = ex.exps.filter(function (e) { return e.status === 'approved'; });
  const cpaid = {}; ct.pays.forEach(function (y) { cpaid[y.ct] = (cpaid[y.ct] || 0) + y.amount; });
  const CA = ct.cts.filter(function (c) { return c.status === 'active'; });
  const TK = tskLoad_(org).tasks, FL = fltLoad_(org), wd = new Date(); wd.setDate(wd.getDate() + (FL.set.warnDays || 7)); const WD = Utilities.formatDate(wd, 'Asia/Riyadh', 'yyyy-MM-dd');
  return {
    prj: pjSum_(org), web: wsSum_(org),
    flt: { vehs: FL.vehs.length, ready: FL.vehs.filter(function (v) { return v.status === 'ready' && !FL.trips.some(function (t) { return t.veh === v.id && t.status === 'open'; }); }).length, open: FL.trips.filter(function (t) { return t.status === 'open'; }).length, maint: FL.vehs.filter(function (v) { return v.status === 'maint'; }).length, renew: FL.mnts.filter(function (m) { return !m.done && m.due <= WD; }).length },
    tsk: { total: TK.length, open: TK.filter(function (t) { return ['done', 'cancel'].indexOf(t.status) < 0; }).length, done: TK.filter(function (t) { return t.status === 'done'; }).length, late: TK.filter(function (t) { return ['done', 'cancel'].indexOf(t.status) < 0 && t.due && t.due < T; }).length },
    assets: { total: A.length, custody: A.filter(function (x) { return x.status === 'custody'; }).length, maint: A.filter(function (x) { return x.status === 'maint'; }).length, late: A.filter(function (x) { return x.status === 'custody' && x.due && x.due < T; }).length },
    purch: { total: R.length, pending: R.filter(function (r) { return r.status === 'pending'; }).length, supply: R.filter(function (r) { return r.status === 'supply' || r.status === 'partial'; }).length, late: R.filter(function (r) { return (r.status === 'supply' || r.status === 'partial') && (r.eta || r.need) && (r.eta || r.need) < T; }).length, sups: (pr.sups || []).length },
    inv: { items: iv.items.length, whs: iv.whs.length, out: out, low: low, movs: iv.movs.filter(function (m) { return m.status === 'posted'; }).length, counts: iv.counts.filter(function (c) { return c.status === 'pending'; }).length },
    ctr: { total: ct.cts.length, active: CA.length, value: CA.reduce(function (s, c) { return s + (c.value || 0); }, 0), paid: CA.reduce(function (s, c) { return s + (cpaid[c.id] || 0); }, 0), obs: ct.obs.filter(function (b) { return b.status === 'open'; }).length, late: ct.obs.filter(function (b) { return b.status === 'open' && b.due < T; }).length },
    exp: { total: ex.exps.length, approved: EA.reduce(function (s, e) { return s + e.amount; }, 0), paid: EA.reduce(function (s, e) { return s + Math.min(e.amount, paid[e.id] || 0); }, 0), pending: ex.exps.filter(function (e) { return e.status === 'pending'; }).length, late: EA.filter(function (e) { return e.due && e.due < T && (paid[e.id] || 0) < e.amount - 0.009; }).length }
  };
}
function actOpsGet_(me) {
  if (!CUR_ORG || CUR_ORG === '*') {
    if (!isPlatformMember_(me)) throw err_('FORBIDDEN', 'غير مسموح.');
    const orgs = loadOrgs_().filter(function (o) { return o.status !== 'archived'; }).map(function (o) { return { id: o.id, code: o.code, name: o.name, s: opsSum_(o.id) }; });
    const tot = {}; orgs.forEach(function (o) { Object.keys(o.s).forEach(function (k) { tot[k] = tot[k] || {}; Object.keys(o.s[k]).forEach(function (f) { tot[k][f] = Math.round(((tot[k][f] || 0) + o.s[k][f]) * 100) / 100; }); }); });
    return { all: 1, tot: tot, orgs: orgs };
  }
  return { all: 0, tot: opsSum_(astNeed_()) };
}

/* ===== عرض مجمّع لكل المؤسسات داخل كل نظام (4.19.3) ===== */
/* ================= المشاريع والمتابعة + حسابات الداعمين + المشاريع التأهيلية (4.21) ================= */
const PJ_ST = { plan: 'لم يبدأ', run: 'جاري', hold: 'متوقف', done: 'مكتمل' };
const PJ_TST = { todo: 'للتنفيذ', doing: 'قيد العمل', review: 'للمراجعة', done: 'منجزة' };
const PJ_PH = { prep: 'التجهيز والبدء', plan: 'الإعداد والتخطيط', exec: 'التنفيذ', ctrl: 'المتابعة والتحكم', close: 'الإغلاق والتقييم' };
const RH_ST = { new: 'لم يبدأ', run: 'جاري', stop: 'متعثر', done: 'مكتمل' };
function pjDefaults_() {
  const L = function (p, a) { return a.map(function (n, i) { return { id: p + (i + 1), n: n }; }); };
  return {
    orgName: '', types: L('t', ['اجتماعي', 'اقتصادي', 'تعليمي', 'صحي', 'إغاثي', 'موسمي', 'أخرى']),
    targets: L('g', ['الفقراء والأسر المحتاجة', 'الأيتام', 'الأرامل والمطلقات', 'كبار السن', 'ذوو الإعاقة', 'الطلاب', 'أخرى']),
    regions: L('r', ['جدة', 'مكة المكرمة', 'الرياض', 'المدينة المنورة', 'الدمام']), villages: [], managers: [],
    pPre: '', pNext: 1001, warnPct: 85,
    supKinds: L('k', ['فرد', 'شركة', 'جهة حكومية', 'جمعية أو مؤسسة', 'صندوق مانح']), taxIds: L('x', ['الرقم الضريبي', 'السجل التجاري', 'الهوية الوطنية', 'رقم الإقامة']), sPre: '', sNext: 1001, smsSign: '',
    rhProjects: L('p', ['ماكينة خياطة', 'عربة طعام متنقلة', 'بقالة صغيرة', 'مشغل نسائي', 'صيانة جوالات', 'تربية مواشي', 'أسر منتجة']),
    rhKinds: L('q', ['قرض حسن', 'منحة', 'قرض بضمان']), skills: L('s', ['خياطة وتفصيل', 'طبخ وإعداد طعام', 'تجارة وبيع', 'حرف يدوية', 'صيانة وتقنية', 'زراعة ورعي']), rPre: 'RH-', rNext: 1, nPre: 'TA-', nNext: 1, graceDays: 0
  };
}
function pjLoad_(org) {
  const st = govLoad_(org, '_prj'), d = pjDefaults_(); st.set = Object.assign(d, st.set || {});
  ['projects', 'ledger', 'tasks', 'kpis', 'acts', 'sups', 'sms', 'needs', 'rh'].forEach(function (k) { st[k] = st[k] || []; }); return st;
}
function pjOut_(st, extra) { const o = { set: st.set, projects: st.projects, ledger: st.ledger, tasks: st.tasks, kpis: st.kpis, acts: st.acts, sups: st.sups, sms: st.sms, needs: st.needs, rh: st.rh, sts: PJ_ST, tsts: PJ_TST, phases: PJ_PH, rsts: RH_ST }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
function pjId_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function pjLog_(x, me, a, note) { x.log = x.log || []; x.log.unshift({ at: now_(), by: me.username, act: a, note: str_(String(note || ''), 300) }); if (x.log.length > 60) x.log.length = 60; }
function pjD_(x, k, req, lbl) { const v = str_(x[k], 10); if (!v) { if (req) throw err_('VALIDATION', 'حدد ' + lbl + '.'); return ''; } if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err_('VALIDATION', 'تاريخ غير صحيح: ' + lbl + '.'); return v; }
function pjM_(v) { const n = Math.round(Number(v) * 100) / 100; return isFinite(n) ? n : NaN; }
function pjIn_(L, id, lbl, req) { const v = str_(String(id == null ? '' : id), 30); if (!v) { if (req) throw err_('VALIDATION', 'اختر ' + lbl + '.'); return ''; } if (!astList_(L, v)) throw err_('VALIDATION', lbl + ' غير موجود في القائمة.'); return v; }
function pjBal_(st, pid) { return Math.round(st.ledger.reduce(function (s, e) { return e.pid !== pid ? s : s + (e.kind === 'in' || e.kind === 'tin' ? e.amount : -e.amount); }, 0) * 100) / 100; }
function pjMob_(v, req, lbl) { const s = String(v || '').replace(/[\s-]/g, ''); if (!s) { if (req) throw err_('VALIDATION', 'اكتب ' + lbl + '.'); return ''; } if (!/^05\d{8}$/.test(s)) throw err_('VALIDATION', lbl + ' يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.'); return s; }
function pjPrj_(st, id, open) { const p = astList_(st.projects, String(id || '')); if (!p) throw err_('NOTFOUND', 'المشروع غير موجود.'); if (open && p.deleted) throw err_('VALIDATION', 'المشروع محذوف؛ استعده أولًا.'); if (open === 2 && p.status === 'done') throw err_('VALIDATION', 'المشروع مكتمل؛ افتحه أولًا للتعديل.'); return p; }

function actPjGet_(me) {
  if (!CUR_ORG || CUR_ORG === '*') return aggOrgs_(me, pjLoad_, ['projects', 'ledger', 'tasks', 'kpis', 'acts', 'sups', 'sms', 'needs', 'rh'], { sts: PJ_ST, tsts: PJ_TST, phases: PJ_PH, rsts: RH_ST });
  const org = astNeed_(), st = pjLoad_(org); if (!st.set.orgName) st.set.orgName = String(getSettings_().orgName || ''); return pjOut_(st);
}
// ===== المشاريع
function actPjSave_(me, p) {
  astCanW_(me); const org = astNeed_(), st = pjLoad_(org), S = st.set, x = p.item || {};
  if (p.life) {
    const pr = pjPrj_(st, x.id), note = str_(p.note, 300);
    if (p.life === 'complete') { if (pr.deleted || pr.status === 'done') throw err_('VALIDATION', 'لا يمكن إكمال هذا المشروع.'); const open = st.tasks.filter(function (t) { return t.pid === pr.id && t.st !== 'done'; }).length; if (open && !p.force) throw err_('VALIDATION', 'للمشروع ' + open + ' مهمة غير منجزة. أنجزها أو أكّد الإكمال.'); pr.prev = pr.status; pr.status = 'done'; pr.doneAt = today_(); pjLog_(pr, me, 'إكمال المشروع', note); }
    else if (p.life === 'reopen') { if (pr.status !== 'done') throw err_('VALIDATION', 'المشروع غير مكتمل.'); if (!note) throw err_('VALIDATION', 'اكتب سبب فتح المشروع.'); pr.status = 'run'; pr.doneAt = ''; pjLog_(pr, me, 'فتح مشروع مكتمل', note); }
    else if (p.life === 'delete') { if (pr.deleted) throw err_('VALIDATION', 'المشروع محذوف من قبل.'); if (!note) throw err_('VALIDATION', 'اكتب سبب الحذف.'); if (pjBal_(st, pr.id) !== 0 && !p.force) throw err_('VALIDATION', 'رصيد المشروع ليس صفرًا؛ حوّل الرصيد أولًا أو أكّد الحذف.'); pr.deleted = 1; pr.delAt = now_(); pr.delBy = me.username; pr.delNote = note; pjLog_(pr, me, 'حذف المشروع', note); }
    else if (p.life === 'restore') { if (!pr.deleted) throw err_('VALIDATION', 'المشروع غير محذوف.'); pr.deleted = 0; pr.delAt = ''; pjLog_(pr, me, 'استعادة المشروع', note); }
    else if (p.life === 'purge') { astAdmin_(me); if (!pr.deleted) throw err_('VALIDATION', 'احذف المشروع أولًا.'); ['tasks', 'kpis', 'acts', 'ledger'].forEach(function (k) { st[k] = st[k].filter(function (y) { return y.pid !== pr.id; }); }); st.projects = st.projects.filter(function (y) { return y !== pr; }); }
    else throw err_('VALIDATION', 'إجراء غير معروف.');
    audit_(me.username, 'دورة حياة مشروع', '', pr.no, p.life); govSave_(org, '_prj', st); return pjOut_(st, { id: pr.id });
  }
  const v = {
    name: str_(x.name, 160), type: pjIn_(S.types, x.type, 'نوع الدعم', 1), target: pjIn_(S.targets, x.target, 'الفئة المستهدفة', 1), region: pjIn_(S.regions, x.region, 'القطاع - المحافظة', 1), village: pjIn_(S.villages, x.village, 'القرية - الحي'),
    manager: pjIn_(S.managers, x.manager, 'مدير المشروع'), status: PJ_ST[x.status] && x.status !== 'done' ? String(x.status) : 'plan', budget: pjM_(x.budget || 0), start: pjD_(x, 'start', 1, 'تاريخ البداية'), end: pjD_(x, 'end', 1, 'تاريخ النهاية'),
    goal: str_(x.goal, 600), desc: str_(x.desc, 1500), place: str_(x.place, 160), bens: Math.max(0, parseInt(x.bens, 10) || 0), donor: str_(x.donor, 30), partners: str_(x.partners, 400), note: str_(x.note, 800), color: /^#[0-9a-f]{6}$/i.test(String(x.color || '')) ? String(x.color) : ''
  };
  if (!v.name) throw err_('VALIDATION', 'اكتب اسم المشروع.');
  if (!(v.budget >= 0)) throw err_('VALIDATION', 'الميزانية غير صحيحة.');
  if (v.end < v.start) throw err_('VALIDATION', 'تاريخ النهاية قبل تاريخ البداية.');
  if (v.village) { const vl = astList_(S.villages, v.village); if (vl.reg && vl.reg !== v.region) throw err_('VALIDATION', 'القرية/الحي «' + vl.n + '» لا يتبع المحافظة المختارة.'); }
  if (v.donor && !astList_(st.sups, v.donor)) throw err_('VALIDATION', 'الداعم غير موجود.');
  let pr = x.id ? pjPrj_(st, x.id, 2) : null;
  if (st.projects.some(function (y) { return y !== pr && !y.deleted && y.name === v.name; })) throw err_('VALIDATION', 'يوجد مشروع بالاسم نفسه.');
  if (pr) { if (pr.status === 'done') v.status = 'done'; Object.assign(pr, v, { upd: now_(), updBy: me.username }); pjLog_(pr, me, 'تحديث بيانات المشروع'); }
  else { const no = (S.pPre || '') + astPad_(S.pNext++, 6); pr = Object.assign(v, { id: pjId_('p'), no: no, by: me.username, at: now_(), files: [], log: [] }); pjLog_(pr, me, 'إنشاء المشروع'); st.projects.unshift(pr); }
  audit_(me.username, x.id ? 'تحديث مشروع' : 'إضافة مشروع', '', pr.no, pr.name); govSave_(org, '_prj', st); return pjOut_(st, { id: pr.id });
}
// ===== الإيرادات والمصروفات والتحويل
function actPjLedger_(me, p) {
  astCanW_(me); const org = astNeed_(), st = pjLoad_(org), x = p.item || {};
  if (p.del) { astAdmin_(me); const e = astList_(st.ledger, String(p.del)); if (!e) throw err_('NOTFOUND', 'القيد غير موجود.'); const ids = e.tr ? st.ledger.filter(function (y) { return y.tr === e.tr; }) : [e];
    ids.forEach(function (y) { if ((y.kind === 'in' || y.kind === 'tin') && pjBal_(st, y.pid) - y.amount < -0.001) throw err_('VALIDATION', 'حذف القيد يجعل رصيد المشروع سالبًا.'); });
    st.ledger = st.ledger.filter(function (y) { return ids.indexOf(y) < 0; }); const pr = astList_(st.projects, e.pid); if (pr) pjLog_(pr, me, 'حذف قيد مالي', e.no); govSave_(org, '_prj', st); return pjOut_(st); }
  const kind = ['in', 'out', 'tr'].indexOf(x.kind) >= 0 ? x.kind : ''; if (!kind) throw err_('VALIDATION', 'نوع القيد غير معروف.');
  const pr = pjPrj_(st, x.pid, 2), amt = pjM_(x.amount), date = pjD_(x, 'date', 1, 'التاريخ');
  if (!(amt > 0)) throw err_('VALIDATION', 'اكتب مبلغًا أكبر من صفر.'); if (date > today_()) throw err_('VALIDATION', 'لا يكون تاريخ القيد مستقبليًا.');
  const base = { date: date, note: str_(x.note, 300), ref: str_(x.ref, 40), src: str_(x.src, 120), by: me.username, at: now_() };
  const no = function () { return 'L' + astPad_(st.ledger.length + 1, 5) + '-' + Utilities.getUuid().slice(0, 3).toUpperCase(); };
  if (kind === 'out' && amt > pjBal_(st, pr.id) + 0.001) throw err_('VALIDATION', 'المبلغ أكبر من رصيد المشروع (' + pjBal_(st, pr.id) + ').');
  if (kind === 'tr') {
    const to = pjPrj_(st, x.to, 2); if (to.id === pr.id) throw err_('VALIDATION', 'اختر مشروعًا آخر للتحويل.'); if (amt > pjBal_(st, pr.id) + 0.001) throw err_('VALIDATION', 'المبلغ أكبر من رصيد المشروع المحوَّل منه.');
    const tr = pjId_('tr');
    st.ledger.unshift(Object.assign({ id: pjId_('l'), no: no(), pid: pr.id, kind: 'tout', amount: amt, tr: tr, peer: to.id }, base));
    st.ledger.unshift(Object.assign({ id: pjId_('l'), no: no(), pid: to.id, kind: 'tin', amount: amt, tr: tr, peer: pr.id }, base));
    pjLog_(pr, me, 'تحويل رصيد إلى ' + to.name, amt); pjLog_(to, me, 'استلام تحويل من ' + pr.name, amt);
  } else { st.ledger.unshift(Object.assign({ id: pjId_('l'), no: no(), pid: pr.id, kind: kind, amount: amt }, base)); pjLog_(pr, me, kind === 'in' ? 'تسجيل إيراد' : 'تسجيل صرف', amt); if (pr.status === 'plan' && kind === 'out') pr.status = 'run'; }
  audit_(me.username, kind === 'in' ? 'إيراد مشروع' : kind === 'out' ? 'صرف مشروع' : 'تحويل رصيد مشروع', '', pr.no, String(amt)); govSave_(org, '_prj', st); return pjOut_(st);
}
// ===== مهام المخطط (جانت/كانبان)
function actPjTask_(me, p) {
  astCanW_(me); const org = astNeed_(), st = pjLoad_(org), x = p.item || {};
  let t = x.id ? astList_(st.tasks, String(x.id)) : null;
  if (p.del) { if (!t) throw err_('NOTFOUND', 'المهمة غير موجودة.'); st.tasks.forEach(function (y) { if (y.dep === t.id) y.dep = ''; }); st.tasks = st.tasks.filter(function (y) { return y !== t; }); govSave_(org, '_prj', st); return pjOut_(st); }
  if (p.move) { if (!t) throw err_('NOTFOUND', 'المهمة غير موجودة.'); pjPrj_(st, t.pid, 2); const s = String(p.move); if (!PJ_TST[s]) throw err_('VALIDATION', 'حالة غير معروفة.'); t.st = s; if (s === 'done') { t.pct = 100; t.doneAt = today_(); } else if (t.pct === 100) t.pct = 90; if (s === 'doing' && !t.pct) t.pct = 10; t.upd = now_(); govSave_(org, '_prj', st); return pjOut_(st); }
  const pr = pjPrj_(st, x.pid, 2), S = st.set;
  const v = { pid: pr.id, title: str_(x.title, 200), phase: PJ_PH[x.phase] ? String(x.phase) : 'exec', owner: pjIn_(S.managers, x.owner, 'المسؤول'), start: pjD_(x, 'start', 1, 'بداية المهمة'), end: pjD_(x, 'end', 1, 'نهاية المهمة'), st: PJ_TST[x.st] ? String(x.st) : 'todo', pct: Math.max(0, Math.min(100, parseInt(x.pct, 10) || 0)), w: Math.max(1, Math.min(10, parseInt(x.w, 10) || 1)), prio: ['low', 'mid', 'high'].indexOf(x.prio) >= 0 ? x.prio : 'mid', ms: x.ms ? 1 : 0, dep: str_(x.dep, 20), note: str_(x.note, 500) };
  if (!v.title) throw err_('VALIDATION', 'اكتب اسم المهمة.'); if (v.end < v.start) throw err_('VALIDATION', 'نهاية المهمة قبل بدايتها.');
  if (v.dep) { const d = astList_(st.tasks, v.dep); if (!d || d.pid !== pr.id) throw err_('VALIDATION', 'المهمة السابقة غير موجودة في المشروع.'); if (t && d.id === t.id) throw err_('VALIDATION', 'لا تعتمد المهمة على نفسها.'); if (v.start < d.end) throw err_('VALIDATION', 'تبدأ المهمة بعد نهاية المهمة السابقة «' + d.title + '» (' + d.end + ').'); }
  if (v.st === 'done') v.pct = 100; else if (v.pct === 100) v.st = 'done';
  if (t) { if (v.st === 'done' && t.st !== 'done') v.doneAt = today_(); Object.assign(t, v, { upd: now_() }); }
  else { t = Object.assign(v, { id: pjId_('k'), by: me.username, at: now_(), doneAt: v.st === 'done' ? today_() : '' }); st.tasks.push(t); pjLog_(pr, me, 'إضافة مهمة', v.title); }
  if (pr.status === 'plan' && (v.st === 'doing' || v.st === 'done')) pr.status = 'run';
  govSave_(org, '_prj', st); return pjOut_(st, { id: t.id });
}
// ===== مؤشرات الأداء
function actPjKpi_(me, p) {
  astCanW_(me); const org = astNeed_(), st = pjLoad_(org), x = p.item || {};
  let k = x.id ? astList_(st.kpis, String(x.id)) : null;
  if (p.del) { if (!k) throw err_('NOTFOUND', 'المؤشر غير موجود.'); st.kpis = st.kpis.filter(function (y) { return y !== k; }); govSave_(org, '_prj', st); return pjOut_(st); }
  const pr = pjPrj_(st, x.pid, 2), v = { pid: pr.id, n: str_(x.n, 160), unit: str_(x.unit, 30), base: pjM_(x.base || 0), target: pjM_(x.target), actual: pjM_(x.actual || 0), dir: x.dir === 'down' ? 'down' : 'up', freq: str_(x.freq, 30), src: str_(x.src, 160) };
  if (!v.n) throw err_('VALIDATION', 'اكتب اسم المؤشر.'); if (!(v.target >= 0) || isNaN(v.actual) || isNaN(v.base)) throw err_('VALIDATION', 'قيم المؤشر غير صحيحة.');
  if (k) { k.hist = k.hist || []; if (k.actual !== v.actual) k.hist.unshift({ at: today_(), v: v.actual }); k.hist = k.hist.slice(0, 24); Object.assign(k, v); }
  else { k = Object.assign(v, { id: pjId_('i'), at: now_(), hist: [{ at: today_(), v: v.actual }] }); st.kpis.push(k); }
  govSave_(org, '_prj', st); return pjOut_(st, { id: k.id });
}
// ===== النشاطات والمستفيدون الملحقون
function actPjAct_(me, p) {
  astCanW_(me); const org = astNeed_(), st = pjLoad_(org), x = p.item || {};
  if (p.del) { const a = astList_(st.acts, String(p.del)); if (!a) throw err_('NOTFOUND', 'النشاط غير موجود.'); st.acts = st.acts.filter(function (y) { return y !== a; }); govSave_(org, '_prj', st); return pjOut_(st); }
  const pr = pjPrj_(st, x.pid, 2), v = { pid: pr.id, kind: ['act', 'ben', 'party'].indexOf(x.kind) >= 0 ? x.kind : 'act', title: str_(x.title, 200), date: pjD_(x, 'date', 1, 'التاريخ'), count: Math.max(0, parseInt(x.count, 10) || 0), note: str_(x.note, 500) };
  if (!v.title) throw err_('VALIDATION', 'اكتب العنوان.'); const a = Object.assign(v, { id: pjId_('a'), by: me.username, at: now_() }); st.acts.unshift(a);
  pjLog_(pr, me, v.kind === 'ben' ? 'إلحاق مستفيدين' : v.kind === 'party' ? 'إلحاق جهة' : 'تسجيل نشاط', v.title); govSave_(org, '_prj', st); return pjOut_(st);
}
// ===== حسابات الداعمين
function actPjSup_(me, p) {
  astCanW_(me); const org = astNeed_(), st = pjLoad_(org), S = st.set, x = p.item || {};
  let s = x.id ? astList_(st.sups, String(x.id)) : null;
  if (p.del) { if (!s) throw err_('NOTFOUND', 'الحساب غير موجود.'); if (st.projects.some(function (y) { return y.donor === s.id; })) { s.off = s.off ? 0 : 1; pjLog_(s, me, s.off ? 'إيقاف الحساب' : 'تفعيل الحساب'); } else st.sups = st.sups.filter(function (y) { return y !== s; }); govSave_(org, '_prj', st); return pjOut_(st); }
  const v = { name: str_(x.name, 160), kind: pjIn_(S.supKinds, x.kind, 'نوع الحساب'), mobile: pjMob_(x.mobile, 1, 'رقم الجوال'), email: str_(x.email, 120), taxable: x.taxable ? 1 : 0, taxType: '', taxNo: '', city: str_(x.city, 80), note: str_(x.note, 800) };
  if (!v.name) throw err_('VALIDATION', 'اكتب اسم الداعم.');
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw err_('VALIDATION', 'البريد الإلكتروني غير صحيح.');
  if (v.taxable) { v.taxType = pjIn_(S.taxIds, x.taxType, 'المعرف الضريبي', 1); v.taxNo = str_(x.taxNo, 30).replace(/\s/g, ''); if (!v.taxNo) throw err_('VALIDATION', 'اكتب رقم المعرف الضريبي.'); if (/ضريبي/.test(astList_(S.taxIds, v.taxType).n) && !/^3\d{13}3$/.test(v.taxNo)) throw err_('VALIDATION', 'الرقم الضريبي 15 رقمًا يبدأ وينتهي بـ 3.'); }
  if (st.sups.some(function (y) { return y !== s && y.mobile === v.mobile; })) throw err_('VALIDATION', 'رقم الجوال مسجل لداعم آخر.');
  if (s) { Object.assign(s, v, { upd: now_() }); pjLog_(s, me, 'تحديث بيانات الحساب'); }
  else { s = Object.assign(v, { id: pjId_('s'), no: (S.sPre || '') + astPad_(S.sNext++, 6), by: me.username, at: now_(), files: [], log: [] }); pjLog_(s, me, 'إنشاء الحساب'); st.sups.unshift(s); }
  audit_(me.username, x.id ? 'تحديث حساب داعم' : 'إضافة حساب داعم', '', s.no, s.name); govSave_(org, '_prj', st); return pjOut_(st, { id: s.id });
}
function actPjSms_(me, p) {
  astCanW_(me); const org = astNeed_(), st = pjLoad_(org), text = str_(p.text, 600), ids = (Array.isArray(p.to) ? p.to : []).map(String);
  if (!text) throw err_('VALIDATION', 'اكتب نص الرسالة.'); const L = st.sups.filter(function (s) { return ids.indexOf(s.id) >= 0 && s.mobile && !s.off; });
  if (!L.length) throw err_('VALIDATION', 'اختر داعمًا واحدًا على الأقل لديه رقم جوال.');
  const m = { id: pjId_('m'), at: now_(), by: me.username, text: text, to: L.map(function (s) { return s.id; }), n: L.length, parts: Math.ceil(text.length / 70) };
  st.sms.unshift(m); if (st.sms.length > 300) st.sms.length = 300; L.forEach(function (s) { pjLog_(s, me, 'رسالة نصية', text.slice(0, 60)); });
  audit_(me.username, 'رسالة نصية للداعمين', '', '', L.length + ' داعم'); govSave_(org, '_prj', st); return pjOut_(st, { id: m.id });
}
// ===== المرشحون للتأهيل ورأي إدارة التأهيل
function actPjNeed_(me, p) {
  astCanW_(me); const org = astNeed_(), st = pjLoad_(org), S = st.set, x = p.item || {};
  let n = x.id ? astList_(st.needs, String(x.id)) : null;
  if (p.del) { if (!n) throw err_('NOTFOUND', 'السجل غير موجود.'); if (st.rh.some(function (r) { return r.need === n.id; })) throw err_('VALIDATION', 'للمرشح مشروع تأهيلي مسجل؛ لا يُحذف.'); st.needs = st.needs.filter(function (y) { return y !== n; }); govSave_(org, '_prj', st); return pjOut_(st); }
  if (p.decide) { if (!n) throw err_('NOTFOUND', 'السجل غير موجود.'); const d = String(p.decide); if (['ok', 'no', 'review'].indexOf(d) < 0) throw err_('VALIDATION', 'قرار غير معروف.'); const note = str_(p.note, 500); if (d !== 'ok' && !note) throw err_('VALIDATION', 'اكتب مبررات الرأي.');
    if (st.rh.some(function (r) { return r.need === n.id; }) && d !== 'ok') throw err_('VALIDATION', 'سُجّل للمرشح مشروع تأهيلي؛ لا يُغيَّر رأيه.');
    n.status = d; n.op = { d: d, note: note, by: me.username, at: now_(), rp: pjIn_(S.rhProjects, p.rp, 'المشروع المقترح'), amt: pjM_(p.amt || 0) || 0 }; pjLog_(n, me, 'رأي إدارة التأهيل: ' + ({ ok: 'مؤهل', no: 'غير مؤهل', review: 'يحتاج دراسة' })[d], note);
    audit_(me.username, 'رأي إدارة التأهيل', '', n.no, d); govSave_(org, '_prj', st); return pjOut_(st); }
  const v = { cat: x.cat === 'dep' ? 'dep' : 'ben', name: str_(x.name, 160), idNo: str_(x.idNo, 10).replace(/\D/g, ''), mobile: pjMob_(x.mobile, 0, 'رقم الجوال'), file: str_(x.file, 40), city: str_(x.city, 80), family: Math.max(0, parseInt(x.family, 10) || 0), income: pjM_(x.income || 0) || 0, skill: pjIn_(S.skills, x.skill, 'المهارة'), want: pjIn_(S.rhProjects, x.want, 'المشروع المرغوب'), reason: str_(x.reason, 600), note: str_(x.note, 600) };
  if (!v.name) throw err_('VALIDATION', 'اكتب الاسم.'); if (v.idNo && !/^[12]\d{9}$/.test(v.idNo)) throw err_('VALIDATION', 'رقم الهوية 10 أرقام يبدأ بـ 1 أو 2.');
  if (v.idNo && st.needs.some(function (y) { return y !== n && y.idNo === v.idNo; })) throw err_('VALIDATION', 'رقم الهوية مسجل من قبل.');
  if (n) Object.assign(n, v, { upd: now_() });
  else { n = Object.assign(v, { id: pjId_('n'), no: (S.nPre || '') + astPad_(S.nNext++, 5), status: 'need', by: me.username, at: now_(), log: [] }); pjLog_(n, me, 'ترشيح للتأهيل'); st.needs.unshift(n); }
  govSave_(org, '_prj', st); return pjOut_(st, { id: n.id });
}
// ===== مشاريع المستفيدين التأهيلية والأقساط
function actPjRh_(me, p) {
  astCanW_(me); const org = astNeed_(), st = pjLoad_(org), S = st.set, x = p.item || {};
  let r = x.id ? astList_(st.rh, String(x.id)) : null;
  if (p.del) { if (!r) throw err_('NOTFOUND', 'المشروع غير موجود.'); if ((r.inst || []).some(function (i) { return i.paid > 0; })) astAdmin_(me); st.rh = st.rh.filter(function (y) { return y !== r; }); audit_(me.username, 'حذف مشروع تأهيلي', '', r.no, r.name); govSave_(org, '_prj', st); return pjOut_(st); }
  if (p.pay) {
    if (!r) throw err_('NOTFOUND', 'المشروع غير موجود.'); const i = astList_(r.inst, String(p.pay.iid)); if (!i) throw err_('NOTFOUND', 'القسط غير موجود.');
    if (p.pay.undo) { astAdmin_(me); i.paid = 0; i.paidAt = ''; i.rcpt = ''; pjLog_(r, me, 'إلغاء سداد قسط', i.n); }
    else { const amt = pjM_(p.pay.amount), date = pjD_(p.pay, 'date', 1, 'تاريخ السداد'); if (!(amt > 0)) throw err_('VALIDATION', 'اكتب مبلغ السداد.'); if (amt > Math.round((i.amount - (i.paid || 0)) * 100) / 100 + 0.001) throw err_('VALIDATION', 'المبلغ أكبر من المتبقي على القسط.'); if (date > today_()) throw err_('VALIDATION', 'لا يكون السداد بتاريخ مستقبلي.'); if (date < r.start) throw err_('VALIDATION', 'السداد قبل بداية المشروع.');
      i.paid = Math.round(((i.paid || 0) + amt) * 100) / 100; i.paidAt = date; i.rcpt = str_(p.pay.rcpt, 40); pjLog_(r, me, 'سداد قسط ' + i.n, amt); }
    const rem = r.inst.reduce(function (s, y) { return s + y.amount - (y.paid || 0); }, 0); if (rem < 0.01 && r.status !== 'done') { r.status = 'done'; r.doneAt = today_(); } else if (rem >= 0.01 && r.status === 'done') r.status = 'run';
    govSave_(org, '_prj', st); return pjOut_(st);
  }
  const loan = function (k) { const o = astList_(S.rhKinds, k); return o && !/منحة/.test(o.n); };
  const v = {
    rp: pjIn_(S.rhProjects, x.rp, 'المشروع التأهيلي', 1), cat: x.cat === 'dep' ? 'dep' : 'ben', need: str_(x.need, 30), person: str_(x.person, 160), idNo: str_(x.idNo, 10).replace(/\D/g, ''), mobile: pjMob_(x.mobile, 0, 'جوال المستفيد'),
    kind: pjIn_(S.rhKinds, x.kind, 'نوع الدعم', 1), status: RH_ST[x.status] ? String(x.status) : 'new', name: str_(x.name, 160), place: str_(x.place, 160), value: pjM_(x.value), start: pjD_(x, 'start', 1, 'تاريخ البداية'), end: pjD_(x, 'end', 1, 'تاريخ النهاية'),
    desc: str_(x.desc, 1500), note: str_(x.note, 800), g: { name: str_((x.g || {}).name, 160), idNo: str_((x.g || {}).idNo, 10).replace(/\D/g, ''), mobile: str_((x.g || {}).mobile, 12).replace(/\D/g, ''), job: str_((x.g || {}).job, 100) }, prj: str_(x.prj, 30)
  };
  if (v.need) { const n = astList_(st.needs, v.need); if (!n) throw err_('VALIDATION', 'ملف المرشح غير موجود.'); if (n.status !== 'ok') throw err_('VALIDATION', 'المرشح لم يُعتمد مؤهلًا من إدارة التأهيل.'); v.person = n.name; v.idNo = v.idNo || n.idNo; v.mobile = v.mobile || n.mobile; v.cat = n.cat; if (st.rh.some(function (y) { return y !== r && y.need === n.id && y.status !== 'done'; })) throw err_('VALIDATION', 'للمستفيد مشروع تأهيلي قائم.'); }
  if (!v.person) throw err_('VALIDATION', 'اختر ملف المستفيد أو التابع.'); if (!v.name) throw err_('VALIDATION', 'اكتب اسم المشروع.'); if (!v.place) throw err_('VALIDATION', 'اكتب مكان المشروع.');
  if (!(v.value > 0)) throw err_('VALIDATION', 'اكتب قيمة المشروع.'); if (v.end < v.start) throw err_('VALIDATION', 'تاريخ النهاية قبل تاريخ البداية.');
  if (v.prj && !astList_(st.projects, v.prj)) throw err_('VALIDATION', 'مشروع التمويل غير موجود.');
  const isLoan = loan(v.kind);
  if (isLoan) { if (!v.g.name) throw err_('VALIDATION', 'اكتب اسم الكافل.'); if (!/^[12]\d{9}$/.test(v.g.idNo)) throw err_('VALIDATION', 'رقم هوية الكافل 10 أرقام.'); pjMob_(v.g.mobile, 1, 'جوال الكافل'); }
  const old = r ? r.inst || [] : [], src = Array.isArray(x.inst) ? x.inst : [];
  const inst = src.slice(0, 120).map(function (i, k) { const o = astList_(old, String(i.id || '')); const a = pjM_(i.amount), d = pjD_(i, 'due', 1, 'استحقاق القسط ' + (k + 1)); if (!(a > 0)) throw err_('VALIDATION', 'مبلغ القسط ' + (k + 1) + ' غير صحيح.'); if (o && (o.paid || 0) > a + 0.001) throw err_('VALIDATION', 'مبلغ القسط ' + (k + 1) + ' أقل من المسدد منه.'); return { id: o ? o.id : pjId_('q'), n: k + 1, due: d, amount: a, paid: o ? o.paid || 0 : 0, paidAt: o ? o.paidAt || '' : '', rcpt: o ? o.rcpt || '' : '' }; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
  inst.forEach(function (i, k) { i.n = k + 1; });
  old.forEach(function (o) { if ((o.paid || 0) > 0 && !inst.some(function (i) { return i.id === o.id; })) throw err_('VALIDATION', 'لا يُحذف قسط مسدد.'); });
  if (isLoan) { if (!inst.length) throw err_('VALIDATION', 'أضف جدول الأقساط للقرض.'); const sum = Math.round(inst.reduce(function (s, i) { return s + i.amount; }, 0) * 100) / 100; if (Math.abs(sum - v.value) > 0.01) throw err_('VALIDATION', 'مجموع الأقساط (' + sum + ') لا يساوي قيمة المشروع (' + v.value + ').'); if (inst[0].due < v.start) throw err_('VALIDATION', 'أول قسط قبل بداية المشروع.'); }
  else if (inst.length) throw err_('VALIDATION', 'المنحة لا تحتاج أقساطًا؛ احذف جدول الأقساط.');
  v.inst = inst;
  if (r) { Object.assign(r, v, { upd: now_() }); pjLog_(r, me, 'تحديث المشروع التأهيلي'); }
  else { r = Object.assign(v, { id: pjId_('h'), no: (S.rPre || '') + astPad_(S.rNext++, 5), by: me.username, at: now_(), files: [], log: [] }); pjLog_(r, me, 'تسجيل مشروع مستفيد'); st.rh.unshift(r); if (v.need) { const n = astList_(st.needs, v.need); pjLog_(n, me, 'سُجّل له مشروع ' + r.no); } }
  audit_(me.username, x.id ? 'تحديث مشروع تأهيلي' : 'تسجيل مشروع تأهيلي', '', r.no, r.name); govSave_(org, '_prj', st); return pjOut_(st, { id: r.id });
}
// ===== الإعدادات
function actPjSet_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = pjLoad_(org), x = p.set || {}, s = st.set;
  const lst = function (L) { return (Array.isArray(L) ? L : []).slice(0, 200).map(function (o, i) { return { id: str_(String(o.id || ''), 20).replace(/[^A-Za-z0-9_-]/g, '') || ('x' + i + Date.now().toString(36)), n: str_(String(o.n || ''), 120), reg: str_(String(o.reg || ''), 20), c: /^#[0-9a-f]{6}$/i.test(String(o.c || '')) ? String(o.c) : '' }; }).filter(function (o) { return o.n; }); };
  const used = { types: [['projects', 'type']], targets: [['projects', 'target']], regions: [['projects', 'region']], villages: [['projects', 'village']], managers: [['projects', 'manager'], ['tasks', 'owner']], supKinds: [['sups', 'kind']], taxIds: [['sups', 'taxType']], rhProjects: [['rh', 'rp'], ['needs', 'want']], rhKinds: [['rh', 'kind']], skills: [['needs', 'skill']] };
  Object.keys(used).forEach(function (k) { if (!x[k]) return; const v = lst(x[k]); s[k].forEach(function (o) { if (!v.some(function (y) { return y.id === o.id; }) && used[k].some(function (u) { return st[u[0]].some(function (r) { return r[u[1]] === o.id; }); })) throw err_('VALIDATION', '«' + o.n + '» مستخدم؛ لا يُحذف.'); }); s[k] = v; });
  ['orgName', 'smsSign'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 160); });
  ['pPre', 'sPre', 'rPre', 'nPre'].forEach(function (k) { if (x[k] != null) s[k] = str_(String(x[k]), 8); });
  ['pNext', 'sNext', 'rNext', 'nNext'].forEach(function (k) { const n = parseInt(x[k], 10); if (n > 0 && n < 1e9) s[k] = n; });
  if (x.warnPct != null) s.warnPct = Math.max(50, Math.min(100, parseInt(x.warnPct, 10) || 85)); if (x.graceDays != null) s.graceDays = Math.max(0, Math.min(90, parseInt(x.graceDays, 10) || 0));
  audit_(me.username, 'إعدادات المشاريع', '', '', ''); govSave_(org, '_prj', st); return pjOut_(st);
}
function actPjUpload_(me, p) {
  astCanW_(me); const org = astNeed_(), st = pjLoad_(org), K = { prj: 'projects', sup: 'sups', rh: 'rh' }[p.kind]; if (!K) throw err_('VALIDATION', 'نوع غير معروف.');
  const t = astList_(st[K], String(p.id || '')); if (!t) throw err_('NOTFOUND', 'العنصر غير موجود.');
  const name = str_(p.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'مستند', mime = String(p.mime || '');
  if (GOV_TYPES.indexOf(mime) < 0) throw err_('VALIDATION', 'الأنواع المسموحة: PDF وWord وExcel وصور JPG/PNG/WEBP.');
  const bytes = Utilities.base64Decode(String(p.data || '')); if (!bytes.length) throw err_('VALIDATION', 'الملف فارغ.'); if (bytes.length > MAX_FILE * 2) throw err_('VALIDATION', 'حجم الملف أكبر من 10 ميجابايت.');
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, 'مشاريع — ' + name)), fid = Utilities.getUuid();
  sheet_('files').appendRow([fid, 'prj:' + org + ':' + t.id, name, mime, bytes.length, file.getId(), me.username, now_()]);
  t.files = t.files || []; t.files.unshift({ fid: fid, name: name, mime: mime, size: bytes.length, at: now_(), by: me.username, tag: str_(p.tag, 40) }); t.files = t.files.slice(0, 25);
  govSave_(org, '_prj', st); return pjOut_(st);
}
function actPjFile_(me, p) {
  const org = astNeed_(); if (me.role === 'viewer') throw err_('FORBIDDEN', 'صلاحية المشاهد لا تشمل تنزيل المستندات.');
  const row = findRow_('files', String(p.fid || '')); if (!row) throw err_('NOTFOUND', 'الملف غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  if (String(v[1]).indexOf('prj:' + org + ':') !== 0) throw err_('FORBIDDEN', 'غير مسموح.');
  return { name: String(v[2]), mime: String(v[3]), data: Utilities.base64Encode(DriveApp.getFileById(String(v[5])).getBlob().getBytes()) };
}
function actPjSamples_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = pjLoad_(org), S = st.set;
  if (p.clear) { ['projects', 'ledger', 'tasks', 'kpis', 'acts', 'sups', 'needs', 'rh', 'sms'].forEach(function (k) { st[k] = st[k].filter(function (x) { return !x.sample; }); }); ['managers', 'villages'].forEach(function (k) { S[k] = S[k].filter(function (x) { return !x.sample; }); }); govSave_(org, '_prj', st); return pjOut_(st); }
  if (st.projects.some(function (x) { return x.sample; })) throw err_('VALIDATION', 'البيانات التوضيحية مضافة من قبل.');
  const d = function (n) { const x = new Date(); x.setDate(x.getDate() + n); return Utilities.formatDate(x, 'Asia/Riyadh', 'yyyy-MM-dd'); }, ts = Date.now().toString(36);
  const M = ['أ. سامي العتيبي', 'أ. هدى الزهراني', 'أ. فهد القحطاني', 'أ. ريم الشهري'].map(function (n, i) { const o = { id: 'sm' + i + ts, n: n, sample: true }; S.managers.push(o); return o.id; });
  const reg0 = (S.regions[0] || {}).id, V = ['أبحر الجنوبية', 'الصفا', 'النسيم', 'الروضة'].map(function (n, i) { const o = { id: 'sv' + i + ts, n: n, reg: reg0, sample: true }; S.villages.push(o); return o.id; });
  const T = function (k) { return (S.types[k] || S.types[0]).id; }, G = function (k) { return (S.targets[k] || S.targets[0]).id; };
  const sup = [['معالي منصور بن إسحاق بن يوسف', 0, '0552241863'], ['شركة الخير للتجارة', 1, '0568860688'], ['صندوق دعم الجمعيات', 4, '0540251565'], ['فاعل خير', 0, '0504667075'], ['مؤسسة البر الخيرية', 3, '0541711532']].map(function (r, i) { const o = { id: pjId_('s'), no: (S.sPre || '') + astPad_(S.sNext++, 6), name: r[0], kind: (S.supKinds[r[1]] || {}).id || '', mobile: r[2], email: i === 1 ? 'info@example.com' : '', taxable: i === 1 ? 1 : 0, taxType: i === 1 ? (S.taxIds[0] || {}).id : '', taxNo: i === 1 ? '300000000000003' : '', city: 'جدة', note: '', by: me.username, at: now_(), files: [], log: [], sample: true }; st.sups.push(o); return o.id; });
  const P = [['أوقاف الجمعية', 1, 6, 'run', -120, 240, 250000, 0], ['التوصيل المدرسي', 2, 5, 'run', -60, 120, 80000, 1], ['السلة الغذائية الشهرية', 0, 0, 'run', -90, 30, 150000, 2], ['الحقيبة المدرسية', 2, 5, 'run', -30, 15, 45000, 3], ['مصروف الفسحة المدرسية', 2, 0, 'hold', -45, 60, 30000, 1], ['فرحة العيد', 0, 0, 'run', -20, 10, 60000, 4], ['سقيا الماء', 4, 0, 'plan', 10, 70, 40000, 2], ['سقيا المعتمرين والحجاج', 4, 6, 'done', -200, -20, 90000, 0], ['تأثيث منزل المحتاجين', 0, 0, 'run', -15, 75, 70000, 3], ['تفريج كربة', 0, 2, 'run', -100, 20, 35000, 1]];
  const ids = P.map(function (r, i) { const pr = { id: pjId_('p'), no: (S.pPre || '') + astPad_(S.pNext++, 6), name: r[0], type: T(r[1]), target: G(r[2]), region: reg0, village: V[i % V.length], manager: M[i % M.length], status: r[3], budget: r[6], start: d(r[4]), end: d(r[5]), goal: 'خدمة ' + (S.targets[r[2]] || {}).n + ' وتحقيق أثر مستدام.', desc: 'مشروع ' + r[0] + ' ضمن خطة الجمعية السنوية.', place: 'جدة', bens: 20 + i * 15, donor: sup[r[7]], partners: '', note: '', color: '', by: me.username, at: now_(), files: [], log: [{ at: now_(), by: me.username, act: 'إنشاء المشروع', note: '' }], sample: true, doneAt: r[3] === 'done' ? d(r[5]) : '' }; st.projects.push(pr); return pr; });
  ids.forEach(function (pr, i) {
    const inn = Math.round(pr.budget * (0.45 + (i % 4) * 0.15)), out = Math.round(inn * (pr.status === 'plan' ? 0 : 0.35 + (i % 3) * 0.2));
    st.ledger.push({ id: pjId_('l'), no: 'L' + astPad_(st.ledger.length + 1, 5), pid: pr.id, kind: 'in', amount: inn, date: d(Math.min(-1, -50 + i * 3)), note: 'تبرع لمشروع', ref: '', src: '', by: me.username, at: now_(), sample: true });
    if (out) st.ledger.push({ id: pjId_('l'), no: 'L' + astPad_(st.ledger.length + 1, 5), pid: pr.id, kind: 'out', amount: out, date: d(Math.min(-1, -20 + i)), note: 'صرف على المشروع', ref: '', src: '', by: me.username, at: now_(), sample: true });
    const ph = [['prep', 'دراسة الاحتياج وتحديد المستفيدين', 0, 0.15], ['plan', 'إعداد الخطة والميزانية', 0.12, 0.3], ['exec', 'التعاقد والتوريد', 0.28, 0.55], ['exec', 'التنفيذ والتوزيع', 0.5, 0.85], ['ctrl', 'المتابعة الميدانية', 0.3, 0.95], ['close', 'التقييم والتقرير الختامي', 0.9, 1]];
    const s0 = new Date(pr.start), len = (new Date(pr.end) - s0) / 864e5, T0 = today_(); let prev = '';
    ph.forEach(function (h, k) { const a = new Date(s0.getTime() + Math.round(len * h[2]) * 864e5), b = new Date(s0.getTime() + Math.round(len * h[3]) * 864e5), A = Utilities.formatDate(a, 'Asia/Riyadh', 'yyyy-MM-dd'), B = Utilities.formatDate(b, 'Asia/Riyadh', 'yyyy-MM-dd');
      const stt = pr.status === 'done' || B < T0 ? (k === 4 && i % 3 === 0 && pr.status !== 'done' ? 'review' : 'done') : A <= T0 ? 'doing' : 'todo';
      const t = { id: pjId_('k'), pid: pr.id, title: h[1], phase: h[0], owner: M[(i + k) % M.length], start: A, end: B, st: stt, pct: stt === 'done' ? 100 : stt === 'review' ? 90 : stt === 'doing' ? 30 + (i * 7 + k * 11) % 50 : 0, w: k === 3 ? 3 : k === 2 ? 2 : 1, prio: k === 3 ? 'high' : 'mid', ms: k === 5 ? 1 : 0, dep: k === 1 || k === 2 || k === 3 ? prev : '', note: '', by: me.username, at: now_(), doneAt: stt === 'done' ? B : '', sample: true };
      if (k !== 4) prev = t.id; st.tasks.push(t); });
    [['عدد المستفيدين', 'مستفيد', pr.bens, Math.round(pr.bens * (0.4 + (i % 5) * 0.15))], ['نسبة رضا المستفيدين', '%', 90, 70 + (i * 3) % 25], ['الالتزام بالميزانية', '%', 100, 80 + (i * 5) % 30]].forEach(function (k) { st.kpis.push({ id: pjId_('i'), pid: pr.id, n: k[0], unit: k[1], base: 0, target: k[2], actual: k[3], dir: 'up', freq: 'شهري', src: 'تقارير المتابعة', at: now_(), hist: [{ at: today_(), v: k[3] }], sample: true }); });
    st.acts.push({ id: pjId_('a'), pid: pr.id, kind: 'ben', title: 'إلحاق دفعة مستفيدين', date: d(-10 + i), count: 10 + i * 3, note: '', by: me.username, at: now_(), sample: true });
  });
  const NN = [['نورة سعيد', 'ben', '1023456781', '0551112233', 0, 0, 'ok'], ['أم خالد الحربي', 'ben', '1034567892', '0552223344', 1, 1, 'ok'], ['سالم محمد', 'dep', '1045678903', '0553334455', 2, 2, 'ok'], ['فاطمة علي', 'ben', '1056789014', '0554445566', 3, 3, 'need'], ['عبدالله ناصر', 'dep', '1067890125', '0555556677', 4, 4, 'review'], ['منيرة أحمد', 'ben', '1078901236', '0556667788', 0, 5, 'no']].map(function (r) { const n = { id: pjId_('n'), no: (S.nPre || '') + astPad_(S.nNext++, 5), cat: r[1], name: r[0], idNo: r[2], mobile: r[3], file: '', city: 'جدة', family: 3 + (r[4] % 4), income: 1500 + r[4] * 400, skill: (S.skills[r[4]] || {}).id || '', want: (S.rhProjects[r[5]] || {}).id || '', reason: 'دخل غير كافٍ ورغبة في مشروع منتج.', note: '', status: r[6], op: r[6] === 'need' ? null : { d: r[6], note: r[6] === 'ok' ? 'تتوفر المهارة والجدية.' : r[6] === 'no' ? 'لا تتوفر المهارة المطلوبة حاليًا.' : 'يحتاج زيارة ميدانية.', by: me.username, at: now_(), rp: (S.rhProjects[r[5]] || {}).id || '', amt: 0 }, by: me.username, at: now_(), log: [], sample: true }; st.needs.push(n); return n; });
  const loan = (S.rhKinds[0] || {}).id, grant = ((S.rhKinds.filter(function (k) { return /منحة/.test(k.n); })[0]) || S.rhKinds[1] || {}).id;
  [[0, loan, 12000, -200, 12, 'مشغل خياطة منزلي'], [1, loan, 9000, -120, 9, 'عربة طعام'], [2, grant, 6000, -60, 0, 'صيانة جوالات']].forEach(function (r, k) {
    const n = NN[r[0]], v = r[2], cnt = r[4], inst = [];
    for (let j = 0; j < cnt; j++) { const due = d(r[3] + 30 * (j + 1)), amt = Math.round(v / cnt * 100) / 100 + (j === cnt - 1 ? Math.round((v - Math.round(v / cnt * 100) / 100 * cnt) * 100) / 100 : 0); const paidOk = due < today_() && !(k === 1 && j >= 2); inst.push({ id: pjId_('q'), n: j + 1, due: due, amount: amt, paid: paidOk ? amt : 0, paidAt: paidOk ? due : '', rcpt: '' }); }
    st.rh.push({ id: pjId_('h'), no: (S.rPre || '') + astPad_(S.rNext++, 5), rp: n.op.rp, cat: n.cat, need: n.id, person: n.name, idNo: n.idNo, mobile: n.mobile, kind: r[1], status: 'run', name: r[5], place: 'جدة - ' + ['الصفا', 'النسيم', 'الروضة'][k], value: v, start: d(r[3]), end: d(r[3] + 30 * Math.max(cnt, 3) + 10), desc: '', note: '', g: cnt ? { name: 'كافل ' + (k + 1), idNo: '10' + astPad_(12345670 + k, 8), mobile: '055000000' + k, job: 'موظف' } : { name: '', idNo: '', mobile: '', job: '' }, prj: '', inst: inst, by: me.username, at: now_(), files: [], log: [], sample: true });
  });
  audit_(me.username, 'إضافة بيانات توضيحية للمشاريع', '', '', ''); govSave_(org, '_prj', st); return pjOut_(st);
}
function pjSum_(org) {
  const st = pjLoad_(org), T = today_(), P = st.projects.filter(function (p) { return !p.deleted; });
  const pct = function (p) { const L = st.tasks.filter(function (t) { return t.pid === p.id; }); const W = L.reduce(function (s, t) { return s + (t.w || 1); }, 0); return W ? L.reduce(function (s, t) { return s + (t.w || 1) * (t.pct || 0); }, 0) / W : 0; };
  return { total: P.length, run: P.filter(function (p) { return p.status === 'run'; }).length, done: P.filter(function (p) { return p.status === 'done'; }).length, late: P.filter(function (p) { return p.status !== 'done' && p.end < T && pct(p) < 100; }).length,
    bal: Math.round(P.reduce(function (s, p) { return s + pjBal_(st, p.id); }, 0) * 100) / 100, sups: st.sups.length, rh: st.rh.length, rlate: st.rh.reduce(function (s, r) { return s + (r.inst || []).filter(function (i) { return i.due < T && (i.paid || 0) < i.amount - 0.009; }).length; }, 0) };
}

/* ================= الموقع الإلكتروني والعلاقات العامة والتواصل الخارجي (4.22) ================= */
const WS_SPEC = {
  menu: { title: 't!', icon: 'i', link: 'u!', img: 'img', subs: 'L:t,link' },
  slider: { img: 'img!', title: 't', body: 'ta', ref: 't', link: 'u', btns: 'L:t,link' },
  counters: { title: 't!', icon: 'i!', num: 'n!', word: 't' },
  about: { title: 't!', body: 'r!', img: 'img' },
  news: { title: 't!', date: 'd!', sum: 'ta', body: 'r!', cover: 'img', album: 'imgs' },
  albums: { title: 't!', sum: 'ta', body: 'r', imgs: 'imgs' },
  videos: { title: 't!', yt: 'yt!' },
  partners: { title: 't', logo: 'img!', site: 'u' },
  policies: { title: 't!', file: 'f!' },
  reports: { title: 't!', year: 'n', file: 'f!' },
  initiatives: { title: 't!', date: 'd!', body: 'r!', goals: 'r', how: 'r', cover: 'img', rep: 'f', imgs: 'imgs' },
  testimonials: { name: 't!', job: 't', body: 'ta!', img: 'img' },
  services: { title: 't!', icon: 'i!', link: 'u!' },
  links: { title: 't!', url: 'u!', icon: 'i' },
  popups: { title: 't!', body: 'ta', img: 'img', link: 'u', d1: 'd', d2: 'd', on: 'b' },
  contests: { title: 't!', body: 'r', d1: 'd!', d2: 'd!', prize: 't', parts: 'L:n,mobile' },
  formpages: { title: 't!', desc: 'ta', fields: 'L:label,type,req', on: 'b' },
  inbox: { kind: 's!', form: 't', name: 't!', mobile: 'm', email: 'e', subject: 't', body: 'ta', st: 's' },
  shortlinks: { code: 't!', url: 'u!' },
  templates: { name: 't!', h1: 't', h1c: 'c', h2: 't', h2c: 'c', links: 'L:t,link', ts: 's', cs: 's', ss: 's', ds: 's' },
  pages: { title: 't!', desc: 'ta', hidden: 'b' },
  fonts: { name: 't!', items: 'L:family,url,weight' },
  accounts: { name: 't!', mobile: 'm!', email: 'e', pw: 'pw', off: 'b', ben: 't', spon: 't', donor: 't', member: 't', vol: 't', emp: 't', student: 't' },
  visits: { cat: 's!', side: 's!', title: 't!', place: 't!', date: 'd!', dur: 't', goal: 'ta', results: 'ta', team: 'tags!', notes: 'ta', imgs: 'imgs', files: 'fs' },
  partnerships: { side: 's!', name: 't!', d1: 'd!', d2: 'd!', desc: 'ta', results: 'ta', notes: 'ta', imgs: 'imgs', files: 'fs', dept: 't', fwd: 't', emp: 't' },
  events: { name: 't!', place: 't!', d1: 'd!', d2: 'd!', goal: 'ta', parties: 'ta', role: 'ta', results: 'ta', notes: 'ta', imgs: 'imgs', files: 'fs' },
  smslists: { title: 't!', nums: 'nums!' },
  msgs: { title: 't!', sms: 'b', email: 'b', push: 'b', wa: 'b', txt: 'ta' }
};
const WS_PAGES = ['نبذة عنا', 'اتصل بنا', 'حسابات الأعضاء', 'البوم الفيديو', 'سياسة الخصوصية', 'مكتبة الصور', 'الأخبار', 'البث المباشر', 'الوظائف', 'اللوائح والسياسات', 'التقرير السنوي', 'الفرص التطوعية', 'المسابقات', 'طلب متطوعين', 'المبادرات', 'الحالات', 'المشاريع', 'الشركاء', 'الخدمات الإلكترونية', 'صفحة التبرعات', 'حاسبة الزكاة', 'طلب إعانة', 'طلب تسجيل كمستفيد', 'أدلة الحوكمة', 'التزكيات', 'تبرعات البرامج', 'تسجيل البرامج', 'التبرعات العامة', 'فرص التبرع', 'التبرعات الخارجية', 'الحلقات التعليمية', 'التعازي', 'إبلاغ عن وفاة', 'فرص التبرع العينية', 'طلبات التبرع', 'طلب استلام تبرع', 'التحقق من المستندات', 'إنشاء طلب لجهة', 'طلب تسجيل جهة', 'قوالب المسابقات', 'مكاتب التحفيظ', 'مراكز التحفيظ', 'مدارس التحفيظ', 'خريطة حلقات الجمعية'];
const WS_MSGS = [['قبول طلب الانضمام لبرنامج مدفوع'], ['تسجيل بلاغ جنازة'], ['فعاليات البرامج'], ['محضر اجتماع', 1, 1], ['حضور اجتماع', 1, 1], ['طلب تحديث ذاتي لملف مستفيد'], ['القسائم الشرائية'], ['سداد اشتراك جمعية عمومية'], ['سداد رسوم اشتراك برنامج قيد المراجعة', 1], ['سداد رسوم اشتراك برنامج', 1], ['قبول طلب الانضمام لبرنامج', 1], ['رفض طلب الانضمام لبرنامج', 1], ['تسليم كفالة متجر خارجي', 1], ['كود القسائم الشرائية'], ['قبول طلب إعانة من الموقع'], ['قبول ملف مستفيد من الموقع'], ['تسليم كفالة عينية', 1], ['رفض طلب إعانة من الموقع', 1], ['رفض التحديث الذاتي', 1], ['رفض طلب تسجيل مستفيد من الموقع', 1]];
function wsDefaults_() {
  const M = { on: true, note: '' }, mt = function (rep) { return { e: Object.assign({}, M), bank: Object.assign({}, M), rep: { on: !!rep, note: '' }, hq: Object.assign({}, M), wallet: Object.assign({}, M) }; };
  return {
    orgName: '',
    site: { status: 'on', title: '', maint: 'الموقع تحت الصيانة، نعود قريبًا بإذن الله.', regAcc: true, regBen: false, regAid: false, privacy: '', terms: '', refund: '' },
    store: { pay: true, btn: 'تبرع الآن', minAmt: 10, matrix: { don: mt(0), prg: mt(1), mem: mt(0), spon: mt(0), zak: mt(0) }, confMsg: 'شكرًا لك، تم استلام تبرعك بنجاح وسيصلك الإيصال.', confSms: true, confMail: true, mobReq: true, gift: true, giftMobReq: true, quick: true, quickPrj: 'سهم التشغيل', zakat: false, inkind: false },
    seo: { title: '', desc: '', keys: '', author: '', ogImg: null, sitemap: '', robots: 'User-agent: *\nAllow: /\nDisallow: /system/' },
    social: { mode: 'direct', ga: '', meta: '', snap: '', tiktok: '', xpx: '', gtm: '', x: '', insta: '', yt: '', wa: '', snapAcc: '', tiktokAcc: '', linkedin: '', fb: '', tg: '' },
    design: { primary: '#4d341a', secondary: '#4d3400', accent: '#0e7a5f', dark: 0.35, light: 0.85, radius: 14, font: 'IBM Plex Sans Arabic', btn: 'pill', home: ['slider', 'counters', 'services', 'projects', 'news', 'initiatives', 'testimonials', 'partners'], theme: '' },
    visitCats: ['شركات ومؤسسات', 'جهات حكومية', 'جمعيات خيرية', 'جهات تعليمية', 'أفراد ومتبرعون'], partnerCats: ['شركات ومؤسسات', 'جهات حكومية', 'جمعيات ومؤسسات أهلية', 'جهات تعليمية', 'جهات صحية'], teams: [], depts: ['إدارة الأوقاف', 'العلاقات العامة', 'الموارد المالية', 'البرامج والمشاريع'], roles: ['مدير الإدارة', 'المدير التنفيذي', 'منسق الشراكات']
  };
}
function wsMerge_(def, val) { if (Array.isArray(def)) return Array.isArray(val) ? val : def; if (def && typeof def === 'object') { const o = {}; Object.keys(def).forEach(function (k) { o[k] = val && Object.prototype.hasOwnProperty.call(val, k) ? wsMerge_(def[k], val[k]) : def[k]; }); return o; } return val == null ? def : val; }
function wsLoad_(org) {
  const st = govLoad_(org, '_web'); st.set = wsMerge_(wsDefaults_(), st.set || {}); st.c = st.c || {}; st.seq = st.seq || {}; st.sms = st.sms || [];
  Object.keys(WS_SPEC).forEach(function (k) { st.c[k] = st.c[k] || []; });
  if (!st.c.pages.length) st.c.pages = WS_PAGES.map(function (n, i) { return { id: 'pg' + i, no: i + 1, page: n, title: n, desc: '', hidden: false, ord: i }; });
  if (!st.seeded) { st.seeded = 1; st.c.msgs = WS_MSGS.map(function (r, i) { return { id: 'mg' + i, no: i + 1, title: r[0], sms: !!r[1], email: !!r[2], push: false, wa: false, txt: '', ord: i }; }); }
  return st;
}
function wsOut_(st, extra) { const c = {}; Object.keys(st.c).forEach(function (k) { c[k] = k === 'accounts' ? st.c[k].map(function (a) { const o = Object.assign({}, a); delete o.pwh; delete o.salt; o.hasPw = !!a.pwh; return o; }) : st.c[k]; }); const o = { set: st.set, c: c, sms: st.sms }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
function wsClean_(h) {
  return String(h || '').slice(0, 60000).replace(/<\s*(script|style|iframe|object|embed|form|button|textarea|select)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '').replace(/<\s*\/?\s*(script|style|iframe|object|embed|form|input|button|meta|link|base|textarea|select)\b[^>]*>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href|src)\s*=\s*("|')\s*(javascript|vbscript|data:text)[^"']*\2/gi, '$1="#"');
}
function wsFileMeta_(v) { if (!v || typeof v !== 'object') return null; const fid = str_(v.fid, 60); if (!fid) return null; return { fid: fid, name: str_(v.name, 160), mime: str_(v.mime, 120), size: Math.max(0, parseInt(v.size, 10) || 0) }; }
function wsVal_(type, v, lbl) {
  switch (type) {
    case 't': case 's': return str_(v == null ? '' : String(v), 300).trim();
    case 'ta': return str_(v == null ? '' : String(v), 4000);
    case 'r': return wsClean_(v);
    case 'i': return str_(String(v || ''), 30).replace(/[^A-Za-z0-9_-]/g, '');
    case 'n': { if (v === '' || v == null) return ''; const n = Number(v); if (!isFinite(n)) throw err_('VALIDATION', lbl + ': رقم غير صحيح.'); return n; }
    case 'b': return !!v && v !== '0' && v !== 'false';
    case 'c': return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : '';
    case 'd': { const s = str_(v, 10); if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw err_('VALIDATION', lbl + ': تاريخ غير صحيح.'); return s; }
    case 'u': { const s = str_(String(v || ''), 500).trim(); if (s && !/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(s)) throw err_('VALIDATION', lbl + ': الرابط يبدأ بـ https:// أو /.'); return s; }
    case 'yt': { const s = str_(String(v || ''), 300).trim(); if (s && !/^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{6,}/i.test(s)) throw err_('VALIDATION', 'رابط يوتيوب غير صحيح.'); return s; }
    case 'm': { const s = String(v || '').replace(/\D/g, ''); if (s && !/^05\d{8}$/.test(s)) throw err_('VALIDATION', lbl + ': الجوال 10 أرقام يبدأ بـ 05.'); return s; }
    case 'e': { const s = str_(String(v || ''), 120).trim(); if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw err_('VALIDATION', lbl + ': بريد غير صحيح.'); return s; }
    case 'img': case 'f': return wsFileMeta_(v);
    case 'imgs': case 'fs': return (Array.isArray(v) ? v : []).slice(0, 40).map(wsFileMeta_).filter(Boolean);
    case 'tags': return (Array.isArray(v) ? v : String(v || '').split(/[\n،,]/)).map(function (x) { return str_(String(x), 100).trim(); }).filter(Boolean).slice(0, 60);
    case 'nums': { const L = (Array.isArray(v) ? v : String(v || '').split(/[\s,،;]+/)).map(function (x) { return String(x).replace(/\D/g, '').replace(/^9665/, '05').replace(/^5(\d{8})$/, '05$1'); }).filter(Boolean); const bad = L.filter(function (x) { return !/^05\d{8}$/.test(x); }); if (bad.length) throw err_('VALIDATION', 'أرقام غير صحيحة: ' + bad.slice(0, 5).join('، ')); const u = []; L.forEach(function (x) { if (u.indexOf(x) < 0) u.push(x); }); return u.slice(0, 20000); }
    default: if (type.indexOf('L:') === 0) { const ks = type.slice(2).split(','); return (Array.isArray(v) ? v : []).slice(0, 100).map(function (o) { const r = {}; ks.forEach(function (k) { r[k] = k === 'link' || k === 'url' ? wsVal_('u', o && o[k], lbl) : k === 'mobile' ? wsVal_('m', o && o[k], 'جوال المشارك') : k === 'req' ? !!(o && o[k]) : str_(String((o && o[k]) || ''), 300).trim(); }); return r; }).filter(function (r) { return ks.some(function (k) { return r[k] && r[k] !== true; }); }); }
      return '';
  }
}
function wsEmpty_(v) { return v == null || v === '' || (Array.isArray(v) && !v.length) || v === false; }
function wsCol_(c) { if (!WS_SPEC[c]) throw err_('VALIDATION', 'قسم غير معروف.'); return WS_SPEC[c]; }
const WS_LBL = { title: 'العنوان', name: 'الاسم', link: 'الرابط', url: 'الرابط', img: 'الصورة', logo: 'الشعار', icon: 'الرمز', num: 'العدد', body: 'المحتوى', date: 'التاريخ', yt: 'رابط يوتيوب', file: 'الملف', d1: 'تاريخ البداية', d2: 'تاريخ النهاية', kind: 'النوع', code: 'الرمز المختصر', mobile: 'رقم الجوال', cat: 'تصنيف الزيارة', side: 'الجهة', place: 'المكان', team: 'فريق الزيارة', nums: 'الأرقام' };
function actWsGet_(me) {
  if (!CUR_ORG || CUR_ORG === '*') { if (!isPlatformMember_(me)) throw err_('FORBIDDEN', 'غير مسموح.'); const orgs = loadOrgs_().filter(function (o) { return o.status !== 'archived'; }); const out = { all: 1, orgs: orgs.map(function (o) { return { id: o.id, code: o.code, name: o.name }; }), c: {}, sms: [] }; let set = null;
    orgs.forEach(function (o) { const st = wsOut_(wsLoad_(o.id)); if (!set) set = st.set; Object.keys(st.c).forEach(function (k) { out.c[k] = (out.c[k] || []).concat(st.c[k].map(function (r) { return Object.assign({}, r, { __o: o.id, __on: o.name }); })); }); st.sms.forEach(function (m) { out.sms.push(Object.assign({}, m, { __o: o.id, __on: o.name })); }); });
    out.set = set || wsDefaults_(); out.set.orgName = 'كل مؤسسات المنصة'; return out; }
  const org = astNeed_(), st = wsLoad_(org); if (!st.set.orgName) st.set.orgName = String(getSettings_().orgName || ''); return wsOut_(st);
}
function actWsSave_(me, p) {
  astCanW_(me); const org = astNeed_(), st = wsLoad_(org), col = String(p.col || ''), S = wsCol_(col), L = st.c[col], x = p.item || {};
  let r = x.id ? astList_(L, String(x.id)) : null;
  if (p.del) { if (!r) throw err_('NOTFOUND', 'السجل غير موجود.'); if (col === 'pages') throw err_('VALIDATION', 'الصفحات المدمجة لا تُحذف؛ يمكن إخفاؤها.'); st.c[col] = L.filter(function (y) { return y !== r; }); audit_(me.username, 'حذف من الموقع', col, String(r.no || ''), String(r.title || r.name || '')); govSave_(org, '_web', st); return wsOut_(st); }
  if (p.order) { const ids = (Array.isArray(p.order) ? p.order : []).map(String); ids.forEach(function (id, i) { const y = astList_(L, id); if (y) y.ord = i; }); L.sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); }); govSave_(org, '_web', st); return wsOut_(st); }
  if (p.status != null) { if (!r) throw err_('NOTFOUND', 'السجل غير موجود.'); if (col === 'inbox') { if (['new', 'read', 'done'].indexOf(p.status) < 0) throw err_('VALIDATION', 'حالة غير معروفة.'); r.st = p.status; } else if ('on' in S || 'hidden' in S || 'off' in S) { const k = 'on' in S ? 'on' : 'hidden' in S ? 'hidden' : 'off'; r[k] = !!p.status; } else if (col === 'msgs') { const ch = String(p.ch || ''); if (['sms', 'email', 'push', 'wa'].indexOf(ch) < 0) throw err_('VALIDATION', 'قناة غير معروفة.'); r[ch] = !!p.status; } govSave_(org, '_web', st); return wsOut_(st); }
  if (!r && col === 'pages') throw err_('VALIDATION', 'الصفحات المدمجة ثابتة؛ عدّل الموجود فقط.');
  const v = {};
  Object.keys(S).forEach(function (k) { const t = S[k].replace('!', ''), req = S[k].slice(-1) === '!', lbl = WS_LBL[k] || k; if (t === 'pw') return; v[k] = wsVal_(t, x[k], lbl); if (req && wsEmpty_(v[k])) throw err_('VALIDATION', 'الحقل مطلوب: ' + lbl + '.'); });
  if (v.d1 && v.d2 && v.d2 < v.d1) throw err_('VALIDATION', 'تاريخ النهاية قبل تاريخ البداية.');
  if (col === 'shortlinks') { v.code = v.code.toLowerCase(); if (!/^[a-z0-9-]{2,40}$/.test(v.code)) throw err_('VALIDATION', 'الرمز المختصر: حروف إنجليزية صغيرة وأرقام وشرطة.'); if (L.some(function (y) { return y !== r && y.code === v.code; })) throw err_('VALIDATION', 'الرمز المختصر مستخدم.'); }
  if (col === 'counters' && !(v.num >= 0)) throw err_('VALIDATION', 'العدد غير صحيح.');
  if (col === 'inbox') { if (['form', 'contact'].indexOf(v.kind) < 0) throw err_('VALIDATION', 'نوع غير معروف.'); v.st = ['new', 'read', 'done'].indexOf(v.st) >= 0 ? v.st : 'new'; }
  if (col === 'visits' && ['داخلية', 'خارجية'].indexOf(v.side) < 0) throw err_('VALIDATION', 'جهة الزيارة: داخلية أو خارجية.');
  if (col === 'accounts') { if (L.some(function (y) { return y !== r && y.mobile === v.mobile; })) throw err_('VALIDATION', 'رقم الجوال مسجل لحساب آخر.'); const pw = String(x.pw || ''); if (!r && !pw) throw err_('VALIDATION', 'اكتب كلمة المرور.'); if (pw) { if (pw.length < 8 || !/\d/.test(pw) || !/[A-Za-z؀-ۿ]/.test(pw)) throw err_('VALIDATION', 'كلمة المرور 8 أحرف على الأقل وتحوي حروفًا وأرقامًا.'); v.salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16); v.pwh = hashPw_(v.salt, pw); } }
  if (r) { Object.assign(r, v, { upd: now_(), updBy: me.username }); }
  else { st.seq[col] = (st.seq[col] || (col === 'accounts' ? 23043300 : 0)) + 1; r = Object.assign(v, { id: 'w' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: st.seq[col], by: me.username, at: now_(), ord: -Date.now() }); if (col === 'shortlinks') r.clicks = 0; L.unshift(r); }
  audit_(me.username, x.id ? 'تعديل في الموقع' : 'إضافة في الموقع', col, String(r.no), String(r.title || r.name || r.code || '')); govSave_(org, '_web', st); return wsOut_(st, { id: r.id });
}
function actWsDraw_(me, p) {
  astCanW_(me); const org = astNeed_(), st = wsLoad_(org), r = astList_(st.c.contests, String(p.id || '')); if (!r) throw err_('NOTFOUND', 'المسابقة غير موجودة.');
  if (p.reset) { r.winners = []; govSave_(org, '_web', st); return wsOut_(st); }
  if (r.d2 && r.d2 > today_()) throw err_('VALIDATION', 'لا يجري السحب قبل انتهاء المسابقة (' + r.d2 + ').');
  r.winners = r.winners || []; const pool = (r.parts || []).filter(function (x) { return !r.winners.some(function (w) { return w.n === x.n && w.mobile === x.mobile; }); }), n = Math.max(1, Math.min(20, parseInt(p.n, 10) || 1));
  if (!pool.length) throw err_('VALIDATION', 'لا مشاركون متبقون للسحب.');
  for (let i = 0; i < n && pool.length; i++) { const k = Math.floor(Math.random() * pool.length); const w = pool.splice(k, 1)[0]; r.winners.push({ n: w.n, mobile: w.mobile, at: now_(), by: me.username }); }
  audit_(me.username, 'سحب على مسابقة', '', String(r.no), r.title); govSave_(org, '_web', st); return wsOut_(st, { id: r.id });
}
function actWsSet_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = wsLoad_(org), key = String(p.key || ''), D = wsDefaults_();
  if (['site', 'store', 'seo', 'social', 'design'].indexOf(key) < 0 && ['visitCats', 'partnerCats', 'teams', 'depts', 'roles'].indexOf(key) < 0) throw err_('VALIDATION', 'قسم إعدادات غير معروف.');
  if (Array.isArray(D[key])) { st.set[key] = (Array.isArray(p.val) ? p.val : []).map(function (x) { return str_(String(x), 120).trim(); }).filter(Boolean).slice(0, 100); }
  else {
    const coerce = function (d, v) { if (Array.isArray(d)) return (Array.isArray(v) ? v : d).map(function (x) { return str_(String(x), 60); }).slice(0, 30); if (d && typeof d === 'object') { const o = {}; Object.keys(d).forEach(function (k) { o[k] = coerce(d[k], v && v[k]); }); return o; } if (d === null) return wsFileMeta_(v); if (typeof d === 'boolean') return v == null ? d : !!v; if (typeof d === 'number') { const n = Number(v); return isFinite(n) ? n : d; } return v == null ? d : String(v).slice(0, 60000); };
    const cur = wsMerge_(D[key], st.set[key]), nv = coerce(D[key], wsMerge_(cur, p.val || {}));
    if (key === 'site') { ['privacy', 'terms', 'refund'].forEach(function (k) { nv[k] = wsClean_(nv[k]); }); if (['on', 'maint', 'off'].indexOf(nv.status) < 0) throw err_('VALIDATION', 'حالة الموقع غير صحيحة.'); }
    if (key === 'design') { ['primary', 'secondary', 'accent'].forEach(function (k) { if (!/^#[0-9a-f]{6}$/i.test(nv[k])) throw err_('VALIDATION', 'لون غير صحيح.'); }); nv.dark = Math.max(0.05, Math.min(0.9, nv.dark)); nv.light = Math.max(0.1, Math.min(0.97, nv.light)); nv.radius = Math.max(0, Math.min(40, nv.radius)); }
    if (key === 'social') { if (['direct', 'gtm'].indexOf(nv.mode) < 0) throw err_('VALIDATION', 'آلية الربط غير صحيحة.'); if (nv.gtm && !/^GTM-[A-Z0-9]+$/.test(nv.gtm)) throw err_('VALIDATION', 'معرّف Google Tag Manager بصيغة GTM-XXXX.'); if (nv.ga && !/^(G|UA|AW)-[A-Z0-9-]+$/i.test(nv.ga)) throw err_('VALIDATION', 'معرّف Google Analytics بصيغة G-XXXX.'); }
    if (key === 'seo') { nv.sitemap = nv.sitemap.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5000).join('\n'); const bad = nv.sitemap.split('\n').filter(function (s) { return s && !/^https?:\/\//.test(s); }); if (bad.length) throw err_('VALIDATION', 'روابط الخارطة تبدأ بـ https://: ' + bad[0]); }
    if (key === 'store' && !(nv.minAmt >= 0)) throw err_('VALIDATION', 'الحد الأدنى غير صحيح.');
    st.set[key] = nv;
  }
  audit_(me.username, 'إعدادات الموقع', '', key, ''); govSave_(org, '_web', st); return wsOut_(st);
}
function actWsSms_(me, p) {
  astCanW_(me); const org = astNeed_(), st = wsLoad_(org), text = str_(p.text, 700).trim(); if (!text) throw err_('VALIDATION', 'اكتب نص الرسالة.');
  let nums = [], src = 'bulk', lst = '';
  if (p.list) { const l = astList_(st.c.smslists, String(p.list)); if (!l) throw err_('VALIDATION', 'اختر القائمة.'); nums = l.nums; src = 'list'; lst = l.title; } else nums = wsVal_('nums', p.nums, 'الأرقام');
  if (!nums.length) throw err_('VALIDATION', 'لا أرقام للإرسال.');
  const m = { id: 'sm' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), at: now_(), by: me.username, text: text, n: nums.length, nums: nums.slice(0, 3000), parts: Math.ceil(text.length / 70), src: src, list: lst, st: 'queued' };
  st.sms.unshift(m); if (st.sms.length > 500) st.sms.length = 500; audit_(me.username, 'رسالة نصية', src, lst, String(nums.length)); govSave_(org, '_web', st); return wsOut_(st, { id: m.id });
}
function actWsUpload_(me, p) {
  astCanW_(me); const org = astNeed_(), name = str_(p.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'ملف', mime = String(p.mime || '');
  if (GOV_TYPES.indexOf(mime) < 0) throw err_('VALIDATION', 'الأنواع المسموحة: PDF وWord وExcel وصور JPG/PNG/WEBP.');
  const bytes = Utilities.base64Decode(String(p.data || '')); if (!bytes.length) throw err_('VALIDATION', 'الملف فارغ.'); if (bytes.length > MAX_FILE * 2) throw err_('VALIDATION', 'حجم الملف أكبر من 10 ميجابايت.');
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, 'الموقع — ' + name)), fid = Utilities.getUuid();
  sheet_('files').appendRow([fid, 'web:' + org + ':' + fid, name, mime, bytes.length, file.getId(), me.username, now_()]);
  return { f: { fid: fid, name: name, mime: mime, size: bytes.length } };
}
function actWsFile_(me, p) {
  const org = astNeed_(); const row = findRow_('files', String(p.fid || '')); if (!row) throw err_('NOTFOUND', 'الملف غير موجود.');
  const v = sheet_('files').getRange(row, 1, 1, HEAD.files.length).getValues()[0];
  if (String(v[1]).indexOf('web:' + org + ':') !== 0) throw err_('FORBIDDEN', 'غير مسموح.');
  return { name: String(v[2]), mime: String(v[3]), data: Utilities.base64Encode(DriveApp.getFileById(String(v[5])).getBlob().getBytes()) };
}
function actWsSamples_(me, p) {
  astAdmin_(me); const org = astNeed_(), st = wsLoad_(org);
  if (p.clear) { Object.keys(st.c).forEach(function (k) { st.c[k] = st.c[k].filter(function (r) { return !r.sample; }); }); st.sms = st.sms.filter(function (m) { return !m.sample; }); govSave_(org, '_web', st); return wsOut_(st); }
  if (Object.keys(st.c).some(function (k) { return st.c[k].some(function (r) { return r.sample; }); })) throw err_('VALIDATION', 'البيانات التوضيحية مضافة من قبل.');
  const d = function (n) { const x = new Date(); x.setDate(x.getDate() + n); return Utilities.formatDate(x, 'Asia/Riyadh', 'yyyy-MM-dd'); };
  const add = function (col, list) { list.forEach(function (o, i) { st.seq[col] = (st.seq[col] || (col === 'accounts' ? 23043300 : 0)) + 1; st.c[col].push(Object.assign({ id: 'w' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), no: st.seq[col], by: me.username, at: now_(), ord: i, sample: true }, o)); }); };
  add('menu', [['الرئيسية', 'home', '/'], ['عن الجمعية', 'alert', '/about'], ['متجر التبرع الإلكتروني', 'cart', '/store'], ['البرامج', 'PRG', '/programs'], ['خدمات المستفيدين', 'users', '/services'], ['الحوكمة', 'GOV', '/governance'], ['بوابة التطوع', 'VOL', '/volunteer'], ['المركز الإعلامي', 'news', '/media'], ['اتصل بنا', 'phone', '/contact']].map(function (r) { return { title: r[0], icon: r[1], link: r[2], img: null, subs: r[0] === 'المركز الإعلامي' ? [{ t: 'الأخبار', link: '/news' }, { t: 'مكتبة الصور', link: '/gallery' }, { t: 'مكتبة الفيديو', link: '/videos' }] : [] }; }));
  add('counters', [['المستفيدين', 'users', 5300, 'مستفيد'], ['الحالات', 'heart', 1500, 'حالة'], ['الأيتام', 'userHeart', 250, 'يتيم'], ['المشاريع', 'PRJ', 18, 'مشروع']].map(function (r) { return { title: r[0], icon: r[1], num: r[2], word: r[3] }; }));
  add('services', [['تبرعات المشاريع', 'PRJ', '/projects'], ['تبرعات الحالات', 'heart', '/cases'], ['المبادرات', 'handshake', '/initiatives'], ['الأخبار', 'news', '/news'], ['مكتبة الصور', 'image', '/gallery'], ['مكتبة الفيديو', 'video', '/videos'], ['اللوائح والسياسات', 'book', '/policies'], ['المسابقات', 'trophy', '/contests'], ['اتصل بنا', 'phone', '/contact']].map(function (r) { return { title: r[0], icon: r[1], link: r[2] }; }));
  add('about', [{ title: 'نبذة عن الجمعية', body: '<p>جمعية خيرية تعنى برعاية الأسر المحتاجة والأيتام وتمكينهم.</p>', img: null }, { title: 'الرؤية والرسالة', body: '<p><b>الرؤية:</b> مجتمع متكافل ومنتج.</p><p><b>الرسالة:</b> تقديم خدمات نوعية مستدامة بشراكات فاعلة.</p>', img: null }]);
  add('news', [['توزيع السلة الغذائية لشهر جمادى', -5], ['توقيع شراكة مع وقف القصواء', -12], ['اختتام برنامج الحقيبة المدرسية', -30]].map(function (r) { return { title: r[0], date: d(r[1]), sum: 'خبر من أخبار الجمعية.', body: '<p>' + r[0] + ' بحمد الله.</p>', cover: null, album: [] }; }));
  add('videos', [['مشروع السلة الغذائية', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'], ['مشروع ترميم المساكن للأسر الفقيرة', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ']].map(function (r) { return { title: r[0], yt: r[1] }; }));
  add('testimonials', [{ name: 'أ. خالد العمري', job: 'رجل أعمال', body: 'جمعية متميزة في الشفافية وسرعة الإنجاز.', img: null }]);
  add('links', [{ title: 'المركز الوطني لتنمية القطاع غير الربحي', url: 'https://ncnp.gov.sa', icon: 'link' }, { title: 'منصة إحسان', url: 'https://ehsan.sa', icon: 'heart' }]);
  add('initiatives', [{ title: 'مبادرة كسوة الشتاء', date: d(-40), body: '<p>توزيع الكسوة الشتوية على الأسر.</p>', goals: '<ul><li>تغطية 300 أسرة</li></ul>', how: '', cover: null, rep: null, imgs: [] }]);
  add('contests', [{ title: 'مسابقة حفظ جزء عم', body: '<p>للأبناء من 7 إلى 12 سنة.</p>', d1: d(-60), d2: d(-2), prize: 'جهاز لوحي', parts: [{ n: 'أحمد سالم', mobile: '0551110001' }, { n: 'ريم علي', mobile: '0551110002' }, { n: 'يوسف خالد', mobile: '0551110003' }, { n: 'سارة محمد', mobile: '0551110004' }] }]);
  add('shortlinks', [{ code: 'zakat', url: '/zakat', clicks: 0 }, { code: 'ramadan', url: '/projects', clicks: 0 }]);
  add('visits', [{ cat: st.set.visitCats[0], side: 'خارجية', title: 'زيارة شركة الخير للتجارة', place: 'جدة', date: d(-8), dur: 'ساعتان', goal: 'عرض مشاريع الجمعية', results: 'وعد بدعم مشروع السلة', team: ['أ. سامي العتيبي', 'أ. هدى الزهراني'], notes: '', imgs: [], files: [] }, { cat: st.set.visitCats[1], side: 'داخلية', title: 'استقبال وفد الموارد البشرية', place: 'مقر الجمعية', date: d(-20), dur: '3 ساعات', goal: 'التعريف بالبرامج', results: 'تنسيق برنامج تدريبي', team: ['أ. فهد القحطاني'], notes: '', imgs: [], files: [] }]);
  add('partnerships', [{ side: st.set.partnerCats[0], name: 'شراكة مع وقف القصواء', d1: d(-90), d2: d(275), desc: 'دعم برامج الأيتام', results: '', notes: '', imgs: [], files: [], dept: st.set.depts[0], fwd: st.set.roles[0], emp: '' }]);
  add('events', [{ name: 'حفل تكريم الداعمين', place: 'قاعة الجمعية', d1: d(-15), d2: d(-15), goal: 'شكر الداعمين', parties: 'الداعمون والشركاء', role: 'التنظيم', results: 'حضور 120 شخصًا', notes: '', imgs: [], files: [] }]);
  add('smslists', [{ title: 'أرقام مجمع', nums: ['0550000001', '0550000002', '0550000003'] }, { title: 'السلة الرمضانية', nums: ['0560000001', '0560000002'] }]);
  add('inbox', [{ kind: 'contact', form: '', name: 'محمد سعيد', mobile: '0532426062', email: '', subject: 'استفسار عن التبرع', body: 'كيف أتبرع لمشروع السقيا؟', st: 'new' }, { kind: 'form', form: 'طلب متطوعين', name: 'نورة أحمد', mobile: '0541112233', email: '', subject: 'تطوع', body: 'أرغب بالتطوع في الفعاليات.', st: 'read' }]);
  audit_(me.username, 'بيانات توضيحية للموقع', '', '', ''); govSave_(org, '_web', st); return wsOut_(st);
}
function wsSum_(org) { const st = wsLoad_(org), c = st.c; return { news: c.news.length, inbox: c.inbox.filter(function (r) { return r.st === 'new'; }).length, accounts: c.accounts.length, visits: c.visits.length, partners: c.partnerships.filter(function (r) { return !r.d2 || r.d2 >= today_(); }).length, events: c.events.length, off: st.set.site.status === 'on' ? 0 : 1 }; }

function aggOrgs_(me, load, recKeys, extra) {
  if (!isPlatformMember_(me)) throw err_('FORBIDDEN', 'غير مسموح.');
  const orgs = loadOrgs_().filter(function (o) { return o.status !== 'archived'; }), out = { all: 1, orgs: orgs.map(function (o) { return { id: o.id, code: o.code, name: o.name }; }) };
  let set = null; recKeys.forEach(function (k) { out[k] = []; });
  orgs.forEach(function (o) { const st = load(o.id);
    if (!set) set = JSON.parse(JSON.stringify(st.set || {}));
    else Object.keys(st.set || {}).forEach(function (k) { const a = st.set[k]; if (Array.isArray(a) && Array.isArray(set[k])) a.forEach(function (x) { if (x && x.id && !set[k].some(function (y) { return y.id === x.id; })) set[k].push(x); }); });
    recKeys.forEach(function (k) { (st[k] || []).forEach(function (r) { out[k].push(Object.assign({}, r, { __o: o.id, __on: o.name })); }); });
  });
  out.set = set || (load('__none__').set); out.set.orgName = 'كل مؤسسات المنصة';
  if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
  return out;
}
function aggSups_(me) { return aggOrgs_(me, prLoad_, ['sups']).sups.map(function (x) { return { id: x.id, n: x.name, no: x.no, active: x.active !== false, ext: 1 }; }); }

function actGovCustomDoc_(me, p) {
  const org = govNeedOrg_();
  const t = str_(p.title, 160); if (!t) throw err_('VALIDATION', 'اكتب اسم المستند.', 'title');
  const g = SCHEMA.GOV.groups.some(function (x) { return x.id === p.g; }) ? String(p.g) : 'found';
  const lib = govLoad_(org, '_lib');
  if (p.remove) { delete lib.docs[str_(p.remove, 60)]; govSave_(org, '_lib', lib); return actGovGet_(me, { cycle: p.cycle }); }
  const key = 'x' + Utilities.getUuid().slice(0, 8);
  lib.docs[key] = { t: t, g: g, s: str_(p.s, 60) || 'مستندات إضافية', custom: true };
  govSave_(org, '_lib', lib);
  return actGovGet_(me, { cycle: p.cycle });
}


/* =====================================================================
 * الهيكل التنظيمي: شجرة المجلس واللجان والقطاعات والإدارات والوحدات والمهام لكل مؤسسة.
 * إن لم تحفظ المؤسسة هيكلها بعد يُعرض القالب الجاهز SCHEMA.ORGTREE، ويُحفظ عند أول تعديل.
 * ===================================================================== */
const TREE_MAX = 4000;
function treeClean_(x, depth, cnt, ids) {
  if (!x || typeof x !== 'object' || depth > 12) return null;
  if (++cnt.n > TREE_MAX) throw err_('VALIDATION', 'الهيكل أكبر من الحد المسموح (' + TREE_MAX + ' عنصر).');
  let id = str_(String(x.id || ''), 24).replace(/[^A-Za-z0-9_-]/g, '');
  if (!id || ids[id]) id = 'n' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  ids[id] = 1;
  const meta = {};
  if (x.meta && typeof x.meta === 'object') Object.keys(x.meta).slice(0, 20).forEach(function (k) { const kk = str_(k, 40), v = str_(String(x.meta[k] == null ? '' : x.meta[k]), 1000); if (kk && v) meta[kk] = v; });
  const o = { id: id, name: str_(String(x.name || ''), 200) || 'بدون اسم', type: str_(String(x.type || ''), 40) || 'إدارة', code: str_(String(x.code || ''), 40), meta: meta, children: [] };
  ['head', 'phone', 'email'].forEach(function (k) { const v = str_(String(x[k] || ''), 120); if (v) o[k] = v; });
  (Array.isArray(x.children) ? x.children : []).forEach(function (c) { const y = treeClean_(c, depth + 1, cnt, ids); if (y) o.children.push(y); });
  return o;
}
function treeGeneral_() { const g = govLoad_('*', '_tree'); return g.tree ? g : null; }
function actTreeGet_(me) {
  const g = treeGeneral_(), base = g ? g.tree : SCHEMA.ORGTREE;
  if (!CUR_ORG || CUR_ORG === '*') {
    if (!isPlatformMember_(me)) throw err_('FORBIDDEN', 'غير مسموح.');
    const cnt = function (t) { let k = 0; (function w(n) { if (n.type !== 'تصنيف') k++; (n.children || []).forEach(w); })(t); return k - 1; };
    return { tree: base, saved: !!g, by: g ? g.by || '' : '', at: g ? g.at || '' : '', template: !g, general: true, orgs: loadOrgs_().filter(function (o) { return o.status !== 'archived'; }).map(function (o) { const st = govLoad_(o.id, '_tree'); return { id: o.id, code: o.code, name: o.name, type: o.type || '', saved: !!st.tree, count: cnt(st.tree || base), by: st.by || '', at: st.at || '' }; }) };
  }
  const org = govNeedOrg_();
  const st = govLoad_(org, '_tree');
  return st.tree ? { tree: st.tree, saved: true, by: st.by || '', at: st.at || '' } : { tree: base, saved: false, template: true };
}
function actTreeSave_(me, p) {
  const general = !CUR_ORG || CUR_ORG === '*';
  if (general) needPlatform_(me);
  else if (me.role !== 'admin') throw err_('FORBIDDEN', 'تعديل الهيكل التنظيمي لمسؤول النظام فقط.');
  const org = general ? '*' : govNeedOrg_();
  if (general && p.apply === 'all') {
    const g = treeGeneral_(), src = g ? g.tree : SCHEMA.ORGTREE; let k = 0;
    loadOrgs_().filter(function (o) { return o.status !== 'archived'; }).forEach(function (o) { const st = govLoad_(o.id, '_tree'); st.tree = JSON.parse(JSON.stringify(src)); st.by = me.username; st.at = now_(); govSave_(o.id, '_tree', st); k++; });
    audit_(me.username, 'تعميم الهيكل العام على المؤسسات', '', '', String(k));
    const out = actTreeGet_(me); out.applied = k; return out;
  }
  const st = govLoad_(org, '_tree');
  if (p.addGeo) {
    const geo = SCHEMA.ORGTREE.children.filter(function (c) { return c.code === 'GEO'; })[0];
    const g0 = general ? null : treeGeneral_();
    const cur = st.tree || (g0 ? g0.tree : SCHEMA.ORGTREE);
    if (!geo) throw err_('VALIDATION', 'الهيئة الانتخابية غير متاحة في القالب.');
    if ((cur.children || []).some(function (c) { return c.code === 'GEO'; })) throw err_('VALIDATION', 'الهيئة الانتخابية موجودة في الهيكل.');
    p.tree = JSON.parse(JSON.stringify(cur)); p.tree.children = (p.tree.children || []).concat([JSON.parse(JSON.stringify(geo))]);
    p.log = p.log || 'إضافة الهيئة الانتخابية';
  }
  let tree;
  if (p.reset === 'template') { const g = general ? null : treeGeneral_(); tree = JSON.parse(JSON.stringify(g ? g.tree : SCHEMA.ORGTREE)); }
  else if (p.reset === 'empty') tree = { id: 'root', name: general ? 'الجهة' : String(getSettings_().orgName || 'الجهة'), type: 'جهة', code: '', meta: {}, children: [] };
  else tree = p.tree;
  st.tree = treeClean_(tree, 0, { n: 0 }, {});
  if (!st.tree) throw err_('VALIDATION', 'هيكل غير صالح.');
  st.by = me.username; st.at = now_();
  govSave_(org, '_tree', st);
  if (p.reset || p.log) audit_(me.username, (p.reset ? 'إعادة تعيين الهيكل التنظيمي' : 'تعديل الهيكل التنظيمي') + (general ? ' العام' : ''), '', '', str_(p.log || p.reset, 200));
  if (general) return actTreeGet_(me);
  return { tree: st.tree, saved: true, by: st.by, at: st.at };
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
  try { sheet_('audit').appendRow([now_(), user || '', action, id || '', no || '', String(detail || '').slice(0, 500), CUR_ORG || '']); } catch (e) { }
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
    table_('users').rows.filter(function (u) { return u.role === 'admin' && u.email && (u.active === true || u.active === 'TRUE') && String(u.org || MAIN_ORG) === (r.org || MAIN_ORG); })
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
    '<p style="color:#888;font-size:12px">رسالة آلية من نظام نافذ.</p></div>';
  MailApp.sendEmail({ to: to, subject: 'نظام نافذ: ' + subject + ' — ' + r.no, htmlBody: html, name: 'نظام نافذ' });
}

/** نسخة احتياطية يومية (مُشغَّل زمني) تحتفظ بآخر 14 نسخة. */
function dailyBackup() {
  const props = PropertiesService.getScriptProperties();
  const folder = DriveApp.getFolderById(props.getProperty('BACKUP_FOLDER_ID'));
  const name = 'نسخة نظام نافذ ' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH-mm');
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
 * الواجهة العامة للموقع الإلكتروني (بلا تسجيل دخول)
 * - GET  ?api=public  ← المحتوى المنشور فقط: الأخبار والبرامج والشركاء وإحصاءات عددية مجمّعة
 * - POST {type,...}    ← طلبات الزوار تُنشأ معاملات «جديد» في الإدارة المختصة
 * لا تُرجع أي بيانات شخصية، ولا تقبل إلا أنواعًا وحقولًا محددة، مع حد للطلبات في الدقيقة.
 * ===================================================================== */
const WEBSITE_ME = { username: 'website', name: 'الموقع الإلكتروني', role: 'contributor', depts: [] };
/** مستدعاة من صفحة الموقع العامة عبر google.script.run (بلا جلسة). */
function siteOrg_(code) { migrate_(); const o = code ? orgByCode_(code) : getOrg_(MAIN_ORG); if (!o || o.status !== 'active') return null; CUR_ORG = o.id; return o; }
/** بوابة منصة نافذ العامة: المؤسسات النشطة وروابط مواقعها (بيانات عامة فقط) */
function platformPublic() {
  try {
    migrate_();
    const cache = CacheService.getScriptCache(); const hit = cache.get('platform_pub_v1'); if (hit) return JSON.parse(hit);
    const orgs = loadOrgs_().filter(function (o) { return o.status === 'active'; }).map(function (o) {
      const st = o.settings || {};
      return { code: o.code, name: o.name, type: o.type || 'جهة غير ربحية', sector: o.sector || '', region: o.region || '', city: o.city || st.siteCity || '', areas: o.areas || '', vision: str_(o.vision || st.siteAbout || '', 220), tagline: st.siteTagline || '', theme: st.siteTheme ? st.siteTheme.tpl : '' };
    });
    const types = {}; orgs.forEach(function (o) { types[o.type] = (types[o.type] || 0) + 1; });
    let appUrl = ''; try { appUrl = ScriptApp.getService().getUrl(); } catch (e) { }
    const out = { ok: true, orgs: orgs, types: types, regions: Object.keys(orgs.reduce(function (a, o) { if (o.region) a[o.region] = 1; return a; }, {})).length, appUrl: appUrl, at: now_() };
    cache.put('platform_pub_v1', JSON.stringify(out), 300);
    return out;
  } catch (e) { console.error(e); return { ok: false, reason: 'error' }; }
}
function sitePublic(code) { const o = siteOrg_(code); if (!o) return { ok: false, reason: 'no-org' }; const d = publicData_(); try { d.appUrl = ScriptApp.getService().getUrl(); } catch (e) { } d.code = o.code; return d; }
function siteSubmit(p) { p = p || {}; if (!siteOrg_(p.org)) return { ok: false, message: 'الجمعية غير متاحة.' }; return publicSubmit_(p); }
function getSettingsSafe_() { try { return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') ? getSettings_() : {}; } catch (e) { return {}; } }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function publicData_() {
  try {
    if (!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')) return { ok: false, reason: 'not-ready' };
    const cache = CacheService.getScriptCache();
    const ck = 'public_v1_' + (CUR_ORG || MAIN_ORG);
    const hit = cache.get(ck);
    if (hit) return JSON.parse(hit);
    const cfg = getSettings_();
    const R = loadRecords_().filter(function (r) { return !r.deleted; });
    const pub = function (r) { return r.f && r.f.visibility === 'منشور'; };
    const news = R.filter(function (r) { return r.g === 3 && r.m === 5 && pub(r); }).sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 12)
      .map(function (r) { return { title: r.title, body: str_(r.notes, 1500), date: r.date }; });
    const partners = R.filter(function (r) { return r.g === 3 && r.m === 9 && pub(r); }).slice(0, 24).map(function (r) { return { name: r.title }; });
    const programs = R.filter(function (r) { return r.g === 5 && (r.m === 0 || r.m === 1) && r.status !== 'مرفوض'; }).slice(0, 12)
      .map(function (r) { return { title: r.title, stage: r.m === 0 ? 'يبحث عن داعم' : 'قيد التنفيذ', budget: +r.f.budget || 0, beneficiaries: +r.f.beneficiaries || 0, location: r.f.location || '', about: str_(r.notes, 300) }; });
    let stats = null;
    if (cfg.publicStats !== false) {
      const names = {};
      R.forEach(function (r) { if (r.g === 10 && r.f && r.f.name) names[r.f.name] = 1; });
      const vol = {}; let hours = 0;
      R.forEach(function (r) { if (r.g === 11 && r.f) { if (r.f.name) vol[r.f.name] = 1; hours += +r.f.hours || 0; } });
      stats = {
        programs: R.filter(function (r) { return r.g === 5; }).length,
        beneficiaries: Object.keys(names).length + R.filter(function (r) { return r.g === 5; }).reduce(function (a, r) { return a + (+r.f.beneficiaries || 0); }, 0),
        volunteers: Object.keys(vol).length, hours: hours,
        projects: R.filter(function (r) { return r.g === 4; }).length
      };
    }
    // محتوى الموقع الإلكتروني المنشور من وحدات إدارة الموقع (حالة النشر = منشور)
    const W = function (m, lim) { return R.filter(function (r) { return r.g === 3 && r.m === m && pub(r); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, lim || 24); };
    const safeUrl = function (u) { u = str_(u, 500); return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; };
    const it = function (r) { const f = r.f || {}; return { title: str_(r.title, 200), body: str_(r.notes, 1500), date: r.date, url: safeUrl(f.url), image: safeUrl(f.image), num: +f.num || 0, until: str_(f.until, 10) }; };
    const today = now_().slice(0, 10);
    const pop = W(28, 6).filter(function (r) { return !r.f.until || String(r.f.until) >= today; })[0];
    const ab = W(23, 1)[0];
    const web = { menu: W(0, 8).map(it), slides: W(1, 6).map(it), pages: W(4, 12).map(it), gallery: W(7, 24).map(it), videos: W(8, 12).map(it), policies: W(10, 24).map(it),
      social: W(21, 10).map(it), counters: W(22, 8).map(it), about: ab ? it(ab) : null, reports: W(24, 12).map(it), initiatives: W(25, 12).map(it), testimonials: W(26, 12).map(it),
      links: W(27, 16).map(it), popup: pop ? it(pop) : null, competitions: W(29, 8).filter(function (r) { return !r.f.until || String(r.f.until) >= today; }).map(it) };
    const out = { ok: true, org: cfg.orgName || '', city: cfg.siteCity || '', phone: cfg.sitePhone || '', email: cfg.siteEmail || '', about: cfg.siteAbout || '', news: news, programs: programs, partners: partners, stats: stats, theme: cfg.siteTheme || null, web: web, at: now_(),
      profile: (function () { const o = getOrg_(CUR_ORG || MAIN_ORG) || {}; return { type: o.type || '', sector: o.sector || '', region: o.region || '', city: o.city || '', areas: o.areas || '', vision: o.vision || '', mission: o.mission || '', goals: o.goals || '',
        aboutTitle: cfg.siteAboutTitle || '', values: cfg.siteValues || '', commit: cfg.siteCommit || '', tagline: cfg.siteTagline || '' }; })() };
    cache.put(ck, JSON.stringify(out), 300);
    return out;
  } catch (e) { console.error(e); return { ok: false, reason: 'error' }; }
}
function doPost(e) {
  let p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json_({ ok: false, message: 'طلب غير صالح.' }); }
  return json_(siteSubmit(p));
}
function publicSubmit_(p) {
  try {
    if (!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')) throw err_('NOT_READY', 'الخدمة غير متاحة الآن.');
    if (str_(p.website, 50)) return { ok: true, no: '' }; // حقل فخ للبرامج الآلية
    const cache = CacheService.getScriptCache();
    const k = 'pub_rate_' + Math.floor(Date.now() / 60000);
    const n = +(cache.get(k) || 0);
    if (n >= 30) throw err_('BUSY', 'طلبات كثيرة الآن، أعد المحاولة بعد دقيقة.');
    cache.put(k, String(n + 1), 120);
    const name = str_(p.name, 80), phone = str_(p.phone, 20), msg = str_(p.message, 1500);
    if (name.length < 3) throw err_('VALIDATION', 'اكتب الاسم الكامل.', 'name');
    if (!/^05\d{8}$/.test(phone)) throw err_('VALIDATION', 'رقم الجوال يبدأ بـ 05 ويتكون من 10 أرقام.', 'phone');
    const today = String(Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd')).slice(0, 10);
    const contact = 'الاسم: ' + name + '\nالجوال: ' + phone + (str_(p.email, 120) ? '\nالبريد: ' + str_(p.email, 120) : '');
    let rec;
    if (p.type === 'aid') {
      rec = { g: 10, m: 14, title: 'طلب إعانة من الموقع: ' + name, f: { name: name, nid: str_(p.nid, 10), family: str_(String(p.family || ''), 3) }, notes: 'نوع الإعانة: ' + str_(p.kind, 60) + '\n' + contact + (msg ? '\n\n' + msg : '') };
    } else if (p.type === 'volunteer') {
      rec = { g: 11, m: 1, title: 'طلب تطوع من الموقع: ' + name, f: { name: name, phone: phone, opportunity: str_(p.field, 120) }, notes: contact + (msg ? '\n\n' + msg : '') };
    } else if (p.type === 'donate') {
      const amt = Number(p.amount);
      if (!(amt > 0 && amt < 1e8)) throw err_('VALIDATION', 'اكتب مبلغ التبرع.', 'amount');
      rec = { g: 6, m: 6, title: 'رغبة تبرع من الموقع: ' + name, f: { donor: name, phone: phone, amount: amt, allocation: str_(p.allocation, 120) || 'عام' }, notes: 'تعهد عبر الموقع ولم يُستلم المبلغ بعد. تواصل مع المتبرع لإتمام التحويل ثم اعتمد المعاملة.\n' + contact + (msg ? '\n\n' + msg : '') };
    } else if (p.type === 'contact') {
      if (msg.length < 5) throw err_('VALIDATION', 'اكتب رسالتك.', 'message');
      rec = { g: 3, m: 6, title: 'رسالة من زائر: ' + (str_(p.subject, 80) || name), f: {}, notes: contact + '\n\n' + msg };
    } else throw err_('VALIDATION', 'نوع الطلب غير معروف.');
    rec.date = today; rec.status = 'جديد';
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw err_('BUSY', 'الخدمة مشغولة، أعد المحاولة بعد لحظات.');
    let out;
    try { out = actCreate_(WEBSITE_ME, rec); bumpRev_(); } finally { lock.releaseLock(); }
    return { ok: true, no: out.record.no };
  } catch (e) { const f = fail_(e); return { ok: false, message: f.message, field: f.field || '' }; }
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
    [12, 2, 'اجتماع مجلس الإدارة', 'جديد', 0, { ref: 'مثال', responsible: 'أمين المجلس' }, 0],
    // سجل سنة تقريبًا حتى تمتلئ لوحة القيادة ومخططاتها
    [6, 6, 'تبرع عام نقدي', 'مكتمل', 0, { donor: 'فاعل خير', amount: 1500, method: 'نقدي', allocation: 'عام' }, 0],
    [6, 9, 'دفعة كفالة أسرة', 'مكتمل', 1, { donor: 'أبو محمد (مثال)', amount: 900, method: 'تحويل بنكي', allocation: 'كفالة' }, 0],
    [6, 7, 'تبرع لمشروع كسوة الشتاء', 'مكتمل', 20, { donor: 'شركة البر التجارية (مثال)', amount: 25000, method: 'تحويل بنكي', allocation: 'كسوة الشتاء' }, 0],
    [6, 9, 'دفعة كفالة يتيم', 'مكتمل', 33, { donor: 'أبو محمد (مثال)', amount: 900, method: 'تحويل بنكي', allocation: 'كفالة' }, 0],
    [6, 8, 'تبرع لأسرة متعففة', 'مكتمل', 45, { donor: 'أبو محمد (مثال)', amount: 4200, method: 'شبكة (مدى)', allocation: 'أسرة متعففة' }, 0],
    [6, 10, 'تبرع لبرنامج تحفيظ القرآن', 'مكتمل', 75, { donor: 'مؤسسة الخير الأهلية (مثال)', amount: 18000, method: 'تحويل بنكي', allocation: 'برنامج التحفيظ' }, 0],
    [6, 6, 'تبرع عبر المتجر الإلكتروني', 'مكتمل', 110, { donor: 'فاعل خير', amount: 6000, method: 'رابط دفع', allocation: 'عام' }, 0],
    [6, 7, 'تبرع لمشروع السقيا', 'مكتمل', 150, { donor: 'شركة البر التجارية (مثال)', amount: 15000, method: 'تحويل بنكي', allocation: 'السقيا' }, 0],
    [6, 7, 'تبرع لمشروع السلال الغذائية', 'مكتمل', 200, { donor: 'مؤسسة الخير الأهلية (مثال)', amount: 22000, method: 'تحويل بنكي', allocation: 'مشروع السلال' }, 0],
    [6, 6, 'تبرع زكاة المال', 'مكتمل', 240, { donor: 'فاعل خير', amount: 9500, method: 'تحويل بنكي', allocation: 'عام' }, 0],
    [7, 1, 'رواتب شهر أكتوبر', 'مكتمل', 30, { amount: 42000, account: 'الرواتب والأجور', costCenter: 'الإدارة العامة', method: 'تحويل بنكي' }, 0],
    [7, 0, 'شراء مستلزمات مكتبية', 'مكتمل', 52, { amount: 2350, account: 'مصروفات تشغيلية', costCenter: 'الإدارة العامة', method: 'نقدي' }, 0],
    [7, 1, 'رواتب شهر سبتمبر', 'مكتمل', 61, { amount: 41500, account: 'الرواتب والأجور', costCenter: 'الإدارة العامة', method: 'تحويل بنكي' }, 0],
    [7, 2, 'سند صرف إعانة سكن', 'مكتمل', 80, { amount: 7500, account: 'مساعدات', costCenter: 'الكفالات', method: 'تحويل بنكي' }, 0],
    [7, 2, 'سند صرف مشروع السقيا', 'مكتمل', 145, { amount: 13200, account: 'مشاريع', costCenter: 'السقيا', method: 'شيك' }, 0],
    [7, 2, 'سند صرف مشروع السلال', 'بانتظار الاعتماد', 4, { amount: 9600, account: 'مشاريع', costCenter: 'مشروع السلال', method: 'شيك' }, 1],
    [9, 1, 'تعيين باحثة اجتماعية', 'مكتمل', 90, { name: 'نورة (مثال)', job: 'باحثة اجتماعية', dept: 'الكفالات' }, 0],
    [9, 5, 'إجازة اعتيادية', 'بانتظار الاعتماد', 3, { name: 'خالد (مثال)', job: 'محاسب', dept: 'المالية' }, 0],
    [9, 9, 'تقييم الأداء السنوي', 'قيد المتابعة', 15, { name: 'سعد (مثال)', job: 'مدير مشروع', dept: 'المشاريع' }, 0],
    [9, 12, 'إعلان وظيفة أمين مستودع', 'جديد', 6, { job: 'أمين مستودع', dept: 'المستودعات' }, 0],
    [10, 6, 'صرف كفالة شهر نوفمبر', 'مكتمل', 2, { name: 'أسرة (مثال)', family: 5, monthly: 900, sponsor: 'أبو محمد (مثال)' }, 0],
    [10, 3, 'تعيين كافل لأسرة أيتام', 'مكتمل', 40, { name: 'أسرة أيتام (مثال)', family: 4, monthly: 1200, sponsor: 'مؤسسة الخير الأهلية (مثال)' }, 0],
    [10, 5, 'كفالة متأخرة التحصيل', 'قيد المتابعة', 25, { name: 'أسرة (مثال)', family: 3, monthly: 700 }, 1],
    [10, 13, 'طلب إعانة علاج', 'مرفوض', 35, { name: 'مستفيد (مثال)', family: 2 }, 0],
    [10, 17, 'طلب إعانة ترميم منزل', 'قيد المتابعة', 9, { name: 'أسرة (مثال)', family: 7 }, 0],
    [4, 1, 'مشروع كسوة الشتاء', 'مكتمل', 120, { manager: 'أ. فهد (مثال)', budget: 60000, progress: 100 }, 0],
    [4, 4, 'تجهيز مستودع التوزيع', 'قيد المتابعة', 18, { manager: 'م. سعد الغامدي', progress: 70 }, 0],
    [5, 1, 'برنامج تحفيظ القرآن الكريم', 'قيد المتابعة', 95, { beneficiaries: 120, budget: 45000, location: 'مقر الجمعية' }, 0],
    [5, 9, 'ملتقى الأسر المنتجة', 'مكتمل', 28, { beneficiaries: 60, location: 'قاعة الجمعية' }, 0],
    [2, 6, 'مخاطبة المالية بشأن الميزانية', 'قيد المتابعة', 5, { recipient: 'إدارة المالية', channel: 'معاملة ورقية' }, 0],
    [2, 7, 'خطاب وارد من جهة حكومية', 'جديد', 2, { recipient: 'الجهة المشرفة (مثال)', channel: 'بريد إلكتروني', ref: 'مثال' }, 0],
    [2, 10, 'طلب عهدة نقدية', 'بانتظار الاعتماد', 3, { recipient: 'المدير التنفيذي', channel: 'معاملة ورقية' }, 0],
    [2, 4, 'تنبيه موعد توزيع السلال', 'مكتمل', 7, { recipient: 'فريق التوزيع', channel: 'تنبيه لحظي' }, 0],
    [11, 3, 'ساعات تطوع حملة الشتاء', 'مكتمل', 22, { name: 'متطوع (مثال)', opportunity: 'كسوة الشتاء', hours: 24 }, 0],
    [11, 11, 'تسليم سيارة التوزيع', 'مكتمل', 9, { name: 'سائق (مثال)' }, 0],
    [8, 5, 'استلام تبرع عيني: بطانيات', 'مكتمل', 26, { item: 'بطانيات', qty: 200, unit: 'حبة', warehouse: 'المستودع الرئيسي' }, 0],
    [8, 9, 'أمر صرف سلال لأسر الحي', 'بانتظار الاعتماد', 2, { item: 'سلة غذائية', qty: 80, unit: 'كرتون', warehouse: 'المستودع الرئيسي' }, 0],
    [12, 10, 'تسجيل إجابات معايير الحوكمة', 'قيد المتابعة', 14, { responsible: 'لجنة الحوكمة' }, 0],
    [13, 10, 'إصدار قسيمة شراء لأسرة', 'مكتمل', 12, { beneficiary: 'أسرة (مثال)', amount: 800, decision: 'مثال' }, 0],
    [1, 0, 'إضافة حساب محاسب', 'مكتمل', 100, { username: 'khaled', role: 'محاسب' }, 0],
    // محتوى الموقع الإلكتروني العام: ما يُنشر هنا يظهر للزوار
    [3, 5, 'إطلاق حملة كسوة الشتاء لهذا العام', 'مكتمل', 6, { visibility: 'منشور' }, 0, 'بدأت الجمعية توزيع كسوة الشتاء على الأسر المستفيدة في الأحياء الأشد حاجة، بمشاركة أكثر من 40 متطوعًا. يمكنكم الإسهام في الحملة من صفحة التبرع.'],
    [3, 5, 'توقيع شراكة مع مؤسسة الخير الأهلية', 'مكتمل', 24, { visibility: 'منشور' }, 0, 'وقّعت الجمعية اتفاقية شراكة لدعم برنامج تحفيظ القرآن الكريم وتوسيع حلقاته لتشمل 120 طالبًا وطالبة.'],
    [3, 5, 'ختام ملتقى الأسر المنتجة', 'مكتمل', 27, { visibility: 'منشور' }, 0, 'اختُتم ملتقى الأسر المنتجة بعرض منتجات 60 أسرة، ضمن برامج التمكين الاقتصادي التي تنفذها الجمعية.'],
    [3, 9, 'مؤسسة الخير الأهلية (مثال)', 'مكتمل', 40, { visibility: 'منشور' }, 0],
    [3, 9, 'شركة البر التجارية (مثال)', 'مكتمل', 40, { visibility: 'منشور' }, 0],
    [5, 0, 'برنامج السلة الغذائية الشهرية', 'جديد', 10, { beneficiaries: 250, budget: 150000, location: 'أحياء المدينة' }, 0, 'سلة غذائية شهرية للأسر المسجلة لدى الجمعية طوال العام.'],
    [5, 0, 'برنامج الحقيبة المدرسية', 'جديد', 8, { beneficiaries: 400, budget: 60000, location: 'مدارس الحي' }, 0, 'تجهيز طلاب الأسر المستفيدة بالحقائب والمستلزمات قبل بداية العام الدراسي.']
  ];
  list.forEach(function (x) {
    const r = { id: Utilities.getUuid(), no: nextNo_(x[0]), g: x[0], m: x[1], title: x[2], status: x[3], pri: x[6], esc: x[6] ? 1 : 0, date: d(x[4]), due: x[4] > 10 ? d(x[4] - 14) : '', owner: '', notes: x[7] || '', f: x[5], sample: true, created: now_(), updated: (x[3] === 'مكتمل' || x[3] === 'مرفوض') ? d(Math.max(0, x[4] - 2)) + 'T10:00:00.000Z' : now_(), createdBy: me.username, updatedBy: me.username, hist: [], files: [] };
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
