'use strict';
// Peran ELGOS. Dua konsep (B2, docs/designs/b2-peran.md):
// - PERAN (role): kode untuk otorisasi. req.user.role = peran yang sedang aktif di sesi.
// - TAMPILAN (view): lima nilai sesuai mockup (K2) untuk menu dan label, diturunkan dari peran.
const ROLES = Object.freeze({
  ETA_ADMIN: 'eta_admin',       // Super Admin (Admin ETA): tenant, modul, konfigurasi platform
  TENANT_ADMIN: 'tenant_admin', // Admin Tenant: pengguna & peran, jabatan, impor (B2)
  HR_ADMIN: 'hr_admin',         // HR / L&D klien: melihat seluruh karyawan (RG-3)
  PIMPINAN: 'pimpinan',         // narasumber CCA, penerima laporan INA (B2 lama)
  SUPERVISOR: 'supervisor',     // atasan langsung: melihat timnya sendiri (RG-3)
  ROLE_LEADER: 'role_leader',   // validator SME untuk DNA
  SME: 'sme',                   // narasumber DACUM
  LEARNER: 'learner',           // karyawan: melihat hasilnya sendiri (Q45)
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

const VIEWS = Object.freeze({
  hr: { label: 'HR / L&D', home: 'dash' },
  atasan: { label: 'Atasan', home: 'dash' },
  karyawan: { label: 'Karyawan', home: 'my' },
  admin: { label: 'Admin Tenant', home: 'users' },
  super: { label: 'Super Admin', home: 'tenants' },
});

const ROLE_VIEW = Object.freeze({
  [ROLES.HR_ADMIN]: 'hr', [ROLES.SUPERVISOR]: 'atasan', [ROLES.PIMPINAN]: 'atasan', [ROLES.ROLE_LEADER]: 'atasan',
  [ROLES.TENANT_ADMIN]: 'admin', [ROLES.ETA_ADMIN]: 'super',
});
/**
 * Tampilan untuk satu peran (selaras `shell/views.ts` B0). pimpinan/role_leader memakai tampilan Atasan untuk menu;
 * cakupan data tetap ditentukan peran lewat visibleEmployeeScope(). sme/learner memakai tampilan Karyawan.
 */
const viewOf = (role) => ROLE_VIEW[role] || 'karyawan';

/** Peran yang memberi wewenang atas data atau akun orang lain; akun ini tidak diubah lewat impor/undangan karyawan. */
const PRIVILEGED_ROLES = Object.freeze([ROLES.HR_ADMIN, ROLES.TENANT_ADMIN, ROLES.ETA_ADMIN]);
/** Peran yang bisa diberikan lewat PUT /users/:id/roles (eta_admin tidak pernah lewat sini). */
const ASSIGNABLE_ROLES = Object.freeze(ALL_ROLES.filter((r) => r !== ROLES.ETA_ADMIN));
// Tampilan yang juga karyawan (K2): HR, Atasan, Admin Tenant
const ALSO_EMPLOYEE_VIEWS = ['hr', 'atasan', 'admin'];

/**
 * Peran yang bisa dipilih akun sebagai tampilan (K2): peran yang dimiliki, ditambah `learner` untuk
 * HR/Atasan/Admin Tenant yang belum punya peran bertampilan Karyawan. eta_admin selalu tunggal.
 */
function switchableRoles(roles) {
  const own = [...new Set((roles || []).filter((r) => ALL_ROLES.includes(r)))];
  if (own.includes(ROLES.ETA_ADMIN)) return [ROLES.ETA_ADMIN];
  if (own.some((r) => ALSO_EMPLOYEE_VIEWS.includes(viewOf(r))) && !own.some((r) => viewOf(r) === 'karyawan')) own.push(ROLES.LEARNER);
  return own;
}

/** Bentuk untuk web: [{ role, view, label }]. `mine` = akun punya tampilan lain, jadi Karyawan diberi label "(saya)". */
function describeRoles(roles) {
  const multi = roles.length > 1;
  return roles.map((role) => {
    const view = viewOf(role);
    return { role, view, label: view === 'karyawan' && multi ? 'Karyawan (saya)' : VIEWS[view].label };
  });
}

/**
 * Review egm D4: siapa boleh mereset verifikasi dua langkah akun lain. targetRoles = peran utama + user_roles.
 * Super Admin tidak bisa direset dari tenant; Admin Tenant hanya oleh Admin Tenant atau Super Admin.
 */
function canResetMfa(actorRole, targetRoles) {
  if (targetRoles.includes(ROLES.ETA_ADMIN)) return false;
  if (targetRoles.includes(ROLES.TENANT_ADMIN)) return actorRole === ROLES.TENANT_ADMIN || actorRole === ROLES.ETA_ADMIN;
  return true;
}

module.exports = { canResetMfa, ROLES, ALL_ROLES, VIEWS, viewOf, PRIVILEGED_ROLES, ASSIGNABLE_ROLES, switchableRoles, describeRoles };
