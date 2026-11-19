'use strict';
// B17 Asisten ELGOS: penyusun fakta per tampilan. Pengaman utama privasi ada di sini: fakta hanya berisi data
// dalam cakupan peran (RG-3), tanpa nama, email, id, transkrip, atau bukti asesmen. Orang disebut lewat ctx.alias
// (kode samaran K1..Kn); server mengganti kode itu dengan nama sesudah model menjawab.
// Spek: docs/designs/b17-asisten-elgos.md bagian "Fakta per tampilan".
const { FLAGS } = require('../../core/flags');
const { deliveryFor } = require('../../core/settings');
const { computeGap } = require('../dna/gap');
const { competencyView, inviteActions, PLAN_VISIBLE } = require('../my/view');
const { toReviewItem } = require('../tna/review-workspace');

const MAX_TEXT = 120;
const clip = (v) => (v == null ? null : String(v).slice(0, MAX_TEXT));
const countBy = (rows, key) => rows.reduce((acc, r) => ({ ...acc, [r[key]]: (acc[r[key]] || 0) + 1 }), {});
const OPEN = ['scheduled', 'in_progress'];

const PAGE_LABEL = {
  my: 'Hasil saya', li: 'Rencana belajar', aiv: 'Wawancara AI', tna: 'Training Needs', review: 'Tinjauan HR', ina: 'Improvement Needs',
};

const BUILDERS = [
  // --- karyawan: hanya req.user.id ---
  {
    key: 'saya', views: ['karyawan'], page: null,
    async build({ stores, tenantId, user }) {
      const p = await stores.people.profile(tenantId, user.id);
      return { jabatan: clip(p && p.jobRoleName), jenjang: clip(p && p.careerLevelName) };
    },
  },
  {
    key: 'kompetensiSaya', views: ['karyawan'], submodule: 'dna', flags: [FLAGS.LEARNER_HOME], page: 'my',
    async build({ stores, tenantId, user }) {
      const person = await stores.people.profile(tenantId, user.id);
      const [comps, assessments] = await Promise.all([
        person && person.jobRoleId ? stores.dna.competenciesForPosition(tenantId, person) : [],
        stores.dna.assessments(tenantId, user.id),
      ]);
      const v = competencyView(computeGap({ competencies: comps, assessments }));
      return { summary: v.summary, weakest: v.items.filter((i) => ['gap', 'partial'].includes(i.status)).slice(0, 5).map((i) => clip(i.name)) };
    },
  },
  {
    key: 'rencanaSaya', views: ['karyawan'], submodule: 'tna', flags: [FLAGS.LEARNER_HOME], page: 'li',
    async build({ stores, tenantId, user, conf }) {
      const items = (await stores.tna.listPlanItems(tenantId, { userIds: [user.id] })).filter((p) => PLAN_VISIBLE.includes(p.status));
      return {
        total: items.length,
        items: items.slice(0, 8).map((p) => ({
          title: clip(p.catalogItemTitle || 'Modul sedang disiapkan'), level: p.programTier ?? null, status: p.status,
          place: clip(deliveryFor(conf, p.catalogSource).label),
        })),
      };
    },
  },
  {
    key: 'undanganSaya', views: ['karyawan'], submodule: 'tna', flags: [FLAGS.LEARNER_HOME], page: 'my',
    async build({ stores, tenantId, user }) {
      const now = new Date();
      const open = (await stores.interviews.list(tenantId, 'tna', { userIds: [user.id] })).filter((s) => OPEN.includes(s.status));
      const deadlines = open.map((s) => s.inviteExpiresAt).filter(Boolean).map((d) => new Date(d)).filter((d) => d > now).sort((a, b) => a - b);
      return { open: open.length, canStart: open.filter((s) => inviteActions(s, now).canStart).length, nearestDeadline: deadlines[0] ? deadlines[0].toISOString() : null };
    },
  },
  // --- atasan: anggota tim dalam cakupan visibleEmployeeScope, tanpa dirinya ---
  {
    key: 'wawancaraTim', views: ['atasan'], submodule: 'tna', page: 'aiv',
    async build({ stores, tenantId, team, scope, alias }) {
      const sessions = await stores.interviews.list(tenantId, 'tna', scope);
      const done = new Set(sessions.filter((s) => s.status === 'completed').map((s) => s.intervieweeId));
      return {
        members: team.length,
        byStatus: countBy(sessions, 'status'),
        notCompleted: team.filter((m) => !done.has(m.id)).slice(0, 10).map(alias),
      };
    },
  },
  {
    key: 'gapTim', views: ['atasan'], submodule: 'tna', page: 'tna',
    async build({ stores, tenantId, scope }) {
      return { top: (await stores.tna.topTrainingGaps(tenantId, scope)).map((g) => ({ ...g, competency: clip(g.competency) })) };
    },
  },
  {
    key: 'rencanaTim', views: ['atasan'], submodule: 'tna', page: 'tna',
    build: ({ stores, tenantId, scope }) => stores.tna.planStatusCounts(tenantId, scope),
  },
  // --- hr: cakupan visibleEmployeeScope (HR dan Admin ETA = seluruh tenant), angka agregat ---
  {
    key: 'tinjauan', views: ['hr'], submodule: 'tna', page: 'review',
    async build({ stores, tenantId, conf }) {
      const targetDays = conf.tna.reviewTargetDays;
      const now = new Date();
      const drafts = (await stores.tna.reviewQueue(tenantId, { statuses: ['draft'] })).map((f) => toReviewItem(f, targetDays, now));
      return { draft: drafts.length, held: drafts.filter((f) => f.held).length, overdue: drafts.filter((f) => f.overdue).length, targetDays };
    },
  },
  {
    key: 'wawancara', views: ['hr'], submodule: 'tna', page: 'aiv',
    async build({ stores, tenantId, scope }) { return { byStatus: countBy(await stores.interviews.list(tenantId, 'tna', scope), 'status') }; },
  },
  {
    key: 'gap', views: ['hr'], submodule: 'tna', page: 'tna',
    async build({ stores, tenantId, scope }) {
      return { top: (await stores.tna.topTrainingGaps(tenantId, scope)).map((g) => ({ ...g, competency: clip(g.competency) })) };
    },
  },
  {
    key: 'rencana', views: ['hr'], submodule: 'tna', page: 'tna',
    build: ({ stores, tenantId, scope }) => stores.tna.planStatusCounts(tenantId, scope),
  },
  {
    key: 'perbaikan', views: ['hr'], submodule: 'tna', flags: [FLAGS.MODULE_INA, FLAGS.TNA_REVIEW_WORKSPACE], page: 'ina',
    build: ({ stores, tenantId }) => stores.tna.improvementCounts(tenantId),
  },
  {
    key: 'permintaanData', views: ['hr'], page: null,
    build: ({ stores, tenantId }) => (stores.dataRequests ? stores.dataRequests.openCounts(tenantId) : null),
  },
];

