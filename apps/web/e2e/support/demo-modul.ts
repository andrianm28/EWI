import { cocok, responsData as data, type Penangan } from './api'
import { tanggalWib } from './tanggal'

// Demo langsung 25 Nov: penangan API layar modul untuk e2e/demo-alur.spec.ts. Data karangan tangan; bentuknya sama
// dengan mock di spec paket masing-masing (core-competencies, b4-dna, improvement-needs, li, ld, lim, b16-cp,
// admin-tenant, super-admin) dan kontrak di docs/designs/. Cukup untuk setiap layar mendarat dengan isi, bukan
// untuk menguji detail layar (itu tugas spec paketnya).

// ---- B10 Core Competencies ----
const baris = (id: string, name: string, target: number, actual: number | null, status = 'draft') => {
  const gap = actual === null ? null : Math.max(0, target - actual)
  return { id, name, definition: null, targetScore: target, actualScore: actual, actualSource: actual === null ? null : 'manual', gap, classification: gap === null ? 'belum_diukur' : gap <= 8 ? 'dalam_batas' : 'perlu_ditinjau', status }
}
const CC_VM = {
  kpis: { readiness: 79, biggestGap: { name: 'Arsitektur public cloud', gap: 17 }, belowTarget: { count: 1, measured: 2, total: 3 }, pendingValidation: 2 },
  groups: [
    { id: 's-1', kind: 'vision', title: 'Corporate Vision', text: 'Menjadi pemimpin layanan cloud.', sourceRef: 'contoh.test/about', readiness: 79,
      rows: [baris('r-1', 'Arsitektur public cloud', 80, 63), baris('r-2', 'Tata kelola layanan', 80, 75, 'validated'), baris('r-3', 'Otomasi', 75, null)] },
    { id: 's-2', kind: 'mission', title: 'Corporate Mission', text: 'Memberi manfaat lewat teknologi.', sourceRef: null, readiness: 75, rows: [baris('r-6', 'Orientasi pelanggan', 80, 75, 'validated')] },
  ],
}
const CC_VALUES = {
  kpis: { readiness: 82, biggestGap: { name: 'Serah terima rapi', gap: 20 }, belowTarget: { count: 1, measured: 2, total: 2 }, pendingValidation: 0, weakestSource: { title: 'Committed', readiness: 75 } },
  groups: [
    { id: 's-3', kind: 'value', title: 'Credible', text: 'Dapat dipercaya.', sourceRef: null, readiness: 90, rows: [baris('r-4', 'Menepati janji', 80, 72, 'validated')] },
    { id: 's-4', kind: 'value', title: 'Committed', text: 'Tuntas.', sourceRef: null, readiness: 75, rows: [baris('r-5', 'Serah terima rapi', 80, 60, 'validated')] },
  ],
}
const CC_CONFIG = {
  values: [{ name: 'Credible' }, { name: 'Committed' }], components: [{ name: 'Kuis', weight: 40 }, { name: 'Asesmen akhir', weight: 60 }],
  totalActivities: 9, passScore: 70, bands: [{ key: 'strong', label: 'Strong Culture Alignment', min: 85, description: 'Skor akhir 85 atau lebih' }, { key: 'baseline', label: 'Baseline Implementation', min: 70, description: null }],
}
const CC_PROGRAM = { key: 'dna-5c', name: "Elitery's DNA 5C", provider: 'Elite Academy', cutoffDate: '2026-10-09', config: CC_CONFIG, insight: 'Skor akhir tertahan kuis.', recommendations: [{ title: 'Selesaikan kegiatan', detail: 'Dampingi yang belum selesai.' }], participants: 135, manualReport: null }
const divisi = (name: string, participants: number, completed: number, passed: number) => ({ name, participants, completed, completedPct: Math.round((completed / participants) * 100), passed, passedPct: Math.round((passed / participants) * 100), avgFinal: 72.1, avgValueScore: 93.4 })
const CC_REPORT = {
  source: 'manual', program: { key: 'dna-5c', name: "Elitery's DNA 5C", provider: 'Elite Academy', cutoffDate: '2026-10-09' },
  kpis: { registered: 135, completed: 69, completedPct: 51, passed: 39, passedPct: 29, avgValueScore: 93.4 },
  statuses: [
    { key: 'strong', label: 'Strong Culture Alignment', description: 'Skor akhir 85 atau lebih', min: 85, count: 7, pct: 5 },
    { key: 'baseline', label: 'Baseline Implementation', description: null, min: 70, count: 32, pct: 24 },
    { key: 'not_passed', label: 'Belum lulus', description: null, min: null, count: 30, pct: 22 },
    { key: 'in_progress', label: 'Masih berjalan', description: null, min: null, count: 66, pct: 49 },
  ],
  values: [{ name: 'Credible', avgCompleted: 94.1, avgAll: 61.2 }, { name: 'Committed', avgCompleted: 92.7, avgAll: 60.3 }],
  components: [{ name: 'Kuis', weight: 40, done: 120, donePct: 89, avg: 58.2, contribution: 23.28 }, { name: 'Asesmen akhir', weight: 60, done: 69, donePct: 51, avg: 81.5, contribution: 48.9 }],
  total: { done: 69, donePct: 51, avgFinal: 72.1 },
  divisions: [divisi('IT Service Delivery', 80, 45, 25), divisi('Sales', 55, 24, 14)], allDivisions: divisi('Semua divisi', 135, 69, 39),
  insight: 'Skor akhir tertahan kuis.', recommendations: [{ title: 'Selesaikan kegiatan', detail: 'Dampingi yang belum selesai.' }],
}
const pimpinan = (userId: string, name: string, status: string, extra = {}) => ({ userId, name, division: 'IT Service Delivery', jobRoleName: 'Kepala Divisi', assignmentId: status === 'none' ? null : `a-${userId}`, status, dueDate: status === 'none' ? null : tanggalWib(6), teamTotal: 6, teamAssigned: 0, teamDone: 0, ...extra })
const CC_ASSIGN_HR = {
  role: 'hr', mine: { leader: null, employee: null },
  kpis: { leadersEligible: 3, leadersAssigned: 1, leadersCompleted: 1, employeesAssigned: 4, employeesCompleted: 3 },
  leaders: [pimpinan('u-l1', 'Dewi Atasan', 'completed', { teamAssigned: 4, teamDone: 3 }), pimpinan('u-l2', 'Budi Atasan', 'none'), pimpinan('u-l3', 'Citra Atasan', 'none')],
}

