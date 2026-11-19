'use strict';
// B8: fungsi murni untuk beranda karyawan (Hasil saya, Rencana belajar). Spek: docs/designs/b8-karyawan.md

const PARTIAL_RATIO = 0.75;
const PLAN_VISIBLE = Object.freeze(['new', 'in_progress', 'completed']);

/** Status kompetensi mengikuti mockup: Menguasai (met), Sebagian (partial), Belum (gap). */
function competencyStatus(score, required) {
  if (score == null) return 'not_assessed';
  if (!required || required <= 0) return 'met';
  const ratio = score / required;
  if (ratio >= 1) return 'met';
  return ratio >= PARTIAL_RATIO ? 'partial' : 'gap';
}

/** Ubah hasil computeGap menjadi kartu karyawan. Bukti asesmen tidak ikut. */
function competencyView(gap) {
  const items = gap.items.map((i) => ({
    competencyId: i.competencyId, code: null, name: i.name, required: i.required, score: i.score, status: competencyStatus(i.score, i.required),
  }));
  const n = (s) => items.filter((i) => i.status === s).length;
  return { items, summary: { total: items.length, assessed: items.length - n('not_assessed'), met: n('met'), partial: n('partial'), gaps: n('gap') } };
}

/** Tautan belajar hanya https (http diterima di luar produksi). Skema lain, mis. javascript:, ditolak. */
function safeLaunchUrl(url, { production = process.env.NODE_ENV === 'production' } = {}) {
  if (!url) return null;
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol === 'https:' || (u.protocol === 'http:' && !production)) return u.toString();
  return null;
}

/** Apa yang bisa dilakukan karyawan pada satu undangan wawancara. */
function inviteActions(session, now = new Date()) {
  const expired = Boolean(session.inviteExpiresAt) && new Date(session.inviteExpiresAt).getTime() <= now.getTime();
  return { expired, canStart: session.status === 'scheduled' && !expired, canContinue: session.status === 'in_progress' };
}

module.exports = { competencyStatus, competencyView, safeLaunchUrl, inviteActions, PLAN_VISIBLE, PARTIAL_RATIO };
