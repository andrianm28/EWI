// Klien API Learning Delivery (B14). Bentuk data mengikuti apps/api/src/modules/ld.
import { ApiError, api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type Group = 'running' | 'upcoming' | 'done' | 'cancelled'
export type Health = 'ok' | 'watch' | 'late'
export type AssessmentMode = 'none' | 'elitementor' | 'vendor_manual'
export type AssessmentStatus = 'none' | 'awaiting' | 'synced' | 'manual_pending' | 'manual'
/** Saran tindakan LD: tiga jenis pesan ke peserta (POST /reminders, body kind) dan buka detail pelatihan. */
export type MessageKind = 'remind' | 'invite' | 'confirm'
export type ActionKind = MessageKind | 'open_training'
export type CheckKey = 'schedule' | 'materials' | 'participants' | 'attendance' | 'assessment' | 'documentation'
export interface Training {
  id: string; title: string; mode: 'online' | 'offline'; source: 'manual' | 'elitementor' | 'lms'
  vendorName: string | null; venue: string | null; startsOn: string | null; endsOn: string | null
  sessionCount: number | null; sessionsDone: number | null; status: string; materialsReady: boolean
  assessmentMode: AssessmentMode; assessmentRef: string | null; assessmentStatus: AssessmentStatus
  moduleCode: string | null; moduleName: string | null; programTier: string | null
  participants: number; completed: number; present: number; attendanceRecorded: number; scored: number
  group: Group; progressPct: number; health: Health; checks: { key: CheckKey; ok: boolean }[]
}
export interface Participant { userId: string; name: string | null; email: string; jobRoleName: string | null; status: string; attendance: boolean | null; score: number | null; scoreSource: string | null }
export interface Doc { id: string; kind: 'material' | 'photo' | 'video'; filename: string; mime: string; sizeBytes: number; createdAt: string }
export interface TrainingDetail extends Training {
  readiness: { key: CheckKey; state: 'complete' | 'missing' | 'waiting'; optional?: boolean }[]
  participantList: Participant[]; documents: Doc[]; storageReady: boolean
}
export interface Dashboard {
  kpis: { running: number; online: number; offline: number; upcoming: number; activeLearners: number; avgProgress: number; attention: number }
  insights: { key: string; trainingId: string; title: string; detail: string; source: string }[]
  actions: { key: string; trainingId: string; kind: ActionKind; title: string; detail: string }[]
  generatedBy: string
}
export interface Options { jobRoles: { id: string; name: string; people: number }[]; employees: { id: string; name: string | null; email: string; jobRoleName: string | null }[]; vendorName: string; storageReady: boolean; webhookSync: boolean }

const token = () => useSessionStore().token
const call = <T>(path: string, init: RequestInit = {}) => api<T>(`/ld${path}`, init, token())
const send = <T>(method: string, path: string, body?: unknown) => call<T>(path, { method, body: JSON.stringify(body ?? {}) })
type D<T> = { data: T }

async function raw(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const t = token()
  if (t) headers.set('Authorization', `Bearer ${t}`)
  const res = await fetch(`${BASE}/ld${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Terjadi kesalahan')
  }
  return res
}

export const ld = {
  dashboard: () => call<D<Dashboard>>('/dashboard'),
  trainings: () => call<D<Training[]>>('/trainings'),
  options: () => call<D<Options>>('/options'),
  create: (body: { title: string; vendorName?: string; startsOn: string; venue?: string }) => send<D<Training>>('POST', '/trainings', body),
  detail: (id: string) => call<D<TrainingDetail>>(`/trainings/${id}`),
  patch: (id: string, body: Record<string, unknown>) => send<D<Training>>('PATCH', `/trainings/${id}`, body),
  addParticipants: (id: string, body: { userIds?: string[]; jobRoleId?: string }) => send<D<TrainingDetail & { added: number }>>('PUT', `/trainings/${id}/participants`, body),
  removeParticipant: (id: string, userId: string) => raw(`/trainings/${id}/participants/${userId}`, { method: 'DELETE' }),
  attendance: (id: string, body: { entries?: { userId: string; present: boolean | null }[]; allPresent?: boolean }) => send<D<TrainingDetail>>('PUT', `/trainings/${id}/attendance`, body),
  assessment: (id: string, body: { mode: AssessmentMode; assessmentRef?: string }) => send<D<TrainingDetail>>('PUT', `/trainings/${id}/assessment`, body),
  scores: (id: string, entries: { userId: string; score: number | null }[]) => send<D<TrainingDetail>>('PUT', `/trainings/${id}/scores`, { entries }),
  remind: (id: string, kind: MessageKind = 'remind') => send<D<{ recipients: number; sent: number; failed: number }>>('POST', `/trainings/${id}/reminders`, { kind }),
  upload: async (id: string, file: File, kind: Doc['kind']) => (await (await raw(`/trainings/${id}/documents?kind=${kind}&filename=${encodeURIComponent(file.name)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
  })).json()) as D<Doc>,
  download: async (doc: Doc) => (await raw(`/documents/${doc.id}/content`)).blob(),
  removeDoc: (id: string) => raw(`/documents/${id}`, { method: 'DELETE' }),
}
