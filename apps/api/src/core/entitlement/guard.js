'use strict';
const { forbidden } = require('../errors');

/**
 * Middleware: submodul hanya bisa diakses bila tenant punya entitlement DAN flag modul menyala.
 * { tenantFlag: false }: satu-satunya pengecualian aturan 3 (B11 Admin Tenant menyiapkan data sebelum modul
 * dinyalakan saat Go/No-Go). Entitlement tetap wajib dan saklar darurat global (R2-1) tetap dihormati.
 */
function requireSubmodule(submodule, { entitlements, flags }, { tenantFlag = true } = {}) {
  const label = submodule.toUpperCase();
  return async (req, _res, next) => {
    try {
      if (!(await entitlements.has(req.tenantId, submodule))) {
        return next(forbidden('NOT_ENTITLED', `Organisasi Anda belum berlangganan ${label}`));
      }
      if (tenantFlag) {
        if (!(await flags.isEnabled(req.tenantId, `module.${submodule}`))) {
          return next(forbidden('FEATURE_DISABLED', `${label} belum diaktifkan untuk organisasi Anda`));
        }
        return next();
      }
      const flag = (await flags.detail(req.tenantId)).find((f) => f.key === `module.${submodule}`);
      if (flag && flag.killSwitch) return next(forbidden('FEATURE_DISABLED', `${label} sedang dimatikan sementara oleh ETA`));
      return next();
    } catch (e) { return next(e); }
  };
}

/** Sama dengan requireSubmodule, sebagai fungsi: dipakai layar gabungan (beranda karyawan) yang memuat beberapa modul. */
async function submoduleActive({ entitlements, flags }, tenantId, submodule) {
  return (await entitlements.has(tenantId, submodule)) && (await flags.isEnabled(tenantId, `module.${submodule}`));
}

module.exports = { requireSubmodule, submoduleActive };
