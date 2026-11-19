// Klien API DNA + TNA (POC Desember). Bentuk data mengikuti apps/api/src/modules/{dna,tna}.
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

export interface Career {
  currentLevel: { id: string; name: string; requiredProgramTier: string | null } | null
  nextLevel: { id: string; name: string; requiredProgramTier: string | null } | null
  currentTierPassed: boolean | null
  nextTierPassed: boolean | null
  promotionCandidate?: boolean
  behindCurrentLevel: boolean
}
export interface GapSummary { total: number; assessed: number; met: number; gaps: number; readiness: number | null }
export interface EmployeeProfile {
  id: string; name: string | null; email: string; role: string; jobRoleName: string | null
  gap: GapSummary; career: Career
}
export interface GapItem { competencyId: string; name: string; kind: string; required: number; score: number | null; gap: number | null; status: 'met' | 'gap' | 'not_assessed'; source?: 'ai_interview' | 'manual_interview' | 'eta_review' | null }
export interface EmployeeDetail {
  person: { id: string; name: string | null; email: string }
  gap: { items: GapItem[]; summary: GapSummary }
  career: Career
  completions: { programTier: string; status: string; source: string }[]
}
export interface Session { id: string; projectId: string; intervieweeId: string; intervieweeName: string | null; status: string; triggerCount: number; inviteExpiresAt?: string; inviteExtendedCount?: number }
export interface Turn { speaker: 'ai' | 'human'; text: string; at: string }
export interface Finding { id: string; userId: string; userName: string | null; title: string; status: string; competencyName: string | null; metricName: string | null; target: number | null; actual: number | null }
export interface ParetoRow { key: string; label: string; people: number; avgMiss: number; score: number; share: number; cumulativeShare: number }
export interface PlanItem { id: string; userId: string; userName: string | null; findingTitle: string | null; origin: string; status: string; catalogItemTitle: string | null; needsModule?: boolean; catalogItemUrl?: string | null; courseStatus?: string | null; note: string | null }
export interface TnaDashboard { role: string; people: number | null; redTargets: number; sessions: Record<string, number>; trainingFindings: number; planItems: Record<string, number>; reviewPending?: number }
// PK-14: review hasil AI oleh HR (PD-14 ★A)
export type ReviewStatus = 'draft' | 'approved' | 'edited' | 'rejected'
export interface ReviewItem {
  id: string; projectId: string; sessionId: string | null; userId: string; userName: string | null
  category: 'training' | 'non_training'; title: string; detail: string | null
  competencyName: string | null; metricName: string | null; target: number | null; actual: number | null
  confidence: number | null; scoringAgreement: boolean | null; reviewStatus: ReviewStatus
  reviewedByName: string | null; reviewedAt: string | null; reviewNote: string | null
  originalTitle: string | null; originalDetail: string | null; originalCategory: string | null; createdAt: string
  // B7: tanda "Perlu ditinjau HR", saran klasifikasi, dan batas tinjauan (hari kerja)
  held: boolean; heldAt: string | null; heldByName: string | null; holdNote: string | null
  suggestedClassification: ReviewClassification; reviewDueAt: string | null; overdue: boolean; handedOffAt: string | null
}
export type ReviewCounts = Record<ReviewStatus, number> & { held: number; overdue: number }
// B7 (flag tna.review_workspace): tiga tombol mockup, solusi pelatihan, penugasan, serah ke Improvement Needs
export type ReviewClassification = 'training' | 'improvement' | 'needs_review'
export interface SolutionPlanItem {
  id: string; status: string; needsModule: boolean; catalogSource: string | null; catalogItemRef: string | null; catalogItemTitle: string | null
  assignmentStatus: 'sending' | 'sent' | 'failed' | null; assignmentTarget: 'elitementor' | null; assignedAt: string | null
}
export interface TrainingSolution {
  findingId: string; userId: string; userName: string | null; title: string; competencyName: string | null
  recommendation: { source: string; ref: string; title: string; url: string | null; programTier: string | null } | null
  planItem: SolutionPlanItem | null
}
export interface ImprovementSolution { findingId: string; userId: string; userName: string | null; title: string; handedOffAt: string | null }
export interface ReviewSolutions {
  training: TrainingSolution[]; improvement: ImprovementSolution[]
  delivery: { target: 'elitementor' | 'lms'; label: string; assignAvailable: boolean }; inaEnabled: boolean
}
export interface ReviewDecision { decision: 'approve' | 'edit' | 'reject'; title?: string; detail?: string; category?: 'training' | 'non_training'; note?: string }
// PM-6: ringkasan temuan di luar pelatihan untuk HR dan atasan yang diberi akses HR (tanpa detail, tanpa rencana aksi)
export interface NonTrainingGrant { supervisorId: string; supervisorName: string | null; supervisorEmail: string; grantedAt: string; grantedByName: string | null }
export interface NonTrainingFinding { id: string; userId: string; userName: string | null; title: string; metricName: string | null; linkedTrainingTitle: string | null; createdAt: string }
export interface Project { id: string; name: string; status: string }