const CC_SINTESIS = {
  minRespondents: 5, employeeBatch: 5,
  kpis: { themes: 2, leadersCompleted: 2, employeesCompleted: '5–9' },
  themes: [
    { requirementId: 'r-1', name: 'Kolaborasi lintas tim', sourceKind: 'vision', sourceTitle: 'Corporate Vision', leaderAgree: 100, leaderRespondents: 1, employeeAligned: 80, employeeRespondents: '5–9', gap: 20, hot: true, actualScore: null, actualSource: null },
    { requirementId: 'r-2', name: 'Fokus pelanggan', sourceKind: 'vision', sourceTitle: 'Corporate Vision', leaderAgree: 100, leaderRespondents: 1, employeeAligned: null, employeeRespondents: '<5', gap: null, hot: false, actualScore: 70, actualSource: 'manual' },
  ],
}

/** B10 tampilan HR: tab Vision & Mission, Corporate Values (laporan program), dan Wawancara AI (penugasan dan sintesis). */
export const penanganCcHr: Penangan = (req) => {
  if (cocok(req, 'GET /cca/synthesis')) return data(CC_SINTESIS)
  if (cocok(req, 'GET /cca/overview')) return data(req.query.get('group') === 'values' ? CC_VALUES : CC_VM)
  if (cocok(req, 'GET /cca/programs')) return data([CC_PROGRAM])
  if (cocok(req, 'GET /cca/programs/dna-5c/report')) return data(CC_REPORT)
  if (cocok(req, 'GET /cca/assignments')) return data(CC_ASSIGN_HR)
  return undefined
}

