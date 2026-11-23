'use strict';
// Improvement Needs (INA), paket B9. HR mengelola tindakan perbaikan untuk masalah non-pelatihan (SOP, alat,
// sistem, budaya) dan memeriksa statusnya lewat wawancara singkat AI ke pemilik tindakan.
// Spek: docs/designs/b9-improvement-needs.md. Akses: ./access.js (K1 = PM-6). Aturan murni: ./domain.js.
const express = require('express');
const { ROLES } = require('../../core/rbac');
const { FLAGS, requireFlag } = require('../../core/flags');
const { badRequest, notFound, forbidden, HttpError } = require('../../core/errors');
const { LEVELS, inaAccess, requireLevel } = require('./access');
const { CATEGORIES, STATUSES, canTransition, isOpen, isOverdue, kpis, isDate, isUuid, normId } = require('./domain');
const { createVerificationAi } = require('./verification-ai');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const conflict = (code, msg, extra) => Object.assign(new HttpError(409, code, msg), extra ? { details: extra } : {});
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const today = () => new Date().toISOString().slice(0, 10);
const MANAGE = [LEVELS.MANAGE];

function text(body, key, label, max, { required = false, min = 1 } = {}) {
  const v = body[key];
  if (v === null || v === undefined || v === '') {
    if (required) throw badRequest(`${label} wajib diisi`);
    return null;
  }
  if (typeof v !== 'string') throw badRequest(`${label} harus berupa teks`);
  const t = v.trim();
  if (!t) { if (required) throw badRequest(`${label} wajib diisi`); return null; }
  if (t.length < min || t.length > max) throw badRequest(`${label} harus ${min}-${max} karakter`);
  return t;
}

