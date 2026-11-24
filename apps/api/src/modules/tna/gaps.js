'use strict';
// B5 Training Needs: papan gap (kompetensi vs Job Competency Model, dan target OKR/KPI/SLA yang meleset).
// Fungsi murni tanpa DB; aturan R1-R9 di docs/designs/b5-training-needs.md.
const { metricKey } = require('./performance');

const SCORE_MAX = 4;
const { REVIEWED } = require('./review-status');
const HR_ROLES = ['hr_admin', 'eta_admin'];
const NUMERIC_TYPES = ['angka', 'persen'];
// Teks tetap dari mockup Pak Eji (layar detail gap)
const HYPOTHESES = Object.freeze([
  'Pengetahuan atau keterampilan belum cukup (kandidat pelatihan).',
  'Panduan, template, atau alat belum memadai (kandidat perbaikan).',
  'Beban kerja atau proses menghambat penerapan (kandidat perbaikan).',
]);

const round2 = (n) => Math.round(n * 100) / 100;
const avg = (list) => list.reduce((a, b) => a + b, 0) / list.length;
const uniform = (list) => (list.length && list.every((v) => v === list[0]) ? list[0] : null);

/** R3: skor 0-4 menjadi persen untuk tampilan mockup. Satu-satunya tempat konversi skala. */
const toPct = (score) => (score === null || score === undefined ? null : Math.round((Number(score) / SCORE_MAX) * 100));

/** Skor terbaru per orang per kompetensi. Kunci `${userId}|${competencyId}`. */
function latestScores(assessments) {
  const best = new Map();
  for (const a of assessments) {
    const key = `${a.userId}|${a.competencyId}`;
    const at = new Date(a.assessedAt || a.createdAt).getTime();
    const cur = best.get(key);
    if (!cur || at >= cur.at) best.set(key, { at, score: Number(a.score) });
  }
  return new Map([...best].map(([k, v]) => [k, v.score]));
}

/** R4: urut gap menurun; kontribusi kumulatif (0-1) hanya untuk baris gap (> 0). */
function withPareto(rows) {
  const sorted = [...rows].sort((a, b) => b.gap - a.gap || String(a.name || '').localeCompare(String(b.name || ''), 'id'));
  const total = sorted.reduce((sum, r) => sum + r.gap, 0);
  let run = 0;
  return sorted.map((r) => {
    if (!(r.gap > 0)) return { ...r, cumulativeShare: null };
    run += r.gap;
    return { ...r, cumulativeShare: total > 0 ? round2(run / total) : 0 };
  });
}

/**
 * R2/R2b. members: [{ id, competencies: [{ id, name, requiredScore, approvedAt }] }] (kompetensi posisi orang itu).
 * Hanya kompetensi yang sudah disahkan HR yang menjadi target.
 */
function competencyGaps({ members, assessments }) {
  const latest = latestScores(assessments);
  const byComp = new Map();
  const unapproved = new Set();
  for (const m of members) {
    for (const c of m.competencies || []) {
      if (!c.approvedAt) { unapproved.add(c.id); continue; }
      if (!byComp.has(c.id)) byComp.set(c.id, { comp: c, scores: [], peopleTotal: 0, peopleWithGap: 0 });
      const row = byComp.get(c.id);
      row.peopleTotal += 1;
      const s = latest.get(`${m.id}|${c.id}`);
      if (s === undefined) continue;
      row.scores.push(s);
      if (s < Number(c.requiredScore)) row.peopleWithGap += 1;
    }
  }
  const rows = [];
  for (const { comp, scores, peopleTotal, peopleWithGap } of byComp.values()) {
    if (!scores.length) continue;
    const target = Number(comp.requiredScore);
    const actual = round2(avg(scores));
    const targetPct = toPct(target); const actualPct = toPct(actual);
    rows.push({
      key: `c:${comp.id}`, kind: 'competency', competencyId: comp.id, code: comp.code || null, name: comp.name,
      target, actual, gap: round2(Math.max(0, target - actual)),
      targetPct, actualPct, gapPct: Math.max(0, targetPct - actualPct),
      assessed: scores.length, peopleWithGap, peopleTotal,
    });
  }
  return { rows: withPareto(rows), unapprovedCompetencies: unapproved.size };
}

