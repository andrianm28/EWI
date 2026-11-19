'use strict';
// B14 Learning Delivery (LD). Pelatihan berjalan dan akan datang, pelatihan offline (peserta, kehadiran, asesmen,
// dokumentasi), insight berbasis aturan, dan pengingat. Spek: docs/designs/b14-learning-delivery.md.
// Hanya HR (mockup: atasan dan karyawan tidak punya menu ini). ELGOS tidak mengirim apa pun ke vendor.
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { FLAGS } = require('../../core/flags');
const { badRequest, notFound, forbidden, HttpError } = require('../../core/errors');
const { detectType, allowedFor, safeFilename, newKey } = require('../../integrations/storage');
const { todayJakarta, decorate, kpis, buildInsights, readiness, INACTIVE_DAYS } = require('./domain');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const conflict = (code, msg) => new HttpError(409, code, msg);
const STATUSES = ['scheduled', 'running', 'done', 'cancelled'];
const DOC_KINDS = ['material', 'photo', 'video'];
const MAX_DOCS = 60;
const REMINDER_GAP_MS = 24 * 3600 * 1000;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const validDate = (s) => DATE.test(String(s)) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

module.exports = {
  key: 'ld',
  title: 'Learning Delivery',
  router({ stores, settings, flags, audit, storage, mailer, uploads = {}, appBaseUrl = '' } = {}) {
    const r = express.Router();
    r.use(requireRole(ROLES.HR_ADMIN));
    const idParam = (req, _res, next) => (UUID.test(req.params.id) ? next() : next(notFound()));
    const maxBytes = uploads.maxBytes || 25 * 1024 * 1024;

    const inactiveBefore = () => new Date(Date.now() - INACTIVE_DAYS * 86400000);
    async function loadAll(tenantId) {
      await stores.ld.syncFromCatalog(tenantId);
      const today = todayJakarta();
      const rows = (await stores.ld.listTrainings(tenantId, { inactiveBefore: inactiveBefore() })).map((t) => decorate(t, today));
      return { rows, today };
    }
    async function loadOne(req) {
      const t = await stores.ld.getTraining(req.tenantId, req.params.id, { inactiveBefore: inactiveBefore() });
      if (!t) throw notFound('Pelatihan tidak ditemukan');
      return decorate(t, todayJakarta());
    }
    /** Peserta, kehadiran, asesmen, dan dokumen hanya dikelola untuk pelatihan yang diinput HR. */
    const manualOnly = (t) => { if (t.source !== 'manual') throw conflict('READ_ONLY_SOURCE', 'Data pelatihan online diambil otomatis dan tidak bisa diubah di sini'); };
    const uuids = (list, label) => {
      if (!Array.isArray(list) || list.some((x) => !UUID.test(String(x)))) throw badRequest(`${label} tidak valid`);
      return [...new Set(list)];
    };
    async function detail(req, t) {
      const [participants, documents] = await Promise.all([stores.ld.listParticipants(req.tenantId, t.id), stores.ld.listDocuments(req.tenantId, t.id)]);
      await audit.readIndividual(req, 'ld.training', { employeeIds: participants.map((p) => p.userId), objectType: 'ld_training', objectIds: [t.id] });
      return { ...t, readiness: readiness(t), participantList: participants, documents, storageReady: !!storage };
    }

    r.get('/', (req, res) => res.json({ module: 'ld', title: 'Learning Delivery', tenantId: req.tenantId, role: req.user.role }));

    // --- Ringkasan ---
    r.get('/dashboard', wrap(async (req, res) => {
      const { rows, today } = await loadAll(req.tenantId);
      const open = rows.filter((x) => x.group === 'running');
      const active = await stores.ld.countActiveLearners(req.tenantId, open.map((x) => x.id));
      const { insights, actions } = buildInsights(rows, today);
      res.json({ data: { kpis: kpis(rows, active), insights, actions, generatedBy: 'rules', today } });
    }));

    // --- Daftar ---
    r.get('/trainings', wrap(async (req, res) => {
      const { state, mode } = req.query;
      if (state && !['running', 'upcoming', 'done', 'cancelled'].includes(state)) throw badRequest('state harus running, upcoming, done, atau cancelled');
      if (mode && !['online', 'offline'].includes(mode)) throw badRequest('mode harus online atau offline');
      const { rows } = await loadAll(req.tenantId);
      res.json({ data: rows.filter((x) => (!state || x.group === state) && (!mode || x.mode === mode)) });
    }));

    // --- Pelatihan offline ---
    r.post('/trainings', wrap(async (req, res) => {
      const b = req.body || {};
      const title = text(b.title, 255);
      if (!title || !b.startsOn) throw badRequest('Isi judul dan tanggal');
      if (!validDate(b.startsOn) || (b.endsOn && !validDate(b.endsOn))) throw badRequest('Tanggal harus berformat YYYY-MM-DD');
      if (b.endsOn && b.endsOn < b.startsOn) throw badRequest('Tanggal selesai tidak boleh sebelum tanggal mulai');
      const sessionCount = b.sessionCount === undefined ? 1 : Number(b.sessionCount);
      if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 100) throw badRequest('Jumlah sesi harus 1 sampai 100');
      if (b.moduleId && (!UUID.test(String(b.moduleId)) || !(await stores.ld.moduleExists(req.tenantId, b.moduleId)))) throw badRequest('Modul tidak ditemukan');
      const conf = await settings.get(req.tenantId);
      const t = await stores.ld.createTraining(req.tenantId, {
        title, startsOn: b.startsOn, endsOn: b.endsOn || null, sessionCount, moduleId: b.moduleId || null,
        vendorName: b.vendorName === undefined ? conf.li.vendorName : text(b.vendorName, 255), venue: text(b.venue, 255), userId: req.user.id,
      });
      await audit.record(req, 'create', 'ld.training', { trainingId: t.id, title });
      res.status(201).json({ data: decorate(t, todayJakarta()) });
    }));

    r.get('/trainings/:id', idParam, wrap(async (req, res) => res.json({ data: await detail(req, await loadOne(req)) })));

    r.patch('/trainings/:id', idParam, wrap(async (req, res) => {
      const t = await loadOne(req);
      const b = req.body || {}; const patch = {};
      // pelatihan online (webhook/LMS): HR hanya boleh mengisi tanggal, modul terkait, dan menutup/membatalkan
      const allowed = t.source === 'manual'
        ? ['title', 'vendorName', 'venue', 'startsOn', 'endsOn', 'sessionCount', 'sessionsDone', 'status', 'materialsReady', 'moduleId']
        : ['startsOn', 'endsOn', 'status', 'moduleId'];
      const extra = Object.keys(b).filter((k) => !allowed.includes(k));
      if (extra.length) throw (t.source === 'manual' ? badRequest(`Kolom tidak bisa diubah: ${extra.join(', ')}`) : conflict('READ_ONLY_SOURCE', 'Data pelatihan online diambil otomatis dan tidak bisa diubah di sini'));
      if (b.title !== undefined) { patch.title = text(b.title, 255); if (!patch.title) throw badRequest('Judul wajib diisi'); }
      if (b.vendorName !== undefined) patch.vendorName = text(b.vendorName, 255) || null;
      if (b.venue !== undefined) patch.venue = text(b.venue, 255) || null;
      for (const k of ['startsOn', 'endsOn']) {
        if (b[k] === undefined) continue;
        if (b[k] !== null && !validDate(b[k])) throw badRequest('Tanggal harus berformat YYYY-MM-DD');
        patch[k] = b[k];
      }
      if (t.source === 'manual' && patch.startsOn === null) throw badRequest('Tanggal mulai wajib diisi');
      const start = patch.startsOn !== undefined ? patch.startsOn : t.startsOn; const end = patch.endsOn !== undefined ? patch.endsOn : t.endsOn;
      if (start && end && end < start) throw badRequest('Tanggal selesai tidak boleh sebelum tanggal mulai');
      for (const k of ['sessionCount', 'sessionsDone']) {
        if (b[k] === undefined) continue;
        if (!Number.isInteger(b[k]) || b[k] < (k === 'sessionCount' ? 1 : 0) || b[k] > 100) throw badRequest('Jumlah sesi tidak valid');
        patch[k] = b[k];
      }
      if ((patch.sessionsDone ?? t.sessionsDone) > (patch.sessionCount ?? t.sessionCount)) throw badRequest('Sesi selesai tidak boleh melebihi jumlah sesi');
      if (b.status !== undefined) {
        if (!STATUSES.includes(b.status)) throw badRequest('Status tidak valid');
        if (t.status === 'cancelled' && b.status !== 'cancelled') throw conflict('INVALID_TRANSITION', 'Pelatihan yang dibatalkan tidak bisa dibuka lagi');
        patch.status = b.status;
      }
      if (b.materialsReady !== undefined) patch.materialsReady = b.materialsReady === true;
      if (b.moduleId !== undefined) {
        if (b.moduleId !== null && (!UUID.test(String(b.moduleId)) || !(await stores.ld.moduleExists(req.tenantId, b.moduleId)))) throw badRequest('Modul tidak ditemukan');
        patch.moduleId = b.moduleId;
      }
      if (!Object.keys(patch).length) throw badRequest('Tidak ada perubahan');
      await stores.ld.updateTraining(req.tenantId, t.id, patch);
      await audit.record(req, 'update', 'ld.training', { trainingId: t.id, fields: Object.keys(patch), status: patch.status });
      res.json({ data: await loadOne(req) });
    }));

    r.put('/trainings/:id/participants', idParam, wrap(async (req, res) => {
      const t = await loadOne(req); manualOnly(t);
      const { userIds, jobRoleId } = req.body || {};
      if (userIds === undefined && !jobRoleId) throw badRequest('Pilih karyawan atau jabatan');
      if (jobRoleId && !UUID.test(String(jobRoleId))) throw badRequest('Jabatan tidak valid');
      const added = await stores.ld.addParticipants(req.tenantId, t.id, { userIds: userIds === undefined ? [] : uuids(userIds, 'Daftar karyawan'), jobRoleId: jobRoleId || null });
      await audit.record(req, 'update', 'ld.participants', { trainingId: t.id, added, jobRoleId: jobRoleId || undefined });
      res.json({ data: { added, ...(await detail(req, await loadOne(req))) } });
    }));

    r.delete('/trainings/:id/participants/:userId', idParam, wrap(async (req, res) => {
      const t = await loadOne(req); manualOnly(t);
      if (!UUID.test(req.params.userId) || !(await stores.ld.removeParticipant(req.tenantId, t.id, req.params.userId))) throw notFound('Peserta tidak ditemukan');
      await audit.record(req, 'delete', 'ld.participants', { trainingId: t.id, employeeIds: [req.params.userId] });
      res.status(204).end();
    }));

    r.put('/trainings/:id/attendance', idParam, wrap(async (req, res) => {
      const t = await loadOne(req); manualOnly(t);
      const { entries = [], allPresent } = req.body || {};
      if (!Array.isArray(entries) || entries.some((e) => !e || !UUID.test(String(e.userId)) || ![true, false, null].includes(e.present))) throw badRequest('Data kehadiran tidak valid');
      if (!entries.length && allPresent !== true) throw badRequest('Tidak ada kehadiran yang dicatat');
      const changed = await stores.ld.setAttendance(req.tenantId, t.id, { entries, all: allPresent === true, byUserId: req.user.id });
      await audit.record(req, 'update', 'ld.attendance', { trainingId: t.id, changed, allPresent: allPresent === true || undefined, employeeIds: entries.map((e) => e.userId) });
      res.json({ data: await detail(req, await loadOne(req)) });
    }));

    r.put('/trainings/:id/assessment', idParam, wrap(async (req, res) => {
      const t = await loadOne(req); manualOnly(t);
      const { mode, assessmentRef } = req.body || {};
      if (!['none', 'elitementor', 'vendor_manual'].includes(mode)) throw badRequest('Cara asesmen harus none, elitementor, atau vendor_manual');
      const patch = { assessmentMode: mode, assessmentRef: null };
      if (mode === 'elitementor') {
        // skor hanya bisa masuk lewat webhook; tanpa itu pilihan ini akan menunggu selamanya
        if (!(await flags.isEnabled(req.tenantId, FLAGS.WEBHOOK_SYNC))) throw forbidden('FEATURE_DISABLED', 'Sinkron skor dari EliteMentor belum diaktifkan. Pakai input skor dari vendor');
        patch.assessmentRef = text(assessmentRef, 128);
        if (!patch.assessmentRef) throw badRequest('Isi kode asesmen di EliteMentor agar skor bisa dicocokkan');
        if (await stores.ld.assessmentRefTaken(req.tenantId, t.id, patch.assessmentRef)) throw conflict('ASSESSMENT_REF_TAKEN', 'Kode asesmen ini sudah dipakai pelatihan lain');
      }
      await stores.ld.updateTraining(req.tenantId, t.id, patch);
      await audit.record(req, 'update', 'ld.assessment', { trainingId: t.id, mode });
      res.json({ data: await detail(req, await loadOne(req)) });
    }));

    r.put('/trainings/:id/scores', idParam, wrap(async (req, res) => {
      const t = await loadOne(req); manualOnly(t);
      if (t.assessmentMode !== 'vendor_manual') throw conflict('INVALID_STATE', 'Pilih "Input skor dari vendor" dulu');
      const { entries } = req.body || {};
      const ok = (e) => e && UUID.test(String(e.userId)) && (e.score === null || (typeof e.score === 'number' && e.score >= 0 && e.score <= 100));
      if (!Array.isArray(entries) || !entries.length || !entries.every(ok)) throw badRequest('Skor harus angka 0 sampai 100');
      const changed = await stores.ld.setScores(req.tenantId, t.id, entries);
      await audit.record(req, 'update', 'ld.scores', { trainingId: t.id, changed, employeeIds: entries.map((e) => e.userId), source: 'vendor_manual' });
      res.json({ data: await detail(req, await loadOne(req)) });
    }));

    // --- Dokumentasi (foto/video/materi). Berkas hanya keluar lewat endpoint unduh di bawah. ---
    r.post('/trainings/:id/documents', idParam, express.raw({ type: () => true, limit: maxBytes }), wrap(async (req, res) => {
      const t = await loadOne(req); manualOnly(t);
      if (!storage) throw new HttpError(501, 'STORAGE_NOT_CONFIGURED', 'Penyimpanan berkas belum dikonfigurasi di server ini');
      const kind = String(req.query.kind || 'photo');
      if (!DOC_KINDS.includes(kind)) throw badRequest('Jenis dokumen harus material, photo, atau video');
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Kirim isi berkas sebagai body dengan ?filename=nama.jpg');
      const type = detectType(req.body);
      if (!allowedFor(kind, type)) throw badRequest(kind === 'material' ? 'Materi harus PDF, JPEG, PNG, WebP, atau MP4' : 'Dokumentasi harus foto (JPEG, PNG, WebP) atau video (MP4)');
      if (t.photoDocs + t.materialDocs >= MAX_DOCS) throw conflict('LIMIT_REACHED', `Paling banyak ${MAX_DOCS} berkas per pelatihan`);
      const key = newKey(req.tenantId);
      await storage.put(key, req.body);
      let doc;
      try {
        doc = await stores.ld.insertDocument(req.tenantId, t.id, { kind, filename: safeFilename(req.query.filename, `berkas.${type.ext}`), mime: type.mime, sizeBytes: req.body.length, storageKey: key, userId: req.user.id });
      } catch (e) { await storage.remove(key); throw e; }
      await audit.record(req, 'create', 'ld.document', { trainingId: t.id, documentId: doc.id, kind, sizeBytes: doc.sizeBytes });
      res.status(201).json({ data: doc });
    }));

    const loadDoc = async (req) => {
      const d = await stores.ld.getDocument(req.tenantId, req.params.id);
      if (!d) throw notFound('Berkas tidak ditemukan');
      return d;
    };

    r.get('/documents/:id/content', idParam, wrap(async (req, res) => {
      // Foto peserta: hanya HR tenant. Admin ETA (lolos requireRole) tidak boleh membuka isi berkas.
      if (req.user.role !== ROLES.HR_ADMIN) throw forbidden('ROLE_FORBIDDEN', 'Dokumentasi pelatihan hanya bisa dibuka HR');
      const d = await loadDoc(req);
      if (!storage) throw new HttpError(501, 'STORAGE_NOT_CONFIGURED', 'Penyimpanan berkas belum dikonfigurasi di server ini');
      const buf = await storage.get(d.storageKey);
      if (!buf) throw notFound('Berkas tidak ditemukan');
      await audit.record(req, 'read', 'ld.document', { trainingId: d.trainingId, documentId: d.id, kind: d.kind });
      res.set({
        'Content-Type': d.mime, 'Content-Length': String(buf.length), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`,
      });
      res.end(buf);
    }));

    r.delete('/documents/:id', idParam, wrap(async (req, res) => {
      const d = await loadDoc(req);
      // tanpa storage barisnya tidak dihapus, supaya berkas tidak tertinggal tanpa catatan
      if (!storage) throw new HttpError(501, 'STORAGE_NOT_CONFIGURED', 'Penyimpanan berkas belum dikonfigurasi di server ini');
      const key = await stores.ld.deleteDocument(req.tenantId, d.id);
      if (key) {
        try { await storage.remove(key); } catch (e) { console.error(`[ld.document] berkas ${key} gagal dihapus dari penyimpanan: ${e.message}`); }
      }
      await audit.record(req, 'delete', 'ld.document', { trainingId: d.trainingId, documentId: d.id, kind: d.kind });
      res.status(204).end();
    }));

    // --- Pengingat ke peserta (email), paling sering sekali per 24 jam per pelatihan ---
    r.post('/trainings/:id/reminders', idParam, wrap(async (req, res) => {
      const t = await loadOne(req);
      if (!['running', 'upcoming'].includes(t.group)) throw conflict('INVALID_STATE', 'Pengingat hanya untuk pelatihan yang berjalan atau akan datang');
      const recipients = await stores.ld.reminderRecipients(req.tenantId, t.id, { pendingOnly: t.mode === 'online' });
      if (!recipients.length) throw badRequest('Tidak ada peserta yang perlu diingatkan');
      if (!(await stores.ld.claimReminder(req.tenantId, t.id, new Date(Date.now() - REMINDER_GAP_MS)))) throw conflict('REMINDER_RECENT', 'Pengingat untuk pelatihan ini sudah dikirim dalam 24 jam terakhir');
      const when = t.mode === 'offline' ? `Tanggal: ${t.startsOn}${t.venue ? `, ${t.venue}` : ''}.` : (t.endsOn ? `Batas penyelesaian: ${t.endsOn}.` : '');
      let sent = 0; let failed = 0;
      for (const u of recipients) {
        try {
          await mailer.send({
            to: u.email, subject: `Pengingat pelatihan: ${t.title}`,
            text: [`Halo ${u.name || ''},`.replace(' ,', ','), '', t.mode === 'offline' ? `Anda terdaftar sebagai peserta pelatihan "${t.title}".` : `Pelatihan "${t.title}" Anda belum selesai.`, when, '',
              appBaseUrl ? `Lihat rencana belajar Anda di ELGOS: ${appBaseUrl}` : '', '', 'Pesan ini dikirim oleh tim HR lewat ELGOS.'].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'),
          });
          sent += 1;
        } catch (e) { failed += 1; console.error(`[ld.reminder] gagal kirim: ${e.message}`); }
      }
      if (!sent) await stores.ld.releaseReminder(req.tenantId, t.id);
      await audit.record(req, 'create', 'ld.reminder', { trainingId: t.id, recipients: recipients.length, sent, failed, employeeIds: recipients.map((u) => u.id) });
      res.status(201).json({ data: { recipients: recipients.length, sent, failed } });
    }));

    return r;
  },
};
