'use strict';
// Sintesis wawancara Core Competencies (spek B10 bagian 11.2 D-6, D-7): dihitung aturan, bukan AI.

const MIN_RESPONDENTS = 5;
const HOT_GAP = 20;
const STANCES = {
  leader: { full: 'agree', partial: 'partial', none: 'disagree' },
  employee: { full: 'aligned', partial: 'partial', none: 'not_aligned' },
};

function respondentBand(n) {
  if (n < 5) return '<5';
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

function score(responses, tier, requirementId) {
  const s = STANCES[tier];
  let n = 0; let points = 0;
  for (const r of responses) {
    if (r.tier !== tier) continue;
    const stance = r.stances && r.stances[requirementId];
    if (stance === s.full) points += 1;
    else if (stance === s.partial) points += 0.5;
    else if (stance !== s.none) continue;
    n += 1;
  }
  return { n, value: n === 0 ? null : Math.round((100 * points) / n) };
}

/**
 * requirements: [{ id }] (tervalidasi, sumber aktif).
 * responses: [{ assigneeId, tier, completedAt, stances: { [requirementId]: stance } }] (penugasan completed).
 */
function synthesize(requirements, responses) {
  const latest = latestResponses(responses);
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

module.exports = { MIN_RESPONDENTS, HOT_GAP, STANCES, respondentBand, synthesize };
