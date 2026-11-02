/**
 * نظام نافذ — الخادم (Google Apps Script)
 *
 * كل قراءة وكتابة تمر من هنا. الواجهة لا تلمس الجدول مباشرة، لذلك تُفرض
 * الصلاحيات وحد الاعتماد وفصل المهام والترقيم ومنع التكرار وسجل التدقيق
 * على الخادم، ولا يمكن تجاوزها من المتصفح.
 *
 * التثبيت: شغّل الدالة setup() مرة واحدة من المحرر، ثم انشر تطبيق ويب.
 */

const APP_VERSION = '4.0.0';
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
  orgs: 'المؤسسات'
};
const HEAD = {
  users: ['username', 'name', 'email', 'role', 'depts', 'active', 'salt', 'hash', 'failed', 'lockedUntil', 'mustChange', 'lastLogin', 'created', 'org', 'prefs', 'phone'],
  records: ['id', 'no', 'g', 'm', 'status', 'deleted', 'updated', 'json'],
  decisions: ['id', 's', 'by', 'at', 'amt', 'note'],
  settings: ['key', 'value'],
  audit: ['at', 'user', 'action', 'recordId', 'no', 'detail', 'org'],
  counters: ['key', 'value'],
  files: ['id', 'recordId', 'name', 'mime', 'size', 'driveId', 'by', 'at'],
  orgs: ['id', 'code', 'name', 'status', 'created', 'json']
};
/* ---------- تعدد المؤسسات ----------
 * كل معاملة ومستخدم وسطر تدقيق يحمل معرّف مؤسسته. المؤسسة النشطة في الطلب الحالي في CUR_ORG:
 * - لمستخدم المؤسسة: مؤسسته دائمًا.
 * - للمشرف العام للمنصة (org = '*'): المؤسسة التي يختارها، أو '*' لعرض كل المؤسسات.
 * الإعدادات نوعان: إعدادات المنصة (ورقة الإعدادات) وإعدادات المؤسسة (داخل ورقة المؤسسات)، والثانية تتقدم.
 */
let CUR_ORG = null;
const MAIN_ORG = 'main';
const ORG_KEYS = ['orgName', 'threshold', 'sod', 'notify', 'siteUrl', 'siteCity', 'sitePhone', 'siteEmail', 'siteAbout', 'publicStats', 'nav', 'layout'];
const ORG_TYPES = ['جمعية خيرية', 'مؤسسة أهلية', 'جمعية تعاونية', 'جمعية مهنية', 'وقف', 'شركة غير ربحية', 'شركة', 'جهة حكومية', 'أخرى'];
const ORG_SECTORS = ['القطاع غير الربحي', 'القطاع الخاص', 'القطاع الحكومي', 'القطاع الوقفي'];
const ORG_AREAS = ['اجتماعي وأسري', 'إغاثي', 'صحي', 'تعليمي', 'ديني ودعوي', 'تحفيظ القرآن', 'تنموي وتمكين', 'إسكاني', 'بيئي', 'ثقافي', 'شبابي ورياضي', 'رعاية الأيتام', 'ذوي الإعاقة', 'كبار السن', 'المرأة والطفل', 'تقني', 'مهني', 'إعلامي'];
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
function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'public') return json_(sitePublic(e.parameter.org));
  if (e && e.parameter && e.parameter.page === 'site') {
    return HtmlService.createHtmlOutputFromFile('Site')
      .setTitle(String((function () { try { const o = siteOrg_(e.parameter.org); return o ? o.name : ''; } catch (x) { return ''; } })() || 'الموقع الإلكتروني'))
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
  });
  return ORGS_CACHE_;
}
function getOrg_(id) { return loadOrgs_().find(function (o) { return o.id === id; }) || null; }
function orgByCode_(code) { code = String(code || '').toUpperCase(); return loadOrgs_().find(function (o) { return o.code === code; }) || null; }
function saveOrgRow_(o) {
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
  if (props.getProperty('SCHEMA_V') === '2') return;
  const ss = ss_();
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
  props.setProperty('SCHEMA_V', '2');
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
    org: String(u.org || MAIN_ORG), phone: String(u.phone || '')
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
      if (uo !== '*') { const o = getOrg_(uo); if (!o || o.status === 'suspended') return { ok: false, code: 'DISABLED', message: 'حساب مؤسستك موقوف مؤقتًا. تواصل مع المشرف العام لمنصة نافذ.' }; }
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
const ORG_REQUIRED = ['create', 'importData', 'addSamples', 'clearSamples', 'emptyTrash'];
function isPlatform_(me) { return me.role === 'admin' && me.org === '*'; }
/** عضو المنصة: حساب على مستوى نافذ (org = '*') بأي دور؛ المشاهد منهم يطّلع على كل المؤسسات دون أي تعديل. */
function isPlatformMember_(me) { return me.org === '*'; }
function needPlatform_(me) { if (!isPlatform_(me)) throw err_('FORBIDDEN', 'هذا الإجراء للمشرف العام لمنصة نافذ فقط.'); }
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
const WRITE_ACTIONS = ['saveOrg', 'setOrgStatus', 'importOrgs', 'bulkResetPasswords', 'savePrefs', 'saveLayout', 'saveNav', 'create', 'update', 'status', 'route', 'escalate', 'deescalate', 'note', 'remove', 'restore', 'purge', 'emptyTrash',
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
    if (['active', 'suspended'].indexOf(p.status) < 0) throw err_('VALIDATION', 'حالة غير صحيحة.');
    if (o.id === MAIN_ORG && p.status === 'suspended') throw err_('VALIDATION', 'لا يمكن إيقاف المؤسسة الرئيسية.');
    o.status = p.status; saveOrgRow_(o);
    audit_(me.username, p.status === 'active' ? 'تفعيل مؤسسة' : 'إيقاف مؤسسة', '', '', o.name);
    return orgPublic_(o);
  },
  importOrgs: function (me, p) { needPlatform_(me); return actImportOrgs_(me, p); },
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
  const people = table_('users').rows.filter(function (u) { return (u.active === true || u.active === 'TRUE') && (CUR_ORG === '*' || String(u.org || MAIN_ORG) === CUR_ORG || String(u.org) === '*'); })
    .map(function (u) { return { username: String(u.username), name: String(u.name), role: String(u.role), hasEmail: !!u.email, org: String(u.org || MAIN_ORG) }; });
  const urow = findUser_(me.username);
  let prefs = null; try { prefs = urow && urow.prefs ? JSON.parse(urow.prefs) : null; } catch (e) { prefs = null; }
  const orgs = isPlatformMember_(me) ? loadOrgs_().map(orgPublic_) : (getOrg_(me.org) ? [orgPublic_(getOrg_(me.org))] : []);
  const meOut = clean_(me); meOut.platform = isPlatform_(me); meOut.member = isPlatformMember_(me);
  return { me: meOut, scope: CUR_ORG, orgs: orgs, prefs: prefs, settings: getSettings_(), records: recs, decisions: dec, people: people, schema: SCHEMA, version: APP_VERSION, now: now_(), appUrl: (function () { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } })() };
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
    const out = { ok: true, org: cfg.orgName || '', city: cfg.siteCity || '', phone: cfg.sitePhone || '', email: cfg.siteEmail || '', about: cfg.siteAbout || '', news: news, programs: programs, partners: partners, stats: stats, at: now_() };
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
