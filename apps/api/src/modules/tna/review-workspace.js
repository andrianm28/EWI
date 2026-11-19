'use strict';
// B7 Tinjauan HR versi mockup Pak Eji: klasifikasi tiga tombol, solusi pelatihan, penugasan ke EliteMentor,
// ekspor gap ke LMS klien, dan serah temuan ke Improvement Needs. Spek: docs/designs/b7-tinjauan-hr.md
// Seluruh rute di balik flag tna.review_workspace (default mati) dan hanya untuk HR. Tidak ada rute yang
// memuat giliran percakapan (PO-6 A).
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { FLAGS, requireFlag } = require('../../core/flags');
const { deliveryFor } = require('../../core/settings');
const { badRequest, notFound, HttpError } = require('../../core/errors');
const { reviewDue, suggestedClassification, CLASSIFICATIONS, categoryFor } = require('./review-sla');
const { PLAN_STATUS_LABEL } = require('./plan-status');
const { toCsv } = require('./csv');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_PLAN = ['new', 'in_progress'];
const MAX_HANDOFF = 200;
// BOM supaya Excel membaca UTF-8
const BOM = String.fromCharCode(0xfeff);
const EXPORT_HEADER = ['ID Karyawan', 'Nama', 'Email', 'Kompetensi', 'Kode Course', 'Judul Course', 'Program', 'Status Rencana'];

/** Bentuk satu butir antrean tinjauan: field tahan, saran klasifikasi, dan batas tinjauan. */
function toReviewItem(row, targetDays, now = new Date()) {
  const { sessionEndedAt, ...item } = row;
  return {
    ...item,
    held: Boolean(item.heldAt) && item.reviewStatus === 'draft',
    suggestedClassification: suggestedClassification(item),
    ...reviewDue({ sessionEndedAt, createdAt: item.createdAt, reviewStatus: item.reviewStatus }, targetDays, now),
  };
}

