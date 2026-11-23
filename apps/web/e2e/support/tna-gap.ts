import { cocok, responsData as data, type Penangan, type ResponsApi, type Terkirim } from './api'
import { PERAN_API, type Peran } from './sesi'

// B5 Training Needs: mock papan gap, detail gap, dan penugasan wawancara, dipakai tna-gap.spec.ts dan
// alur/jalur-utama.spec.ts. Data karangan tangan mengikuti kontrak di docs/designs/b5-training-needs.md, bukan fixture tangkapan;
// alur yang sama terhadap API sungguhan: apps/api/tests/integration/alur-gap-wawancara.test.js.

/** Kompetensi Analisis insiden, satu-satunya baris gap kompetensi. */
export const ID_KOMPETENSI = '11111111-1111-4111-8111-111111111111'
/** Karyawan Dimas, bisa ditugaskan wawancara (Sari sudah punya sesi terbuka). */
export const ID_DIMAS = 'e1111111-1111-4111-8111-111111111111'
const ID_SARI = 'e2222222-2222-4222-8222-222222222222'
/** Proyek aktif Pilot L1. */
export const ID_PROYEK = 'p1111111-1111-4111-8111-111111111111'

const SUMMARY = {
  period: '2026-11', periods: ['2026-11', '2026-10'],
  kpis: { competencyGaps: 2, okrGaps: 1, totalGaps: 3, interviewed: 1, top4Share: 0.86 },
  classification: { training: 1, non_training: 0, review: 1, pending: 1 }, unapprovedCompetencies: 2,
}
export const COMP = {
  key: `c:${ID_KOMPETENSI}`, kind: 'competency', competencyId: ID_KOMPETENSI, code: 'ST-A2', name: 'Analisis insiden', target: 3, actual: 2.25, gap: 0.75,
  targetPct: 75, actualPct: 56, gapPct: 19, assessed: 4, peopleWithGap: 3, peopleTotal: 5, cumulativeShare: 0.41,
  classification: 'pending', interviewed: false, interviewedCount: 0, assignedCount: 1,
}
const OKR = {
  key: 'o:sla|waktu respons|2026-11', kind: 'okr', metricType: 'sla', name: 'Waktu respons', period: '2026-11', target: 15, actual: 22.5, diff: 7.5,
  targetVaries: false, direction: 'lower', tolerance: 0, unit: 'menit', valueType: 'angka', peopleMissed: 2, peopleTotal: 4,
  classification: 'review', interviewed: true, interviewedCount: 1, assignedCount: 0,
}
export const DETAIL = {
  ...COMP,
  evidence: ['3 dari 4 karyawan yang dinilai berada di bawah target.'],
  hypotheses: [{ text: 'Materi pelatihan belum mencakup langkah ini.', verified: false }],
  jobRoles: ['Service Delivery L1'],
  employees: [
    { id: ID_DIMAS, name: 'Dimas', jobRoleId: 'jr1', jobRoleName: 'Service Delivery L1', value: 2, target: 3, gap: 1, self: false, assignable: true, session: null },
    { id: ID_SARI, name: 'Sari', jobRoleId: 'jr1', jobRoleName: 'Service Delivery L1', value: 2, target: 3, gap: 1, self: false, assignable: true,
      session: { id: 's-open', status: 'scheduled', inviteExpiresAt: '2026-12-01T16:59:59.000Z', projectId: ID_PROYEK, assignedBy: 'u-hr', open: true } },
  ],
}

export interface OpsiPapanGap {
  peran: Peran
  /** Ganti respons POST /tna/assignments, mis. untuk galat. */
  assign?: ResponsApi
  /** Ganti respons POST /tna/assignments/:id/cancel. */
  cancel?: ResponsApi
  /** Jumlah temuan AI menunggu review di GET /tna/dashboard (bawaan tidak ada). */
  reviewPending?: number
}

/** Penangan papan gap B5 dan pengelolaan TNA lama di halaman yang sama. Permintaan tulis dicatat di `terkirim`. */
export function papanGapTna(o: OpsiPapanGap): { penangan: Penangan; terkirim: Terkirim[] } {
  const terkirim: Terkirim[] = []
  const penangan: Penangan = (req) => {
    if (cocok(req, 'GET /:sm/imports/templates') || cocok(req, 'GET /:sm/imports/batches')) return data([])
    // Pengelolaan TNA lama
    if (cocok(req, 'GET /tna/dashboard')) return data({ role: PERAN_API[o.peran], people: null, redTargets: 1, sessions: {}, trainingFindings: 0, planItems: {}, reviewPending: o.reviewPending })
    if (cocok(req, 'GET /tna/findings')) return data([{ id: 'f1', userId: 'd', userName: 'Dimas', title: 'Kesulitan analisis insiden', status: 'open', competencyName: null, metricName: null, target: null, actual: null }])
    if (cocok(req, 'GET /tna/pareto') || cocok(req, 'GET /tna/plan-items') || cocok(req, 'GET /tna/sessions')) return data([])
    if (cocok(req, 'GET /tna/job-roles')) return { json: { data: [{ id: 'jr1', name: 'Service Delivery L1' }], defaults: { scope: 'red_only', jobRoleId: null } } }
    if (cocok(req, 'GET /projects')) return data([{ id: ID_PROYEK, name: 'Pilot L1', status: 'active' }, { id: 'p-closed', name: 'Lama', status: 'closed' }])
    // Papan gap B5
    if (cocok(req, 'GET /tna/gaps/summary')) return data(SUMMARY)
    if (cocok(req, 'GET /tna/gaps/competencies')) return data({ rows: [COMP], unapprovedCompetencies: 2 })
    if (cocok(req, 'GET /tna/gaps/okr')) return data({ rows: [OKR], period: '2026-11', periods: SUMMARY.periods })
    if (cocok(req, 'GET /tna/gaps/detail')) return data(DETAIL)
    if (cocok(req, 'POST /tna/assignments')) {
      terkirim.push({ path: '/assignments', body: req.body })
      return o.assign ?? data({ assigned: [{ sessionId: 's-new', employeeId: ID_DIMAS, inviteExpiresAt: '2026-12-05T16:59:59.000Z', durationMinutes: 15, replaced: false }], skipped: [] }, 201)
    }
    if (cocok(req, 'POST /tna/assignments/:id/cancel')) {
      terkirim.push({ path: `/api${req.path}`, body: null })
      return o.cancel ?? data({ id: 's-open', status: 'abandoned' })
    }
    return undefined
  }
  return { penangan, terkirim }
}
