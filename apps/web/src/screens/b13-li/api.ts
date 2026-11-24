// Klien API Learning Intervention (B13). Bentuk data mengikuti apps/api/src/modules/li.
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

export interface CatalogItem { id: string; title: string; source: string; externalRef: string }
export type Level = 'basic' | 'intermediate' | 'advanced'
export type ItemKind = 'K' | 'S' | 'A'
export type StatusKey = 'available' | 'dev_approved' | 'dev_review' | 'dev_draft' | 'delivered' | 'confirmed' | 'requested' | 'none'
export type RequestStatus = 'requested' | 'confirmed' | 'delivered' | 'installed' | 'cancelled'
export interface Priority { rank: number; share?: number; cumulativeShare: number }
export interface ModuleRow {
  id: string; code: string; name: string; level: Level; stream: string | null; catalogItemId: string | null
  jobRoles: { id: string; name: string }[]; counts: Record<ItemKind, number>
  status: { key: StatusKey; via: string | null }; priority: Priority | null; recommendation: 'vendor' | 'dev'
  request: { id: string; status: RequestStatus } | null; draft: { id: string; status: string } | null
}
export interface ModuleDetail extends ModuleRow { objective: string | null; items: { kind: ItemKind; text: string }[]; vendorName: string }
export interface ParetoSummary { available: boolean; count: number; codes: string[]; cumulativeShare: number; withoutGapData: number; unlinkedFindings: number }
export interface Library {
  data: ModuleRow[]
  kpis: { modules: number; knowledge: number; skill: number; attitude: number; streams: number }
  pareto: ParetoSummary
  filters: { jobRoles: { id: string; name: string }[]; streams: string[] }
  vendorName: string
}
export interface VendorRequest { id: string; moduleId: string; moduleCode: string; moduleName: string; vendorName: string; status: RequestStatus; requestedAt: string }
export interface DraftRow { id: string; moduleId: string; moduleCode: string; moduleName: string; status: DraftStatus; reviewerName: string | null; reviewNote: string | null }
export type DraftStatus = 'draft' | 'sme_review' | 'approved' | 'returned'
export interface Objective { kind: ItemKind; item: string; text: string; assessment: string }
export interface Draft extends DraftRow {
  moduleLevel: Level; moduleStream: string | null; moduleObjective: string | null; generatedBy: string
  objectives: Objective[]
  sessions: { order: number; title: string; detail: string; covers: string }[]
  assessments: { kind: ItemKind; title: string; detail: string; objectives: number }[]
}
export interface Requests { data: { vendor: VendorRequest[]; drafts: DraftRow[]; candidates: { id: string; code: string; name: string; priority: Priority | null }[] }; vendorName: string }
export interface Programs {
  data: {
    jobRoles: { id: string; name: string; hasDictionary: boolean }[]; jobRoleId: string | null; level: Level
    levels: { level: Level; count: number }[]
    kpis: { courses: number; available: number; inProgress: number; noSource: number }
    groups: { stream: string; modules: ModuleRow[] }[]
    pareto: { available: boolean; codes: string[] }
  }
  vendorName: string
}

const KINDS: ItemKind[] = ['K', 'S', 'A']
const kindOf = (v: unknown): ItemKind => (KINDS.includes(v as ItemKind) ? (v as ItemKind) : 'K')
/**
 * Gap B1: draf lama (seed sebelum 25 Nov) menyimpan tujuan sebagai teks dan asesmen tanpa hitungan tujuan.
 * Dinormalkan ke bentuk kontrak generateDraft supaya layar bisa menyunting dan PUT tidak ditolak.
 */
export function normalizeDraft(d: Draft): Draft {
  const objectives = (d.objectives as unknown[] ?? []).map((o): Objective => {
    if (typeof o === 'string') return { kind: 'K', item: o, text: o, assessment: '' }
    const x = (o ?? {}) as Partial<Objective>
    return { kind: kindOf(x.kind), item: x.item ?? '', text: x.text ?? '', assessment: x.assessment ?? '' }
  })
  const assessments = (d.assessments ?? []).map((a) => ({
    ...a,
    kind: kindOf(a.kind),
    objectives: Number.isInteger(a.objectives) ? a.objectives : objectives.filter((o) => o.kind === kindOf(a.kind)).length,
  }))
  return { ...d, objectives, sessions: d.sessions ?? [], assessments }
}

const call = <T>(path: string, init: RequestInit = {}) => api<T>(`/li${path}`, init, useSessionStore().token)
const send = <T>(method: string, path: string, body?: unknown) => call<T>(path, { method, body: JSON.stringify(body ?? {}) })
const qs = (o: Record<string, string | null | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const li = {
  library: (f: { jobRoleId?: string; priority?: string; type?: string; level?: string; stream?: string } = {}) => call<Library>(`/modules${qs(f)}`),
  module: (id: string, jobRoleId?: string) => call<{ data: ModuleDetail }>(`/modules/${id}${qs({ jobRoleId })}`),
  requestModule: (id: string) => send<{ data: VendorRequest }>('POST', `/modules/${id}/request`),
  requestBulk: (body: { scope: 'pareto' | 'program'; jobRoleId?: string; level?: Level }) => send<{ data: { created: number; skipped: number } }>('POST', '/requests/bulk', body),
  requests: () => call<Requests>('/requests'),
  moveRequest: (id: string, status: RequestStatus, catalogItemId?: string) => send<{ data: VendorRequest }>('PATCH', `/requests/${id}`, catalogItemId ? { status, catalogItemId } : { status }),
  catalog: () => call<{ data: CatalogItem[] }>('/catalog'),
  linkCourse: (moduleId: string, catalogItemId: string | null) => send<{ data: ModuleRow }>('PATCH', `/modules/${moduleId}`, { catalogItemId }),
  deleteDraft: (id: string) => call<unknown>(`/drafts/${id}`, { method: 'DELETE' }),
  programs: (f: { jobRoleId?: string | null; level?: Level } = {}) => call<Programs>(`/programs${qs(f)}`),
  startDraft: (moduleId: string) => send<{ data: Draft }>('POST', `/modules/${moduleId}/draft`),
  draft: async (id: string) => { const res = await call<{ data: Draft }>(`/drafts/${id}`); return { ...res, data: normalizeDraft(res.data) } },
  saveDraft: (id: string, body: Partial<Pick<Draft, 'objectives' | 'sessions' | 'assessments'>>) => send<{ data: Draft }>('PUT', `/drafts/${id}`, body),
  submitDraft: (id: string) => send<{ data: Draft }>('POST', `/drafts/${id}/submit`),
  reviewDraft: (id: string, body: { decision: 'approved' | 'returned'; note?: string; reviewerName: string }) => send<{ data: Draft }>('POST', `/drafts/${id}/review`, body),
}
