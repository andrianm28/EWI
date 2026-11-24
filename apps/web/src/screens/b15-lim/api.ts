// Klien API Learning Impact Measurement (B15). Bentuk data mengikuti apps/api/src/modules/lim dan spek 5.1.
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

export type Coverage = 'measured' | 'partial' | 'missing'
export type Verdict = 'terkonfirmasi' | 'retensi_turun' | 'belum_diukur'
export type Strength = 'strong' | 'moderate' | 'weak' | 'no_data'
export interface PlanSummary { id: string; title: string; jobRoleName: string | null; moduleCount: number; participantCount: number }
export interface Plan {
  id: string; title: string; jobRoleId: string | null; jobRoleName: string | null; periodFrom: string | null; periodUntil: string | null
  businessProblem: string; desiredBehavior: string; priorityCapabilities: string; evidencePlan: string; existingMetrics: string
  baselineLabel: string | null; afterLabel: string | null; status: 'active' | 'archived'
  modules: { id: string; title: string; code: string | null }[]
}
export interface ChainLevel { level: number; key: string; label: string; source: string; finding: string; coverage: Coverage }
export interface CompetencyRow {
  competencyId: string; name: string; pre: number | null; preN: number; post: number | null; postN: number; postUnauditable: number; postShared: boolean
  reinterview: number | null; reinterviewN: number; performance: number | null; performanceN: number; verdict: Verdict
}
export interface Indicator {
  id: string; name: string; level: 'performance' | 'business'; source: string | null; unit: string | null; direction: 'lower_better' | 'higher_better'
  baseline: number | null; current: number | null; target: number | null; improved: boolean | null; targetMet: boolean | null
  strength: Strength; strengthSource: 'hr' | 'rules'
}
export interface Overview {
  plan: Plan; participants: number; chain: ChainLevel[]; insight: { level: number | null; text: string }
  competencies: CompetencyRow[]; indicators: Indicator[]
  valueEstimate: { label: string; value: string; note?: string } | null; factors: string[]; generatedBy: string
}
export interface QueueRow {
  userId: string; name: string; competencies: { competencyId: string; name: string }[]; postCompletedOn: string | null
  dueFrom: string | null; dueUntil: string | null; status: 'none' | 'scheduled' | 'done'; window: 'early' | 'due' | 'late' | null
  scheduledOn: string | null; score: number | null
  /** Tahap 3: wawancara selesai terbaru (null bila belum ada); hasil bisa dibuka bila canView */
  reinterviewId: string | null; canView: boolean
}
// --- Tahap 3: wawancara ulang AI (spek bagian 12) ---
export type ReinterviewKind = 'scenario' | 'verify' | 'apply'
export interface MyReinterview { planId: string; planTitle: string; scheduledOn: string | null; status: 'open' | 'in_progress' | 'completed'; competencies: string[] }
export interface ReinterviewTurn { position: number; role: 'ai' | 'participant'; kind: ReinterviewKind; competency: string | null; text: string; options: string[] | null }
export interface ReinterviewSession {
  step: 'consent' | 'chat' | 'scoring' | 'done'; consentVersionRequired: string; competencies: string[]
  turns: ReinterviewTurn[]; answerCount: number; questionCount: number
}
export type Retention = 'retention_drop' | 'confirmed' | 'missing'
export type Application = 'application_gap' | 'applied' | 'missing'
export type Confidence = 'low' | 'medium' | 'high'
export interface ReinterviewResult {
  id: string; completedAt: string
  competencies: { competencyId: string; name: string; post: number | null; reinterview: number; performance: number | null; reason: string }[]
  benchmark: { competencyId: string; name: string; post: number | null; reinterview: number | null; performance: number | null; retention: Retention; application: Application }[]
  chain: ChainLevel[]; confidence: Confidence; recommendations: string[]; generatedBy: string
}
export interface ReinterviewResults { userId: string; indicators: Indicator[]; factors: string[]; reinterviews: ReinterviewResult[] }
export interface Options { modules: { id: string; code: string | null; name: string }[]; jobRoles: { id: string; name: string }[] }
export interface NewPlan {
  title: string; jobRoleId?: string | null; periodFrom?: string | null; periodUntil?: string | null; moduleIds: string[]
  businessProblem?: string; desiredBehavior?: string; priorityCapabilities?: string; evidencePlan?: string; existingMetrics?: string
}

const token = () => useSessionStore().token
const call = <T>(path: string, init: RequestInit = {}) => api<T>(`/lim${path}`, init, token())
const send = <T>(method: string, path: string, body?: unknown) => call<T>(path, { method, body: JSON.stringify(body ?? {}) })
type D<T> = { data: T }

export const lim = {
  plans: () => call<D<PlanSummary[]>>('/plans'),
  options: () => call<D<Options>>('/options'),
  create: (body: NewPlan) => send<D<Plan>>('POST', '/plans', body),
  overview: (id: string) => call<D<Overview>>(`/plans/${id}/overview`),
  preFromDna: (id: string) => send<D<{ filled: number }>>('POST', `/plans/${id}/pre-from-dna`),
  queue: (id: string) => call<D<QueueRow[]>>(`/plans/${id}/queue`),
  /** notify: kabari karyawan lewat email (aksi "Mulai sekarang"); hanya untuk penjadwalan, bukan pembatalan */
  schedule: (id: string, userIds: string[], date: string | null, notify = false) =>
    send<D<{ scheduled: string[]; skipped: { userId: string; reason: string }[]; rejected: { userId: string; message: string }[]; notified?: number }>>('POST', `/plans/${id}/queue/schedule`, notify ? { userIds, date, notify } : { userIds, date }),
  result: (id: string, userId: string) => call<D<ReinterviewResults>>(`/plans/${id}/reinterviews/${userId}`),
  /** "Simpan hasil": catat bahwa HR sudah meninjau hasil wawancara ulang yang ditampilkan */
  review: (id: string, userId: string, reinterviewId: string) => send<void>('POST', `/plans/${id}/reinterviews/${userId}/review`, { reinterviewId }),
  mine: () => call<D<MyReinterview[]>>('/me/reinterviews'),
  session: (planId: string) => call<D<ReinterviewSession>>(`/me/reinterviews/${planId}/session`),
  consent: (planId: string, consentVersion: string) => send<D<{ question: unknown }>>('POST', `/me/reinterviews/${planId}/consent`, { consentVersion }),
  /** text kosong = minta pertanyaan yang belum ada, atau nilai ulang bila semua jawaban sudah ada */
  turn: (planId: string, text?: string) => send<D<{ question: unknown; done: boolean }>>('POST', `/me/reinterviews/${planId}/turns`, text === undefined ? {} : { text }),
}
