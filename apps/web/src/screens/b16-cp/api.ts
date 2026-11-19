// Klien API B16 Career & Promotion. Bentuk data mengikuti apps/api/src/modules/dna/career-routes.js.
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

export type Tier = 'basic' | 'intermediate' | 'advanced'
export type CareerStatus = 'no_path' | 'below_current' | 'top_level' | 'next_no_requirement' | 'eligible' | 'program_passed_okr_low' | 'program_passed_no_okr' | 'on_track'
export type DecisionState = 'none' | 'supervisor_recommend' | 'supervisor_hold' | 'approved' | 'hold'
export type Action = 'recommend' | 'hold' | 'approve'
export interface Ref { id: string; name: string }
export interface NextLevel extends Ref { requiredProgramTier: Tier | null }
export interface MapRow {
  id: string; name: string | null; division: string | null; jobRoleId: string | null; jobRoleName: string | null
  level: Ref | null; programs: { tier: Tier; passed: boolean }[]; okr: { achievement: number; period: string | null; count: number } | null
  status: CareerStatus; nextLevel: NextLevel | null; decisionState: DecisionState
}
export interface CareerMap { okrMin: number; kpi: { employees: number; divisions: number; eligible: number; awaitingDecision: number; belowCurrent: number }; divisions: string[]; employees: MapRow[] }
export interface Evidence {
  person: { id: string; name: string | null; division: string | null; jobRoleName: string | null; level: Ref | null }
  status: CareerStatus; nextLevel: NextLevel | null; programsPassed: Tier[]
  okr: { achievement: number; min: number; met: boolean; period: string | null; count: number } | null
  reinterview: null; supervisorRecommendation: { decision: 'recommend' | 'hold'; byName: string | null; at: string } | null
}
export interface Paths { jobRole: Ref | null; okrMin: number; levels: { id: string; order: number; name: string; requiredProgramTier: Tier | null; moduleCount: number; employees: number; readyForNext: number }[] }
export interface Stage { decision: string; byName: string | null; at: string; note: string | null }
export interface DecisionRow {
  employee: { id: string; name: string | null; division: string | null; jobRoleName: string | null }
  fromLevel: Ref | null; toLevel: Ref | null
  requirement: { programPassed: boolean; okr: { achievement: number; min: number; met: boolean } | null }
  eligible: boolean; supervisor: Stage | null; hr: Stage | null; actions: Action[]; blockedReason: string | null
}

const call = <T>(path: string, init: RequestInit = {}) => api<{ data: T }>(path, init, useSessionStore().token).then((r) => r.data)

export const cpApi = {
  map: () => call<CareerMap>('/dna/career/map'),
  evidence: (userId: string) => call<Evidence>(`/dna/career/employees/${userId}/evidence`),
  paths: () => call<Paths>('/dna/career/paths'),
  decisions: () => call<DecisionRow[]>('/dna/career/decisions'),
  decide: (userId: string, stage: 'supervisor' | 'hr', decision: Action, note?: string) =>
    call<DecisionRow>(`/dna/career/decisions/${userId}/${stage}`, { method: 'POST', body: JSON.stringify({ decision, note: note || undefined }) }),
}

export const TIER_LABEL: Record<Tier, string> = { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' }
