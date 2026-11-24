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
const { gapKeyOf, findingsInGap, GAP_MATCH_COLUMNS } = require('./gaps');
const { metricKey } = require('./performance');
const { parseGapQuery } = require('./assignment');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_PLAN = ['new', 'in_progress'];
const MAX_HANDOFF = 200;
// BOM supaya Excel membaca UTF-8
const BOM = String.fromCharCode(0xfeff);
const EXPORT_HEADER = ['ID Karyawan', 'Nama', 'Email', 'Kompetensi', 'Kode Course', 'Judul Course', 'Program', 'Status Rencana'];

/** Salinan baris tanpa field tertentu. */
const omit = (fields) => (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !fields.includes(k)));
// Kolom internal pencocokan gap (gaps.js GAP_MATCH_COLUMNS, dipilih lna-stores); tidak dikirim ke klien
const withoutGapFields = omit(Object.keys(GAP_MATCH_COLUMNS));
// Layar tinjauan per gap tanpa rincian temuan maupun catatan ringkasan karyawan (PO-6 A); rincian di antrean lama
const GAP_HIDDEN_FIELDS = ['detail', 'originalDetail', 'summaryNote'];
const withoutDetail = omit(GAP_HIDDEN_FIELDS);

/** Permintaan membawa filter gap (`kind` terisi). Dipakai juga gerbang flag GET /review di index.js. */
const hasGapFilter = (req) => req.query.kind !== undefined && req.query.kind !== '';

/**
 * Paritas B7 web: filter gap opsional dari query (parameter sama dengan `/tna/gaps/detail`). Tanpa `kind` -> null
 * (perilaku lama). Kompetensi harus milik tenant ini (404). Return { key, label, keep(rows), query } dengan `query`
 * predikat gap untuk store reviewQueue, listReviewedForSolutions, dan listPlanExport (audit PR 39 butir 39-3).
 */
async function gapFilterOf(req, stores) {
  if (!hasGapFilter(req)) return null;
  const gap = parseGapQuery(req.query);
  let label = gap.name;
  if (gap.kind === 'competency') {
    const competency = await stores.dna.getCompetency(req.tenantId, gap.competencyId);
    if (!competency) throw notFound('Gap tidak ditemukan');
    label = competency.name;
  }
  const key = gapKeyOf(gap);
  const query = gap.kind === 'competency'
    ? { kind: 'competency', competencyId: gap.competencyId }
    : { kind: 'okr', metricType: gap.metricType, metricKey: metricKey(gap.name), period: gap.period };
  return { key, label, keep: (rows) => findingsInGap(rows, key), query };
}

/** projectId opsional di query: harus satu UUID, selain itu 400 (bukan galat cast di database). */
function projectIdOf(req) {
  const v = req.query.projectId;
  if (v === undefined || v === '') return undefined;
  if (typeof v !== 'string' || !UUID.test(v)) throw badRequest('projectId tidak valid');
  return v;
}

/** Bentuk satu butir antrean tinjauan: field tahan, saran klasifikasi, dan batas tinjauan. */
function toReviewItem(row, targetDays, now = new Date()) {
  const { sessionEndedAt, ...item } = withoutGapFields(row);
  return {
    ...item,
    held: Boolean(item.heldAt) && item.reviewStatus === 'draft',
    suggestedClassification: suggestedClassification(item),
    ...reviewDue({ sessionEndedAt, createdAt: item.createdAt, reviewStatus: item.reviewStatus }, targetDays, now),
  };
}

