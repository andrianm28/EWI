// Klien API Core Competencies (B10). Bentuk respons: docs/designs/b10-core-competencies.md bagian 5.
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

export type GroupKey = 'vm' | 'values'
export type SourceKind = 'vision' | 'mission' | 'value'
export type RequirementStatus = 'draft' | 'validated' | 'rejected'
export type Classification = 'dalam_batas' | 'perlu_ditinjau' | 'belum_diukur'

export type OverviewRow = {
  id: string; name: string; definition: string | null; targetScore: number; actualScore: number | null
  actualSource: string | null; gap: number | null; classification: Classification; status: RequirementStatus
}
export interface OverviewGroup {
  id: string; kind: SourceKind; title: string; text: string | null; sourceRef: string | null; readiness: number | null; rows: OverviewRow[]
}
export interface Overview {
  kpis: {
    readiness: number | null
    biggestGap: { name: string; gap: number } | null
    belowTarget: { count: number; measured: number; total: number }
    pendingValidation: number
    weakestSource?: { title: string; readiness: number } | null
  }
  groups: OverviewGroup[]
}

export interface Requirement {
  id: string; sourceId: string; name: string; definition: string | null; targetScore: number; actualScore: number | null
  actualSource: 'manual' | 'synthesis' | null; origin: 'hr' | 'ai'; status: RequirementStatus
}
export interface Source {
  id: string; kind: SourceKind; title: string; text: string | null; sourceRef: string | null; position: number
  status: 'active' | 'archived'; requirements: Requirement[]
}

export interface ProgramConfig {
  values: { name: string }[]
  components: { name: string; weight: number }[]
  totalActivities: number
  passScore: number
  bands: { key: string; label: string; min: number; description?: string | null }[]
}
export interface Recommendation { title: string; detail: string | null }
export interface Program {
  key: string; name: string; provider: string | null; cutoffDate: string | null; config: ProgramConfig
  insight: string | null; recommendations: Recommendation[]; participants: number; manualReport: ManualReport | null
}
export interface ManualReport {
  registered: number; completed: number; passed: number; avgValueScore: number | null; avgFinal: number | null
  statuses: Record<string, number>
  values: { avgCompleted: number | null; avgAll: number | null }[]
  components: { done: number; avg: number | null }[]
  divisions: { name: string; participants: number; completed: number; passed: number; avgFinal: number | null; avgValueScore: number | null }[]
}
export type DivisionRow = {
  name: string; participants: number; completed: number; completedPct: number | null; passed: number; passedPct: number | null
  avgFinal: number | null; avgValueScore: number | null
}
export interface ProgramReport {
  source: 'results' | 'manual'
  program: { key: string; name: string; provider: string | null; cutoffDate: string | null }
  kpis: { registered: number; completed: number; completedPct: number | null; passed: number; passedPct: number | null; avgValueScore: number | null }
  statuses: { key: string; label: string; description: string | null; min: number | null; count: number; pct: number | null }[]
  values: { name: string; avgCompleted: number | null; avgAll: number | null }[]
  components: { name: string; weight: number; done: number; donePct: number | null; avg: number | null; contribution: number | null }[]
  total: { done: number; donePct: number | null; avgFinal: number | null }
  divisions: DivisionRow[]
  allDivisions: DivisionRow
  insight: string | null
  recommendations: Recommendation[]
}

export type AssignmentStatus = 'none' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
export interface Assignment { id: string; tier: 'leader' | 'employee'; status: AssignmentStatus; dueDate: string | null; durationMinutes: number; completedAt: string | null }
export interface Mine { leader: Assignment | null; employee: Assignment | null }
export type LeaderRow = {
  userId: string; name: string; division: string | null; jobRoleName: string | null; assignmentId: string | null
  status: AssignmentStatus; dueDate: string | null; teamTotal: number; teamAssigned: number; teamDone: number
}
export type TeamRow = { userId: string; name: string; jobRoleName: string | null; status: AssignmentStatus }
export type Assignments =
  | { role: 'hr'; mine: Mine; kpis: { leadersEligible: number; leadersAssigned: number; leadersCompleted: number; employeesAssigned: number; employeesCompleted: number }; leaders: LeaderRow[] }
  | { role: 'leader'; mine: Mine; canAssign: boolean; team: TeamRow[] }
  | { role: 'employee'; mine: Mine }
export interface AssignResult { tier: string; assigned: (Assignment & { assigneeId: string })[]; skipped: string[]; rejected: string[] }