// ---- B4 Developmental Needs ----
const kamus = { status: 'available', tool1: true, tool2: true, tool3: true, competencyCount: 2, approvedCount: 1, approved: false, assessedCompetencyCount: 2 }
const JABATAN = { id: 'jr1', name: 'Engineer Service Delivery' }
const DNA_OVERVIEW = {
  jobs: [{ id: 'jr1', name: JABATAN.name, division: 'IT', dictionary: 'available', competencyCount: 2 }, { id: 'jr2', name: 'Solution Architect', division: 'IT', dictionary: 'none', competencyCount: 0 }],
  selectedJobRoleId: 'jr1',
  kpi: { employees: 2, jobFunctions: 1, competencies: 2, jobsWithDictionary: 1, jobsTotal: 2 },
  stageDistribution: [
    { stage: 'basic', count: 1, percent: 50 }, { stage: 'intermediate', count: 0, percent: 0 }, { stage: 'advanced', count: 0, percent: 0 },
    { stage: 'done', count: 1, percent: 50 }, { stage: 'not_assessed', count: 0, percent: 0 },
  ],
  dictionary: kamus,
}
const DNA_COMPS = [
  { id: 'c1', code: 'ST-B1', name: 'Fondasi layanan', stream: 'Specific Technical', programTier: 'basic', requiredScore: 3, approvedAt: null, jobFunctionIds: ['jf1'] },
  { id: 'c2', code: 'TC-I1', name: 'Automation', stream: 'Technical', programTier: 'intermediate', requiredScore: 3, approvedAt: '2026-11-20T03:00:00Z', jobFunctionIds: [] },
]
const DNA_CURRICULUM = { jobRole: JABATAN, untiered: 0, tiers: [
  { tier: 'basic', count: 1, modules: [{ id: 'c1', code: 'ST-B1', name: 'Fondasi layanan', stream: 'Specific Technical' }] },
  { tier: 'intermediate', count: 1, modules: [{ id: 'c2', code: 'TC-I1', name: 'Automation', stream: 'Technical' }] },
  { tier: 'advanced', count: 0, modules: [] },
] }
const DNA_EMPLOYEES = [
  { id: 'e1', name: 'Ani', stage: 'basic', met: 0, assessed: 1, total: 2, focus: ['ST-B1'] },
  { id: 'e2', name: 'Budi', stage: 'done', met: 2, assessed: 2, total: 2, focus: [] },
]
function rencanaPegawai(id: string, name: string) {
  return {
    person: { id, name, jobRoleId: 'jr1', jobRoleName: JABATAN.name }, stage: 'basic', met: 0, assessed: 1, total: 2, untiered: 0, focus: ['ST-B1'],
    advice: 'Fokus pada modul Basic yang belum tercapai: ST-B1.',
    tiers: [
      { tier: 'basic', modules: [{ competencyId: 'c1', code: 'ST-B1', name: 'Fondasi layanan', stream: null, score: 1, target: 3, status: 'develop', mastery: 'not_yet' }] },
      { tier: 'intermediate', modules: [{ competencyId: 'c2', code: 'TC-I1', name: 'Automation', stream: null, score: null, target: 3, status: 'not_assessed', mastery: null }] },
      { tier: 'advanced', modules: [] },
    ],
  }
}

/** B4: ringkasan, kamus per jabatan, kurikulum, dan rencana per pegawai. */
export const penanganDnaDemo: Penangan = (req) => {
  if (cocok(req, 'GET /dna/development/overview')) return data(DNA_OVERVIEW)
  if (cocok(req, 'GET /dna/job-roles/:id/dictionary')) return data({ jobRole: JABATAN, jobFunctions: [{ id: 'jf1', order: 1, name: 'Penanganan insiden', competencyCount: 1 }], competencies: DNA_COMPS, dictionary: kamus })
  if (cocok(req, 'GET /dna/job-roles/:id/curriculum')) return data(DNA_CURRICULUM)
  if (cocok(req, 'GET /dna/development/employees')) return data(DNA_EMPLOYEES)
  const p = cocok(req, 'GET /dna/employees/:id/development-plan')
  if (p) return data(rencanaPegawai(p.id, DNA_EMPLOYEES.find((e) => e.id === p.id)?.name ?? 'Pegawai'))
  return undefined
}

// ---- B9 Improvement Needs ----
const INA_ACTIONS = [
  { id: 'a-1', title: 'Perbarui SOP eskalasi insiden', category: 'sop', subLabel: null, ownerUserId: 'u-2', ownerName: 'Karyawan A', ownerJobRoleName: 'Engineer L1', sourceRef: 'ST-A2', dueDate: '2026-12-01', status: 'new', overdue: false, lastVerification: null, findingId: null, involvesIndividual: false },
  { id: 'a-2', title: 'Forum umpan balik bulanan', category: 'budaya', subLabel: null, ownerUserId: null, ownerName: null, ownerJobRoleName: null, sourceRef: null, dueDate: null, status: 'in_progress', overdue: false, lastVerification: null, findingId: null, involvesIndividual: false },
]

/** B9 tampilan HR (level kelola). `GET /ina/access/me` dijawab penanganShellDemo kecuali di sini. */
export const penanganInaHr: Penangan = (req) => {
  if (cocok(req, 'GET /ina/access/me')) return data({ level: 'manage', pendingVerifications: 0 })
  if (cocok(req, 'GET /ina/actions')) return { json: { data: INA_ACTIONS, kpis: { total: 2, done: 0, process: 1, culture: 1, overdue: 0 }, meta: { level: 'manage', hiddenIndividual: 0 } } }
  const a = cocok(req, 'GET /ina/actions/:id')
  if (a) return data({ ...(INA_ACTIONS.find((x) => x.id === a.id) ?? INA_ACTIONS[0]!), detail: 'Eskalasi P1 belum punya langkah baku.' })
  if (cocok(req, 'GET /ina/owners')) return data([{ id: 'u-2', name: 'Karyawan A', jobRoleName: 'Engineer L1' }])
  if (cocok(req, 'GET /ina/access')) return data([])
  if (cocok(req, 'GET /ina/verifications')) return data([])
  return undefined
}

