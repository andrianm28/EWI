'use strict';
// Development Need Analysis (DNA). RG-1: gap individu terhadap kompetensi jabatan + jenjang karier.
// Terbuka (jangan dikunci di sini): RG-1a sumber kamus kompetensi, RG-1b sumber status lulus program,
// RG-1c alur wawancara SME/DACUM, RG-1e siapa melihat kandidat promosi.
const crypto = require('crypto');
const express = require('express');
const { FLAGS, requireFlag } = require('../../core/flags');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor, inScope } = require('../../core/rbac/scope');
const { badRequest, notFound, conflict, HttpError } = require('../../core/errors');
const { interviewRouter, wrap } = require('../interviews');
const { computeGap } = require('./gap');
const { careerStatus } = require('./career');
const { importRouter } = require('../imports');
const { getKind } = require('../imports/kinds');
const { validateRows, commitRows } = require('../imports/engine');
const { developmentRoutes, isUuid, orConflict } = require('./development-routes');

const TIERS = ['basic', 'intermediate', 'advanced'];
const KINDS = ['core', 'job'];
// 'dacum' & 'both' boleh diimpor sebagai data; alur wawancara SME yang menghasilkannya menunggu RG-1c.
const SOURCES = ['hr_rule', 'dacum', 'cca', 'both'];

function validateCompetency(b) {
  const c = b || {};
  if (!c.name) return 'name wajib diisi';
  if (!KINDS.includes(c.kind)) return 'kind harus core atau job';
  if (c.kind === 'job' && !c.jobRoleId) return 'jobRoleId wajib untuk kompetensi jabatan';
  if (c.source && !SOURCES.includes(c.source)) return `source harus salah satu: ${SOURCES.join(', ')}`;
  if (c.requiredScore != null && !(Number.isInteger(c.requiredScore) && c.requiredScore >= 0 && c.requiredScore <= 4)) return 'requiredScore 0-4';
  if (c.importance != null && !(Number.isInteger(c.importance) && c.importance >= 1 && c.importance <= 5)) return 'importance 1-5';
  return validateDictionaryFields(c, { hasJobRole: Boolean(c.jobRoleId) });
}

/** B4: kode modul, rumpun, dan tingkat program (BIA). Kode hanya untuk kompetensi yang punya job role. */
function validateDictionaryFields(c, { hasJobRole }) {
  if (c.code != null && (typeof c.code !== 'string' || !c.code.trim() || c.code.trim().length > 32)) return 'code harus teks 1-32 karakter';
  if (c.code != null && !hasJobRole) return 'code hanya untuk kompetensi yang punya jobRoleId';
  if (c.stream != null && (typeof c.stream !== 'string' || c.stream.trim().length > 64)) return 'stream maksimal 64 karakter';
  if (c.programTier != null && !TIERS.includes(c.programTier)) return 'programTier harus basic, intermediate, atau advanced';
  return null;
}
const cleanCode = (v) => (v == null ? null : String(v).trim());
const cleanText = (v) => (v == null || !String(v).trim() ? null : String(v).trim());

const toCompetency = (c) => ({
  jobRoleId: c.jobRoleId || null, careerLevelId: c.careerLevelId || null, kind: c.kind, name: String(c.name),
  definition: c.definition || null, indicators: Array.isArray(c.indicators) ? c.indicators : [],
  source: c.source || 'hr_rule', requiredScore: c.requiredScore ?? 3, importance: c.importance ?? 3,
  code: cleanCode(c.code), stream: cleanText(c.stream), programTier: c.programTier || null,
});