/** Paket lain (B11-B16) menambah fakta lewat sini. Aturan sama: tanpa nama/kontak, orang lewat ctx.alias. */
function registerFactBuilder(builder) {
  if (!builder || !builder.key || !Array.isArray(builder.views) || typeof builder.build !== 'function') throw new Error('Penyusun fakta tidak valid');
  if (BUILDERS.some((b) => b.key === builder.key)) throw new Error(`Kunci fakta sudah dipakai: ${builder.key}`);
  if (builder.page && !PAGE_LABEL[builder.page]) throw new Error(`Halaman tidak dikenal: ${builder.page}; daftarkan dengan registerPage`);
  BUILDERS.push(builder);
}

function registerPage(key, label) {
  if (PAGE_LABEL[key]) throw new Error(`Halaman sudah ada: ${key}`);
  PAGE_LABEL[key] = label;
}

/** Penyusun yang aktif untuk tampilan ini: modul aktif (entitlement + flag) dan semua flag tambahan menyala. */
async function activeBuilders({ view, active, flagOn }) {
  const out = [];
  for (const b of BUILDERS) {
    if (!b.views.includes(view)) continue;
    if (b.submodule && !(await active(b.submodule))) continue;
    let ok = true;
    for (const f of b.flags || []) if (!(await flagOn(f))) { ok = false; break; }
    if (ok) out.push(b);
  }
  return out;
}

/** Susun fakta. Return { facts, factKeys, pages: [{key,label}] } dengan halaman hanya dari fakta yang terisi. */
async function buildFacts(builders, ctx) {
  const facts = {}; const pages = [];
  for (const b of builders) {
    const value = await b.build(ctx);
    if (value == null) continue;
    facts[b.key] = value;
    if (b.page && !pages.some((p) => p.key === b.page)) pages.push({ key: b.page, label: PAGE_LABEL[b.page] });
  }
  return { facts, factKeys: Object.keys(facts), pages };
}

module.exports = { buildFacts, activeBuilders, registerFactBuilder, registerPage, PAGE_LABEL, MAX_TEXT };