// ---- B13 Learning Intervention ----
const VENDOR = 'Mahaka Institute'
const jobLi = { id: 'jr-1', name: 'Engineer Service Delivery' }
const modul = (o: Record<string, unknown>) => ({
  level: 'advanced', stream: 'Specific Technical', catalogItemId: null, jobRoles: [jobLi], counts: { K: 1, S: 1, A: 1 },
  status: { key: 'none', via: null }, priority: null, recommendation: 'vendor', request: null, draft: null, ...o,
})
const RCA = modul({ id: 'm-1', code: 'ST-A2', name: 'Root Cause Analysis', recommendation: 'dev', priority: { rank: 1, share: 0.6, cumulativeShare: 0.6, label: 'Root Cause Analysis' } })
const ITIL = modul({ id: 'm-2', code: 'TC-B1', name: 'ITIL Foundation', level: 'basic', stream: 'Technical Competencies' })
const DRAF = {
  id: 'd-1', moduleId: 'm-1', moduleCode: 'ST-A2', moduleName: 'Root Cause Analysis', moduleLevel: 'advanced', moduleStream: 'Specific Technical',
  moduleObjective: 'Mampu menemukan akar masalah', status: 'draft', generatedBy: 'template', reviewerName: null, reviewNote: null,
  objectives: [{ kind: 'K', item: 'Konsep 5 Whys', text: 'Menjelaskan konsep 5 Whys pada tes tertulis (skor ≥ 80%)', assessment: 'Tes tertulis' }],
  sessions: [{ order: 1, title: 'Pembuka', detail: 'Relevansi', covers: 'Semua tujuan' }],
  assessments: [{ kind: 'K', title: 'Knowledge', detail: 'Tes tertulis, lulus bila skor ≥ 80%.', objectives: 1 }],
}

/** B13: Library, detail modul, Program & Course, Permintaan & pengembangan, dan draf modul (berstate). */
export function penanganLiDemo(): Penangan {
  let draf = { ...DRAF }
  return (req) => {
    if (cocok(req, 'GET /li/modules')) {
      return { json: {
        data: req.query.get('priority') === 'pareto' ? [RCA] : [RCA, ITIL], vendorName: VENDOR,
        kpis: { modules: 2, knowledge: 2, skill: 2, attitude: 2, streams: 2 },
        pareto: { available: true, count: 1, codes: ['ST-A2'], cumulativeShare: 0.6, withoutGapData: 1, unlinkedFindings: 0 },
        filters: { jobRoles: [jobLi], streams: ['Specific Technical', 'Technical Competencies'] },
      } }
    }
    const m = cocok(req, 'GET /li/modules/:id')
    if (m) return data({ ...(m.id === 'm-2' ? ITIL : RCA), objective: 'Tujuan modul', vendorName: VENDOR, items: [{ kind: 'K', text: 'Konsep dasar' }, { kind: 'S', text: 'Praktik' }, { kind: 'A', text: 'Teliti' }] })
    if (cocok(req, 'GET /li/catalog')) return data([])
    if (cocok(req, 'GET /li/programs')) {
      return { json: { vendorName: VENDOR, data: {
        jobRoles: [{ ...jobLi, hasDictionary: true }, { id: 'jr-2', name: 'Project Manager', hasDictionary: false }], jobRoleId: req.query.get('jobRoleId') ?? 'jr-1',
        level: req.query.get('level') ?? 'basic', levels: [{ level: 'basic', count: 1 }, { level: 'intermediate', count: 0 }, { level: 'advanced', count: 1 }],
        kpis: { courses: 2, available: 0, inProgress: 0, noSource: 2 },
        groups: [{ stream: 'Specific Technical', modules: [RCA] }, { stream: 'Technical Competencies', modules: [ITIL] }], pareto: { available: true, codes: ['ST-A2'] },
      } } }
    }
    if (cocok(req, 'GET /li/requests')) {
      return { json: { vendorName: VENDOR, data: {
        vendor: [{ id: 'rq-1', moduleId: 'm-2', moduleCode: 'TC-B1', moduleName: 'ITIL Foundation', vendorName: VENDOR, status: 'requested', requestedAt: '2026-11-19' }],
        drafts: [{ id: 'd-1', moduleId: 'm-1', moduleCode: 'ST-A2', moduleName: 'Root Cause Analysis', status: draf.status, reviewerName: null, reviewNote: null }],
        candidates: [{ id: 'm-3', code: 'ST-B9', name: 'Alur Layanan SLA', priority: { rank: 2, share: 0.2, cumulativeShare: 0.8 } }],
      } } }
    }
    if (cocok(req, 'POST /li/modules/:id/draft')) return data(draf, 201)
    if (cocok(req, 'GET /li/drafts/d-1')) return data(draf)
    if (cocok(req, 'PUT /li/drafts/d-1')) { draf = { ...draf, ...(req.body as object) }; return data(draf) }
    if (cocok(req, 'POST /li/drafts/d-1/submit')) { draf = { ...draf, status: 'sme_review' }; return data(draf) }
    return undefined
  }
}

