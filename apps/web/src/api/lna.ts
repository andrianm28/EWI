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
export interface PlanItem { id: string; userId: string; userName: string | null; findingTitle: string | null; origin: string; status: string; catalogItemTitle: string | null; needsModule?: boolean; note: string | null }
// PM-6: ringkasan temuan di luar pelatihan untuk HR dan atasan yang diberi akses HR (tanpa detail, tanpa rencana aksi)
export interface NonTrainingGrant { supervisorId: string; supervisorName: string | null; supervisorEmail: string; grantedAt: string; grantedByName: string | null }
export interface NonTrainingFinding { id: string; userId: string; userName: string | null; title: string; metricName: string | null; linkedTrainingTitle: string | null; createdAt: string }
export interface TnaDashboard { role: string; people: number | null; redTargets: number; sessions: Record<string, number>; trainingFindings: number; planItems: Record<string, number> }
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
  session: (key: 'dna' | 'tna', id: string) => call<{ data: Session & { turns: Turn[] } }>(`/${key}/sessions/${id}`),
  consent: (key: 'dna' | 'tna', id: string) => post<{ data: { question: Turn | null } }>(`/${key}/sessions/${id}/consent`, {}),
  answer: (key: 'dna' | 'tna', id: string, text: string) => post<{ data: { question: Turn | null; done: boolean } }>(`/${key}/sessions/${id}/turns`, { text }),
  complete: (key: 'dna' | 'tna', id: string) => post<{ data: { status: string } }>(`/${key}/sessions/${id}/complete`, {}),
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
export const PLAN_STATUS_LABEL: Record<string, string> = {
  requested: 'Diminta', new: 'Baru', in_progress: 'Berjalan', completed: 'Selesai', rejected: 'Ditolak',
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