const okrKey = (metricType, name, period) => `o:${metricType}|${metricKey(name)}|${period}`;

/** R5. records: baris kinerja dalam cakupan untuk satu periode (atau beberapa; dikelompokkan per periode). */
function okrGaps(records) {
  const groups = new Map();
  for (const r of records) {
    if (!r.period) continue;
    const key = okrKey(r.metricType, r.name, r.period);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const rows = [];
  for (const [key, list] of groups) {
    const missed = list.filter((r) => r.isMet === false);
    if (!missed.length) continue;
    const targets = list.map((r) => r.target);
    const target = uniform(targets);
    const targetVaries = target === null && targets.some((t) => t !== null && t !== undefined);
    const valueType = uniform(list.map((r) => r.valueType || 'angka'));
    const actuals = list.map((r) => r.actual).filter((a) => a !== null && a !== undefined);
    const numeric = NUMERIC_TYPES.includes(valueType) && target !== null && actuals.length === list.length;
    const actual = numeric ? round2(avg(actuals.map(Number))) : null;
    rows.push({
      key, kind: 'okr', metricType: list[0].metricType, name: String(list[0].name).trim().replace(/\s+/g, ' '), period: list[0].period,
      target: target === null ? null : Number(target), actual, diff: actual === null ? null : round2(actual - Number(target)),
      targetVaries, direction: uniform(list.map((r) => r.direction || 'higher')), tolerance: uniform(list.map((r) => Number(r.tolerance) || 0)),
      unit: uniform(list.map((r) => r.unit || null)), valueType,
      peopleMissed: new Set(missed.map((r) => r.userId)).size, peopleTotal: new Set(list.map((r) => r.userId)).size,
    });
  }
  return rows.sort((a, b) => b.peopleMissed - a.peopleMissed || a.name.localeCompare(b.name, 'id'));
}

/** Kunci gap dari parameter permintaan atau kolom fokus. */
function gapKeyOf(gap) {
  if (gap.kind === 'competency') return `c:${gap.competencyId}`;
  return okrKey(gap.metricType, gap.name, gap.period);
}

const isOpen = (s, now) => s.status === 'in_progress'
  || (s.status === 'scheduled' && (!s.inviteExpiresAt || new Date(s.inviteExpiresAt).getTime() > now.getTime()));

function sessionGapKeys(s, recordsById) {
  if (s.focusKind === 'competency') return s.focusCompetencyId ? [`c:${s.focusCompetencyId}`] : [];
  if (s.focusKind === 'okr') return [`o:${s.focusMetricType}|${s.focusMetricKey}|${s.focusPeriod}`];
  const keys = new Set();
  for (const id of s.triggerRecordIds || []) {
    const r = recordsById.get(id);
    if (r && r.period) keys.add(okrKey(r.metricType, r.name, r.period));
  }
  return [...keys];
}

/**
 * R8. sessions: sesi TNA dalam cakupan, terbaru lebih dulu. Return Map kunci gap ->
 * { interviewedCount, assignedCount, byUser: Map(userId -> sesi terakhir yang bukan dibatalkan) }.
 */
function linkSessions({ sessions, recordsById = new Map(), now = new Date() }) {
  const out = new Map();
  for (const s of sessions) {
    if (s.status === 'abandoned') continue;
    for (const key of sessionGapKeys(s, recordsById)) {
      if (!out.has(key)) out.set(key, { interviewed: new Set(), assigned: new Set(), byUser: new Map() });
      const g = out.get(key);
      if (s.status === 'completed') g.interviewed.add(s.intervieweeId);
      else if (isOpen(s, now)) g.assigned.add(s.intervieweeId);
      if (!g.byUser.has(s.intervieweeId)) g.byUser.set(s.intervieweeId, {
        id: s.id, status: s.status, inviteExpiresAt: s.inviteExpiresAt || null,
        projectId: s.projectId || null, assignedBy: s.assignedBy || null, open: isOpen(s, now),
      });
    }
  }
  for (const g of out.values()) {
    g.interviewedCount = g.interviewed.size;
    g.assignedCount = g.assigned.size;
  }
  return out;
}

/** R6: temuan -> gap lewat kompetensi, baris kinerja, atau (bila tak tertaut) fokus sesinya. */
function findingsByGap({ findings, sessionsById = new Map() }) {
  const out = new Map();
  const push = (key, f) => { if (!out.has(key)) out.set(key, []); out.get(key).push(f); };
  for (const f of findings) {
    let linked = false;
    if (f.competencyId) { push(`c:${f.competencyId}`, f); linked = true; }
    if (f.metricName && f.metricPeriod) { push(okrKey(f.metricType, f.metricName, f.metricPeriod), f); linked = true; }
    if (linked || !f.sessionId) continue;
    const s = sessionsById.get(f.sessionId);
    if (s && s.focusKind) for (const key of sessionGapKeys(s, new Map())) push(key, f);
  }
  return out;
}

/**
 * Paritas B7 web: temuan satu gap menurut R6, untuk baris yang membawa kolom fokus sesinya sendiri
 * (`focusKind`, `focusCompetencyId`, `focusMetricType`, `focusMetricKey`, `focusPeriod`). Urutan masukan dipertahankan.
 */
/**
 * Kolom pencocokan temuan ke gap (aturan R6) yang dibawa baris temuan: nama field -> kolom SQL (alias `pr` baris
 * kinerja, `s` sesi). Satu sumber untuk SELECT di lna-stores dan daftar field internal yang dibuang sebelum respons.
 */
const GAP_MATCH_COLUMNS = Object.freeze({
  metricType: 'pr.metric_type', metricPeriod: 'pr.period', focusKind: 's.focus_kind', focusCompetencyId: 's.focus_competency_id',
  focusMetricType: 's.focus_metric_type', focusMetricKey: 's.focus_metric_key', focusPeriod: 's.focus_period',
});

function findingsInGap(findings, key) {
  const sessionsById = new Map(findings.filter((f) => f.sessionId && f.focusKind).map((f) => [f.sessionId, {
    focusKind: f.focusKind, focusCompetencyId: f.focusCompetencyId, focusMetricType: f.focusMetricType, focusMetricKey: f.focusMetricKey, focusPeriod: f.focusPeriod,
  }]));
  return findingsByGap({ findings, sessionsById }).get(key) || [];
}

/** R7: apa yang boleh dilihat pemanggil. nonTrainingUserIds null = semua karyawan. */
function visibility({ role, userId, hasGrant = false, flagNonTraining = false, directReportIds = [] }) {
  if (HR_ROLES.includes(role)) return { draft: true, nonTraining: flagNonTraining, nonTrainingUserIds: null };
  const granted = role === 'supervisor' && hasGrant && flagNonTraining;
  return { draft: false, nonTraining: granted, nonTrainingUserIds: new Set(directReportIds.filter((id) => id !== userId)) };
}

/** R6: tabel keputusan klasifikasi satu gap. */
function classify({ findings = [], vis, interviewed }) {
  let training = false; let nonTraining = false; let draft = false;
  for (const f of findings) {
    if (f.reviewStatus === 'draft') { if (vis.draft) draft = true; continue; }
    if (!REVIEWED.includes(f.reviewStatus)) continue;
    if (f.category === 'training') training = true;
    else if (f.category === 'non_training' && vis.nonTraining && (!vis.nonTrainingUserIds || vis.nonTrainingUserIds.has(f.userId))) nonTraining = true;
  }
  if (draft || (training && nonTraining)) return 'review';
  if (training) return 'training';
  if (nonTraining) return 'non_training';
  // R7: temuan apa pun (selain ditolak) berarti gap sudah diwawancarai, walau temuannya tersembunyi bagi pemanggil
  const hasFindings = findings.some((f) => f.reviewStatus !== 'rejected');
  return interviewed || hasFindings ? 'review' : 'pending';
}

/** Lengkapi baris dengan klasifikasi (R6) dan hitungan wawancara (R8). */
function decorate(rows, { findingsMap, links, vis }) {
  return rows.map((r) => {
    const link = links.get(r.key);
    const interviewedCount = link ? link.interviewedCount : 0;
    const interviewed = interviewedCount > 0;
    const classification = r.kind === 'competency' && !(r.gap > 0) ? 'ok' : classify({ findings: findingsMap.get(r.key), vis, interviewed });
    return { ...r, classification, interviewed, interviewedCount, assignedCount: link ? link.assignedCount : 0 };
  });
}

/** Kartu KPI dan batang klasifikasi tab Ringkasan. Baris "Dalam batas" tidak dihitung. */
function summarize({ competencyRows, okrRows }) {
  const cGaps = competencyRows.filter((r) => r.gap > 0);
  const all = [...cGaps, ...okrRows];
  const classification = { training: 0, non_training: 0, review: 0, pending: 0 };
  for (const r of all) if (classification[r.classification] !== undefined) classification[r.classification] += 1;
  const fourth = cGaps[Math.min(3, cGaps.length - 1)];
  return {
    kpis: {
      competencyGaps: cGaps.length, okrGaps: okrRows.length, totalGaps: all.length,
      interviewed: all.filter((r) => r.interviewed).length, top4Share: fourth ? fourth.cumulativeShare || 0 : 0,
    },
    classification,
  };
}

const fmt = (n) => String(round2(Number(n))).replace('.', ',');

/** R9: kalimat bukti dari data, tanpa nama orang. employees: [{ value }] (nilai individu atau null). */
function evidenceFor(row, employees = []) {
  if (row.kind === 'competency') {
    const scores = employees.map((e) => e.value).filter((v) => v !== null && v !== undefined);
    const out = [
      `${row.peopleWithGap} dari ${row.assessed} karyawan yang dinilai berada di bawah target.`,
      `Rata-rata skor ${fmt(row.actual)} dari target ${fmt(row.target)} (skala 0-${SCORE_MAX}).`,
    ];
    if (scores.length) out.push(`Skor terendah ${fmt(Math.min(...scores))}, tertinggi ${fmt(Math.max(...scores))}.`);
    const missing = row.peopleTotal - row.assessed;
    if (missing > 0) out.push(`${missing} karyawan belum dinilai untuk kompetensi ini.`);
    return out;
  }
  const unit = row.unit ? ` ${row.unit}` : '';
  const out = [`${row.peopleMissed} dari ${row.peopleTotal} karyawan tidak mencapai target pada periode ${row.period}.`];
  if (row.actual !== null && row.actual !== undefined) out.push(`Rata-rata realisasi ${fmt(row.actual)}${unit} dari target ${fmt(row.target)}${unit}.`);
  else if (row.targetVaries) out.push('Target berbeda antarkaryawan, jadi rata-rata tim tidak ditampilkan.');
  if (row.tolerance) out.push(`Toleransi ${fmt(row.tolerance)}${unit} sudah diperhitungkan.`);
  return out;
}

module.exports = { GAP_MATCH_COLUMNS,
  SCORE_MAX, HYPOTHESES, toPct, latestScores, withPareto, competencyGaps, okrGaps, gapKeyOf, linkSessions, findingsByGap, findingsInGap,
  visibility, classify, decorate, summarize, evidenceFor, isOpen,
};