// ---- B14 Learning Delivery ----
const dasarLd = {
  vendorName: null, venue: null, sessionCount: 1, sessionsDone: 0, status: 'running', materialsReady: false, assessmentMode: 'none', assessmentRef: null,
  assessmentStatus: 'none', moduleCode: null, moduleName: null, programTier: null, participants: 0, completed: 0, present: 0, attendanceRecorded: 0, scored: 0,
  checks: [{ key: 'schedule', ok: true }, { key: 'materials', ok: true }, { key: 'participants', ok: true }, { key: 'assessment', ok: true }],
}
const LD_ONLINE = { ...dasarLd, id: 't-1', title: 'ITIL Foundation', mode: 'online', source: 'lms', startsOn: '2026-11-01', endsOn: '2026-11-10', participants: 4, completed: 1, group: 'running', progressPct: 40, health: 'late' }
const LD_OFFLINE = {
  ...dasarLd, id: 't-2', title: 'Workshop RCA', mode: 'offline', source: 'manual', vendorName: VENDOR, startsOn: '2026-11-25', endsOn: '2026-11-25',
  status: 'scheduled', group: 'upcoming', progressPct: 0, health: 'watch', participants: 2,
  checks: [{ key: 'schedule', ok: false }, { key: 'materials', ok: false }, { key: 'participants', ok: true }, { key: 'assessment', ok: false }],
}
const LD_DETAIL = {
  ...LD_OFFLINE, documents: [], storageReady: true,
  participantList: [{ userId: 'u-d', name: 'Dimas', email: 'dimas@contoh.test', jobRoleName: 'Engineer', status: 'enrolled', attendance: null, score: null, scoreSource: null }],
  readiness: [{ key: 'schedule', state: 'missing' }, { key: 'materials', state: 'missing' }, { key: 'participants', state: 'complete' }, { key: 'attendance', state: 'missing' },
    { key: 'assessment', state: 'missing' }, { key: 'documentation', state: 'missing', optional: true }],
}

/** B14: ringkasan, daftar pelatihan, dan detail pelatihan offline. */
export const penanganLdDemo: Penangan = (req) => {
  if (cocok(req, 'GET /ld/dashboard')) {
    return data({
      kpis: { running: 1, online: 1, offline: 0, upcoming: 1, activeLearners: 3, avgProgress: 40, attention: 2 }, generatedBy: 'rules',
      insights: [{ key: 'late:t-1', trainingId: 't-1', title: 'ITIL Foundation tertinggal dari jadwal', detail: '3 dari 4 peserta belum selesai.', source: 'LMS klien' }],
      actions: [{ key: 'remind:t-1', trainingId: 't-1', kind: 'remind', title: 'Kirim pengingat ke 3 peserta ITIL Foundation', detail: 'Batas sudah lewat' }],
    })
  }
  if (cocok(req, 'GET /ld/trainings')) return data([LD_ONLINE, LD_OFFLINE])
  if (cocok(req, 'GET /ld/options')) return data({ vendorName: VENDOR, storageReady: true, webhookSync: false, jobRoles: [{ id: 'jr-1', name: 'Engineer', people: 2 }], employees: [] })
  if (cocok(req, 'GET /ld/trainings/t-2')) return data(LD_DETAIL)
  return undefined
}

