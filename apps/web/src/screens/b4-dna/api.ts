// Klien API B4 Developmental Needs. Bentuk data mengikuti apps/api/src/modules/dna/development-routes.js.
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

export type Tier = 'basic' | 'intermediate' | 'advanced'
export type Stage = Tier | 'done' | 'not_assessed'
export interface DictionaryStatus {
  status: 'available' | 'none'; tool1: boolean; tool2: boolean; tool3: boolean
  competencyCount: number; approvedCount: number; approved: boolean; assessedCompetencyCount: number
}
export interface JobOption { id: string; name: string; division: string | null; dictionary: 'available' | 'none'; competencyCount: number }
export interface Overview {
  jobs: JobOption[]; selectedJobRoleId: string | null
  kpi: { employees: number; jobFunctions: number; competencies: number; jobsWithDictionary: number; jobsTotal: number }
  stageDistribution: { stage: Stage; count: number; percent: number }[]
  dictionary: DictionaryStatus
}
export interface DictionaryRow { id: string; code: string | null; name: string; stream: string | null; programTier: Tier | null; requiredScore: number; approvedAt: string | null; jobFunctionIds: string[] }
export interface Dictionary {
  jobRole: { id: string; name: string }
  jobFunctions: { id: string; order: number; name: string; competencyCount: number }[]
  competencies: DictionaryRow[]
  dictionary: DictionaryStatus
}
export interface Curriculum { jobRole: { id: string; name: string }; untiered: number; tiers: { tier: Tier; count: number; modules: { id: string; code: string | null; name: string; stream: string | null }[] }[] }
export interface EmployeeNeed { id: string; name: string | null; stage: Stage; met: number; assessed: number; total: number; focus: string[] }
export interface PlanModule { competencyId: string; code: string | null; name: string; stream: string | null; score: number | null; target: number; status: 'met' | 'develop' | 'locked' | 'not_assessed'; mastery: 'mastered' | 'partial' | 'not_yet' | null }
export interface DevelopmentPlan {
  person: { id: string; name: string | null; jobRoleId: string | null; jobRoleName: string | null }
  stage: Stage; met: number; assessed: number; total: number; untiered: number; focus: string[]; advice: string
  tiers: { tier: Tier; modules: PlanModule[] }[]
}

const call = <T>(path: string, init: RequestInit = {}) => api<{ data: T }>(path, init, useSessionStore().token).then((r) => r.data)
const q = (params: Record<string, string | null | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString()
  return s ? `?${s}` : ''
}

export const dnaApi = {
  overview: (jobRoleId?: string | null) => call<Overview>(`/dna/development/overview${q({ jobRoleId })}`),
  dictionary: (jobRoleId: string, jobFunctionId?: string | null, tier?: string | null) => call<Dictionary>(`/dna/job-roles/${jobRoleId}/dictionary${q({ jobFunctionId, tier })}`),
  approveDictionary: (jobRoleId: string) => call<{ approved: number }>(`/dna/job-roles/${jobRoleId}/dictionary/approve`, { method: 'POST', body: '{}' }),
  curriculum: (jobRoleId: string) => call<Curriculum>(`/dna/job-roles/${jobRoleId}/curriculum`),
  employees: (jobRoleId: string) => call<EmployeeNeed[]>(`/dna/development/employees${q({ jobRoleId })}`),
  plan: (userId: string) => call<DevelopmentPlan>(`/dna/employees/${userId}/development-plan`),
}

export const TIER_LABEL: Record<Tier, string> = { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' }
export const STAGE_LABEL: Record<Stage, string> = { ...TIER_LABEL, done: 'Tuntas', not_assessed: 'Belum dinilai' }