function reviewWorkspaceRouter({ stores, settings, catalog, flags, audit, assignments, ltiAssignments, wrap }) {
  const r = express.Router();
  const hr = requireRole(ROLES.HR_ADMIN);
  const flag = requireFlag(flags, FLAGS.TNA_REVIEW_WORKSPACE, 'Tinjauan HR versi baru belum diaktifkan untuk organisasi Anda');
  const conflict = (code, message) => new HttpError(409, code, message);

  /**
   * Bisakah tenant ini menugaskan langsung ke EliteMentor? Baris 5 dan 6 tabel keputusan di spek B7.
   * EM-LTI (spek em-lti-platform §3.4): ekspor LMS tetap dicek dulu; lalu mode LTI (flag em.lti + tool aktif) didahulukan,
   * kalau tidak jalur REST lama. Return { mode: 'lti', tool } | { mode: 'rest' } | { blocked }.
   */
  async function assignGate(tenantId, conf) {
    if (conf.lms.delivery === 'lms_export') return { blocked: conflict('ASSIGN_VIA_EXPORT', `Organisasi Anda belajar di ${conf.lms.lmsName}. Ekspor daftar gap untuk diunggah ke sana.`) };
    const tool = ltiAssignments ? await ltiAssignments.available(tenantId) : null;
    if (tool) return { mode: 'lti', tool };
    if (!assignments || !conf.lms.elitementorOrganizationId || !(await flags.isEnabled(tenantId, FLAGS.GAPS_AUTOSEND))) {
      return { blocked: conflict('ASSIGN_UNAVAILABLE', 'Penugasan langsung ke EliteMentor belum tersedia untuk organisasi Anda') };
    }
    return { mode: 'rest' };
  }

  // --- Klasifikasi tiga tombol ---
  // Hanya dipakai layar tinjauan per gap, jadi respons tanpa rincian dan catatan ringkasan (PO-6 A, P9 CD-3)
  const classifiedItem = (row, conf) => withoutDetail(toReviewItem(row, conf.tna.reviewTargetDays));
  r.post('/findings/:id/classify', hr, flag, wrap(async (req, res) => {
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

    // B8 + keputusan user 19 Nov: temuan dari wawancara yang persetujuannya ditarik dibekukan (draf maupun sudah diputus)
    assertNotWithdrawn(current);
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
      if (category === current.category) return res.json({ data: classifiedItem(current, conf) });
      out = await stores.tna.reclassifyFinding(req.tenantId, current.id, { category, reviewerId: base.reviewerId });
      if (!out) throw conflict('ALREADY_ACTIONED', 'Temuan ini sudah ditindaklanjuti, klasifikasinya tidak bisa diubah lagi');
      decision = 'reclassified';
    }
    await audit.record(req, 'update', 'tna.finding_review', {
      employeeIds: [current.userId], objectType: 'tna_finding', objectIds: [current.id], decision, classification, from: current.category, confidence: current.confidence,
    });
    return res.json({ data: classifiedItem(out, conf) });
  }));

  // --- Solusi: rekomendasi course untuk temuan pelatihan, daftar temuan perbaikan ---
  r.get('/review/solutions', hr, flag, wrap(async (req, res) => {
    const gap = await gapFilterOf(req, stores);
    const [all, conf, inaEnabled] = await Promise.all([
      // predikat gap di SQL (sama dengan reviewQueue), keanggotaan pasti tetap lewat gap.keep (aturan R6)
      stores.tna.listReviewedForSolutions(req.tenantId, { projectId: projectIdOf(req), gap: gap ? gap.query : undefined }),
      settings.get(req.tenantId),
      flags.isEnabled(req.tenantId, FLAGS.MODULE_INA),
    ]);
    const rows = gap ? gap.keep(all) : all;
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
    const delivery = { ...deliveryFor(conf, null), assignAvailable: !(await assignGate(req.tenantId, conf)).blocked };
    await audit.readIndividual(req, 'tna.review_solutions', { employeeIds: rows.map((f) => f.userId), objectType: 'tna_finding', objectIds: rows.map((f) => f.findingId) });
    res.json({ data: { training, improvement, delivery, inaEnabled } });
  }));

  // --- Penugasan satu rencana ke EliteMentor. Urutan cek mengikuti tabel keputusan di spek ---
  r.post('/plan-items/:id/assign', hr, flag, wrap(async (req, res) => {
    const plan = UUID.test(req.params.id) ? await stores.tna.getPlanForAssignment(req.tenantId, req.params.id) : null;
    if (!plan) throw notFound('Item training plan tidak ditemukan');
    if (plan.frozen) throw frozenError();
    if (!ACTIVE_PLAN.includes(plan.status)) throw conflict('INVALID_STATE', `Rencana berstatus "${PLAN_STATUS_LABEL[plan.status]}" tidak bisa ditugaskan`);
    if (!plan.catalogItemRef) throw conflict('NEEDS_MODULE', 'Rencana ini belum punya course. Pilih atau buat modulnya dulu.');
    if (plan.assignmentStatus === 'sent') return res.json({ data: await stores.tna.getPlanItem(req.tenantId, plan.id) });
    const conf = await settings.get(req.tenantId);
    const gate = await assignGate(req.tenantId, conf);
    if (gate.blocked) throw gate.blocked;
    if (plan.catalogSource !== 'elitementor') throw conflict('COURSE_NOT_IN_TARGET', 'Course rencana ini bukan course EliteMentor. Ekspor daftar gap untuk LMS perusahaan.');
    const claimedAt = await stores.tna.claimPlanAssignment(req.tenantId, plan.id);
    if (!claimedAt) throw conflict('ASSIGN_IN_PROGRESS', 'Penugasan rencana ini sedang dikirim. Coba lagi sebentar.');

    const meta = { employeeIds: [plan.userId], objectType: 'tna_plan_item', objectIds: [plan.id], target: 'elitementor', mode: gate.mode };
    let ref;
    try {
      // EM-LTI: mode LTI tidak memanggil jaringan; penugasan = resource link yang bisa diluncurkan karyawan
      ({ ref } = gate.mode === 'lti'
        ? await ltiAssignments.assign({ tenantId: req.tenantId, tool: gate.tool, plan, actorId: req.user.id })
        : await assignments.assign({
          organizationId: conf.lms.elitementorOrganizationId,
          employee: { employeeId: plan.employeeId, email: plan.email },
          course: { ref: plan.catalogItemRef, title: plan.catalogItemTitle },
          planItemId: plan.id,
        }));
    } catch (e) {
      // hanya nama galat yang dicatat; pesan bisa memuat data
      console.error(`Penugasan EliteMentor gagal (rencana ${plan.id}): ${e.name || 'Error'}`);
      const closed = await stores.tna.finishPlanAssignment(req.tenantId, plan.id, { status: 'failed', ref: null, userId: req.user.id, claimedAt });
      await audit.record(req, 'update', 'tna.plan_assignment', { ...meta, result: closed ? 'failed' : 'superseded' });
      if (!closed) throw conflict('ASSIGN_IN_PROGRESS', 'Penugasan rencana ini sudah diproses permintaan lain. Muat ulang untuk melihat hasilnya.');
      throw new HttpError(502, 'EM_ASSIGN_FAILED', 'EliteMentor tidak menerima penugasan. Coba lagi.');
    }
    const saved = await stores.tna.finishPlanAssignment(req.tenantId, plan.id, { status: 'sent', ref, userId: req.user.id, claimedAt });
    // Klaim sudah diambil alih permintaan lain (macet > 5 menit): hasil ini tidak disimpan, jadi jangan laporkan terkirim
    await audit.record(req, 'update', 'tna.plan_assignment', { ...meta, result: saved ? 'sent' : 'superseded', ref: saved ? undefined : ref });
    if (!saved) throw conflict('ASSIGN_IN_PROGRESS', 'Penugasan rencana ini sudah diproses permintaan lain. Muat ulang untuk melihat hasilnya.');
    return res.json({ data: saved });
  }));

  // --- Ekspor gap untuk LMS klien (K4). Hanya membaca. Filter gap opsional (layar per gap, P9 IR-5) ---
  r.get('/plan-items/export.csv', hr, flag, wrap(async (req, res) => {
    const gap = await gapFilterOf(req, stores);
    const all = await stores.tna.listPlanExport(req.tenantId, { projectId: projectIdOf(req), gap: gap ? gap.query : undefined });
    const rows = gap ? gap.keep(all) : all;
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

  // --- Serah temuan Improvement Needs ke modul Improvement Needs (dibaca modul INA, B9) ---
  r.post('/review/improvement-handoff', hr, flag, wrap(async (req, res) => {
    const raw = (req.body || {}).findingIds;
    if (!Array.isArray(raw) || !raw.length || raw.length > MAX_HANDOFF) throw badRequest(`findingIds wajib berisi 1-${MAX_HANDOFF} id`);
    if (!raw.every((id) => typeof id === 'string' && UUID.test(id))) throw badRequest('findingIds harus berisi id temuan yang valid');
    if (!(await flags.isEnabled(req.tenantId, FLAGS.MODULE_INA))) throw conflict('INA_DISABLED', 'Modul Improvement Needs belum aktif untuk organisasi Anda');
    const ids = [...new Set(raw.map((id) => id.toLowerCase()))];
    const out = await stores.tna.handoffImprovement(req.tenantId, ids, req.user.id);
    if (out.handedOff.length) {
      await audit.record(req, 'update', 'tna.improvement_handoff', { employeeIds: out.employeeIds, objectType: 'tna_finding', objectIds: out.handedOff, count: out.handedOff.length });
    }
    res.json({ data: { handedOff: out.handedOff, already: out.already, skipped: out.skipped } });
  }));

  return r;
}

/** Keputusan user 19 Nov: temuan dan rencana dari wawancara yang persetujuannya ditarik dibekukan, data tetap disimpan. */
const frozenError = () => new HttpError(409, 'CONSENT_WITHDRAWN', 'Karyawan menarik persetujuan wawancara ini. Temuan dan rencananya dibekukan.');

/** B8: temuan (draf maupun sudah diputus) dari wawancara yang persetujuannya ditarik tidak diproses lagi. */
function assertNotWithdrawn(item) {
  if (item && item.consentWithdrawnAt) throw frozenError();
}

module.exports = { reviewWorkspaceRouter, toReviewItem, withoutDetail, hasGapFilter, gapFilterOf, projectIdOf, assertNotWithdrawn, frozenError };