/** Profil DNA beberapa karyawan sekaligus (dashboard). */
async function profiles(stores, tenantId, people) {
  const ids = people.map((p) => p.id);
  const [levels, assessments, completions] = await Promise.all([
    stores.dna.listLevels(tenantId), stores.dna.assessmentsFor(tenantId, ids), stores.dna.completions(tenantId, ids),
  ]);
  const compCache = new Map();
  const out = [];
  for (const p of people) {
    const key = `${p.jobRoleId}|${p.careerLevelId}`;
    if (!compCache.has(key)) {
      compCache.set(key, p.jobRoleId ? await stores.dna.competenciesForPosition(tenantId, p) : []);
    }
    const gap = computeGap({ competencies: compCache.get(key), assessments: assessments.filter((a) => a.userId === p.id) });
    const career = careerStatus({
      levels: levels.filter((l) => l.jobRoleId === p.jobRoleId), currentLevelId: p.careerLevelId,
      completions: completions.filter((c) => c.userId === p.id),
    });
    out.push({ ...p, gap: gap.summary, career });
  }
  return out;
}

/** Saran kandidat promosi hanya bila modul promosi aktif (G2-A) dan peran diizinkan (RG-1e). */
async function canSeePromotion(req, flags, settings) {
  if (!(await flags.isEnabled(req.tenantId, FLAGS.PROMOTION_RECOMMENDATION))) return false;
  if (req.user.role === ROLES.ETA_ADMIN) return true;
  return (await settings.get(req.tenantId)).dna.promotionVisibleTo.includes(req.user.role);
}

