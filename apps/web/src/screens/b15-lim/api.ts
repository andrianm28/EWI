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
}
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
  queue: (id: string) => call<D<QueueRow[]>>(`/plans/${id}/queue`),
  schedule: (id: string, userIds: string[], date: string | null) =>
    send<D<{ scheduled: string[]; skipped: { userId: string; reason: string }[]; rejected: { userId: string; message: string }[] }>>('POST', `/plans/${id}/queue/schedule`, { userIds, date }),
}
