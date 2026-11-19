'use strict';
// Core Competencies (CCA). Kompetensi inti perusahaan dari visi, misi, dan nilai korporasi; hasil program nilai
// dari laporan program; penugasan wawancara AI berjenjang (HR -> pimpinan -> karyawan).
// Spek: docs/designs/b10-core-competencies.md. Percakapan dan sintesis wawancara menyusul setelah mesin wawancara B6.
const express = require('express');
const { requireRole, visibleEmployeeScope, ROLES } = require('../../core/rbac');
const { FLAGS, requireFlag } = require('../../core/flags');
const { badRequest, forbidden, notFound, HttpError } = require('../../core/errors');
const v = require('../imports/values');
const { importRouter } = require('../imports');
const { buildOverview, GROUP_KINDS } = require('./readiness');
const { validateProgramConfig, buildReport, normalizeManualReport, buildManualReport, KEY_RE } = require('./program-report');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const SOURCE_KINDS = ['vision', 'mission', 'value'];
const SOURCE_STATUSES = ['active', 'archived'];
const REQUIREMENT_STATUSES = ['draft', 'validated', 'rejected'];
const LEADER_ROLES = [ROLES.SUPERVISOR, ROLES.PIMPINAN];
const MAX_ASSIGNEES = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isHr = (req) => [ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(req.user.role);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Teks wajib/opsional dengan batas panjang; melempar 400 dengan pesan Indonesia. */
function textField(body, key, label, { required = false, max = 255 } = {}) {
  if (!has(body, key) || body[key] === null) {
    if (required) throw badRequest(`${label} wajib diisi`);
    return has(body, key) ? null : undefined;
  }
  const s = String(body[key]).trim();
  if (!s && required) throw badRequest(`${label} wajib diisi`);
  if (s.length > max) throw badRequest(`${label} maksimal ${max} karakter`);
  return s || null;
}

/** Skor 0-100; nullable = boleh null (mengosongkan). undefined bila tidak dikirim. */
function scoreField(body, key, label, { required = false, nullable = false } = {}) {
  if (!has(body, key)) {
    if (required) throw badRequest(`${label} wajib diisi`);
    return undefined;
  }
  if (body[key] === null && nullable) return null;
  const n = typeof body[key] === 'number' ? body[key] : v.number(body[key]);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw badRequest(`${label} harus angka 0-100`);
  return n;
}

function intField(body, key, label, { min, max, fallback }) {
  if (!has(body, key) || body[key] === null) return fallback;
  const n = Number(body[key]);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${label} harus bilangan bulat ${min}-${max}`);
  return n;
}

/** Program milik tenant pemanggil menurut :key, atau 404. */
async function loadProgram(stores, req) {
  const program = KEY_RE.test(req.params.key) ? await stores.cca.getProgram(req.tenantId, req.params.key) : null;
  if (!program) throw notFound('Program tidak ditemukan');
  return program;
}

const idParam = (req, label) => {
  if (!UUID_RE.test(req.params.id)) throw notFound(`${label} tidak ditemukan`);
  return req.params.id;
};

module.exports = {
  key: 'cca',
  title: 'Core Competencies',
  router({ stores, flags, audit } = {}) {
    const r = express.Router();
    const hr = requireRole(ROLES.HR_ADMIN);
    const programOf = (req) => loadProgram(stores, req);
    const interview = requireFlag(flags, FLAGS.CCA_INTERVIEW, 'Wawancara AI Core Competencies belum diaktifkan untuk organisasi Anda');

    r.get('/', (req, res) => res.json({ module: 'cca', title: 'Core Competencies', tenantId: req.tenantId, role: req.user.role }));

    // --- Persyaratan kompetensi (visi, misi) dan indikator perilaku (nilai korporasi) ---
    r.get('/overview', hr, wrap(async (req, res) => {
      const group = String(req.query.group || 'vm');
      if (!GROUP_KINDS[group]) throw badRequest('group harus vm atau values');
      res.json({ data: buildOverview(await stores.cca.listSources(req.tenantId), group) });
    }));

    r.get('/sources', hr, wrap(async (req, res) => {
      res.json({ data: await stores.cca.listSources(req.tenantId, { includeArchived: req.query.archived === '1' }) });
    }));

    r.post('/sources', hr, wrap(async (req, res) => {
      const body = req.body || {};
      if (!SOURCE_KINDS.includes(body.kind)) throw badRequest(`kind harus salah satu: ${SOURCE_KINDS.join(', ')}`);
      const row = await stores.cca.createSource(req.tenantId, {
        kind: body.kind,
        title: textField(body, 'title', 'Judul', { required: true }),
        text: textField(body, 'text', 'Isi pernyataan', { max: 5000 }),
        sourceRef: textField(body, 'sourceRef', 'Sumber', { max: 512 }),
        position: intField(body, 'position', 'Urutan', { min: 0, max: 9999, fallback: 0 }),
        createdBy: req.user.id,
      });
      await audit.record(req, 'create', 'cca.source', { sourceId: row.id, kind: row.kind });
      res.status(201).json({ data: row });
    }));

    r.patch('/sources/:id', hr, wrap(async (req, res) => {
      const body = req.body || {};
      const id = idParam(req, 'Sumber');
      if (!(await stores.cca.getSource(req.tenantId, id))) throw notFound('Sumber tidak ditemukan');
      if (has(body, 'status') && !SOURCE_STATUSES.includes(body.status)) throw badRequest(`status harus salah satu: ${SOURCE_STATUSES.join(', ')}`);
      const patch = {
        title: has(body, 'title') ? textField(body, 'title', 'Judul', { required: true }) : undefined,
        text: textField(body, 'text', 'Isi pernyataan', { max: 5000 }),
        sourceRef: textField(body, 'sourceRef', 'Sumber', { max: 512 }),
        position: intField(body, 'position', 'Urutan', { min: 0, max: 9999, fallback: undefined }),
        status: body.status,
      };
      const row = await stores.cca.updateSource(req.tenantId, id, patch);
      await audit.record(req, 'update', 'cca.source', { sourceId: id, fields: Object.keys(patch).filter((k) => patch[k] !== undefined) });
      res.json({ data: row });
    }));

    r.post('/sources/:id/requirements', hr, wrap(async (req, res) => {
      const body = req.body || {};
      const source = await stores.cca.getSource(req.tenantId, idParam(req, 'Sumber'));
      if (!source || source.status !== 'active') throw notFound('Sumber tidak ditemukan');
      const row = await stores.cca.createRequirement(req.tenantId, {
        sourceId: source.id,
        name: textField(body, 'name', 'Nama persyaratan', { required: true }),
        definition: textField(body, 'definition', 'Definisi', { max: 2000 }),
        targetScore: scoreField(body, 'targetScore', 'Target', { required: true }),
        actualScore: scoreField(body, 'actualScore', 'Aktual', { nullable: true }),
        origin: 'hr',
      });
      await audit.record(req, 'create', 'cca.requirement', { requirementId: row.id, sourceId: source.id });
      res.status(201).json({ data: row });
    }));

    r.patch('/requirements/:id', hr, wrap(async (req, res) => {
      const body = req.body || {};
      const id = idParam(req, 'Persyaratan');
      const current = await stores.cca.getRequirement(req.tenantId, id);
      if (!current) throw notFound('Persyaratan tidak ditemukan');
      if (has(body, 'status') && !REQUIREMENT_STATUSES.includes(body.status)) throw badRequest(`status harus salah satu: ${REQUIREMENT_STATUSES.join(', ')}`);
      const patch = {
        name: has(body, 'name') ? textField(body, 'name', 'Nama persyaratan', { required: true }) : undefined,
        definition: textField(body, 'definition', 'Definisi', { max: 2000 }),
        targetScore: scoreField(body, 'targetScore', 'Target'),
        actualScore: scoreField(body, 'actualScore', 'Aktual', { nullable: true }),
        status: body.status,
      };
      // isi persyaratan yang sudah divalidasi berubah -> kembali menunggu validasi HR
      const contentChanged = ['name', 'definition', 'targetScore'].some((k) => patch[k] !== undefined && patch[k] !== current[k]);
      if (patch.status === undefined && current.status === 'validated' && contentChanged) patch.status = 'draft';
      const row = await stores.cca.updateRequirement(req.tenantId, id, { ...patch, actualSource: 'manual', validatedBy: req.user.id });
      await audit.record(req, 'update', 'cca.requirement', { requirementId: id, fields: Object.keys(patch).filter((k) => patch[k] !== undefined) });
      res.json({ data: row });
    }));

    // --- Program nilai korporasi: konfigurasi, impor laporan, laporan agregat ---
    r.use('/imports', importRouter({ submodule: 'cca', stores, audit }));

    r.get('/programs', hr, wrap(async (req, res) => {
      res.json({ data: await stores.cca.listPrograms(req.tenantId) });
    }));

    r.put('/programs/:key', hr, wrap(async (req, res) => {
      const body = req.body || {};
      const { key } = req.params;
      if (!KEY_RE.test(key)) throw badRequest('Key program hanya huruf kecil, angka, dan tanda hubung (maksimal 32 karakter)');
      const cfg = validateProgramConfig(body.config);
      if (cfg.error) throw badRequest(cfg.error);
      const existing = await stores.cca.getProgram(req.tenantId, key);
      // Field opsional yang tidak dikirim mempertahankan nilai lama (mis. tanggal cut off yang diisi impor); null mengosongkan.
      let cutoffDate = has(body, 'cutoffDate') || !existing ? null : existing.cutoffDate;
      if (has(body, 'cutoffDate') && body.cutoffDate !== null && body.cutoffDate !== '') {
        const d = v.date(body.cutoffDate);
        if (!d) throw badRequest('Tanggal cut off tidak valid');
        cutoffDate = v.isoDate(d);
      }
      const recs = body.recommendations === undefined ? (existing ? existing.recommendations : []) : body.recommendations === null ? [] : body.recommendations;
      if (!Array.isArray(recs) || recs.length > 20) throw badRequest('Rekomendasi harus daftar, maksimal 20 butir');
      const recommendations = recs.map((x) => ({
        title: textField(x || {}, 'title', 'Judul rekomendasi', { required: true }),
        detail: textField(x || {}, 'detail', 'Isi rekomendasi', { max: 1000 }) ?? null,
      }));
      const reshaped = existing && (existing.config.values.length !== cfg.value.values.length || existing.config.components.length !== cfg.value.components.length
        || existing.config.bands.map((b) => b.key).sort().join() !== cfg.value.bands.map((b) => b.key).sort().join());
      if (reshaped && (existing.manualReport || (await stores.cca.countProgramResults(req.tenantId, existing.id)) > 0)) {
        // skor tersimpan berurut menurut nilai/komponen; mengubah jumlahnya membuat hasil lama salah kolom
        throw new HttpError(409, 'PROGRAM_HAS_RESULTS', 'Jumlah nilai, komponen, atau status tidak bisa diubah setelah hasil diimpor atau diisi. Buat program baru dengan key lain.');
      }
      const keep = (field, value) => (value === undefined ? (existing ? existing[field] : null) : value);
      const row = await stores.cca.upsertProgram(req.tenantId, {
        key,
        name: textField(body, 'name', 'Nama program', { required: true }),
        provider: keep('provider', textField(body, 'provider', 'Penyelenggara')),
        cutoffDate,
        config: cfg.value,
        insight: keep('insight', textField(body, 'insight', 'Temuan', { max: 4000 })),
        recommendations,
        updatedBy: req.user.id,
      });
      await audit.record(req, existing ? 'update' : 'create', 'cca.program', { programKey: key });
      res.status(existing ? 200 : 201).json({ data: row });
    }));

    r.get('/programs/:key/report', hr, wrap(async (req, res) => {
      const program = await programOf(req);
      // agregat saja; hasil per karyawan tidak keluar dari endpoint ini.
      // Hasil per karyawan (impor) didahulukan; isian agregat dipakai hanya bila impor belum ada.
      const results = await stores.cca.listProgramResults(req.tenantId, program.id);
      res.json({ data: !results.length && program.manualReport ? buildManualReport(program, program.manualReport) : buildReport(program, results) });
    }));

    // Isian agregat dari laporan ringkasan, untuk klien yang tidak punya berkas per karyawan. Body null = hapus isian.
    r.put('/programs/:key/manual-report', hr, wrap(async (req, res) => {
      const program = await programOf(req);
      const input = (req.body || {}).report;
      let value = null;
      if (input !== null) {
        const out = normalizeManualReport(program.config, input);
        if (out.error) throw badRequest(out.error);
        value = out.value;
      }
      const saved = await stores.cca.setProgramManualReport(req.tenantId, program.key, value, req.user.id);
      await audit.record(req, 'update', 'cca.program', { programKey: program.key, manualReport: value !== null });
      const hasResults = (await stores.cca.countProgramResults(req.tenantId, program.id)) > 0;
      res.json({ data: { saved: value !== null, shadowedByImport: hasResults, report: value ? buildManualReport(saved, value) : null } });
    }));

    // --- Penugasan wawancara berjenjang: HR -> pimpinan -> karyawan ---
    const publicAssignment = (a) => (a ? { id: a.id, tier: a.tier, status: a.status, dueDate: a.dueDate, durationMinutes: a.durationMinutes, completedAt: a.completedAt } : null);
    const isLeaderRole = (req) => LEADER_ROLES.includes(req.user.role);

    /** Penugasan terbaru milik pemanggil per tier: { leader, employee }. */
    async function mineOf(req) {
      const rows = await stores.cca.listAssignments(req.tenantId, { assigneeIds: [req.user.id] });
      return { leader: rows.find((a) => a.tier === 'leader') || null, employee: rows.find((a) => a.tier === 'employee') || null };
    }

    /**
     * Anggota tim = bawahan langsung. visibleEmployeeScope() hanya memberi tim kepada peran supervisor, padahal
     * kepala divisi diimpor sebagai pimpinan; di modul ini kedua peran pimpinan memakai cakupan atasan yang sama.
     */
    async function teamOf(req) {
      const reports = await stores.people.directReportIds(req.tenantId, req.user.id);
      const scope = visibleEmployeeScope({ id: req.user.id, role: ROLES.SUPERVISOR }, reports);
      return (await stores.people.list(req.tenantId, scope)).filter((m) => m.id !== req.user.id);
    }

    r.get('/assignments', interview, wrap(async (req, res) => {
      const own = await mineOf(req);
      const mine = { leader: publicAssignment(own.leader), employee: publicAssignment(own.employee) };
      if (isHr(req)) {
        const [eligible, leaders, employees] = await Promise.all([
          stores.cca.listEligibleLeaders(req.tenantId, LEADER_ROLES),
          stores.cca.listAssignments(req.tenantId, { tier: 'leader' }),
          stores.cca.listAssignments(req.tenantId, { tier: 'employee' }),
        ]);
        const byAssignee = new Map(leaders.map((a) => [a.assigneeId, a]));
        const rows = eligible.map((u) => {
          const a = byAssignee.get(u.id);
          // Dihitung per penugas, bukan per putaran penugasan pimpinan, supaya cocok dengan KPI employeesAssigned
          const team = employees.filter((e) => e.assignedBy === u.id);
          return {
            userId: u.id, name: u.name, division: u.division ?? null, jobRoleName: u.jobRoleName ?? null,
            assignmentId: a ? a.id : null, status: a ? a.status : 'none', dueDate: a ? a.dueDate : null,
            teamTotal: u.teamSize, teamAssigned: team.length, teamDone: team.filter((e) => e.status === 'completed').length,
          };
        });
        const assignedRows = rows.filter((x) => x.status !== 'none');
        // HR menerima status pimpinan dan hitungan tim; daftar karyawan per orang tidak ikut.
        return res.json({
          data: {
            role: 'hr',
            mine,
            kpis: {
              leadersEligible: rows.length,
              leadersAssigned: assignedRows.length,
              leadersCompleted: assignedRows.filter((x) => x.status === 'completed').length,
              employeesAssigned: employees.length,
              employeesCompleted: employees.filter((a) => a.status === 'completed').length,
            },
            leaders: rows,
          },
        });
      }
      if (!isLeaderRole(req)) return res.json({ data: { role: 'employee', mine } });
      const members = await teamOf(req);
      const theirs = await stores.cca.listAssignments(req.tenantId, { assigneeIds: members.map((m) => m.id), tier: 'employee' });
      const statusOf = new Map(theirs.map((a) => [a.assigneeId, a.status]));
      // Pimpinan hanya melihat status tim; ringkasan dan isi jawaban tidak pernah ikut.
      return res.json({
        data: {
          role: 'leader',
          mine,
          canAssign: !!own.leader && own.leader.status === 'completed',
          team: members.map((m) => ({ userId: m.id, name: m.name, jobRoleName: m.jobRoleName ?? null, status: statusOf.get(m.id) || 'none' })),
        },
      });
    }));

    r.post('/assignments', interview, requireRole(ROLES.HR_ADMIN, ...LEADER_ROLES), wrap(async (req, res) => {
      const body = req.body || {};
      const ids = Array.isArray(body.assigneeIds) ? [...new Set(body.assigneeIds.map(String))] : [];
      if (!ids.length || ids.length > MAX_ASSIGNEES) throw badRequest(`assigneeIds wajib berisi 1-${MAX_ASSIGNEES} orang`);
      const due = v.date(body.dueDate);
      if (!due) throw badRequest('Batas waktu wajib diisi dengan tanggal yang valid');
      // "hari ini" dihitung dalam WIB (UTC+7)
      if (v.isoDate(due) < v.isoDate(new Date(Date.now() + 7 * 3600 * 1000))) throw badRequest('Batas waktu tidak boleh di masa lalu');
      const durationMinutes = intField(body, 'durationMinutes', 'Durasi', { min: 5, max: 60, fallback: 10 });

      let tier; let parentId = null; let allowed;
      if (isHr(req)) {
        tier = 'leader';
        allowed = new Set((await stores.cca.listEligibleLeaders(req.tenantId, LEADER_ROLES)).map((u) => u.id));
      } else {
        const own = await mineOf(req);
        if (!own.leader || own.leader.status !== 'completed') {
          throw new HttpError(409, 'LEADER_INTERVIEW_REQUIRED', 'Selesaikan wawancara pimpinan Anda dulu sebelum menugaskan anggota tim');
        }
        tier = 'employee'; parentId = own.leader.id;
        allowed = new Set((await teamOf(req)).map((m) => m.id));
      }

      const assigned = []; const skipped = []; const rejected = [];
      for (const id of ids) {
        // id di luar aturan (termasuk id tenant lain) dijawab sama: rejected
        if (!UUID_RE.test(id) || !allowed.has(id)) { rejected.push(id); continue; }
        const row = await stores.cca.createAssignment(req.tenantId, { assigneeId: id, assignedBy: req.user.id, tier, parentId, dueDate: v.isoDate(due), durationMinutes });
        if (row) assigned.push(row); else skipped.push(id);
      }
      if (assigned.length) await audit.record(req, 'create', 'cca.assignment', { tier, assigneeIds: assigned.map((a) => a.assigneeId), dueDate: v.isoDate(due) });
      res.status(201).json({ data: { tier, assigned: assigned.map((a) => ({ ...publicAssignment(a), assigneeId: a.assigneeId })), skipped, rejected } });
    }));

    r.patch('/assignments/:id', interview, requireRole(ROLES.HR_ADMIN, ...LEADER_ROLES), wrap(async (req, res) => {
      if ((req.body || {}).status !== 'cancelled') throw badRequest('Hanya pembatalan (status: cancelled) yang didukung');
      const a = await stores.cca.getAssignment(req.tenantId, idParam(req, 'Penugasan'));
      // HR membatalkan tier pimpinan; penugasan karyawan hanya oleh atasan yang menugaskannya (spek 6.3)
      const mayCancel = a && (a.assignedBy === req.user.id || (isHr(req) && a.tier === 'leader'));
      if (!mayCancel) throw notFound('Penugasan tidak ditemukan');
      const row = await stores.cca.cancelAssignment(req.tenantId, a.id);
      if (!row) throw new HttpError(409, 'INVALID_STATE', 'Penugasan yang sudah dimulai atau selesai tidak bisa dibatalkan');
      await audit.record(req, 'update', 'cca.assignment', { assignmentId: a.id, assigneeIds: [a.assigneeId], status: 'cancelled' });
      res.json({ data: publicAssignment(row) });
    }));

    // Ringkasan wawancara: peserta sendiri, atau HR untuk tier pimpinan. Ringkasan karyawan tidak dibuka per orang.
    r.get('/assignments/:id/summary', interview, wrap(async (req, res) => {
      const a = await stores.cca.getAssignment(req.tenantId, idParam(req, 'Penugasan'));
      const own = a && a.assigneeId === req.user.id;
      if (!a || (!own && !isHr(req))) throw notFound('Penugasan tidak ditemukan');
      if (!own && a.tier !== 'leader') throw forbidden('SUMMARY_RESTRICTED', 'Ringkasan karyawan tidak ditampilkan per orang; lihat sintesis');
      const summary = a.status === 'completed' ? await stores.cca.getAssignmentSummary(req.tenantId, a.id) : null;
      if (!summary) throw notFound('Ringkasan belum tersedia');
      await audit.readIndividual(req, 'cca.interview_summary', { employeeIds: [a.assigneeId], objectType: 'cca_assignment', objectIds: [a.id] });
      res.json({ data: { ...publicAssignment(a), assigneeId: a.assigneeId, summary } });
    }));

    return r;
  },
};