// --- B10 tahap 2: sesi wawancara peserta dan sintesis HR (spek bagian 11.4) ---
export type InterviewStep = 'consent' | 'chat' | 'summary' | 'done' | 'cancelled'
export type ThemeKey = 'vision' | 'mission' | 'values' | 'behavior' | 'support'
export interface InterviewTurn { role: 'ai' | 'participant'; theme: ThemeKey; text: string; options: string[] | null }
export interface InterviewQuestion { position: number; theme: ThemeKey; text: string; options: string[] }
export interface SummaryTheme { theme: ThemeKey | null; question: string | null; answer: string | null }
export interface InterviewSession {
  assignment: { id: string; tier: 'leader' | 'employee'; status: AssignmentStatus; dueDate: string; durationMinutes: number; restartsLeft: number }
  step: InterviewStep
  consentVersionRequired: string | null
  turns: InterviewTurn[]
  answerCount: number
  questionCount: number
  summary: { themes: SummaryTheme[]; createdAt: string } | null
}
export type SynthesisRow = {
  requirementId: string; name: string; sourceKind: SourceKind; sourceTitle: string
  leaderAgree: number | null; leaderRespondents: number; employeeAligned: number | null; employeeRespondents: string
  gap: number | null; hot: boolean; actualScore: number | null; actualSource: 'manual' | 'synthesis' | null
}
export interface Synthesis { themes: SynthesisRow[]; minRespondents: number; employeeBatch: number; kpis: { themes: number; leadersCompleted: number; employeesCompleted: string } }
export interface ApplyResult { applied: { requirementId: string; previous: { actualScore: number | null; actualSource: string | null } }[]; skipped: { requirementId: string; reason: string }[] }

const call = <T>(path: string, init: RequestInit = {}) => api<{ data: T }>(`/cca${path}`, init, useSessionStore().token).then((r) => r.data)
const send = <T>(method: string, path: string, body: unknown) => call<T>(path, { method, body: JSON.stringify(body) })

export const cca = {
  overview: (group: GroupKey) => call<Overview>(`/overview?group=${group}`),
  sources: () => call<Source[]>('/sources'),
  createSource: (body: { kind: SourceKind; title: string; text?: string | null; sourceRef?: string | null }) => send<Source>('POST', '/sources', body),
  updateSource: (id: string, body: Partial<{ title: string; text: string | null; sourceRef: string | null; status: 'active' | 'archived' }>) => send<Source>('PATCH', `/sources/${id}`, body),
  createRequirement: (sourceId: string, body: { name: string; definition?: string | null; targetScore: number; actualScore?: number | null }) =>
    send<Requirement>('POST', `/sources/${sourceId}/requirements`, body),
  updateRequirement: (id: string, body: Partial<{ name: string; definition: string | null; targetScore: number; actualScore: number | null; status: RequirementStatus }>) =>
    send<Requirement>('PATCH', `/requirements/${id}`, body),
  programs: () => call<Program[]>('/programs'),
  saveProgram: (key: string, body: { name: string; provider: string | null; cutoffDate: string | null; config: ProgramConfig; insight: string | null; recommendations: Recommendation[] }) =>
    send<Program>('PUT', `/programs/${key}`, body),
  report: (key: string) => call<ProgramReport>(`/programs/${key}/report`),
  saveManualReport: (key: string, report: ManualReport | null) =>
    send<{ saved: boolean; shadowedByImport: boolean; report: ProgramReport | null }>('PUT', `/programs/${key}/manual-report`, { report }),
  assignments: () => call<Assignments>('/assignments'),
  assign: (assigneeIds: string[], dueDate: string, durationMinutes = 10) => send<AssignResult>('POST', '/assignments', { assigneeIds, dueDate, durationMinutes }),
  cancelAssignment: (id: string) => send<Assignment>('PATCH', `/assignments/${id}`, { status: 'cancelled' }),
  session: (id: string) => call<InterviewSession>(`/assignments/${id}/session`),
  consent: (id: string, consentVersion: string) => send<{ question: InterviewQuestion | null }>('POST', `/assignments/${id}/consent`, { consentVersion }),
  /** Tanpa text: minta (ulang) pertanyaan berikutnya. */
  turn: (id: string, text?: string) => send<{ question: InterviewQuestion | null; done: boolean }>('POST', `/assignments/${id}/turns`, text === undefined ? {} : { text }),
  summarize: (id: string) => send<{ themes: SummaryTheme[]; createdAt: string }>('POST', `/assignments/${id}/summary`, {}),
  confirm: (id: string) => send<{ status: 'completed' }>('POST', `/assignments/${id}/summary/confirm`, {}),
  restart: (id: string) => send<{ restartsLeft: number }>('POST', `/assignments/${id}/restart`, {}),
  synthesis: () => call<Synthesis>('/synthesis'),
  applySynthesis: (requirementIds: string[]) => send<ApplyResult>('POST', '/synthesis/apply', { requirementIds }),
  preview: (tier: 'leader' | 'employee') => call<{ tier: string; questions: InterviewQuestion[] }>(`/interview/preview?tier=${tier}`),
}

export const THEME_LABEL: Record<ThemeKey, string> = {
  vision: 'Visi',
  mission: 'Misi',
  values: 'Nilai',
  behavior: 'Perilaku kunci',
  support: 'Dukungan',
}

export const CLASS_LABEL: Record<Classification, string> = {
  dalam_batas: 'Dalam batas',
  perlu_ditinjau: 'Perlu ditinjau HR',
  belum_diukur: 'Belum diukur',
}
export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  none: 'Belum ditugaskan',
  assigned: 'Ditugaskan',
  in_progress: 'Sedang berjalan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
}
export const fmt = (n: number | null | undefined, suffix = '') => (n === null || n === undefined ? '-' : `${String(n).replace('.', ',')}${suffix}`)
export const fmtDate = (iso: string | null | undefined, month: 'long' | 'short' = 'long') => {
  if (!iso) return '-'
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('id-ID', { day: 'numeric', month, year: 'numeric' })
}
