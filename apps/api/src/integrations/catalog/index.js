'use strict';
// Port katalog pembelajaran untuk training plan. K-1 (EliteMentor saja vs + LMS klien/Moodle) dan
// kontrak API katalog EliteMentor (FR-EM) belum final, jadi adapter di sini masih stub.
// Kontrak adapter: { source, findForCompetency({ tenantId, competency, tier }) -> [{ ref, title }] }

/** EliteMentor: menunggu endpoint katalog di repo EM (T2 token endpoint EM). Untuk sementara kosong. */
function elitementorAdapter(/* client */) {
  return { source: 'elitementor', async findForCompetency() { return []; } };
}

/** LMS klien (Moodle untuk ELGOS) hanya aktif bila K-1 memilih jalur ini; kini stub kosong. */
function moodleAdapter() {
  return { source: 'moodle', async findForCompetency() { return []; } };
}

/** Katalog di memori untuk test dan demo. items: [{ ref, title, keywords[] }] */
function memoryAdapter(source, items = []) {
  return {
    source,
    async findForCompetency({ competency }) {
      const name = String(competency?.name || '').toLowerCase();
      return items.filter((i) => (i.keywords || []).some((k) => name.includes(k.toLowerCase()))).map(({ ref, title }) => ({ ref, title }));
    },
  };
}

/**
 * Cari modul di semua LMS tujuan tenant, berurutan. Tidak ada hasil -> status 'needs_module'
 * (RG-2: HR membuat modul atau memanggil vendor).
 */
function createCatalogService(adapters = {}) {
  return {
    async match({ tenantId, targets, competency, tier }) {
      if (!competency) return null;
      for (const source of targets) {
        const adapter = adapters[source];
        if (!adapter) continue;
        const [hit] = await adapter.findForCompetency({ tenantId, competency, tier });
        if (hit) return { source, ref: hit.ref, title: hit.title };
      }
      return null;
    },
  };
}

module.exports = { createCatalogService, elitementorAdapter, moodleAdapter, memoryAdapter };