// ---- B15 Learning Impact Measurement (layar saja; wawancara ulang milik thread B15) ----
const LIM_PLAN = {
  id: 'p-1', title: 'Pilot L1', jobRoleId: 'jr-1', jobRoleName: 'Engineer Service Delivery', periodFrom: '2026-09-01', periodUntil: null,
  businessProblem: 'Penyelesaian insiden P1 lambat', desiredBehavior: 'Engineer menganalisis akar masalah', priorityCapabilities: 'RCA',
  evidencePlan: 'Skor asesmen, wawancara ulang AI', existingMetrics: 'MTTR P1', baselineLabel: 'Sep 2026', afterLabel: 'Nov 2026',
  status: 'active', valueEstimate: null, factors: [], modules: [{ id: 'm-1', title: 'RCA', code: 'ST-A2' }],
}
const LIM_OVERVIEW = {
  plan: LIM_PLAN, participants: 6, generatedBy: 'rules',
  chain: [
    { level: 1, key: 'activity', label: 'Aktivitas', source: 'Learning Delivery', finding: '5 dari 6 keikutsertaan selesai (83%)', coverage: 'measured' },
    { level: 2, key: 'learning', label: 'Pembelajaran', source: 'Asesmen pre dan post', finding: 'Naik rata-rata 16 poin', coverage: 'measured' },
    { level: 3, key: 'capability', label: 'Kapabilitas', source: 'Wawancara ulang AI', finding: '1 dari 6 karyawan sudah diwawancara ulang', coverage: 'partial' },
    { level: 4, key: 'application', label: 'Penerapan', source: 'Review atasan', finding: '2 dari 6 karyawan punya skor kinerja', coverage: 'partial' },
    { level: 5, key: 'performance', label: 'Kinerja', source: 'Indikator kinerja tim', finding: 'MTTR P1 92 → 71 mnt', coverage: 'measured' },
    { level: 6, key: 'business', label: 'Hasil bisnis', source: 'Indikator bisnis tim', finding: 'Belum ada data', coverage: 'missing' },
  ],
  insight: { level: 3, text: 'Rantai paling lemah ada di tingkat 3.' },
  competencies: [{ competencyId: 'k1', name: 'RCA & Post-Incident Report', pre: 52, preN: 6, post: 71, postN: 6, postUnauditable: 0, postShared: false, reinterview: 92, reinterviewN: 1, performance: 88, performanceN: 1, verdict: 'terkonfirmasi' }],
  indicators: [{ id: 'i-1', name: 'MTTR insiden P1', level: 'performance', source: 'Sistem tiket', unit: 'mnt', direction: 'lower_better', baseline: 92, current: 71, target: 75, improved: true, targetMet: true, strength: 'strong', strengthSource: 'hr', position: 0 }],
  valueEstimate: null, factors: [],
}

/** B15: rencana Pilot L1 dengan ringkasan dan antrean. */
export const penanganLimDemo: Penangan = (req) => {
  if (cocok(req, 'GET /lim/plans')) return data([{ id: 'p-1', title: 'Pilot L1', jobRoleName: 'Engineer Service Delivery', moduleCount: 1, participantCount: 6 }])
  if (cocok(req, 'GET /lim/plans/p-1/overview')) return data(LIM_OVERVIEW)
  if (cocok(req, 'GET /lim/plans/p-1/queue')) return data([])
  if (cocok(req, 'GET /lim/options')) return data({ modules: [], jobRoles: [] })
  if (cocok(req, 'GET /lim/imports/templates') || cocok(req, 'GET /lim/imports/batches')) return data([])
  return undefined
}

// ---- B16 Career & Promotion ----
const program = (n: number) => ['basic', 'intermediate', 'advanced'].map((tier, i) => ({ tier, passed: i < n }))
const CP_MAP = {
  okrMin: 80, kpi: { employees: 2, divisions: 1, eligible: 1, awaitingDecision: 0, belowCurrent: 1 }, divisions: ['IT'],
  employees: [
    { id: 'e1', name: 'Ani', division: 'IT', jobRoleId: 'jr1', jobRoleName: 'Engineer', level: { id: 'l1', name: 'Junior' }, programs: program(2), okr: { achievement: 92.5, period: '2026-11', count: 2 }, status: 'eligible', nextLevel: { id: 'l2', name: 'Senior', requiredProgramTier: 'intermediate' }, decisionState: 'none' },
    { id: 'e2', name: 'Budi', division: 'IT', jobRoleId: 'jr1', jobRoleName: 'Engineer', level: { id: 'l1', name: 'Junior' }, programs: program(0), okr: null, status: 'below_current', nextLevel: { id: 'l2', name: 'Senior', requiredProgramTier: 'intermediate' }, decisionState: 'none' },
  ],
}

/** B16: peta promosi, jalur karier, dan daftar keputusan. */
export const penanganCpDemo: Penangan = (req) => {
  if (cocok(req, 'GET /dna/career/map')) return data(CP_MAP)
  if (cocok(req, 'GET /dna/career/paths')) return data({ jobRole: { id: 'jr1', name: 'Engineer' }, okrMin: 80, levels: [
    { id: 'l1', order: 0, name: 'Junior', requiredProgramTier: 'basic', moduleCount: 4, employees: 2, readyForNext: 1 },
    { id: 'l2', order: 1, name: 'Senior', requiredProgramTier: 'intermediate', moduleCount: 6, employees: 0, readyForNext: 0 },
  ] })
  if (cocok(req, 'GET /dna/career/decisions')) return data([])
  const ev = cocok(req, 'GET /dna/career/employees/:id/evidence')
  if (ev) {
    const p = CP_MAP.employees.find((e) => e.id === ev.id) ?? CP_MAP.employees[0]!
    return data({ person: { id: p.id, name: p.name, division: p.division, jobRoleName: p.jobRoleName, level: p.level }, status: p.status, nextLevel: p.nextLevel,
      programsPassed: p.programs.filter((x) => x.passed).map((x) => x.tier), okr: p.okr ? { ...p.okr, min: 80, met: p.okr.achievement >= 80 } : null, reinterview: null, supervisorRecommendation: null })
  }
  return undefined
}

