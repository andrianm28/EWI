'use strict';
// Sintesis wawancara Core Competencies (spek B10 bagian 11.2 D-6, D-7): dihitung aturan, bukan AI.

const { CCA_STANCES } = require('../../ai/prompts');

const MIN_RESPONDENTS = 5;
const HOT_GAP = 20;
// keputusan user 23 Nov (D1): angka karyawan hanya bergeser setiap 5 penyelesaian baru dari orang berbeda, supaya
// selisih dua tampilan tidak menunjuk satu orang
const EMPLOYEE_BATCH = 5;

function respondentBand(n) {
  if (n < MIN_RESPONDENTS) return `<${MIN_RESPONDENTS}`;
  if (n < 10) return '5–9';
  if (n < 20) return '10–19';
  return '20+';
}

// putaran terbaru per orang per tier
function latestResponses(responses) {
  const latest = new Map();
  for (const r of responses) {
    const key = `${r.tier}:${r.assigneeId}`;
    const prev = latest.get(key);
    if (!prev || new Date(r.completedAt) > new Date(prev.completedAt)) latest.set(key, r);
  }
  return [...latest.values()];
}

// jawaban karyawan dihitung hanya setelah masuk batch (settled, ditandai saat konfirmasi oleh batchToSettle)
const counted = (r) => r.tier !== 'employee' || r.settled;

/**
 * Penyelesaian karyawan yang menunggu batch: [{ id, assigneeId }]. Batch dibentuk bila yang menunggu berasal dari
 * paling sedikit `batchSize` orang berbeda (putaran ulang satu orang tidak mengisi batch sendirian); semua ikut.
 */
function batchToSettle(pending, batchSize) {
  const people = new Set(pending.map((x) => x.assigneeId));
  return people.size >= batchSize ? pending.map((x) => x.id) : [];
}

function score(responses, tier, requirementId) {
  const [full, partial, none] = CCA_STANCES[tier];
  let n = 0; let points = 0;
  for (const r of responses) {
    if (r.tier !== tier) continue;
    const stance = r.stances && r.stances[requirementId];
    if (stance === full) points += 1;
    else if (stance === partial) points += 0.5;
    else if (stance !== none) continue;
    n += 1;
  }
  return { n, value: n === 0 ? null : Math.round((100 * points) / n) };
}

/**
 * requirements: [{ id }] (tervalidasi, sumber aktif).
 * responses: [{ assigneeId, tier, completedAt, settled, stances: { [requirementId]: stance } }] (penugasan completed).
 * Karyawan hanya dihitung bila `settled` (D-7, keputusan user 23 Nov).
 */
function synthesize(requirements, responses) {
  const latest = latestResponses(responses.filter(counted));
  return requirements.map((req) => {
    const leader = score(latest, 'leader', req.id);
    const employee = score(latest, 'employee', req.id);
    const employeeAligned = employee.n >= MIN_RESPONDENTS ? Math.round(employee.value / 5) * 5 : null;
    const gap = leader.value !== null && employeeAligned !== null ? leader.value - employeeAligned : null;
    return {
      requirementId: req.id,
      leaderAgree: leader.value,
      leaderRespondents: leader.n,
      employeeAligned,
      employeeRespondents: respondentBand(employee.n),
      gap,
      hot: gap !== null && gap >= HOT_GAP,
    };
  });
}

module.exports = { MIN_RESPONDENTS, HOT_GAP, EMPLOYEE_BATCH, respondentBand, synthesize, batchToSettle };
