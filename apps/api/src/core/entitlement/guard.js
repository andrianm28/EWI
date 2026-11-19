'use strict';
const { forbidden } = require('../errors');

/** Middleware: submodul hanya bisa diakses bila tenant punya entitlement DAN flag modul menyala. */
function requireSubmodule(submodule, { entitlements, flags }) {
  return async (req, _res, next) => {
    try {
      if (!(await entitlements.has(req.tenantId, submodule))) {
        return next(forbidden('NOT_ENTITLED', `Organisasi Anda belum berlangganan ${submodule.toUpperCase()}`));
      }
      if (!(await flags.isEnabled(req.tenantId, `module.${submodule}`))) {
        return next(forbidden('FEATURE_DISABLED', `${submodule.toUpperCase()} belum diaktifkan untuk organisasi Anda`));
      }
      return next();
    } catch (e) { return next(e); }
  };
}

/** Sama dengan requireSubmodule, sebagai fungsi: dipakai layar gabungan (beranda karyawan) yang memuat beberapa modul. */
async function submoduleActive({ entitlements, flags }, tenantId, submodule) {
  return (await entitlements.has(tenantId, submodule)) && (await flags.isEnabled(tenantId, `module.${submodule}`));
}

module.exports = { requireSubmodule, submoduleActive };
