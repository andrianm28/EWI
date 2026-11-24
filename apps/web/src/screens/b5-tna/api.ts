// Klien API papan gap dan penugasan wawancara (B5). Bentuk data: docs/designs/b5-training-needs.md bagian 6 dan 16.
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

export type Classification = 'training' | 'non_training' | 'review' | 'pending' | 'ok'
// type (bukan interface) supaya memenuhi Record<string, unknown> milik UiDataTable
export type GapCounts = { classification: Classification; interviewed: boolean; interviewedCount: number; assignedCount: number }
export type CompetencyGap = GapCounts & {
  key: string; kind: 'competency'; competencyId: string; code: string | null; name: string; target: number; actual: number; gap: number
  targetPct: number; actualPct: number; gapPct: number; assessed: number; peopleWithGap: number; peopleTotal: number; cumulativeShare: number | null
}
export type OkrGap = GapCounts & {
  key: string; kind: 'okr'; metricType: string; name: string; period: string; target: number | null; actual: number | null; diff: number | null
  targetVaries: boolean; direction: string | null; tolerance: number | null; unit: string | null; valueType: string | null; peopleMissed: number; peopleTotal: number
}
export interface GapSummary {
  period: string | null; periods: string[]
  kpis: { competencyGaps: number; okrGaps: number; totalGaps: number; interviewed: number; top4Share: number }
  classification: Record<'training' | 'non_training' | 'review' | 'pending', number>
  unapprovedCompetencies: number
}
export interface DetailSession { id: string; status: string; inviteExpiresAt: string | null; projectId: string | null; assignedBy: string | null; open: boolean }
export type DetailEmployee = {
  id: string; name: string | null; jobRoleId: string | null; jobRoleName: string | null; value: number | null; target: number | null
  gap?: number | null; isMet?: boolean; self: boolean; assignable: boolean; session: DetailSession | null
}
export type GapDetail = (CompetencyGap | OkrGap) & { evidence: string[]; hypotheses: { text: string; verified: boolean }[]; jobRoles: string[]; employees: DetailEmployee[] }
export type GapRef = { kind: 'competency'; competencyId: string } | { kind: 'okr'; metricType: string; name: string; period: string }
export interface AssignBody { projectId: string; gap: GapRef; mode: 'affected' | 'all_job_role'; jobRoleId?: string; employeeIds?: string[]; dueDate: string; durationMinutes: 15 | 30 }
export interface AssignResult { assigned: { sessionId: string; employeeId: string; inviteExpiresAt: string }[]; skipped: { employeeId: string; reason: string }[] }
export interface Project { id: string; name: string; status: string }

const call = <T>(path: string, init: RequestInit = {}) => api<T>(path, init, useSessionStore().token)
const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) })
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const gaps = {
  summary: (period?: string) => call<{ data: GapSummary }>(`/tna/gaps/summary${qs({ period })}`),
  competencies: () => call<{ data: { rows: CompetencyGap[]; unapprovedCompetencies: number } }>('/tna/gaps/competencies'),
  okr: (period?: string) => call<{ data: { rows: OkrGap[]; period: string | null; periods: string[] } }>(`/tna/gaps/okr${qs({ period })}`),
  detail: (ref: GapRef) => call<{ data: GapDetail }>(`/tna/gaps/detail${qs(ref as unknown as Record<string, string>)}`),
  assign: (body: AssignBody) => post<{ data: AssignResult }>('/tna/assignments', body),
  cancel: (sessionId: string) => post<{ data: { id: string; status: string } }>(`/tna/assignments/${sessionId}/cancel`, {}),
  projects: () => call<{ data: Project[] }>('/projects'),
  jobRoles: () => call<{ data: { id: string; name: string }[]; defaults?: { scope?: string; jobRoleId?: string | null } }>('/tna/job-roles'),
}

/**
 * Peran yang diterima API papan gap (R1). Peran lain mendapat 403, jadi papan tidak dimuat sama sekali.
 * Tanpa eta_admin: Super Admin diblokir dari isi karyawan (aturan 24 Nov, 403 EMPLOYEE_CONTENT_PRIVATE; R39-2).
 * Dicocokkan dengan peran aktif sesi (session.hasActiveRole), bukan semua peran akun (B2, R39-3).
 */
export const BOARD_ROLES = ['hr_admin', 'supervisor']
export const HR_ROLES = ['hr_admin']

/** Ubah query rute menjadi rujukan gap; null bila tidak lengkap. */
export function gapRefFromQuery(q: Record<string, unknown>): GapRef | null {
  const s = (k: string) => (typeof q[k] === 'string' ? (q[k] as string) : '')
  if (s('kind') === 'competency' && s('competencyId')) return { kind: 'competency', competencyId: s('competencyId') }
  if (s('kind') === 'okr' && s('metricType') && s('name') && s('period')) return { kind: 'okr', metricType: s('metricType'), name: s('name'), period: s('period') }
  return null
}
export function gapRefOf(row: CompetencyGap | OkrGap): GapRef {
  return row.kind === 'competency' ? { kind: 'competency', competencyId: row.competencyId } : { kind: 'okr', metricType: row.metricType, name: row.name, period: row.period }
}
