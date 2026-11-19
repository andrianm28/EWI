'use strict';
// B2: menu per tampilan, mengikuti fungsi N di mockup Pak Eji (Main.dc.html). Shell web (B0) hanya menggambar.
// Butir: [key, label, icon, flag?]. key = kunci layar. Grup: { group, label, icon, items }.
const { FLAGS } = require('../flags');

const F = { cc: FLAGS.MODULE_CCA, dna: FLAGS.MODULE_DNA, tna: FLAGS.MODULE_TNA, ina: FLAGS.MODULE_INA };
// Flag modul yang didaftarkan paket lain (B13, B14, B15). Belum terdaftar = butir tampil nonaktif.
const LATER = { li: 'module.li', ld: 'module.ld', lim: 'module.lim' };
// Butir yang juga butuh entitlement submodul
const SUBMODULE = { cc: 'cca', dna: 'dna', tna: 'tna', ina: 'ina' };

const DNA = ['dna', 'Developmental Needs', 'account_tree', F.dna];
const TNA = ['tna', 'Training Needs', 'fact_check', F.tna];
const INA = ['ina', 'Improvement Needs', 'build_circle', F.ina];
const LIM = ['lim', 'Learning Impact Measurement', 'monitoring', LATER.lim];
const CP = ['cp', 'Career & Promotion', 'workspace_premium', FLAGS.PROMOTION_RECOMMENDATION];
const LNA = (items) => ({ group: 'lna', label: 'Learning Needs Analysis', icon: 'query_stats', items });

const MENUS = Object.freeze({
  hr: [
    ['dash', 'Dashboard utama', 'dashboard'],
    LNA([['cc', 'Core Competencies', 'flag', F.cc], DNA, TNA, INA]),
    { group: 'li', label: 'Learning Intervention', icon: 'extension', items: [
      ['lib', 'Library', 'local_library', LATER.li],
      ['prog', 'Program & Course', 'collections_bookmark', LATER.li],
      ['req', 'Permintaan & pengembangan', 'inventory_2', LATER.li],
    ] },
    ['ld', 'Learning Delivery', 'school', LATER.ld],
    LIM, CP,
  ],
  atasan: [
    ['dash', 'Dashboard tim', 'dashboard'],
    LNA([['aiv', 'Wawancara AI', 'record_voice_over', F.cc], DNA, TNA, INA]),
    LIM, CP,
  ],
  karyawan: [
    ['my', 'Hasil saya', 'person'],
    ['aiv', 'Wawancara visi & nilai', 'record_voice_over', F.cc],
    ['iv', 'Wawancara akar masalah', 'forum', F.tna],
    ['li', 'Rencana belajar', 'school'],
  ],
  admin: [
    ['users', 'Pengguna & peran', 'group'],
    ['jobs', 'Jabatan & kamus kompetensi', 'badge'],
    ['cfg', 'Impor data & integrasi', 'upload_file'],
  ],
  super: [
    ['tenants', 'Tenant', 'apartment'],
    ['platform', 'Konfigurasi platform', 'tune'],
  ],
});

/**
 * Menu untuk satu tampilan. `flags`: peta flag efektif tenant (flags.all); flag yang belum terdaftar tidak ada
 * di peta sehingga butirnya nonaktif. `submodules`: daftar submodul ber-entitlement.
 */
function buildMenu(view, { flags = {}, submodules = [] } = {}) {
  const leaf = ([key, label, icon, flag], level) => {
    const sub = key === 'aiv' ? 'cca' : (key === 'iv' ? 'tna' : SUBMODULE[key]);
    const enabled = (!flag || flags[flag] === true) && (!sub || submodules.includes(sub));
    return { key, label, icon, level, group: null, enabled };
  };
  const out = [];
  for (const item of MENUS[view] || []) {
    if (Array.isArray(item)) { out.push(leaf(item, 0)); continue; }
    const children = item.items.map((i) => leaf(i, 1));
    out.push({ key: null, label: item.label, icon: item.icon, level: 0, group: item.group, enabled: children.some((c) => c.enabled) });
    out.push(...children);
  }
  return out;
}

module.exports = { buildMenu, MENUS };
