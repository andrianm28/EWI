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
const { forbidden, notFound, HttpError } = require('../../core/errors');

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
        consentVersion: s.consentVersion ?? null, startedAt: s.startedAt, endedAt: s.endedAt };
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
  // B15: skor dampak belajar; tidak digerbang flag (hak subjek data berlaku apa pun modul yang aktif)
  const impactMeasurement = stores.lim ? await stores.lim.exportForUser(tenantId, person.id) : undefined;
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
    coreCompetencies,
    impactMeasurement,
  };
}

function employeeRouter({ stores, flags, audit }) {
  const r = express.Router();

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
    await audit.record(req, 'delete', 'employee', { employeeIds: [person.id], reason });
    const result = await stores.people.deleteEmployee(req.tenantId, person.id);
    if (!result) throw notFound('Karyawan tidak ditemukan');
    res.json({ data: { deleted: true, userId: result.id, scrubbedImportRows: result.scrubbedImportRows } });
  }));

  return r;
}

module.exports = { employeeRouter, buildExport, EXPORT_VERSION };
