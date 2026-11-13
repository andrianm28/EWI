'use strict';
// Development Need Analysis (DNA). RG-1: gap individu terhadap kompetensi jabatan + jenjang karier.
// Terbuka (jangan dikunci di sini): RG-1a sumber kamus kompetensi, RG-1b sumber status lulus program,
// RG-1c alur wawancara SME/DACUM, RG-1e siapa melihat kandidat promosi.
const crypto = require('crypto');
const express = require('express');
const { FLAGS, requireFlag } = require('../../core/flags');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor, inScope } = require('../../core/rbac/scope');
const { badRequest, notFound, HttpError } = require('../../core/errors');
const { interviewRouter, wrap } = require('../interviews');
const { computeGap } = require('./gap');
const { careerStatus } = require('./career');

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
  return null;
}

const toCompetency = (c) => ({
  jobRoleId: c.jobRoleId || null, careerLevelId: c.careerLevelId || null, kind: c.kind, name: String(c.name),
  definition: c.definition || null, indicators: Array.isArray(c.indicators) ? c.indicators : [],
  source: c.source || 'hr_rule', requiredScore: c.requiredScore ?? 3, importance: c.importance ?? 3,
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
  router({ stores, ai, settings, flags } = {}) {
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
    r.post('/competencies', hr, wrap(async (req, res) => {
      const err = validateCompetency(req.body);
      if (err) throw badRequest(err);
      res.status(201).json({ data: await stores.dna.createCompetency(req.tenantId, toCompetency(req.body)) });
    }));
    // Impor massal (mis. dari dokumen jenjang HR atau hasil DACUM yang sudah ada)
    r.post('/competencies/bulk', hr, wrap(async (req, res) => {
      const items = (req.body || {}).items;
      if (!Array.isArray(items) || !items.length || items.length > 500) throw badRequest('items wajib berisi 1-500 kompetensi');
      const errors = items.map((c, i) => ({ index: i, error: validateCompetency(c) })).filter((e) => e.error);
      if (errors.length) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Sebagian kompetensi tidak valid', details: errors } });
      const created = [];
      for (const c of items) created.push(await stores.dna.createCompetency(req.tenantId, toCompetency(c)));
      return res.status(201).json({ data: created });
    }));
    r.post('/competencies/:id/approve', hr, wrap(async (req, res) => {
      const row = await stores.dna.approveCompetency(req.tenantId, req.params.id, req.user.id);
      if (!row) throw notFound('Kompetensi tidak ditemukan');
      res.json({ data: row });
    }));

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
      const comps = await stores.dna.listCompetencies(req.tenantId);
      const byName = new Map(comps.map((c) => [c.name.trim().toLowerCase(), c]));
      const byId = new Map(comps.map((c) => [c.id, c]));
      const users = await stores.people.resolve(req.tenantId, {
        employeeIds: rows.map((r0) => r0 && r0.employeeId).filter(Boolean).map(String),
        emails: rows.map((r0) => r0 && r0.email).filter(Boolean).map((e) => String(e).trim().toLowerCase()),
      });
      const batchId = crypto.randomUUID();
      const rejected = [];
      let imported = 0;
      for (const [index, raw] of rows.entries()) {
        const row = raw || {};
        const score = Number(row.score);
        if (!Number.isInteger(score) || score < 0 || score > 4) { rejected.push({ index, reason: 'score harus bilangan bulat 0-4' }); continue; }
        const comp = row.competencyId ? byId.get(row.competencyId) : byName.get(String(row.competency || '').trim().toLowerCase());
        if (!comp) { rejected.push({ index, reason: 'Kompetensi tidak ada di kamus kompetensi organisasi ini' }); continue; }
        const email = row.email ? String(row.email).trim().toLowerCase() : null;
        const u = users.find((x) => (row.employeeId && x.employeeId === String(row.employeeId)) || (email && x.email === email));
        if (!u) { rejected.push({ index, reason: 'Karyawan tidak ditemukan di organisasi ini' }); continue; }
        const when = row.assessedAt || assessedAt;
        await stores.dna.addAssessment(req.tenantId, {
          userId: u.id, competencyId: comp.id, score, confidence: 1, source: 'manual_interview',
          evidence: row.evidence ? String(row.evidence) : null, assessor: row.assessor || assessor || null,
          assessedAt: when && !Number.isNaN(Date.parse(when)) ? new Date(when) : null, importBatchId: batchId,
        });
        imported += 1;
      }
      res.status(201).json({ data: { batchId, imported, rejected } });
    }));

    // --- Dashboard karier & gap (learner: dirinya, atasan: timnya, HR: semua) ---
    r.get('/employees', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      const people = await stores.people.list(req.tenantId, scope, { roles: ['learner', 'supervisor', 'role_leader', 'sme'], jobRoleId: req.query.jobRoleId });
      const showPromotion = await canSeePromotion(req, flags, settings);
      const rows = await profiles(stores, req.tenantId, people);
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
      res.json({ data: { person, gap: computeGap({ competencies, assessments }), career, completions, levels } });
    }));

    r.get('/promotion-candidates', requireFlag(flags, FLAGS.PROMOTION_RECOMMENDATION, 'Modul rekomendasi promosi belum diaktifkan'), wrap(async (req, res) => {
      if (!(await canSeePromotion(req, flags, settings))) {
        throw new HttpError(403, 'ROLE_FORBIDDEN', 'Saran kandidat promosi hanya untuk HR');
      }
      const scope = await scopeFor(req, stores.people);
      const people = await stores.people.list(req.tenantId, scope, { roles: ['learner', 'supervisor', 'role_leader', 'sme'] });
      const rows = await profiles(stores, req.tenantId, people);
      res.json({ data: rows.filter((p) => p.career.promotionCandidate) });
    }));

    r.use('/sessions', requireFlag(flags, FLAGS.DNA_AI_INTERVIEW, 'Wawancara AI DNA belum diaktifkan; gunakan impor hasil wawancara manual'),
      interviewRouter({ submodule: 'dna', stores, ai }));
    return r;
  },
};
