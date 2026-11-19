'use strict';
// Port katalog pembelajaran untuk training plan. Kontrak API katalog EliteMentor (FR-EM) belum final, jadi
// adapter EliteMentor masih stub. PK-18 (17 Nov): Moodle dilayani dari katalog statis yang diimpor HR
// (template "Katalog course" + pemetaan ke kompetensi); sinkron API Moodle menyusul setelah pilot (PO-1 opsi B).
// Kontrak adapter: { source, findForCompetency({ tenantId, competency, tier }) -> [{ ref, title, url? }] }

/** EliteMentor: menunggu endpoint katalog di repo EM (T2 token endpoint EM). Untuk sementara kosong. */
function elitementorAdapter(/* client */) {
  return { source: 'elitementor', async findForCompetency() { return []; } };
}

/**
 * LMS klien (Moodle untuk ELGOS) dari katalog statis hasil impor: course aktif yang dipetakan ke kompetensi
 * temuan, course dengan program yang sama diutamakan. store = stores.catalog; tanpa store hasilnya kosong.
 */
function moodleAdapter(store) {
  return {
    source: 'moodle',
    async findForCompetency({ tenantId, competency, tier }) {
      if (!store || !competency || !competency.id) return [];
      const rows = await store.findForCompetency(tenantId, { source: 'moodle', competencyId: competency.id, tier });
      return rows.map(({ ref, title, url }) => ({ ref, title, url: url || null }));
    },
  };
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
        if (hit) return { source, ref: hit.ref, title: hit.title, url: hit.url || null };
      }
      return null;
    },
  };
}

module.exports = { createCatalogService, elitementorAdapter, moodleAdapter, memoryAdapter };
