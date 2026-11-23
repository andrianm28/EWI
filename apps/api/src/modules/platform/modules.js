'use strict';
// B12: delapan modul tenant di panel Super Admin, urutan mengikuti mockup. Nama flag diambil dari FLAGS.
// `product`: entitlement satuan yang bisa diberikan saat modul dinyalakan; li/ld/lim hanya lewat full_suite
// (core/entitlement FULL_SUITE_ONLY), Career & Promotion tanpa entitlement.
const { FLAGS } = require('../../core/flags');

const MODULES = Object.freeze([
  { key: 'cca', name: 'Core Competencies', flag: FLAGS.MODULE_CCA, gated: true, product: 'cca', earlyAccess: true },
  { key: 'dna', name: 'Developmental Needs', flag: FLAGS.MODULE_DNA, gated: true, product: 'dna', earlyAccess: false },
  { key: 'tna', name: 'Training Needs', flag: FLAGS.MODULE_TNA, gated: true, product: 'tna', earlyAccess: false },
  { key: 'ina', name: 'Improvement Needs', flag: FLAGS.MODULE_INA, gated: true, product: 'ina', earlyAccess: false },
  { key: 'li', name: 'Learning Intervention', flag: FLAGS.MODULE_LI, gated: true, product: null, earlyAccess: false },
  { key: 'ld', name: 'Learning Delivery', flag: FLAGS.MODULE_LD, gated: true, product: null, earlyAccess: false },
  { key: 'lim', name: 'Learning Impact Measurement', flag: FLAGS.MODULE_LIM, gated: true, product: null, earlyAccess: false },
  { key: 'promotion', name: 'Career & Promotion', flag: FLAGS.PROMOTION_RECOMMENDATION, gated: false, product: null, earlyAccess: false },
]);

const byKey = (key) => MODULES.find((m) => m.key === key) || null;

/**
 * Baris panel untuk satu modul. detail: hasil flags.detail(tenantId); submodules: entitlements.submodules(tenantId).
 * entitled: true/false untuk modul berentitlement, null bila modul tidak memakai entitlement.
 * effective = flag tenant menyala, kill switch tidak aktif, dan entitlement tidak menolak.
 */
function rowFor(m, detail, submodules) {
  const d = detail.find((x) => x.key === m.flag);
  const entitled = m.gated ? submodules.includes(m.key) : null;
  const flagOn = Boolean(d && d.tenantEnabled);
  const killSwitch = Boolean(d && d.killSwitch);
  return {
    key: m.key, name: m.name, available: Boolean(d), earlyAccess: m.earlyAccess, entitled, flagOn, killSwitch,
    effective: flagOn && !killSwitch && entitled !== false,
  };
}

module.exports = { MODULES, byKey, rowFor };