function call<T>(path: string, init: RequestInit = {}) {
  return api<T>(path, init, useSessionStore().token)
}
const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const lna = {
  projects: () => call<{ data: Project[] }>('/projects'),
  dnaEmployees: () => call<{ data: EmployeeProfile[] }>('/dna/employees'),
  dnaEmployee: (id: string) => call<{ data: EmployeeDetail }>(`/dna/employees/${id}`),
  sessions: (key: 'dna' | 'tna') => call<{ data: Session[] }>(`/${key}/sessions`),
  // PO-6 A: turns hanya dikirim ke karyawan yang diwawancarai (transcriptVisible)
  session: (key: 'dna' | 'tna', id: string) => call<{ data: Session & { turns?: Turn[]; transcriptVisible?: boolean } }>(`/${key}/sessions/${id}`),
  // PM-9 A: persetujuan menyebut kode versi teks yang ditampilkan
  consent: (key: 'dna' | 'tna', id: string, consentVersion: string) =>
    post<{ data: { question: Turn | null; consentVersion: string } }>(`/${key}/sessions/${id}/consent`, { consentVersion }),
  answer: (key: 'dna' | 'tna', id: string, text: string) => post<{ data: { question: Turn | null; done: boolean } }>(`/${key}/sessions/${id}/turns`, { text }),
  complete: (key: 'dna' | 'tna', id: string) => post<{ data: { status: string; analysis?: { status: string } } }>(`/${key}/sessions/${id}/complete`, {}),
  reviewQueue: (status: 'draft' | 'reviewed' = 'draft') => call<{ data: ReviewItem[]; counts: ReviewCounts; targetDays: number }>(`/tna/review?status=${status}`),
  classifyFinding: (id: string, classification: ReviewClassification, note?: string) => post<{ data: ReviewItem }>(`/tna/findings/${id}/classify`, { classification, note }),
  reviewSolutions: () => call<{ data: ReviewSolutions }>('/tna/review/solutions'),
  assignPlanItem: (id: string) => post<{ data: PlanItem }>(`/tna/plan-items/${id}/assign`, {}),
  handoffImprovement: (findingIds: string[]) => post<{ data: { handedOff: string[]; already: string[]; skipped: string[] } }>('/tna/review/improvement-handoff', { findingIds }),
  reviewFinding: (id: string, body: ReviewDecision) => post<{ data: ReviewItem }>(`/tna/findings/${id}/review`, body),
  tnaDashboard: () => call<{ data: TnaDashboard }>('/tna/dashboard'),
  pareto: () => call<{ data: ParetoRow[] }>('/tna/pareto'),
  findings: () => call<{ data: Finding[] }>('/tna/findings'),
  planItems: () => call<{ data: PlanItem[] }>('/tna/plan-items'),
  planFinding: (id: string) => post<{ data: PlanItem }>(`/tna/findings/${id}/plan`, {}),
  requestTraining: (findingId: string, note: string) => post<{ data: PlanItem }>('/tna/training-requests', { findingId, note }),
  nonTrainingFindings: () => call<{ data: NonTrainingFinding[] }>('/tna/findings/non-training'),
  nonTrainingAccessMe: () => call<{ data: { granted: boolean } }>('/tna/non-training-access/me'),
  nonTrainingAccess: () => call<{ data: NonTrainingGrant[]; supervisors: { id: string; name: string | null; email: string }[] }>('/tna/non-training-access'),
  grantNonTraining: (supervisorId: string) => call<{ data: { granted: boolean } }>(`/tna/non-training-access/${supervisorId}`, { method: 'PUT' }),
  revokeNonTraining: (supervisorId: string) => call<{ data: { granted: boolean } }>(`/tna/non-training-access/${supervisorId}`, { method: 'DELETE' }),
  extendInvite: (id: string, days = 7) => post<{ data: { inviteExpiresAt: string } }>(`/tna/sessions/${id}/extend`, { days }),
  setPlanStatus: (id: string, status: string) => call<{ data: PlanItem }>(`/tna/plan-items/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  // Cakupan sesuai kebutuhan perusahaan: hanya target merah (default) atau semua karyawan di job role tertentu
  tnaJobRoles: () => call<{
    data: { id: string; name: string; division: string | null }[]
    defaults?: { scope: 'red_only' | 'all_members' | null; jobRoleId: string | null }
  }>('/tna/job-roles'),
  scheduleTna: (projectId: string, opts: { scope: 'red_only' | 'all_members'; period: string; jobRoleId?: string }) =>
    post<{ data: { scope: string; scheduled: number; skipped: number } }>(`/tna/projects/${projectId}/interviews`, {
      scope: opts.scope, ...(opts.period ? { period: opts.period } : {}), ...(opts.jobRoleId ? { jobRoleId: opts.jobRoleId } : {}),
    }),
}

export const ROLE_LABEL: Record<string, string> = {
  hr_admin: 'HR', supervisor: 'Atasan', learner: 'Karyawan', eta_admin: 'Admin ETA',
}
// K-3: satu set status rencana (sama dengan apps/api/src/modules/tna/plan-status.js)
export const COURSE_STATUS_LABEL: Record<string, string> = { passed: 'Lulus', in_progress: 'Berjalan', failed: 'Tidak lulus' }
export const PLAN_STATUS_LABEL: Record<string, string> = {
  requested: 'Diminta', new: 'Baru', in_progress: 'Berjalan', completed: 'Selesai', rejected: 'Ditolak',
}
export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: 'Menunggu review', approved: 'Disetujui', edited: 'Diubah lalu disetujui', rejected: 'Ditolak',
}
/** Label keyakinan dari dua kali penilaian AI (PD-13 ★A). */
export function confidenceLabel(c: number | null): { text: string; tone: 'ok' | 'warn' | 'low' } {
  if (c == null) return { text: 'Keyakinan tidak diketahui', tone: 'low' }
  if (c >= 0.75) return { text: `Keyakinan tinggi (${Math.round(c * 100)}%)`, tone: 'ok' }
  if (c >= 0.5) return { text: `Keyakinan sedang (${Math.round(c * 100)}%)`, tone: 'warn' }
  return { text: `Keyakinan rendah (${Math.round(c * 100)}%)`, tone: 'low' }
}
export const PLAN_NEXT: Record<string, string[]> = {
  requested: ['new', 'rejected'], new: ['in_progress', 'rejected'], in_progress: ['completed', 'rejected'], completed: [], rejected: [],
}
export const FLAG_TRAINING_REQUEST = 'tna.training_request'
export const FLAG_NON_TRAINING_HR = 'tna.non_training_hr'
export const formatWib = (iso: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
export const ASSESSMENT_SOURCE_LABEL: Record<string, string> = {
  manual_interview: 'wawancara manual', ai_interview: 'wawancara AI', eta_review: 'penilaian ulang ETA',
}
export const TIER_LABEL: Record<string, string> = { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' }
