'use strict';
// Entitlement Gating (B14): model hybrid. Paket "full_suite" membuka semua submodul;
// selain itu tenant membeli per submodul. Entitlement = hak komersial; flag = kesiapan fitur.
// Submodul terbuka hanya jika keduanya true.
const SUBMODULES = Object.freeze(['cca', 'dna', 'tna', 'ina']);
// Modul bangun penuh 19 Nov (B13 Learning Intervention, B14 Learning Delivery). Model komersial 5 modul belum
// diputuskan, jadi untuk sekarang hanya terbuka lewat paket full_suite dan belum bisa dibeli satuan
// (CHECK entitlements.product tidak diubah). Paket lain yang menambah modul cukup menambah kuncinya di sini.
const FULL_SUITE_ONLY = Object.freeze(['li', 'ld']);

/** store: { getActiveEntitlements(tenantId, now) -> Promise<Array<{ product: string }>> } */
function createEntitlementService(store, clock = () => new Date()) {
  async function submodules(tenantId) {
    const rows = (await store.getActiveEntitlements(tenantId, clock())) || [];
    const products = new Set(rows.map((r) => r.product));
    if (products.has('full_suite')) return [...SUBMODULES, ...FULL_SUITE_ONLY];
    return SUBMODULES.filter((s) => products.has(s));
  }
  /** Produk entitlement aktif (mis. ['full_suite'] atau ['dna', 'tna']), terurut. Modul 2–5 memeriksa produk ini. */
  async function products(tenantId) {
    const rows = (await store.getActiveEntitlements(tenantId, clock())) || [];
    return [...new Set(rows.map((r) => r.product))].sort();
  }
  return {
    submodules,
    products,
    async has(tenantId, submodule) {
      return (await submodules(tenantId)).includes(submodule);
    },
  };
}

module.exports = { SUBMODULES, FULL_SUITE_ONLY, createEntitlementService };
