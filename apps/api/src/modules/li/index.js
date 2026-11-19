'use strict';
// B13 Learning Intervention (LI). Library modul KSA dari DACUM Tool 2, Program & Course per jabatan (Tool 3),
// permintaan ke vendor (K4), dan pengembangan modul bersama ELGOS. Spek: docs/designs/b13-learning-intervention.md.
// Hanya HR (mockup: atasan dan karyawan tidak punya menu ini). ELGOS tidak mengirim apa pun ke vendor.
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor } = require('../../core/rbac/scope');
const { FLAGS } = require('../../core/flags');
const { badRequest, notFound, HttpError } = require('../../core/errors');
const { importRouter } = require('../imports');
const { evaluate } = require('../tna/performance');
const { rankTrainingNeeds } = require('../tna/pareto');
const {
  LEVELS, ITEM_KINDS, REQUEST_FLOW, moduleStatus, canRequestTransition, recommendedSource, priorityFromPareto, modulePriority, countItems, byPriorityThenCode, norm,
} = require('./domain');
const { generateDraft, validateDraft, sanitizeDraftPatch } = require('./design');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const conflict = (code, msg) => new HttpError(409, code, msg);
const PATH_ACTIVE = {
  request: 'Modul ini sudah punya permintaan ke vendor yang masih berjalan',
  draft: 'Modul ini sudah punya draf pengembangan. Draf yang belum diajukan bisa dihapus dulu bila ingin meminta ke vendor',
};

