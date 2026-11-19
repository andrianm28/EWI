// Klien API Improvement Needs (B9). Bentuk data mengikuti apps/api/src/modules/ina; spek docs/designs/b9-improvement-needs.md.
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

export type InaLevel = 'manage' | 'read' | 'summary'
export type ActionCategory = 'sop' | 'alat' | 'sistem' | 'budaya' | 'lainnya'
export type ActionStatus = 'new' | 'in_progress' | 'done' | 'rejected'
export type VerificationStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'withdrawn'
export type ReportedStatus = 'in_progress' | 'done' | 'blocked'

export interface InaAction {
  id: string; title: string; detail?: string | null; category: ActionCategory; subLabel: string | null
  ownerUserId: string | null; ownerName: string | null; ownerJobRoleName: string | null; sourceRef: string | null
  dueDate: string | null; status: ActionStatus; overdue: boolean
  lastVerification: { id: string; status: VerificationStatus; endedAt: string | null; reportedStatus?: ReportedStatus | null } | null
  findingId?: string | null; involvesIndividual?: boolean
}
export interface InaKpis { total: number; done: number; process: number; culture: number; overdue: number }
export interface ActionList { data: InaAction[]; kpis: InaKpis; meta: { level: InaLevel; hiddenIndividual?: number } }
export interface ActionInput {
  title?: string; detail?: string | null; category?: ActionCategory; subLabel?: string | null; ownerUserId?: string | null
  sourceRef?: string | null; dueDate?: string | null; involvesIndividual?: boolean; status?: ActionStatus
}
export interface SupervisorAccess { supervisorId: string; name: string | null; email: string; granted: boolean; grantedAt: string | null; grantedByName: string | null }
export interface OwnerOption { id: string; name: string | null; jobRoleName: string | null }
export interface Turn { speaker: 'ai' | 'human'; text: string; at?: string }
export interface Verification {
  id: string; actionId: string; actionTitle: string; actionDueDate: string | null; ownerUserId: string; ownerName: string | null
  status: VerificationStatus; dueDate: string | null; assignedAt: string; startedAt: string | null; endedAt: string | null
  reportedStatus: ReportedStatus | null; summary: string | null; aiProvider: string | null; turns?: Turn[]
}
export interface TurnReply { question: string | null; done: boolean; status?: VerificationStatus }

export const CATEGORY_LABEL: Record<ActionCategory, string> = { sop: 'SOP', alat: 'Alat', sistem: 'Sistem', budaya: 'Budaya', lainnya: 'Lainnya' }
export const STATUS_LABEL: Record<ActionStatus, string> = { new: 'Baru', in_progress: 'Berjalan', done: 'Selesai', rejected: 'Ditolak' }
// sama dengan TRANSITIONS di apps/api/src/modules/ina/domain.js
export const NEXT_STATUS: Record<ActionStatus, ActionStatus[]> = {
  new: ['in_progress', 'done', 'rejected'], in_progress: ['done', 'rejected', 'new'], done: ['in_progress'], rejected: ['new'],
}
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  assigned: 'Menunggu pemilik', in_progress: 'Sedang dijawab', completed: 'Selesai', cancelled: 'Dibatalkan', withdrawn: 'Ditarik pemilik',
}
export const REPORTED_LABEL: Record<ReportedStatus, string> = { in_progress: 'Masih berjalan', done: 'Sudah selesai', blocked: 'Terhambat' }
/** Versi teks persetujuan verifikasi yang ditampilkan di layar (disimpan bersama persetujuan). */
export const CONSENT_VERSION = 'ina-verifikasi-v1.0'

const call = <T>(path: string, init: RequestInit = {}) => api<T>(`/ina${path}`, init, useSessionStore().token)
const send = <T>(method: string, path: string, body?: unknown) => call<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const ina = {
  me: () => call<{ data: { level: InaLevel | null; pendingVerifications: number } }>('/access/me'),
  actions: (hidden = false) => call<ActionList>(`/actions${hidden ? '?hidden=1' : ''}`),
  action: (id: string) => call<{ data: InaAction }>(`/actions/${id}`),
  createAction: (body: ActionInput) => send<{ data: InaAction }>('POST', '/actions', body),
  updateAction: (id: string, body: ActionInput) => send<{ data: InaAction }>('PATCH', `/actions/${id}`, body),
  owners: () => call<{ data: OwnerOption[] }>('/owners'),
  access: () => call<{ data: SupervisorAccess[] }>('/access'),
  grant: (supervisorId: string) => send<{ data: { granted: boolean } }>('PUT', `/access/${supervisorId}`),
  revoke: (supervisorId: string) => send<{ data: { granted: boolean } }>('DELETE', `/access/${supervisorId}`),
  verifications: () => call<{ data: Verification[] }>('/verifications'),
  myVerifications: () => call<{ data: Verification[] }>('/verifications/mine'),
  verification: (id: string) => call<{ data: Verification }>(`/verifications/${id}`),
  assign: (actionId: string, dueDate: string | null) => send<{ data: Verification }>('POST', `/actions/${actionId}/verifications`, { dueDate }),
  consent: (id: string) => send<{ data: Verification & TurnReply }>('POST', `/verifications/${id}/consent`, { consentVersion: CONSENT_VERSION }),
  answer: (id: string, text: string) => send<{ data: TurnReply }>('POST', `/verifications/${id}/turns`, { text }),
  complete: (id: string) => send<{ data: Verification & TurnReply }>('POST', `/verifications/${id}/complete`, {}),
  withdraw: (id: string) => send<{ data: Verification }>('POST', `/verifications/${id}/withdraw`, {}),
  cancel: (id: string) => send<{ data: Verification }>('POST', `/verifications/${id}/cancel`, {}),
}