module.exports = {
  key: 'dna',
  title: 'Development Need Analysis',
  router({ stores, ai, settings, flags, audit } = {}) {
    const r = express.Router();
    const hr = requireRole(ROLES.HR_ADMIN);

    r.get('/', (req, res) => res.json({ module: 'dna', title: 'Development Need Analysis', tenantId: req.tenantId, role: req.user.role }));

    // --- Kamus kompetensi & jenjang (konfigurasi per klien, RG-1g) ---
    r.get('/job-roles', wrap(async (req, res) => res.json({ data: await stores.dna.listJobRoles(req.tenantId) })));
    r.post('/job-roles', hr, wrap(async (req, res) => {
      const { name, division, description, levels = [] } = req.body || {};
      if (!name) throw badRequest('name wajib diisi');
      if (!Array.isArray(levels) || levels.some((l) => !l || !l.name || (l.programTier && !TIERS.includes(l.programTier)))) {
        throw badRequest('levels berisi { name, programTier? basic|intermediate|advanced }, urut dari jenjang terendah');
      }
      res.status(201).json({ data: await stores.dna.createJobRole(req.tenantId, { name, division, description, levels }) });
    }));

    r.get('/competencies', wrap(async (req, res) => {
      res.json({ data: await stores.dna.listCompetencies(req.tenantId, { jobRoleId: req.query.jobRoleId, careerLevelId: req.query.careerLevelId }) });
    }));
    /** A12: jobRoleId/careerLevelId di body harus milik tenant (dan jenjang milik job role itu), selain itu 400. */
    async function positionError(tenantId, items) {
      const roles = await stores.dna.listJobRoles(tenantId);
      for (const [index, c] of items.entries()) {
        if (!c.jobRoleId && c.careerLevelId) return { index, error: 'careerLevelId butuh jobRoleId' };
        if (!c.jobRoleId) continue;
        const role = roles.find((x) => x.id === c.jobRoleId);
        if (!role) return { index, error: 'jobRoleId bukan jabatan di organisasi ini' };
        if (c.careerLevelId && !role.levels.some((l) => l.id === c.careerLevelId)) return { index, error: 'careerLevelId bukan jenjang dari job role ini' };
      }
      return null;
    }
    /** Kode unik per jabatan tanpa beda huruf besar/kecil: cek di dalam batch dan terhadap kamus, sebelum menulis. */
    async function assertCodesFree(tenantId, items, exceptId) {
      const seen = new Set(); const existing = new Map();
      for (const c of items.filter((x) => x.code != null)) {
        const key = `${c.jobRoleId}|${cleanCode(c.code).toLowerCase()}`;
        if (seen.has(key)) throw conflict(`Kode ${cleanCode(c.code)} muncul lebih dari sekali untuk jabatan yang sama`);
        seen.add(key);
        if (!existing.has(c.jobRoleId)) existing.set(c.jobRoleId, await stores.dna.listCompetencies(tenantId, { jobRoleId: c.jobRoleId }));
        if (existing.get(c.jobRoleId).some((x) => x.id !== exceptId && x.code && x.code.toLowerCase() === cleanCode(c.code).toLowerCase())) {
          throw conflict(`Kode ${cleanCode(c.code)} sudah dipakai di jabatan ini`);
        }
      }
    }
    const CODE_TAKEN = 'Kode kompetensi sudah dipakai di jabatan ini';

    r.post('/competencies', hr, wrap(async (req, res) => {
      const err = validateCompetency(req.body);
      if (err) throw badRequest(err);
      const pos = await positionError(req.tenantId, [req.body]);
      if (pos) throw badRequest(pos.error);
      await assertCodesFree(req.tenantId, [req.body]);
      res.status(201).json({ data: await orConflict(stores.dna.createCompetency(req.tenantId, toCompetency(req.body)), CODE_TAKEN) });
    }));
    // B4: melengkapi/koreksi kamus yang sudah ada. Perubahan mereset pengesahan (A7).
    r.patch('/competencies/:id', hr, wrap(async (req, res) => {
      const current = isUuid(req.params.id) ? await stores.dna.getCompetency(req.tenantId, req.params.id) : null;
      if (!current) throw notFound('Kompetensi tidak ditemukan');
      const b = req.body || {};
      const patch = {};
      for (const k of ['name', 'definition', 'code', 'stream', 'programTier', 'requiredScore', 'importance']) if (b[k] !== undefined) patch[k] = b[k];
      if (!Object.keys(patch).length) throw badRequest('Tidak ada kolom yang diubah');
      if (patch.name !== undefined && (typeof patch.name !== 'string' || !patch.name.trim())) throw badRequest('name wajib diisi');
      if (patch.requiredScore != null && !(Number.isInteger(patch.requiredScore) && patch.requiredScore >= 0 && patch.requiredScore <= 4)) throw badRequest('requiredScore 0-4');
      if (patch.importance != null && !(Number.isInteger(patch.importance) && patch.importance >= 1 && patch.importance <= 5)) throw badRequest('importance 1-5');
      if (patch.requiredScore === null || patch.importance === null) throw badRequest('requiredScore dan importance tidak boleh dikosongkan');
      const err = validateDictionaryFields(patch, { hasJobRole: Boolean(current.jobRoleId) });
      if (err) throw badRequest(err);
      if (patch.name !== undefined) patch.name = patch.name.trim();
      if (patch.code !== undefined) patch.code = cleanCode(patch.code);
      if (patch.stream !== undefined) patch.stream = cleanText(patch.stream);
      if (patch.code) await assertCodesFree(req.tenantId, [{ jobRoleId: current.jobRoleId, code: patch.code }], current.id);
      res.json({ data: await orConflict(stores.dna.updateCompetency(req.tenantId, current.id, patch), CODE_TAKEN) });
    }));
    // Impor massal (mis. dari dokumen jenjang HR atau hasil DACUM yang sudah ada)
    r.post('/competencies/bulk', hr, wrap(async (req, res) => {
      const items = (req.body || {}).items;
      if (!Array.isArray(items) || !items.length || items.length > 500) throw badRequest('items wajib berisi 1-500 kompetensi');
      const errors = items.map((c, i) => ({ index: i, error: validateCompetency(c) })).filter((e) => e.error);
      if (errors.length) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Sebagian kompetensi tidak valid', details: errors } });
      const pos = await positionError(req.tenantId, items);
      if (pos) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Sebagian kompetensi tidak valid', details: [pos] } });
      await assertCodesFree(req.tenantId, items);
      const created = [];
      for (const c of items) created.push(await orConflict(stores.dna.createCompetency(req.tenantId, toCompetency(c)), CODE_TAKEN));
      return res.status(201).json({ data: created });
    }));
    r.post('/competencies/:id/approve', hr, wrap(async (req, res) => {
      const row = await stores.dna.approveCompetency(req.tenantId, req.params.id, req.user.id);
      if (!row) throw notFound('Kompetensi tidak ditemukan');
      res.json({ data: row });
    }));

    // B4: kamus per job function, kurikulum BIA, tahap dan rencana pengembangan
    developmentRoutes(r, { stores, audit });

    // RG-1c terbuka: wawancara SME -> DACUM belum dibangun.
    r.post('/dacum/sessions', hr, (_req, _res, next) => next(new HttpError(501, 'DECISION_PENDING',
      'Alur wawancara SME/DACUM menunggu keputusan RG-1a/RG-1c. Untuk sementara impor kamus kompetensi lewat /dna/competencies/bulk.')));

    // --- Posisi karyawan & status program ---
    r.put('/employees/:userId/position', hr, wrap(async (req, res) => {
      const { jobRoleId, careerLevelId } = req.body || {};
      if (!jobRoleId) throw badRequest('jobRoleId wajib diisi');
      const levels = await stores.dna.listLevels(req.tenantId, jobRoleId);
      if (careerLevelId && !levels.some((l) => l.id === careerLevelId)) throw badRequest('careerLevelId bukan jenjang dari job role ini');
      const row = await stores.people.setPosition(req.tenantId, req.params.userId, { jobRoleId, careerLevelId: careerLevelId || null });
      if (!row) throw notFound('Karyawan tidak ditemukan');
      res.json({ data: { userId: row.id, jobRoleId, careerLevelId: careerLevelId || null } });
    }));

    // RG-1b terbuka: sumber 'manual' (HR) di sini; Sync Back EliteMentor/LMS klien menulis ke tabel yang sama dengan source lain.
    r.post('/program-completions', hr, wrap(async (req, res) => {
      const { userId, programTier, status, passedAt } = req.body || {};
      if (!userId || !TIERS.includes(programTier) || !['in_progress', 'passed', 'failed'].includes(status)) {
        throw badRequest('userId, programTier (basic|intermediate|advanced), status (in_progress|passed|failed) wajib');
      }
      if (!(await stores.people.get(req.tenantId, userId))) throw notFound('Karyawan tidak ditemukan');
      const row = await stores.dna.upsertCompletion(req.tenantId, {
        userId, programTier, status, source: 'manual', passedAt: status === 'passed' ? passedAt || new Date() : null, recordedBy: req.user.id,
      });
      res.status(201).json({ data: row });
    }));

    // Penilaian ulang manual oleh Admin ETA (kalibrasi skor AI, B2/B20)
    r.post('/assessments', requireRole(), wrap(async (req, res) => {
      const { userId, competencyId, score, evidence } = req.body || {};
      if (!userId || !competencyId || !Number.isInteger(score) || score < 0 || score > 4) throw badRequest('userId, competencyId, score 0-4 wajib');
      if (!(await stores.dna.getCompetency(req.tenantId, competencyId))) throw notFound('Kompetensi tidak ditemukan');
      if (!(await stores.people.get(req.tenantId, userId))) throw notFound('Karyawan tidak ditemukan');
      res.status(201).json({ data: await stores.dna.addAssessment(req.tenantId, { userId, competencyId, score, confidence: 1, source: 'eta_review', evidence: evidence || 'Penilaian ulang Admin ETA' }) });
    }));

    // Cadence 11 Nov (C2): hasil wawancara DNA manual (mis. ELGOS) diimpor HR, satu baris = karyawan × kompetensi.
    // Kompetensi dicocokkan dengan kamus (nama, tanpa beda huruf besar/kecil) atau competencyId; tidak dibuat otomatis.
    r.post('/assessments/import', hr, wrap(async (req, res) => {
      const { rows, assessor, assessedAt } = req.body || {};
      if (!Array.isArray(rows) || !rows.length || rows.length > 5000) throw badRequest('rows wajib berisi 1-5000 baris');
      if (assessedAt && Number.isNaN(Date.parse(assessedAt))) throw badRequest('assessedAt bukan tanggal yang valid');
      const kind = getKind('dna_results');
      const ctx = { stores, tenantId: req.tenantId, options: { assessor, assessedAt } };
      const { accepted, rejected } = await validateRows(kind, rows, ctx);
      const batchId = crypto.randomUUID();
      await commitRows(kind, accepted, { ...ctx, batchId, user: req.user });
      res.status(201).json({ data: { batchId, imported: accepted.length, rejected: rejected.map(({ index, reason }) => ({ index, reason })) } });
    }));

    // R3-3: impor file XLSX/CSV dengan pemetaan kolom (karyawan, jenjang, kamus, status lulus, hasil DNA)
    r.use('/imports', importRouter({ submodule: 'dna', stores, audit }));

    // --- Dashboard karier & gap (learner: dirinya, atasan: timnya, HR: semua) ---
    r.get('/employees', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      const people = await stores.people.list(req.tenantId, scope, { roles: ['learner', 'supervisor', 'role_leader', 'sme'], jobRoleId: req.query.jobRoleId });
      const showPromotion = await canSeePromotion(req, flags, settings);
      const rows = await profiles(stores, req.tenantId, people);
      await audit.readIndividual(req, 'dna.employee_results', { employeeIds: people.map((p) => p.id), objectType: 'dna_profile' });
      res.json({ data: rows.map((p) => (showPromotion ? p : { ...p, career: { ...p.career, promotionCandidate: undefined } })) });
    }));

    r.get('/employees/:userId', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      if (!inScope(scope, req.params.userId)) throw notFound('Karyawan tidak ditemukan');
      const person = await stores.people.get(req.tenantId, req.params.userId);
      if (!person) throw notFound('Karyawan tidak ditemukan');
      const [competencies, assessments, levels, completions] = await Promise.all([
        person.jobRoleId ? stores.dna.competenciesForPosition(req.tenantId, person) : [],
        stores.dna.assessments(req.tenantId, person.id),
        person.jobRoleId ? stores.dna.listLevels(req.tenantId, person.jobRoleId) : [],
        stores.dna.completions(req.tenantId, [person.id]),
      ]);
      const career = careerStatus({ levels, currentLevelId: person.careerLevelId, completions });
      if (!(await canSeePromotion(req, flags, settings))) delete career.promotionCandidate;
      await audit.readIndividual(req, 'dna.employee_result', { employeeIds: [person.id], objectType: 'dna_profile', objectIds: assessments.map((a) => a.id) });
      res.json({ data: { person, gap: computeGap({ competencies, assessments }), career, completions, levels } });
    }));

    r.get('/promotion-candidates', requireFlag(flags, FLAGS.PROMOTION_RECOMMENDATION, 'Modul rekomendasi promosi belum diaktifkan'), wrap(async (req, res) => {
      if (!(await canSeePromotion(req, flags, settings))) {
        throw new HttpError(403, 'ROLE_FORBIDDEN', 'Saran kandidat promosi hanya untuk HR');
      }
      const scope = await scopeFor(req, stores.people);
      const people = await stores.people.list(req.tenantId, scope, { roles: ['learner', 'supervisor', 'role_leader', 'sme'] });
      const rows = (await profiles(stores, req.tenantId, people)).filter((p) => p.career.promotionCandidate);
      await audit.readIndividual(req, 'dna.promotion_candidates', { employeeIds: rows.map((p) => p.id), objectType: 'dna_profile' });
      res.json({ data: rows });
    }));

    r.use('/sessions', requireFlag(flags, FLAGS.DNA_AI_INTERVIEW, 'Wawancara AI DNA belum diaktifkan; gunakan impor hasil wawancara manual'),
      interviewRouter({ submodule: 'dna', stores, ai, audit }));
    return r;
  },
};
