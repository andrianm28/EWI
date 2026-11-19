'use strict';
// PK-15 (17 Nov): hak subjek data selama pilot — hapus dan ekspor data per karyawan.
// Bukan submodul (tidak lewat requireSubmodule): hak hapus/ekspor berlaku apa pun modul yang aktif.
// - Hapus: HR tenant yang sama (Admin ETA ikut aturan requireRole). Akun HR/Admin dan akun sendiri tidak bisa dihapus.
// - Ekspor (JSON): karyawan itu sendiri atau HR tenant yang sama. Atasan tidak (ekspor bukan bagian RG-3).
//   Transkrip mentah hanya ikut bila yang mengekspor adalah karyawan itu sendiri (PO-6 A).
// Setiap hapus dan ekspor dicatat di audit log sebelum dijalankan (fail closed).
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor, inScope } = require('../../core/rbac/scope');
const { FLAGS } = require('../../core/flags');
const { forbidden, notFound, badRequest, HttpError } = require('../../core/errors');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const SUBMODULES = ['tna', 'dna'];
const EXPORT_VERSION = 'elgos-employee-export-v1';

async function buildExport({ stores, flags, tenantId, person, self }) {
  const only = { userIds: [person.id] };
  const ina = (await flags.isEnabled(tenantId, FLAGS.MODULE_INA)) && (await flags.isEnabled(tenantId, FLAGS.INA_DASHBOARD));
  // Karyawan menerima seluruh temuannya; HR mengikuti aturan tampil RG-4 (non-training hanya bila INA aktif).
  const categories = self || ina ? ['training', 'non_training'] : ['training'];
  const interviews = [];
  for (const sub of SUBMODULES) {
    for (const s of await stores.interviews.list(tenantId, sub, only)) {
      const row = { submodule: sub, id: s.id, projectId: s.projectId, status: s.status, consentAt: s.consentAt,
        consentVersion: s.consentVersion ?? null, consentWithdrawnAt: s.consentWithdrawnAt ?? null, startedAt: s.startedAt, endedAt: s.endedAt };
      row.transcript = self ? await stores.interviews.turns(tenantId, s.id) : undefined;
      interviews.push(row);
    }
  }
  const [findings, planItems, performance, assessments, completions] = await Promise.all([
    stores.tna.listFindings(tenantId, only, { categories }),
    stores.tna.listPlanItems(tenantId, only),
    stores.tna.listPerformance(tenantId, only, {}),
    stores.dna.assessments(tenantId, person.id),
    stores.dna.completions(tenantId, [person.id]),
  ]);
  // B10: hasil program nilai dan penugasan wawancara Core Competencies; ringkasan wawancara hanya untuk karyawan itu sendiri
  const coreCompetencies = stores.cca ? await stores.cca.exportFor(tenantId, person.id, { withSummary: self }) : undefined;
  return {
    format: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    transcriptIncluded: self,
    profile: person,
    interviews,
    findings,
    planItems,
    performance,
    dna: { assessments, completions },
    // B8: permintaan data milik karyawan (tarik persetujuan, minta hapus)
    dataRequests: stores.dataRequests ? await stores.dataRequests.listForUser(tenantId, person.id) : [],
    // B17: pertanyaan dan jawaban Asisten ELGOS milik karyawan
    assistantLogs: stores.assistant ? (await stores.assistant.listForUser(tenantId, person.id))
      .map(({ createdAt, view, question, answer, outcome }) => ({ createdAt, view, question, answer, outcome })) : [],
    coreCompetencies,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_TYPES = ['withdraw_consent', 'delete_data'];
const REQUEST_STATUSES = ['open', 'done', 'cancelled'];
const isAdmin = (role) => [ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(role);

function employeeRouter({ stores, flags, audit }) {
  const r = express.Router();
  const hr = requireRole(ROLES.HR_ADMIN);

  // --- B8: permintaan data karyawan. Tanpa flag: hak subjek data tidak bergantung pada flag fitur. ---
  // Rute ini didaftarkan sebelum /:userId.
  if (stores.dataRequests) {
    r.post('/me/data-requests', wrap(async (req, res) => {
      const { type } = req.body || {};
      if (!REQUEST_TYPES.includes(type)) throw badRequest(`type harus ${REQUEST_TYPES.join(' atau ')}`);
      const reason = String((req.body || {}).reason || '').trim();
      if (reason.length > 1000) throw badRequest('reason maksimal 1000 karakter');
      const me = req.user.id;
      if (type === 'delete_data') {
        if (isAdmin(req.user.role)) throw new HttpError(409, 'ADMIN_ACCOUNT', 'Akun HR atau Admin ETA tidak dihapus lewat sini. Hubungi Admin ETA.');
        const row = await stores.dataRequests.createDelete(req.tenantId, me, reason || null);
        if (!row) throw new HttpError(409, 'REQUEST_EXISTS', 'Permintaan hapus data Anda sudah tercatat dan sedang diproses HR');
        await audit.record(req, 'create', 'my.data_request', { employeeIds: [me], type, requestId: row.id });
        return res.status(201).json({ data: row });
      }
      // Keputusan user 19 Nov: tarik persetujuan menghentikan wawancara dan menandai sesi; data tidak dihapus.
      const out = await stores.dataRequests.withdrawConsent(req.tenantId, me, reason || null);
      await audit.record(req, 'create', 'my.data_request', { employeeIds: [me], type, requestId: out.request.id, sessions: out.sessionIds.length, objectType: 'interview_session', objectIds: out.sessionIds });
      return res.status(out.created ? 201 : 200).json({ data: { ...out.request, sessions: out.sessionIds.length } });
    }));

    r.delete('/me/data-requests/:id', wrap(async (req, res) => {
      const row = UUID.test(req.params.id) ? await stores.dataRequests.get(req.tenantId, req.params.id) : null;
      if (!row || row.userId !== req.user.id) throw notFound('Permintaan tidak ditemukan');
      if (row.type === 'withdraw_consent') throw new HttpError(409, 'CANNOT_CANCEL', 'Persetujuan yang sudah ditarik tidak bisa dipulihkan. HR bisa mengundang Anda lagi.');
      const done = await stores.dataRequests.cancel(req.tenantId, row.id, req.user.id);
      if (!done) throw new HttpError(409, 'INVALID_STATE', 'Permintaan ini sudah diproses');
      await audit.record(req, 'update', 'my.data_request', { employeeIds: [req.user.id], type: row.type, requestId: row.id, to: 'cancelled' });
      res.json({ data: done });
    }));

    r.get('/data-requests', hr, wrap(async (req, res) => {
      const status = req.query.status || 'open';
      if (status !== 'all' && !REQUEST_STATUSES.includes(status)) throw badRequest('status harus open, done, cancelled, atau all');
      const rows = await stores.dataRequests.list(req.tenantId, { statuses: status === 'all' ? undefined : [status] });
      const now = Date.now();
      await audit.readIndividual(req, 'employee.data_requests', { employeeIds: rows.map((x) => x.userId), objectType: 'data_request', objectIds: rows.map((x) => x.id) });
      res.json({ data: rows.map((x) => ({ ...x, overdue: x.status === 'open' && Boolean(x.dueAt) && now > new Date(x.dueAt).getTime() })) });
    }));

    r.post('/data-requests/:id/fulfill', hr, wrap(async (req, res) => {
      const row = UUID.test(req.params.id) ? await stores.dataRequests.get(req.tenantId, req.params.id) : null;
      if (!row) throw notFound('Permintaan tidak ditemukan');
      if (row.userId === req.user.id) throw new HttpError(409, 'CANNOT_FULFILL_OWN', 'Permintaan Anda sendiri harus diproses HR lain');
      if (row.type === 'delete_data') throw new HttpError(409, 'USE_DELETE_EMPLOYEE', 'Permintaan hapus data dipenuhi dengan menghapus data karyawan itu');
      if (row.status !== 'open') throw new HttpError(409, 'INVALID_STATE', 'Permintaan ini sudah diproses');
      const erase = (req.body || {}).erase === true;
      const note = String((req.body || {}).note || '').trim().slice(0, 1000) || null;
      // Audit sebelum hapus (pola PK-15), ditulis di dalam transaksi setelah permintaan diklaim dan sesi dikunci:
      // daftar sesinya sama dengan yang dihapus, dan permintaan yang kalah balapan tidak meninggalkan jejak palsu.
      const beforeErase = (sessionIds) => audit.record(req, 'delete', 'employee.interview_data', {
        employeeIds: [row.userId], requestId: row.id, objectType: 'interview_session', sessionIds,
      });
      const out = await stores.dataRequests.resolveWithdrawal(req.tenantId, row.id, { resolvedBy: req.user.id, note, erase, beforeErase });
      if (!out) throw new HttpError(409, 'INVALID_STATE', 'Permintaan ini sudah diproses');
      await audit.record(req, 'update', 'employee.data_request', { employeeIds: [row.userId], requestId: row.id, type: row.type, erase });
      res.json({ data: out });
    }));
  }

  r.get('/:userId/export', wrap(async (req, res) => {
    const self = req.user.id === req.params.userId;
    if (!self && ![ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(req.user.role)) {
      throw forbidden('ROLE_FORBIDDEN', 'Ekspor data hanya untuk karyawan itu sendiri atau HR');
    }
    const scope = await scopeFor(req, stores.people);
    if (!inScope(scope, req.params.userId)) throw notFound('Karyawan tidak ditemukan');
    const person = await stores.people.get(req.tenantId, req.params.userId);
    if (!person) throw notFound('Karyawan tidak ditemukan');
    const data = await buildExport({ stores, flags, tenantId: req.tenantId, person, self });
    await audit.record(req, 'export', 'employee.data', {
      employeeIds: [person.id], self, format: EXPORT_VERSION, transcriptIncluded: self,
      counts: { interviews: data.interviews.length, findings: data.findings.length, planItems: data.planItems.length, performance: data.performance.length },
    });
    res.setHeader('Content-Disposition', `attachment; filename="elgos-data-${person.id}.json"`);
    res.json({ data });
  }));

  r.delete('/:userId', requireRole(ROLES.HR_ADMIN), wrap(async (req, res) => {
    if (req.params.userId === req.user.id) throw new HttpError(409, 'CANNOT_DELETE_SELF', 'Tidak bisa menghapus akun sendiri');
    const person = await stores.people.get(req.tenantId, req.params.userId);
    if (!person) throw notFound('Karyawan tidak ditemukan');
    if ([ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(person.role)) {
      throw new HttpError(409, 'ADMIN_ACCOUNT', 'Akun HR atau Admin ETA dinonaktifkan lewat Admin ETA, bukan dihapus di sini');
    }
    const reason = String((req.body || {}).reason || '').slice(0, 500) || null;
    // B8: permintaan data yang masih terbuka ikut tercatat, karena barisnya terhapus bersama akun (bukti pemenuhan)
    const dataRequests = stores.dataRequests
      ? (await stores.dataRequests.listForUser(req.tenantId, person.id)).filter((x) => x.status === 'open').map(({ id, type, createdAt }) => ({ id, type, createdAt }))
      : [];
    await audit.record(req, 'delete', 'employee', { employeeIds: [person.id], reason, dataRequests });
    const result = await stores.people.deleteEmployee(req.tenantId, person.id);
    if (!result) throw notFound('Karyawan tidak ditemukan');
    res.json({ data: { deleted: true, userId: result.id, scrubbedImportRows: result.scrubbedImportRows } });
  }));

  return r;
}

module.exports = { employeeRouter, buildExport, EXPORT_VERSION };