// ---- B11 Admin Tenant ----
const ADMIN_USERS = [
  { id: 'u-admin', name: 'Admin Satu', email: 'admin@contoh.test', employeeId: null, role: 'tenant_admin', roleLabel: 'Admin Tenant', jobRoleId: null, jobRoleName: null, careerLevelId: null, supervisorId: null, status: 'active', lastLoginAt: '2026-11-19T01:00:00Z', pendingLogin: false },
  { id: 'u-2', name: 'Karyawan A', email: 'a@contoh.test', employeeId: 'E-1', role: 'learner', roleLabel: 'Karyawan', jobRoleId: 'j-1', jobRoleName: 'Engineer Service Delivery', careerLevelId: null, supervisorId: null, status: 'active', lastLoginAt: null, pendingLogin: true },
]
const ADMIN_JOBS = [
  { id: 'j-1', name: 'Engineer Service Delivery', division: 'Operasi', description: null, levels: [], competencyCount: 12, employeeCount: 6, dictionary: 'tersedia', sources: ['dacum'], lastImport: { filename: 'DACUM_SD_v2.1.xlsx', at: '2026-11-18T03:00:00Z' } },
  { id: 'j-2', name: 'Sales', division: null, description: null, levels: [], competencyCount: 0, employeeCount: 0, dictionary: 'belum_tersedia', sources: [], lastImport: null },
]
const ADMIN_SUMMARY = {
  competencyModel: [
    { jobRoleId: 'j-1', jobRoleName: 'Engineer Service Delivery', competencyCount: 12, status: 'terimpor', lastImport: { batchId: 'b-1', filename: 'DACUM_SD_v2.1.xlsx', source: 'dacum', uploadedAt: '2026-11-18T03:00:00Z', uploadedByName: 'Admin Satu', imported: 12 } },
    { jobRoleId: 'j-2', jobRoleName: 'Sales', competencyCount: 0, status: 'belum', lastImport: null },
  ],
  performance: [{ period: '2026-Q4', records: 3, missed: 2, lastImport: { batchId: 'b-2', filename: 'okr_q4_2026.csv', source: 'berkas', uploadedAt: '2026-11-18T04:00:00Z', uploadedByName: null } }],
  integrations: { elitementor: { status: 'terkonfigurasi', organizationMapped: true, sso: true, webhookSync: true }, lms: { targets: ['elitementor', 'moodle'], gapExport: true } },
}

/** B11: pengguna & peran, jabatan & kamus, impor & integrasi. */
export const penanganAdminDemo: Penangan = (req) => {
  if (cocok(req, 'GET /tenant-admin/users')) return { json: { data: ADMIN_USERS, meta: { total: ADMIN_USERS.length, sso: true } } }
  if (cocok(req, 'GET /tenant-admin/roles')) return data([{ key: 'learner', label: 'Karyawan' }, { key: 'supervisor', label: 'Atasan' }, { key: 'hr_admin', label: 'HR / L&D' }])
  if (cocok(req, 'GET /tenant-admin/job-roles')) return data(ADMIN_JOBS)
  if (cocok(req, 'GET /tenant-admin/job-roles/:id/competencies')) return data([{ id: 'c-1', name: 'Root Cause Analysis', kind: 'job', source: 'dacum' }])
  if (cocok(req, 'GET /tenant-admin/imports/summary')) return data(ADMIN_SUMMARY)
  if (cocok(req, 'GET /tenant-admin/imports/:sm/templates') || cocok(req, 'GET /tenant-admin/imports/:sm/batches')) return data([])
  return undefined
}

// ---- B12 Super Admin ----
const TENANTS = [
  { id: 't-1', slug: 'pt-elitery', name: 'PT Elitery', status: 'active', adminEmail: 'admin@elitery.test', users: 42, activeModules: 3, createdAt: '2026-11-10T02:00:00Z' },
  { id: 't-2', slug: 'pt-tunggu', name: 'PT Tunggu', status: 'pending_admin', adminEmail: 'admin@tunggu.test', users: 1, activeModules: 0, createdAt: '2026-11-18T02:00:00Z' },
]
const MODULES = [
  { key: 'cca', name: 'Core Competencies', available: true, earlyAccess: true, entitled: true, flagOn: true, killSwitch: false, effective: true },
  { key: 'tna', name: 'Training Needs', available: true, earlyAccess: false, entitled: true, flagOn: true, killSwitch: false, effective: true },
]
const SETTINGS = {
  editable: { sessionIdleMinutes: 30, aiHrAgreementTarget: 85 },
  display: { encryption: 'local', aiModel: { provider: 'bedrock', model: 'model-uji' }, ssoTenants: 0, idleEnforcedTenants: 1, idleEnforcement: 'per_tenant' },
  encryptionProvider: 'local',
}