function reviewWorkspaceRouter({ stores, settings, catalog, flags, audit, assignments, wrap }) {
  const r = express.Router();
  const hr = requireRole(ROLES.HR_ADMIN);
  const flag = requireFlag(flags, FLAGS.TNA_REVIEW_WORKSPACE, 'Tinjauan HR versi baru belum diaktifkan untuk organisasi Anda');
  const conflict = (code, message) => new HttpError(409, code, message);

  /** Bisakah tenant ini menugaskan langsung ke EliteMentor? Baris 5 dan 6 tabel keputusan di spek. */
  async function assignGate(tenantId, conf) {
    if (conf.lms.delivery === 'lms_export') return conflict('ASSIGN_VIA_EXPORT', `Organisasi Anda belajar di ${conf.lms.lmsName}. Ekspor daftar gap untuk diunggah ke sana.`);
    if (!assignments || !conf.lms.elitementorOrganizationId || !(await flags.isEnabled(tenantId, FLAGS.GAPS_AUTOSEND))) {
      return conflict('ASSIGN_UNAVAILABLE', 'Penugasan langsung ke EliteMentor belum tersedia untuk organisasi Anda');
    }
    return null;
  }

  // --- Klasifikasi tiga tombol ---
  r.post('/findings/:id/classify', flag, hr, wrap(async (req, res) => {
    const { classification, note } = req.body || {};
    if (!CLASSIFICATIONS.includes(classification)) throw badRequest(`classification harus ${CLASSIFICATIONS.join(', ')}`);
    const cleanNote = note == null ? undefined : String(note).trim();
    if (cleanNote && cleanNote.length > 2000) throw badRequest('note maksimal 2000 karakter');
    const current = UUID.test(req.params.id) ? await stores.tna.getReviewItem(req.tenantId, req.params.id) : null;
    if (!current) throw notFound('Temuan tidak ditemukan');
    const reviewed = conflict('ALREADY_REVIEWED', 'Temuan ini sudah direview');
    const conf = await settings.get(req.tenantId);
    const base = { tenantId: req.tenantId, id: current.id, reviewerId: req.user.id };
    let out; let decision;

    if (current.reviewStatus === 'draft') {
      if (classification === 'needs_review') {
        out = await stores.tna.holdFinding(req.tenantId, current.id, { note: cleanNote, reviewerId: base.reviewerId });
        decision = 'hold';
      } else {
        const category = categoryFor(classification);
        decision = category === current.category ? 'approved' : 'edited';
        out = await stores.tna.reviewFinding(req.tenantId, current.id, {
          decision, category: decision === 'edited' ? category : undefined, note: cleanNote, reviewerId: base.reviewerId,
        });
      }
      if (!out) throw reviewed;
    } else if (current.reviewStatus === 'rejected' || classification === 'needs_review') {
      throw reviewed;
    } else {
      const category = categoryFor(classification);
      if (category === current.category) return res.json({ data: toReviewItem(current, conf.tna.reviewTargetDays) });
      out = await stores.tna.reclassifyFinding(req.tenantId, current.id, { category, reviewerId: base.reviewerId });
      if (!out) throw conflict('ALREADY_ACTIONED', 'Temuan ini sudah ditindaklanjuti, klasifikasinya tidak bisa diubah lagi');
      decision = 'reclassified';
    }
    await audit.record(req, 'update', 'tna.finding_review', {
      employeeIds: [current.userId], objectType: 'tna_finding', objectIds: [current.id], decision, classification, from: current.category, confidence: current.confidence,
    });
    return res.json({ data: toReviewItem(out, conf.tna.reviewTargetDays) });
  }));

  // --- Solusi: rekomendasi course untuk temuan pelatihan, daftar temuan perbaikan ---
  r.get('/review/solutions', flag, hr, wrap(async (req, res) => {
    const [rows, conf, inaEnabled] = await Promise.all([
      stores.tna.listReviewedForSolutions(req.tenantId, { projectId: req.query.projectId }),
      settings.get(req.tenantId),
      flags.isEnabled(req.tenantId, FLAGS.MODULE_INA),
    ]);
    const training = [];
    for (const f of rows.filter((x) => x.category === 'training')) {
      let recommendation = null;
      if (!f.planItem && f.competencyId) {
        const competency = await stores.dna.getCompetency(req.tenantId, f.competencyId);
        const hit = await catalog.match({ tenantId: req.tenantId, targets: conf.lms.targets, competency });
        if (hit) recommendation = { source: hit.source, ref: hit.ref, title: hit.title, url: hit.url || null, programTier: hit.programTier || null };
      }
      training.push({ findingId: f.findingId, userId: f.userId, userName: f.userName, title: f.title, competencyName: f.competencyName, recommendation, planItem: f.planItem });
    }
    const improvement = rows.filter((x) => x.category === 'non_training')
      .map((f) => ({ findingId: f.findingId, userId: f.userId, userName: f.userName, title: f.title, handedOffAt: f.handedOffAt }));
    const delivery = { ...deliveryFor(conf, null), assignAvailable: !(await assignGate(req.tenantId, conf)) };
    await audit.readIndividual(req, 'tna.review_solutions', { employeeIds: rows.map((f) => f.userId), objectType: 'tna_finding', objectIds: rows.map((f) => f.findingId) });
    res.json({ data: { training, improvement, delivery, inaEnabled } });
  }));

  // --- Penugasan satu rencana ke EliteMentor. Urutan cek mengikuti tabel keputusan di spek ---
  r.post('/plan-items/:id/assign', flag, hr, wrap(async (req, res) => {
    const plan = UUID.test(req.params.id) ? await stores.tna.getPlanForAssignment(req.tenantId, req.params.id) : null;
    if (!plan) throw notFound('Item training plan tidak ditemukan');
    if (!ACTIVE_PLAN.includes(plan.status)) throw conflict('INVALID_STATE', `Rencana berstatus "${PLAN_STATUS_LABEL[plan.status]}" tidak bisa ditugaskan`);
    if (!plan.catalogItemRef) throw conflict('NEEDS_MODULE', 'Rencana ini belum punya course. Pilih atau buat modulnya dulu.');
    if (plan.assignmentStatus === 'sent') return res.json({ data: await stores.tna.getPlanItem(req.tenantId, plan.id) });
    const conf = await settings.get(req.tenantId);
    const blocked = await assignGate(req.tenantId, conf);
    if (blocked) throw blocked;
    if (plan.catalogSource !== 'elitementor') throw conflict('COURSE_NOT_IN_TARGET', 'Course rencana ini bukan course EliteMentor. Ekspor daftar gap untuk LMS perusahaan.');
    if (!(await stores.tna.claimPlanAssignment(req.tenantId, plan.id))) throw conflict('ASSIGN_IN_PROGRESS', 'Penugasan rencana ini sedang dikirim. Coba lagi sebentar.');

    const meta = { employeeIds: [plan.userId], objectType: 'tna_plan_item', objectIds: [plan.id], target: 'elitementor' };
    let ref;
    try {
      ({ ref } = await assignments.assign({
        organizationId: conf.lms.elitementorOrganizationId,
        employee: { employeeId: plan.employeeId, email: plan.email },
        course: { ref: plan.catalogItemRef, title: plan.catalogItemTitle },
        planItemId: plan.id,
      }));
    } catch {
      await stores.tna.finishPlanAssignment(req.tenantId, plan.id, { status: 'failed', ref: null, userId: req.user.id });
      await audit.record(req, 'update', 'tna.plan_assignment', { ...meta, result: 'failed' });
      throw new HttpError(502, 'EM_ASSIGN_FAILED', 'EliteMentor tidak menerima penugasan. Coba lagi.');
    }
    const saved = await stores.tna.finishPlanAssignment(req.tenantId, plan.id, { status: 'sent', ref, userId: req.user.id });
    await audit.record(req, 'update', 'tna.plan_assignment', { ...meta, result: 'sent' });
    return res.json({ data: saved });
  }));

  // --- Ekspor gap untuk LMS klien (K4). Hanya membaca ---
  r.get('/plan-items/export.csv', flag, hr, wrap(async (req, res) => {
    const rows = await stores.tna.listPlanExport(req.tenantId, { projectId: req.query.projectId });
    const csv = toCsv(EXPORT_HEADER, rows.map((p) => [
      p.employeeId, p.userName, p.email, p.competencyName, p.catalogItemRef, p.catalogItemTitle, p.programTier, PLAN_STATUS_LABEL[p.status] || p.status,
    ]));
    // audit lebih dulu: ekspor tanpa jejak tidak dikirim
    await audit.record(req, 'export', 'tna.plan_items', {
      employeeIds: [...new Set(rows.map((p) => p.userId))], objectType: 'tna_plan_item', count: rows.length,
    });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="gap-pelatihan-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`${BOM}${csv}`);
  }));

  // --- Serah temuan non-pelatihan ke Improvement Needs (dibaca modul INA, B9) ---
  r.post('/review/improvement-handoff', flag, hr, wrap(async (req, res) => {
    const raw = (req.body || {}).findingIds;
    if (!Array.isArray(raw) || !raw.length || raw.length > MAX_HANDOFF) throw badRequest(`findingIds wajib berisi 1-${MAX_HANDOFF} id`);
    if (!raw.every((id) => typeof id === 'string' && UUID.test(id))) throw badRequest('findingIds harus berisi id temuan yang valid');
    if (!(await flags.isEnabled(req.tenantId, FLAGS.MODULE_INA))) throw conflict('INA_DISABLED', 'Modul Improvement Needs belum aktif untuk organisasi Anda');
    const ids = [...new Set(raw.map((id) => id.toLowerCase()))];
    const out = await stores.tna.handoffImprovement(req.tenantId, ids, req.user.id);
    if (out.handedOff.length) {
      await audit.record(req, 'update', 'tna.improvement_handoff', { objectType: 'tna_finding', objectIds: out.handedOff, count: out.handedOff.length });
    }
    res.json({ data: out });
  }));

  return r;
}

module.exports = { reviewWorkspaceRouter, toReviewItem };
