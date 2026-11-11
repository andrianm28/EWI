'use strict';
// Entitlement Gating (B14): model hybrid. Paket "full_suite" membuka semua submodul;
// selain itu tenant membeli per submodul. Entitlement = hak komersial; flag = kesiapan fitur.
// Submodul terbuka hanya jika keduanya true.
const SUBMODULES = Object.freeze(['cca', 'dna', 'tna', 'ina']);

/** store: { getActiveEntitlements(tenantId, now) -> Promise<Array<{ product: string }>> } */
function createEntitlementService(store, clock = () => new Date()) {
  async function submodules(tenantId) {
    const rows = (await store.getActiveEntitlements(tenantId, clock())) || [];
    const products = new Set(rows.map((r) => r.product));
    if (products.has('full_suite')) return [...SUBMODULES];
    return SUBMODULES.filter((s) => products.has(s));
  }
  return {
    submodules,
    async has(tenantId, submodule) {
      return (await submodules(tenantId)).includes(submodule);
    },
  };
}

module.exports = { SUBMODULES, createEntitlementService };
