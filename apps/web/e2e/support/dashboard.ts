import { cocok, responsData, type Penangan } from './api'

// B3 Dashboard utama (HR): respons GET /api/dashboard, dipakai dashboard.spec.ts dan alur/jalur-utama.spec.ts.
// Data karangan tangan mengikuti kontrak di docs/designs/b3-dashboard.md, bukan fixture tangkapan.

export const DASHBOARD_HR = {
  scope: 'all',
  people: 42,
  kpis: {
    employeesAnalyzed: 30,
    competencyGaps: 12,
    okrGaps: 7,
    aiHrAgreement: { percent: 88, approved: 22, reviewed: 25, targetPercent: 85 },
    analysisDays: { median: 9, sessions: 14, targetDays: 14 },
  },
  modules: [
    { no: 1, key: 'lna', active: true, parts: [{ key: 'cca', active: false }, { key: 'dna', active: true }, { key: 'tna', active: true }, { key: 'ina', active: false }] },
    { no: 2, key: 'li', active: false },
    { no: 3, key: 'ld', active: false },
    { no: 4, key: 'lim', active: false },
    { no: 5, key: 'cp', active: true },
  ],
  pareto: {
    rows: [
      { key: 'c1', competencyId: 'c1', label: 'Root Cause Analysis', people: 9, score: 12, share: 0.5, cumulativeShare: 0.5, hot: true },
      { key: 'c2', competencyId: 'c2', label: 'Ticket Life Cycle', people: 6, score: 7, share: 0.29, cumulativeShare: 0.79, hot: true },
      { key: 't:komunikasi pelanggan', competencyId: null, label: 'Komunikasi pelanggan', people: 3, score: 5, share: 0.21, cumulativeShare: 1, hot: false },
    ],
    total: 3,
    hotCount: 2,
  },
  actions: [
    { key: 'review_pending', count: 4 },
    { key: 'interviews_open', count: 2 },
    { key: 'plan_needs_module', count: 1 },
    { key: 'competencies_unapproved', count: 3 },
  ],
}

/** Penangan GET /api/dashboard dengan DASHBOARD_HR. */
export const penanganDashboardHr: Penangan = (req) => (cocok(req, 'GET /dashboard') ? responsData(DASHBOARD_HR) : undefined)
