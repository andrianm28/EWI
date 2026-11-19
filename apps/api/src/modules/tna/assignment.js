'use strict';
// B5: penugasan wawancara akar masalah (R10, R11 di docs/designs/b5-training-needs.md). Fungsi murni tanpa DB.
const { HttpError, badRequest } = require('../../core/errors');
const { METRIC_TYPES, metricKey } = require('./performance');
const { isOpen } = require('./gaps');

const { WIB_OFFSET_MS, wibDay } = require('../interviews/invitation');
const DUE_MAX_DAYS = 30;
const DURATIONS = Object.freeze([15, 30]);
const MODES = Object.freeze(['affected', 'all_job_role']);
const MAX_EMPLOYEES = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/** Tenggat tanggal WIB -> akhir hari itu (23.59.59 WIB). Paling cepat besok, paling lama 30 hari. */
function parseDueDate(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest('Tenggat wajib diisi dengan format YYYY-MM-DD');
  const due = new Date(`${value}T23:59:59+07:00`);
  if (Number.isNaN(due.getTime()) || new Date(due.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10) !== value) {
    throw badRequest('Tanggal tenggat tidak valid');
  }
  const days = wibDay(due) - wibDay(now);
  if (days < 1 || days > DUE_MAX_DAYS) {
    throw new HttpError(400, 'DUE_DATE_OUT_OF_RANGE', `Tenggat paling cepat besok dan paling lama ${DUE_MAX_DAYS} hari dari sekarang`);
  }
  return due;
}

function parseGap(gap) {
  if (!gap || typeof gap !== 'object') throw badRequest('Pilih gap yang akan diwawancarai');
  if (gap.kind === 'competency') {
    if (!isUuid(gap.competencyId)) throw badRequest('Kompetensi tidak valid');
    return { kind: 'competency', competencyId: gap.competencyId };
  }
  if (gap.kind === 'okr') {
    if (!METRIC_TYPES.includes(gap.metricType)) throw badRequest(`Jenis target harus ${METRIC_TYPES.join(', ')}`);
    if (typeof gap.name !== 'string' || !gap.name.trim() || gap.name.length > 255) throw badRequest('Nama target wajib diisi');
    if (typeof gap.period !== 'string' || !gap.period.trim() || gap.period.length > 32) throw badRequest('Periode target wajib diisi');
    return { kind: 'okr', metricType: gap.metricType, name: gap.name.trim().replace(/\s+/g, ' '), period: gap.period };
  }
  throw badRequest('Jenis gap tidak dikenal; pilih gap kompetensi atau gap OKR');
}

/** Validasi bentuk permintaan penugasan. Keberadaan ID di tenant dicek di router. */
function validateAssignment(body, now = new Date()) {
  const b = body || {};
  if (!isUuid(b.projectId)) throw badRequest('Proyek wajib dipilih');
  const gap = parseGap(b.gap);
  if (!MODES.includes(b.mode)) throw badRequest(`Mode peserta harus ${MODES.join(' atau ')}`);
  if (b.mode === 'all_job_role' && !isUuid(b.jobRoleId)) throw badRequest('Pilih jabatan untuk mewawancarai semua karyawannya');
  if (!DURATIONS.includes(b.durationMinutes)) throw badRequest('Durasi wawancara harus 15 atau 30 menit');
  let employeeIds = null;
  if (b.employeeIds !== undefined && b.employeeIds !== null) {
    if (!Array.isArray(b.employeeIds) || !b.employeeIds.length || b.employeeIds.length > MAX_EMPLOYEES || !b.employeeIds.every(isUuid)) {
      throw badRequest(`Daftar karyawan harus berisi 1-${MAX_EMPLOYEES} ID yang valid`);
    }
    employeeIds = [...new Set(b.employeeIds)];
  }
  return {
    projectId: b.projectId, gap, mode: b.mode, jobRoleId: b.mode === 'all_job_role' ? b.jobRoleId : null,
    employeeIds, dueAt: parseDueDate(b.dueDate, now), durationMinutes: b.durationMinutes,
  };
}

/**
 * Siapa yang memenuhi mode peserta (BT-29). members: karyawan dalam cakupan penugas.
 * Return [{ userId, jobRoleId, triggerRecordIds }] mengikuti urutan members. Penugas dan Admin ETA tidak ikut (R11).
 */
function eligibleEmployees({ mode, gap, members, records = [], latest = new Map(), competency = null, jobRoleId = null, selfId }) {
  const missed = new Map();
  if (gap.kind === 'okr') {
    const key = metricKey(gap.name);
    for (const r of records) {
      if (r.isMet !== false || r.metricType !== gap.metricType || r.period !== gap.period || metricKey(r.name) !== key) continue;
      missed.set(r.userId, [...(missed.get(r.userId) || []), r.id]);
    }
  }
  const affected = (m) => {
    if (gap.kind === 'okr') return missed.has(m.id);
    const s = latest.get(`${m.id}|${gap.competencyId}`);
    return s !== undefined && competency && s < Number(competency.requiredScore);
  };
  return members
    .filter((m) => m.id !== selfId && m.role !== 'eta_admin')
    .filter((m) => (mode === 'all_job_role' ? m.jobRoleId === jobRoleId : affected(m)))
    .map((m) => ({ userId: m.id, jobRoleId: m.jobRoleId ?? null, triggerRecordIds: missed.get(m.id) || [] }));
}

/**
 * Satu sesi TNA terbuka per orang per proyek. existing: sesi 'scheduled'/'in_progress' proyek itu.
 * Sesi terjadwal yang undangannya sudah lewat digantikan (ditandai abandoned oleh store).
 */
function planAssignments({ eligible, existing, now = new Date() }) {
  const byUser = new Map();
  for (const s of existing) byUser.set(s.intervieweeId, [...(byUser.get(s.intervieweeId) || []), s]);
  const assign = []; const skipped = [];
  for (const e of eligible) {
    const mine = byUser.get(e.userId) || [];
    if (mine.some((s) => s.status === 'in_progress')) { skipped.push({ employeeId: e.userId, reason: 'in_progress' }); continue; }
    if (mine.some((s) => isOpen(s, now))) { skipped.push({ employeeId: e.userId, reason: 'open_session' }); continue; }
    assign.push({ ...e, replaceSessionIds: mine.filter((s) => s.status === 'scheduled').map((s) => s.id) });
  }
  return { assign, skipped };
}

module.exports = {
  DURATIONS, MODES, DUE_MAX_DAYS, MAX_EMPLOYEES, isUuid, parseDueDate, validateAssignment, eligibleEmployees, planAssignments,
};