module.exports = {
  key: 'ina',
  title: 'Improvement Needs',
  router({ stores, flags, audit, ai } = {}) {
    const r = express.Router();
    const db = stores.ina;
    const verifier = createVerificationAi(ai);
    const dashboard = requireFlag(flags, FLAGS.INA_DASHBOARD, 'Improvement Needs belum diaktifkan untuk organisasi Anda');
    const aiFlag = requireFlag(flags, FLAGS.INA_AI_VERIFICATION, 'Verifikasi AI belum diaktifkan untuk organisasi Anda');

    r.get('/', (req, res) => res.json({ module: 'ina', title: 'Improvement Needs', tenantId: req.tenantId }));

    // Untuk menu di web. Sengaja di luar flag ina.dashboard: flag mati dijawab level null, bukan galat.
    r.get('/access/me', wrap(async (req, res) => {
      const [dash, aiOn] = await Promise.all([flags.isEnabled(req.tenantId, FLAGS.INA_DASHBOARD), flags.isEnabled(req.tenantId, FLAGS.INA_AI_VERIFICATION)]);
      const level = dash ? (await inaAccess(req, stores)).level : null;
      const pendingVerifications = dash && aiOn ? await db.countPending(req.tenantId, req.user.id) : 0;
      res.json({ data: { level, pendingVerifications } });
    }));

    // ---------- bentuk jawaban ----------
    /** level read (atasan) tidak menerima rujukan temuan dan status yang dilaporkan pemilik. */
    function publicAction(a, level, { detail = false } = {}) {
      const manage = level === LEVELS.MANAGE;
      const out = {
        id: a.id, title: a.title, category: a.category, subLabel: a.subLabel, ownerUserId: a.ownerUserId, ownerName: a.ownerName,
        ownerJobRoleName: a.ownerJobRoleName, sourceRef: a.sourceRef, dueDate: a.dueDate, status: a.status, overdue: isOverdue(a, today()),
        lastVerification: a.verificationId
          ? { id: a.verificationId, status: a.verificationStatus, endedAt: a.verificationEndedAt, ...(manage ? { reportedStatus: a.verificationReportedStatus } : {}) }
          : null,
        createdAt: a.createdAt, updatedAt: a.updatedAt,
      };
      if (manage) Object.assign(out, { findingId: a.findingId, competencyId: a.competencyId, performanceRecordId: a.performanceRecordId, involvesIndividual: a.involvesIndividual });
      if (detail) out.detail = a.detail;
      return out;
    }
    /** HR: ringkasan tanpa transkrip (PO-6). Pemilik: `turns` ditambahkan oleh rutenya sendiri. */
    const publicVerification = (v) => ({
      id: v.id, actionId: v.actionId, actionTitle: v.actionTitle, actionDueDate: v.actionDueDate, ownerUserId: v.ownerUserId, ownerName: v.ownerName,
      status: v.status, dueDate: v.dueDate, assignedAt: v.assignedAt, startedAt: v.startedAt, endedAt: v.endedAt,
      reportedStatus: v.reportedStatus, summary: v.summary, aiProvider: v.aiProvider,
    });
    /** Pemilik lama (tindakan sudah dialihkan atau ditandai individu) tidak lagi menerima judul tindakan yang sekarang. */
    const ownerView = (v) => {
      const out = publicVerification(v);
      if (v.actionOwnerUserId !== v.ownerUserId || v.actionInvolvesIndividual) out.actionTitle = 'Tindakan perbaikan (sudah dialihkan)';
      return out;
    };
    const aiAction = (v) => ({ title: v.actionTitle, category: v.actionCategory, dueDate: v.actionDueDate });

    // ---------- Tindakan perbaikan ----------
    r.get('/actions', dashboard, wrap(async (req, res) => {
      const access = await requireLevel(req, stores, [LEVELS.MANAGE, LEVELS.READ, LEVELS.SUMMARY]);
      const { status, category } = req.query;
      if (status && !STATUSES.includes(status)) throw badRequest('status tidak dikenal');
      if (category && !CATEGORIES.includes(category)) throw badRequest('category tidak dikenal');
      const hidden = req.query.hidden === '1';
      if (hidden && access.level !== LEVELS.MANAGE) throw forbidden('ROLE_FORBIDDEN', 'Hanya HR yang bisa melihat tindakan yang menyangkut individu');

      const all = await db.listActions(req.tenantId, { scope: access.scope, hidden });
      const meta = { level: access.level };
      if (access.level === LEVELS.MANAGE) meta.hiddenIndividual = await db.countHidden(req.tenantId);
      // KPI dari himpunan utama yang boleh dilihat pemanggil, sebelum filter query. Tindakan yang menyangkut
      // individu tidak pernah ikut KPI, juga saat HR membuka daftar hidden=1.
      const visible = hidden ? await db.listActions(req.tenantId, { scope: access.scope, hidden: false }) : all;
      const body = { data: [], kpis: kpis(visible, today()), meta };
      if (access.level !== LEVELS.SUMMARY) {
        const rows = all.filter((a) => (!status || a.status === status) && (!category || a.category === category));
        await audit.readIndividual(req, 'ina.actions', { employeeIds: rows.map((a) => a.ownerUserId), objectType: 'ina_action', objectIds: rows.map((a) => a.id) });
        body.data = rows.map((a) => publicAction(a, access.level));
      }
      res.json(body);
    }));

    /** Tindakan yang boleh dilihat pemanggil; selain itu 404 (keberadaannya tidak dibocorkan). */
    async function loadAction(req, levels = [LEVELS.MANAGE, LEVELS.READ]) {
      const access = await requireLevel(req, stores, levels);
      const a = isUuid(req.params.id) ? await db.getAction(req.tenantId, req.params.id) : null;
      if (!a) throw notFound('Tindakan tidak ditemukan');
      if (access.level !== LEVELS.MANAGE) {
        const visible = !a.involvesIndividual && (access.scope.all || (a.ownerUserId && access.scope.userIds.includes(a.ownerUserId)));
        if (!visible) throw notFound('Tindakan tidak ditemukan');
      }
      return { action: a, access };
    }

    r.get('/actions/:id', dashboard, wrap(async (req, res) => {
      const { action, access } = await loadAction(req);
      await audit.readIndividual(req, 'ina.action', { employeeIds: [action.ownerUserId], objectType: 'ina_action', objectIds: [action.id] });
      res.json({ data: publicAction(action, access.level, { detail: true }) });
    }));

    // Pilihan pemilik untuk formulir HR: akun aktif tenant (nama dan jabatan saja)
    r.get('/owners', dashboard, wrap(async (req, res) => {
      await requireLevel(req, stores, MANAGE);
      res.json({ data: await db.ownerOptions(req.tenantId) });
    }));

    /** Validasi field tindakan yang ada di body; rujukan dicari ulang dalam tenant. */
    async function readFields(req, body, { creating, current = null }) {
      const out = {};
      if (creating || has(body, 'title')) out.title = text(body, 'title', 'Judul tindakan', 255, { required: true, min: 3 });
      if (has(body, 'detail')) out.detail = text(body, 'detail', 'Detail', 4000);
      if (creating || has(body, 'category')) {
        if (!CATEGORIES.includes(body.category)) throw badRequest(`Kategori harus salah satu dari: ${CATEGORIES.join(', ')}`);
        out.category = body.category;
      }
      if (has(body, 'subLabel')) out.subLabel = text(body, 'subLabel', 'Sub-label', 64);
      if (has(body, 'sourceRef')) out.sourceRef = text(body, 'sourceRef', 'Asal gap', 255);
      if (has(body, 'dueDate')) {
        if (body.dueDate !== null && !isDate(body.dueDate)) throw badRequest('Tenggat harus berformat YYYY-MM-DD');
        out.dueDate = body.dueDate;
      }
      if (has(body, 'involvesIndividual')) {
        if (typeof body.involvesIndividual !== 'boolean') throw badRequest('involvesIndividual harus true atau false');
        out.involvesIndividual = body.involvesIndividual;
      }
      // rujukan hanya diperiksa bila nilainya berubah: pemilik yang sudah nonaktif tidak mengunci ubahan field lain
      const sameRef = (key, value) => current && value === current[key];
      if (has(body, 'ownerUserId')) {
        const owner = normId(body.ownerUserId);
        if (owner !== null && !sameRef('ownerUserId', owner) && !(isUuid(owner) && (await db.activeUser(req.tenantId, owner)))) {
          throw badRequest('Pemilik tidak ditemukan di organisasi ini');
        }
        out.ownerUserId = owner;
      }
      for (const [key, label, lookup] of [['competencyId', 'Kompetensi', db.competencyName], ['performanceRecordId', 'Data kinerja', db.metricName]]) {
        if (!has(body, key)) continue;
        const ref = normId(body[key]);
        if (ref !== null && !sameRef(key, ref) && !(isUuid(ref) && (await lookup(req.tenantId, ref)))) throw badRequest(`${label} tidak ditemukan di organisasi ini`);
        out[key] = ref;
      }
      return out;
    }
    const auditAction = (req, verb, a, extra = {}) => audit.record(req, verb, 'ina.action', {
      objectIds: [a.id], ...(a.ownerUserId ? { employeeIds: [a.ownerUserId] } : {}), ...extra,
    });
    // status temuan milik TNA yang diubah dari INA dicatat dengan sumber daya TNA (PK-15), `via` = layar asal
    const auditFinding = async (req, change, employeeId) => {
      if (!change) return;
      await audit.record(req, 'update', 'tna.finding', {
        objectIds: [change.id], status: { from: change.from, to: change.to }, via: 'ina', ...(employeeId ? { employeeIds: [employeeId] } : {}),
      });
    };

    r.post('/actions', dashboard, wrap(async (req, res) => {
      await requireLevel(req, stores, MANAGE);
      const body = req.body || {};
      const fields = await readFields(req, body, { creating: true });
      if (fields.subLabel && fields.category !== 'lainnya') throw badRequest('Sub-label hanya untuk kategori lainnya');

      let finding = null;
      if (has(body, 'findingId') && body.findingId !== null) {
        finding = isUuid(body.findingId) ? await db.finding(req.tenantId, body.findingId) : null;
        if (!finding) throw badRequest('Temuan tidak ditemukan di organisasi ini');
        // keputusan user 19 Nov: temuan dari wawancara yang persetujuannya ditarik dibekukan
        if (finding.frozen) throw conflict('CONSENT_WITHDRAWN', 'Karyawan menarik persetujuan wawancara ini. Temuan dan rencananya dibekukan.');
        if (finding.category !== 'non_training') throw badRequest('Hanya temuan di luar pelatihan yang bisa dijadikan tindakan perbaikan');
        if (!['approved', 'edited'].includes(finding.reviewStatus)) throw badRequest('Temuan ini belum ditinjau HR');
        // temuan wawancara selalu berasal dari satu karyawan: HR wajib memutuskan apakah tindakannya menyangkut individu
        if (typeof body.involvesIndividual !== 'boolean') throw badRequest('Tentukan involvesIndividual (true/false) untuk tindakan dari temuan');
        const existing = await db.actionIdByFinding(req.tenantId, finding.id);
        if (existing) throw conflict('DUPLICATE', 'Temuan ini sudah punya tindakan perbaikan', { actionId: existing });
        fields.findingId = finding.id;
        if (fields.competencyId === undefined) fields.competencyId = finding.competencyId;
        if (fields.performanceRecordId === undefined) fields.performanceRecordId = finding.performanceRecordId;
      }
      if (!fields.sourceRef) {
        // hanya dari kamus kompetensi; nama metrik kinerja adalah baris milik satu karyawan, jadi tidak dibawa ke kolom
        // yang terlihat atasan (review egm CD-7)
        fields.sourceRef = (fields.competencyId && (await db.competencyName(req.tenantId, fields.competencyId))) || null;
      }
      const created = await db.createAction(req.tenantId, fields, req.user.id);
      if (!created) throw conflict('DUPLICATE', 'Temuan ini sudah punya tindakan perbaikan');
      await auditAction(req, 'create', created, { category: created.category, fromFinding: Boolean(created.findingId) });
      await auditFinding(req, created.effects.finding, finding && finding.userId);
      res.status(201).json({ data: publicAction(created, LEVELS.MANAGE, { detail: true }) });
    }));

    r.patch('/actions/:id', dashboard, wrap(async (req, res) => {
      const { action: current } = await loadAction(req, MANAGE);
      const body = req.body || {};
      if (has(body, 'findingId')) throw badRequest('Temuan asal tidak bisa diganti');
      const patch = await readFields(req, body, { creating: false, current });
      if (has(body, 'status')) {
        if (!STATUSES.includes(body.status)) throw badRequest('status tidak dikenal');
        patch.status = body.status;
      }
      if (!Object.keys(patch).length) throw badRequest('Tidak ada perubahan yang dikirim');
      const changed = Object.keys(patch).filter((k) => patch[k] !== current[k]);
      if (!changed.length) return res.json({ data: publicAction(current, LEVELS.MANAGE, { detail: true }) });

      const next = { ...current, ...patch };
      if (next.subLabel && next.category !== 'lainnya') {
        if (changed.includes('subLabel')) throw badRequest('Sub-label hanya untuk kategori lainnya');
        patch.subLabel = null; // kategori pindah dari "lainnya": sub-label ikut dikosongkan
        changed.push('subLabel');
      }
      if (changed.includes('status') && !canTransition(current.status, patch.status)) {
        throw conflict('INVALID_TRANSITION', `Status tidak bisa berubah dari ${current.status} ke ${patch.status}`);
      }
      // verifikasi terbuka tidak lagi relevan bila pemilik berganti, tindakan ditutup, atau tindakan disembunyikan;
      // status temuan asal ikut berubah. Semuanya dalam satu transaksi bersama perubahan tindakan (review egm IC-1).
      const nextStatus = changed.includes('status') ? patch.status : current.status;
      const nextIndividual = changed.includes('involvesIndividual') ? patch.involvesIndividual : current.involvesIndividual;
      let reason = null;
      if (changed.includes('ownerUserId')) reason = 'owner_changed';
      else if (!isOpen(nextStatus)) reason = 'action_closed';
      else if (nextIndividual) reason = 'involves_individual';
      let findingStatus = null;
      if (current.findingId && changed.includes('status')) {
        if (nextStatus === 'done') findingStatus = 'resolved';
        else if (current.status === 'done') findingStatus = 'planned';
      }
      const saved = await db.updateAction(req.tenantId, current.id, Object.fromEntries(changed.map((k) => [k, patch[k]])), current.status, {
        cancelVerifications: Boolean(reason), finding: findingStatus ? { id: current.findingId, status: findingStatus } : null,
      });
      if (!saved) throw conflict('INVALID_TRANSITION', 'Status tindakan ini baru saja diubah orang lain. Muat ulang lalu coba lagi.');
      const cancelled = saved.effects.cancelled;
      // isi judul/detail tidak ikut ke audit; cukup nama kolom
      const meta = { fields: changed };
      if (changed.includes('status')) meta.status = { from: current.status, to: saved.status };
      if (changed.includes('ownerUserId')) { meta.owner = { from: current.ownerUserId, to: saved.ownerUserId }; meta.employeeIds = [current.ownerUserId, saved.ownerUserId].filter(Boolean); }
      if (cancelled.length) meta.cancelledVerifications = cancelled;
      await auditAction(req, 'update', saved, meta);
      for (const vid of cancelled) {
        await audit.record(req, 'update', 'ina.verification', {
          objectIds: [vid], actionId: current.id, employeeIds: [current.ownerUserId].filter(Boolean), event: 'cancelled', reason,
        });
      }
      await auditFinding(req, saved.effects.finding);
      const fresh = cancelled.length ? await db.getAction(req.tenantId, saved.id) : saved;
      return res.json({ data: publicAction(fresh, LEVELS.MANAGE, { detail: true }) });
    }));

    // ---------- Akses atasan (K1 = PM-6; izin yang sama dengan daftar temuan di luar pelatihan TNA) ----------
    r.get('/access', dashboard, wrap(async (req, res) => {
      await requireLevel(req, stores, MANAGE);
      const [grants, supervisors] = await Promise.all([
        stores.tna.nonTrainingGrants(req.tenantId),
        stores.people.list(req.tenantId, { all: true }, { roles: [ROLES.SUPERVISOR] }),
      ]);
      const byId = new Map(grants.map((g) => [g.supervisorId, g]));
      res.json({
        data: supervisors.map((s) => {
          const g = byId.get(s.id);
          return { supervisorId: s.id, name: s.name, email: s.email, granted: Boolean(g), grantedAt: g ? g.grantedAt : null, grantedByName: g ? g.grantedByName : null };
        }),
      });
    }));

    async function loadSupervisor(req) {
      await requireLevel(req, stores, MANAGE);
      const person = isUuid(req.params.supervisorId) ? await stores.people.get(req.tenantId, req.params.supervisorId) : null;
      if (!person || person.role !== ROLES.SUPERVISOR) throw notFound('Atasan tidak ditemukan');
      return person;
    }
    r.put('/access/:supervisorId', dashboard, wrap(async (req, res) => {
      const sup = await loadSupervisor(req);
      const changed = await stores.tna.grantNonTraining(req.tenantId, sup.id, req.user.id);
      // satu izin, satu nama sumber daya audit (sama dengan TNA); `via` membedakan layar asalnya
      if (changed) await audit.record(req, 'create', 'tna.non_training_access', { supervisorId: sup.id, employeeIds: [sup.id], via: 'ina' });
      res.json({ data: { supervisorId: sup.id, granted: true, changed } });
    }));
    r.delete('/access/:supervisorId', dashboard, wrap(async (req, res) => {
      const sup = await loadSupervisor(req);
      const changed = await stores.tna.revokeNonTraining(req.tenantId, sup.id, req.user.id);
      if (changed) await audit.record(req, 'delete', 'tna.non_training_access', { supervisorId: sup.id, employeeIds: [sup.id], via: 'ina' });
      res.json({ data: { supervisorId: sup.id, granted: false, changed } });
    }));

    // ---------- Verifikasi AI ----------
    const verif = [dashboard, aiFlag];
    const auditVerification = (req, verb, v, extra = {}) => audit.record(req, verb, 'ina.verification', {
      objectIds: [v.id], actionId: v.actionId, employeeIds: [v.ownerUserId], ...extra,
    });

    r.post('/actions/:id/verifications', ...verif, wrap(async (req, res) => {
      const { action } = await loadAction(req, MANAGE);
      const body = req.body || {};
      if (has(body, 'dueDate') && body.dueDate !== null && !isDate(body.dueDate)) throw badRequest('Tenggat verifikasi harus berformat YYYY-MM-DD');
      if (!action.ownerUserId) throw new HttpError(400, 'NO_OWNER', 'Tindakan ini belum punya pemilik');
      if (action.involvesIndividual) throw conflict('INVALID_STATE', 'Tindakan yang menyangkut individu tidak diverifikasi lewat AI');
      if (!isOpen(action.status)) throw conflict('INVALID_STATE', 'Hanya tindakan berstatus Baru atau Berjalan yang bisa diverifikasi');
      if (!(await db.activeUser(req.tenantId, action.ownerUserId))) throw new HttpError(400, 'NO_OWNER', 'Akun pemilik tindakan sudah tidak aktif');
      const created = await db.createVerification(req.tenantId, { actionId: action.id, ownerUserId: action.ownerUserId, dueDate: body.dueDate || null, assignedBy: req.user.id });
      if (!created) {
        // null: masih ada verifikasi terbuka, atau tindakan baru saja berubah (ditutup, pindah pemilik, ditandai individu)
        const now = await db.getAction(req.tenantId, action.id);
        if (!now || now.ownerUserId !== action.ownerUserId || now.involvesIndividual || !isOpen(now.status)) {
          throw conflict('INVALID_STATE', 'Tindakan ini baru saja diubah. Muat ulang lalu coba lagi.');
        }
        throw conflict('DUPLICATE', 'Tindakan ini masih punya verifikasi yang belum selesai');
      }
      await auditVerification(req, 'create', created);
      res.status(201).json({ data: publicVerification(created) });
    }));

    r.get('/verifications', ...verif, wrap(async (req, res) => {
      await requireLevel(req, stores, MANAGE);
      const rows = await db.listVerifications(req.tenantId);
      await audit.readIndividual(req, 'ina.verification_summary', { employeeIds: rows.map((v) => v.ownerUserId), objectType: 'ina_verification', objectIds: rows.map((v) => v.id) });
      res.json({ data: rows.map(publicVerification) });
    }));

    // Pemilik tindakan (peran apa pun) melihat verifikasi yang ditugaskan kepadanya
    r.get('/verifications/mine', ...verif, wrap(async (req, res) => {
      const rows = await db.listVerifications(req.tenantId, { ownerUserId: req.user.id });
      res.json({ data: rows.filter((v) => v.status !== 'cancelled').map(ownerView) });
    }));

    async function loadVerification(req) {
      const v = isUuid(req.params.id) ? await db.getVerification(req.tenantId, req.params.id) : null;
      if (!v) throw notFound('Verifikasi tidak ditemukan');
      return v;
    }
    /** Hanya pemilik; orang lain (termasuk HR) mendapat 404 di rute percakapan. */
    async function loadOwn(req) {
      const v = await loadVerification(req);
      if (v.ownerUserId !== req.user.id) throw notFound('Verifikasi tidak ditemukan');
      return v;
    }

    r.get('/verifications/:id', ...verif, wrap(async (req, res) => {
      const v = await loadVerification(req);
      if (v.ownerUserId === req.user.id) {
        const turns = await db.turns(req.tenantId, v.id);
        await audit.readIndividual(req, 'ina.verification_transcript', { employeeIds: [v.ownerUserId], objectType: 'ina_verification', objectIds: [v.id] });
        return res.json({ data: { ...ownerView(v), turns } });
      }
      if ((await inaAccess(req, stores)).level !== LEVELS.MANAGE) throw notFound('Verifikasi tidak ditemukan');
      await audit.readIndividual(req, 'ina.verification_summary', { employeeIds: [v.ownerUserId], objectType: 'ina_verification', objectIds: [v.id] });
      return res.json({ data: publicVerification(v) }); // tanpa turns (PO-6)
    }));

    r.post('/verifications/:id/consent', ...verif, wrap(async (req, res) => {
      const v = await loadOwn(req);
      const consentVersion = text(req.body || {}, 'consentVersion', 'Versi persetujuan', 32, { required: true });
      const question = await verifier.nextQuestion({ action: aiAction(v), askedCount: 0, turns: [] });
      if (!(await db.moveVerification(req.tenantId, v.id, ['assigned'], 'in_progress', { consentVersion }))) {
        throw conflict('INVALID_STATE', 'Verifikasi ini sudah dimulai atau sudah ditutup');
      }
      await db.addTurn(req.tenantId, v.id, 'ai', question);
      await auditVerification(req, 'update', v, { event: 'consent', consentVersion });
      res.json({ data: { ...publicVerification(await db.getVerification(req.tenantId, v.id)), question, done: false } });
    }));

    /** Tutup percakapan: simpan ringkasan untuk HR. Status tindakan TIDAK diubah; keputusan tetap di HR. */
    async function finalize(req, v, turns) {
      const out = await verifier.summarize({ action: aiAction(v), turns });
      const moved = await db.moveVerification(req.tenantId, v.id, ['in_progress'], 'completed', { summary: out.summary, reportedStatus: out.reportedStatus, aiProvider: out.provider });
      if (!moved) throw conflict('INVALID_STATE', 'Verifikasi ini sudah ditutup');
      await auditVerification(req, 'update', v, { event: 'completed', reportedStatus: out.reportedStatus });
      return db.getVerification(req.tenantId, v.id);
    }

    r.post('/verifications/:id/turns', ...verif, wrap(async (req, res) => {
      const v = await loadOwn(req);
      if (v.status !== 'in_progress') throw conflict('INVALID_STATE', 'Verifikasi ini belum dimulai atau sudah ditutup');
      const answer = text(req.body || {}, 'text', 'Jawaban', 4000, { required: true });
      // status dan batas jawaban diperiksa lagi di dalam transaksi (request bersamaan, tarik diri, batal oleh HR)
      if (!(await db.addTurn(req.tenantId, v.id, 'human', answer, { maxHuman: verifier.maxQuestions }))) {
        throw conflict('INVALID_STATE', 'Verifikasi ini sudah ditutup atau semua pertanyaan sudah dijawab');
      }
      const turns = await db.turns(req.tenantId, v.id);
      const answered = turns.filter((t) => t.speaker === 'human').length;
      const question = await verifier.nextQuestion({ action: aiAction(v), askedCount: answered, turns });
      if (!question) {
        const done = await finalize(req, v, turns); // jawaban terakhir menutup percakapan
        return res.json({ data: { ...publicVerification(done), question: null, done: true } });
      }
      await db.addTurn(req.tenantId, v.id, 'ai', question);
      return res.json({ data: { question, done: false } });
    }));

    // Pemilik boleh mengakhiri lebih awal, asal sudah menjawab minimal satu pertanyaan
    r.post('/verifications/:id/complete', ...verif, wrap(async (req, res) => {
      const v = await loadOwn(req);
      if (v.status !== 'in_progress') throw conflict('INVALID_STATE', 'Verifikasi ini belum dimulai atau sudah ditutup');
      const turns = await db.turns(req.tenantId, v.id);
      if (!turns.some((t) => t.speaker === 'human')) throw conflict('INVALID_STATE', 'Jawab minimal satu pertanyaan sebelum mengakhiri');
      res.json({ data: { ...publicVerification(await finalize(req, v, turns)), question: null, done: true } });
    }));

    // Pemilik menarik diri: percakapan dihapus, HR hanya melihat statusnya
    r.post('/verifications/:id/withdraw', ...verif, wrap(async (req, res) => {
      const v = await loadOwn(req);
      if (!(await db.withdrawVerification(req.tenantId, v.id))) throw conflict('INVALID_STATE', 'Verifikasi ini sudah ditutup');
      await auditVerification(req, 'update', v, { event: 'withdrawn' });
      res.json({ data: publicVerification(await db.getVerification(req.tenantId, v.id)) });
    }));

    r.post('/verifications/:id/cancel', ...verif, wrap(async (req, res) => {
      await requireLevel(req, stores, MANAGE);
      const v = await loadVerification(req);
      if (!(await db.moveVerification(req.tenantId, v.id, ['assigned', 'in_progress'], 'cancelled'))) {
        throw conflict('INVALID_STATE', 'Verifikasi ini sudah ditutup');
      }
      await auditVerification(req, 'update', v, { event: 'cancelled' });
      res.json({ data: publicVerification(await db.getVerification(req.tenantId, v.id)) });
    }));

    return r;
  },
};