/** B12: daftar tenant, modul per tenant, dan konfigurasi platform. */
export const penanganSuperDemo: Penangan = (req) => {
  if (cocok(req, 'GET /platform/tenants')) return data({ kpis: { tenants: TENANTS.length, activeTenants: 1, users: 43, modulesAvailable: 8 }, tenants: TENANTS })
  if (cocok(req, 'GET /platform/tenants/:id/modules')) return data(MODULES)
  if (cocok(req, 'GET /platform/settings')) return data(SETTINGS)
  if (cocok(req, 'GET /platform/ai-quality')) return data([{ tenantId: 't-1', name: 'PT Elitery', reviewed: 40, approved: 36, agreement: 90, meetsTarget: true, enoughData: true, daily: [] }])
  if (cocok(req, 'GET /platform/ai-cost')) return data([])
  if (cocok(req, 'GET /platform/log')) return data([])
  if (cocok(req, 'GET /platform/attempts')) return data([])
  return undefined
}

// ---- Atasan ----
/** B3 Dashboard tim (bentuk sama dengan TEAM_DATA di dashboard.spec.ts). */
export const DASHBOARD_TIM = {
  scope: 'team',
  people: 5,
  kpis: { employeesAnalyzed: 3, competencyGaps: 2, okrGaps: 1, aiHrAgreement: null, analysisDays: null },
  modules: [
    { no: 1, key: 'lna', active: true, parts: [{ key: 'cca', active: true }, { key: 'dna', active: true }, { key: 'tna', active: true }, { key: 'ina', active: true }] },
    { no: 4, key: 'lim', active: true },
    { no: 5, key: 'cp', active: true },
  ],
  pareto: { rows: [{ key: 'c1', competencyId: null, label: 'Root Cause Analysis', people: 2, score: 3, share: 1, cumulativeShare: 1, hot: true }], total: 1, hotCount: 1 },
  actions: [{ key: 'interviews_open', count: 1 }],
}
const penugasanCc = (tier: string, status: string) => ({ id: `as-${tier}`, tier, status, dueDate: tanggalWib(6), durationMinutes: 10, completedAt: status === 'completed' ? '2026-11-20T03:00:00Z' : null })

/** Atasan: Dashboard tim, Wawancara AI (status tim), dan Improvement Needs level baca. */
export const penanganAtasanDemo: Penangan = (req) => {
  if (cocok(req, 'GET /dashboard')) return data(DASHBOARD_TIM)
  if (cocok(req, 'GET /cca/assignments')) {
    return data({ role: 'leader', mine: { leader: penugasanCc('leader', 'completed'), employee: null }, canAssign: true,
      team: [{ userId: 'u-a', name: 'Karyawan A', jobRoleName: 'Engineer', status: 'completed' }, { userId: 'u-b', name: 'Karyawan B', jobRoleName: 'Engineer', status: 'none' }] })
  }
  if (cocok(req, 'GET /ina/access/me')) return data({ level: 'read', pendingVerifications: 0 })
  if (cocok(req, 'GET /ina/actions')) return { json: { data: INA_ACTIONS, kpis: { total: 2, done: 0, process: 1, culture: 1, overdue: 0 }, meta: { level: 'read', hiddenIndividual: 0 } } }
  return undefined
}

// ---- Karyawan ----
const KARTU_RENCANA = [
  { id: 'p1', title: 'Alur tiket layanan', description: 'Alur tiket dari masuk sampai ditutup.', level: 'Basic', mode: null, code: 'ST-B4', status: 'in_progress', courseStatus: null, courseScore: null, reason: 'Belum paham eskalasi', needsModule: false, where: { target: 'elitementor', label: 'EliteMentor' }, launchUrl: 'https://elitementor.contoh.test/c/st-b4' },
  { id: 'p4', title: 'Analisis insiden', description: null, level: 'Intermediate', mode: null, code: 'ST-A2', status: 'new', courseStatus: null, courseScore: null, reason: 'Analisis insiden', needsModule: false, where: { target: 'elitementor', label: 'EliteMentor' }, launchUrl: 'https://elitementor.contoh.test/c/st-a2' },
]

/** Karyawan: Wawancara visi & nilai (penugasan sendiri) dan Rencana belajar. Hasil saya dan wawancara akar masalah dari support/. */
export const penanganKaryawanDemo: Penangan = (req) => {
  if (cocok(req, 'GET /cca/assignments')) return data({ role: 'employee', mine: { leader: null, employee: penugasanCc('employee', 'assigned') } })
  if (cocok(req, 'GET /my/learning-plan')) return { json: { data: KARTU_RENCANA, delivery: { target: 'elitementor', label: 'EliteMentor' } } }
  return undefined
}