module.exports = {
  key: 'li',
  title: 'Learning Intervention',
  router({ stores, settings, flags, audit } = {}) {
    const r = express.Router();
    const hr = requireRole(ROLES.HR_ADMIN);
    const reviewer = requireRole(ROLES.HR_ADMIN, ROLES.SME, ROLES.ROLE_LEADER);
    const idParam = (req, _res, next) => (UUID.test(req.params.id) ? next() : next(notFound()));

    /**
     * Prioritas Pareto dari gap training (temuan TNA). Hanya agregat per kompetensi; judul temuan tidak dibaca.
     * Temuan tanpa kompetensi tidak bisa dihubungkan ke modul, jadi tidak ikut peringkat (dilaporkan di `unlinked`).
     * jobRoleId: batasi ke karyawan jabatan itu (mockup: "total gap jabatan ...").
     */
    async function loadPareto(req, conf, jobRoleId) {
      if (!(await flags.isEnabled(req.tenantId, FLAGS.MODULE_TNA))) return { available: false, priorities: new Map(), rows: [], unlinked: 0 };
      const gaps = await stores.li.listTrainingGaps(req.tenantId, await scopeFor(req, stores.people), { jobRoleId });
      const linked = gaps.filter((g) => g.competencyKey);
      const rows = rankTrainingNeeds(linked.map((g) => ({
        userId: g.userId, competencyId: g.competencyKey, competencyName: g.competencyName, title: g.competencyName, importance: g.importance,
        missRatio: g.target != null ? evaluate({ target: g.target, actual: g.actual, direction: g.direction, tolerance: g.tolerance }).missRatio : null,
      })), conf.tna.pareto);
      return { available: true, priorities: priorityFromPareto(rows), rows, unlinked: gaps.length - linked.length };
    }

    /** Modul + status, prioritas, dan saran sumber. */
    async function loadLibrary(req, { jobRoleId } = {}) {
      const conf = await settings.get(req.tenantId);
      const [modules, pareto] = await Promise.all([stores.li.listModules(req.tenantId), loadPareto(req, conf, jobRoleId)]);
      const rows = modules.map((m) => decorate(m, conf, pareto.priorities));
      return { conf, pareto, rows };
    }
    function decorate(m, conf, priorities) {
      return {
        ...m,
        counts: countItems(m.items),
        status: moduleStatus({ request: m.request, draft: m.draft, catalogItemId: m.catalogItemId }),
        priority: modulePriority(m, priorities),
        recommendation: recommendedSource(m, conf.li.devStreams),
      };
    }
    const summary = ({ items: _items, competencyKeys: _c, objective: _o, ...m }) => m;
    function paretoSummary(pareto, rows) {
      const prio = rows.filter((m) => m.priority).sort(byPriorityThenCode);
      const keys = new Set(pareto.rows.map((p) => p.competencyId));
      const linked = rows.filter((m) => m.competencyKeys.some((k) => keys.has(k))).length;
      return {
        available: pareto.available,
        count: prio.length,
        codes: prio.map((m) => m.code),
        cumulativeShare: prio.length ? Math.max(...prio.map((m) => m.priority.cumulativeShare)) : 0,
        withoutGapData: rows.length - linked,
        unlinkedFindings: pareto.unlinked,
      };
    }
    const optionalUuid = (v, label) => { if (v !== undefined && v !== '' && !UUID.test(String(v))) throw badRequest(`${label} tidak valid`); return v || undefined; };

    r.get('/', reviewer, (req, res) => res.json({ module: 'li', title: 'Learning Intervention', tenantId: req.tenantId, role: req.user.role }));
    r.use('/imports', importRouter({ submodule: 'li', stores, audit }));

    // --- Library ---
    r.get('/modules', hr, wrap(async (req, res) => {
      const q = req.query;
      const jobRoleId = optionalUuid(q.jobRoleId, 'Jabatan');
      const { conf, pareto, rows } = await loadLibrary(req, { jobRoleId });
      if (q.level && !LEVELS.includes(q.level)) throw badRequest('Level harus basic, intermediate, atau advanced');
      if (q.type && !ITEM_KINDS.includes(q.type)) throw badRequest('Tipe harus K, S, atau A');
      const data = rows.filter((m) => (!jobRoleId || m.jobRoles.some((j) => j.id === jobRoleId))
        && (q.priority !== 'pareto' || m.priority)
        && (!q.type || m.counts[q.type] > 0)
        && (!q.level || m.level === q.level)
        && (!q.stream || norm(m.stream) === norm(q.stream))).sort(byPriorityThenCode);
      const sum = (k) => rows.reduce((a, m) => a + m.counts[k], 0);
      res.json({
        data: data.map(summary),
        kpis: { modules: rows.length, knowledge: sum('K'), skill: sum('S'), attitude: sum('A'), streams: new Set(rows.map((m) => m.stream).filter(Boolean)).size },
        pareto: paretoSummary(pareto, rows),
        filters: {
          jobRoles: (await stores.li.listJobRoles(req.tenantId)).filter((j) => j.moduleCount > 0),
          streams: [...new Set(rows.map((m) => m.stream).filter(Boolean))].sort(),
        },
        vendorName: conf.li.vendorName,
      });
    }));

    r.get('/modules/:id', hr, idParam, wrap(async (req, res) => {
      // jobRoleId: prioritas dihitung untuk jabatan yang sama dengan daftar yang sedang dilihat
      const { conf, rows } = await loadLibrary(req, { jobRoleId: optionalUuid(req.query.jobRoleId, 'Jabatan') });
      const m = rows.find((x) => x.id === req.params.id);
      if (!m) throw notFound('Modul tidak ditemukan');
      res.json({ data: { ...m, competencyKeys: undefined, vendorName: conf.li.vendorName } });
    }));

    // Tautkan modul ke course di katalog LMS/EliteMentor (atau lepas dengan null). Inilah yang membuat modul "tersedia"
    // bagi rancangan yang sudah disetujui SME, dan bagi modul yang course-nya memang sudah ada.
    r.patch('/modules/:id', hr, idParam, wrap(async (req, res) => {
      const { catalogItemId } = req.body || {};
      if (catalogItemId === undefined) throw badRequest('Isi catalogItemId (atau null untuk melepas tautan)');
      if (catalogItemId !== null && !UUID.test(String(catalogItemId))) throw badRequest('Course katalog tidak ditemukan');
      if (!(await stores.li.getModule(req.tenantId, req.params.id))) throw notFound('Modul tidak ditemukan');
      if (!(await stores.li.setCatalogItem(req.tenantId, req.params.id, catalogItemId))) throw badRequest('Course katalog tidak ditemukan');
      await audit.record(req, 'update', 'li.module', { moduleId: req.params.id, catalogItemId });
      const { rows } = await loadLibrary(req);
      res.json({ data: summary(rows.find((x) => x.id === req.params.id)) });
    }));

    // Pilihan course katalog untuk menautkan modul (tanpa data individu)
    r.get('/catalog', hr, wrap(async (req, res) => res.json({ data: await stores.li.listCatalogItems(req.tenantId) })));

    // --- Permintaan ke vendor ---
    async function requestModule(req, moduleId, vendorName) {
      const out = await stores.li.createRequest(req.tenantId, moduleId, { vendorName, userId: req.user.id });
      if (out && !out.conflict) await audit.record(req, 'create', 'li.module_request', { requestId: out.id, moduleId, moduleCode: out.moduleCode, vendorName });
      return out;
    }

    r.post('/modules/:id/request', hr, idParam, wrap(async (req, res) => {
      const conf = await settings.get(req.tenantId);
      const out = await requestModule(req, req.params.id, conf.li.vendorName);
      if (!out) throw notFound('Modul tidak ditemukan');
      if (out.conflict) throw conflict('PATH_ACTIVE', PATH_ACTIVE[out.conflict]);
      res.status(201).json({ data: out });
    }));

    r.post('/requests/bulk', hr, wrap(async (req, res) => {
      const { scope, jobRoleId, level } = req.body || {};
      if (!['pareto', 'program'].includes(scope)) throw badRequest('scope harus pareto atau program');
      if (scope === 'program' && (!jobRoleId || !UUID.test(String(jobRoleId)) || !LEVELS.includes(level))) throw badRequest('Pilih jabatan dan level program');
      // scope pareto: jobRoleId opsional, sama dengan filter Library, agar yang diminta sama dengan yang tampil
      const roleId = scope === 'pareto' ? optionalUuid(jobRoleId, 'Jabatan') : jobRoleId;
      const { conf, rows } = await loadLibrary(req, { jobRoleId: scope === 'pareto' ? roleId : undefined });
      const inScope = rows.filter((m) => (scope === 'pareto'
        ? !!m.priority && (!roleId || m.jobRoles.some((j) => j.id === roleId))
        : m.level === level && m.jobRoles.some((j) => j.id === jobRoleId)));
      const targets = inScope.filter((m) => m.recommendation === 'vendor' && m.status.key === 'none');
      const created = [];
      for (const m of targets) {
        const out = await requestModule(req, m.id, conf.li.vendorName);
        if (out && !out.conflict) created.push(out);
      }
      res.status(201).json({ data: { created: created.length, skipped: inScope.length - created.length, requests: created } });
    }));

    r.get('/requests', hr, wrap(async (req, res) => {
      const { conf, rows } = await loadLibrary(req);
      const [vendor, drafts] = await Promise.all([stores.li.listRequests(req.tenantId), stores.li.listDrafts(req.tenantId)]);
      const candidates = rows.filter((m) => m.recommendation === 'dev' && m.status.key === 'none').sort(byPriorityThenCode)
        .map((m) => ({ id: m.id, code: m.code, name: m.name, priority: m.priority }));
      res.json({ data: { vendor, drafts, candidates }, vendorName: conf.li.vendorName });
    }));

    r.patch('/requests/:id', hr, idParam, wrap(async (req, res) => {
      const { status, note, catalogItemId } = req.body || {};
      const current = await stores.li.getRequest(req.tenantId, req.params.id);
      if (!current) throw notFound('Permintaan tidak ditemukan');
      const statuses = [...REQUEST_FLOW, 'cancelled'];
      if (!statuses.includes(status)) throw badRequest(`Status harus salah satu dari ${statuses.join(', ')}`);
      if (!canRequestTransition(current.status, status)) throw conflict('INVALID_TRANSITION', `Status tidak bisa diubah dari ${current.status} ke ${status}`);
      if (catalogItemId !== undefined && catalogItemId !== null) {
        if (status !== 'installed') throw badRequest('Course katalog hanya diisi saat modul dipasang');
        if (!UUID.test(String(catalogItemId)) || !(await stores.li.catalogItemExists(req.tenantId, catalogItemId))) throw badRequest('Course katalog tidak ditemukan');
      }
      const out = await stores.li.moveRequest(req.tenantId, current.id, current.status, status, {
        userId: req.user.id, note: note === undefined ? undefined : String(note).slice(0, 2000), catalogItemId: catalogItemId || null,
      });
      if (!out) throw conflict('INVALID_TRANSITION', 'Status permintaan sudah berubah. Muat ulang halaman');
      await audit.record(req, 'update', 'li.module_request', { requestId: out.id, moduleId: out.moduleId, from: current.status, to: status, catalogItemId: catalogItemId || undefined });
      res.json({ data: out });
    }));

    // --- Program & Course (jabatan x level) ---
    r.get('/programs', hr, wrap(async (req, res) => {
      const jobRoles = (await stores.li.listJobRoles(req.tenantId)).map((j) => ({ id: j.id, name: j.name, division: j.division, hasDictionary: j.moduleCount > 0 }));
      const jobRoleId = optionalUuid(req.query.jobRoleId, 'Jabatan') || (jobRoles.find((j) => j.hasDictionary) || jobRoles[0] || {}).id || null;
      const { conf, pareto, rows } = await loadLibrary(req, { jobRoleId: jobRoleId || undefined });
      const level = req.query.level || 'basic';
      if (!LEVELS.includes(level)) throw badRequest('Level harus basic, intermediate, atau advanced');
      if (jobRoleId && !jobRoles.some((j) => j.id === jobRoleId)) throw notFound('Jabatan tidak ditemukan');
      const ofJob = rows.filter((m) => m.jobRoles.some((j) => j.id === jobRoleId));
      const courses = ofJob.filter((m) => m.level === level).sort(byPriorityThenCode);
      const n = (keys) => courses.filter((m) => keys.includes(m.status.key)).length;
      const streams = [...new Set(courses.map((m) => m.stream || 'Lainnya'))];
      res.json({
        data: {
          jobRoles, jobRoleId, level,
          levels: LEVELS.map((l) => ({ level: l, count: ofJob.filter((m) => m.level === l).length })),
          kpis: { courses: courses.length, available: n(['available']), inProgress: n(['requested', 'confirmed', 'delivered', 'dev_draft', 'dev_review', 'dev_approved']), noSource: n(['none']) },
          groups: streams.map((s) => ({ stream: s, modules: courses.filter((m) => (m.stream || 'Lainnya') === s).map(summary) })),
          pareto: { available: pareto.available, codes: courses.filter((m) => m.priority).map((m) => m.code) },
        },
        vendorName: conf.li.vendorName,
      });
    }));

    // --- Pengembangan modul bersama ELGOS ---
    r.post('/modules/:id/draft', hr, idParam, wrap(async (req, res) => {
      const m = await stores.li.getModule(req.tenantId, req.params.id);
      if (!m) throw notFound('Modul tidak ditemukan');
      if (!m.items.length) throw badRequest('Modul ini belum punya butir KSA untuk dikembangkan');
      const out = await stores.li.createDraft(req.tenantId, m.id, { ...generateDraft(m), generatedBy: 'template' }, req.user.id);
      if (!out) throw notFound('Modul tidak ditemukan');
      if (out.conflict) throw conflict('PATH_ACTIVE', PATH_ACTIVE.request);
      if (out.created) await audit.record(req, 'create', 'li.module_draft', { draftId: out.draft.id, moduleId: m.id, moduleCode: m.code });
      res.status(out.created ? 201 : 200).json({ data: out.draft });
    }));

    const loadDraft = async (req) => {
      const d = await stores.li.getDraft(req.tenantId, req.params.id);
      if (!d) throw notFound('Draf tidak ditemukan');
      return d;
    };
    const editable = (d) => { if (!['draft', 'returned'].includes(d.status)) throw conflict('INVALID_STATE', 'Draf yang sudah diajukan tidak bisa diubah'); };

    // Antrian tinjauan untuk SME/role leader (dan HR): hanya draf yang sedang menunggu tinjauan kecuali HR meminta semua.
    r.get('/drafts', reviewer, wrap(async (req, res) => {
      const isHr = [ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(req.user.role);
      const status = isHr && req.query.status !== 'sme_review' ? undefined : 'sme_review';
      res.json({ data: await stores.li.listDrafts(req.tenantId, { status }) });
    }));

    r.get('/drafts/:id', reviewer, idParam, wrap(async (req, res) => {
      const d = await loadDraft(req);
      // SME/role leader hanya melihat draf yang sedang menunggu tinjauan (sama dengan antreannya)
      if (![ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(req.user.role) && d.status !== 'sme_review') throw notFound('Draf tidak ditemukan');
      res.json({ data: d });
    }));

    r.put('/drafts/:id', hr, idParam, wrap(async (req, res) => {
      editable(await loadDraft(req));
      const { value, error } = sanitizeDraftPatch(req.body);
      if (error) throw badRequest(error);
      const out = await stores.li.updateDraft(req.tenantId, req.params.id, value);
      if (!out) throw conflict('INVALID_STATE', 'Draf yang sudah diajukan tidak bisa diubah');
      await audit.record(req, 'update', 'li.module_draft', { draftId: out.id, moduleId: out.moduleId, fields: Object.keys(value) });
      res.json({ data: out });
    }));

    r.delete('/drafts/:id', hr, idParam, wrap(async (req, res) => {
      const d = await loadDraft(req);
      editable(d);
      if (!(await stores.li.deleteDraft(req.tenantId, d.id))) throw conflict('INVALID_STATE', 'Draf yang sudah diajukan tidak bisa dihapus');
      await audit.record(req, 'delete', 'li.module_draft', { draftId: d.id, moduleId: d.moduleId });
      res.status(204).end();
    }));

    r.post('/drafts/:id/submit', hr, idParam, wrap(async (req, res) => {
      const d = await loadDraft(req);
      editable(d);
      const err = validateDraft(d);
      if (err) throw badRequest(err);
      const out = await stores.li.submitDraft(req.tenantId, d.id, req.user.id);
      if (!out) throw conflict('INVALID_STATE', 'Draf sudah diajukan');
      await audit.record(req, 'update', 'li.module_draft', { draftId: d.id, moduleId: d.moduleId, to: 'sme_review' });
      res.json({ data: out });
    }));

    r.post('/drafts/:id/review', reviewer, idParam, wrap(async (req, res) => {
      const d = await loadDraft(req);
      const { decision, note } = req.body || {};
      if (!['approved', 'returned'].includes(decision)) throw badRequest('Keputusan harus approved atau returned');
      if (d.status !== 'sme_review') throw conflict('INVALID_STATE', 'Draf ini tidak sedang menunggu tinjauan SME');
      if (decision === 'returned' && !String(note || '').trim()) throw badRequest('Isi catatan untuk draf yang dikembalikan');
      // SME/role leader meninjau sendiri; HR hanya mencatat keputusan SME, jadi nama SME wajib diisi.
      const onBehalf = [ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(req.user.role);
      let reviewerName = String((req.body || {}).reviewerName || '').trim().slice(0, 255);
      if (onBehalf && !reviewerName) throw badRequest('Isi nama SME yang meninjau');
      if (!onBehalf) reviewerName = ((await stores.people.get(req.tenantId, req.user.id)) || {}).name || req.user.email || 'SME';
      const out = await stores.li.reviewDraft(req.tenantId, d.id, { decision, note: String(note || '').trim().slice(0, 2000), reviewerName, recordedByHr: onBehalf, userId: req.user.id });
      if (!out) throw conflict('INVALID_STATE', 'Draf ini tidak sedang menunggu tinjauan SME');
      await audit.record(req, 'update', 'li.module_draft', { draftId: d.id, moduleId: d.moduleId, to: decision, reviewerName, recordedByHr: onBehalf });
      res.json({ data: out });
    }));

    return r;
  },
};
