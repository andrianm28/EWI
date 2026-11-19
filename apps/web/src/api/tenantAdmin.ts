// Klien API layar Admin Tenant (B11). Bentuk data mengikuti apps/api/src/modules/tenant-admin; spek docs/designs/b11-admin-tenant.md.
import { ApiError, api } from '@/api/client'
import type { ImportBatch, ImportKind, ImportPreview, Mapping } from '@/api/imports'
import { useSessionStore } from '@/stores/session'

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
const ROOT = '/tenant-admin'

export type UserStatus = 'active' | 'invited' | 'disabled'
export interface AdminUser {
  id: string; name: string | null; email: string; employeeId: string | null; role: string; roleLabel: string
  jobRoleId: string | null; jobRoleName: string | null; careerLevelId: string | null; supervisorId: string | null
  status: UserStatus; lastLoginAt: string | null; pendingLogin: boolean
}
export interface RoleOption { key: string; label: string }
export interface UserInput { name?: string; email?: string; role?: string; employeeId?: string | null; jobRoleId?: string | null; supervisorId?: string | null; status?: 'active' | 'disabled' }
export interface JobRole {
  id: string; name: string; division: string | null; description: string | null; levels: { id: string; name: string }[]
  competencyCount: number; employeeCount: number; dictionary: 'tersedia' | 'belum_tersedia'; sources: string[]
  lastImport: { filename: string; at: string } | null
}
export interface Competency { id: string; name: string; kind: string; source: string | null; definition?: string | null }
export interface LastImport { batchId: string; filename: string; source: string | null; uploadedAt: string; uploadedByName: string | null }
export interface ImportSummary {
  competencyModel: { jobRoleId: string; jobRoleName: string; competencyCount: number; status: 'terimpor' | 'belum'; lastImport: (LastImport & { imported: number | null }) | null }[]
  performance: { period: string; records: number; missed: number; lastImport: LastImport | null }[]
  integrations: {
    elitementor: { status: 'terkonfigurasi' | 'belum_dikonfigurasi'; organizationMapped: boolean; sso: boolean; webhookSync: boolean }
    lms: { targets: string[]; gapExport: boolean }
  }
}
export type ImportArea = 'dna' | 'tna'
/** Jenis impor yang dibuka layar admin (sama dengan IMPORT_KINDS di API). */
export const ADMIN_IMPORT_KIND: Record<ImportArea, string> = { dna: 'dna_competencies', tna: 'tna_performance' }
export const SOURCE_LABEL: Record<string, string> = { berkas: 'Berkas', hris: 'HRIS', okr: 'Sistem OKR', dacum: 'DACUM', hr_rule: 'Aturan HR', cca: 'Core Competencies', both: 'DACUM dan Core Competencies' }

const token = () => useSessionStore().token
const call = <T>(path: string, init: RequestInit = {}) => api<T>(`${ROOT}${path}`, init, token())
const send = <T>(method: string, path: string, body?: unknown) => call<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const tenantAdmin = {
  roles: () => call<{ data: RoleOption[] }>('/roles'),
  users: () => call<{ data: AdminUser[]; meta: { total: number; sso: boolean } }>('/users'),
  inviteUser: (body: UserInput) => send<{ data: AdminUser; invited: boolean }>('POST', '/users', body),
  updateUser: (id: string, body: UserInput) => send<{ data: AdminUser }>('PATCH', `/users/${id}`, body),
  resendInvite: (id: string) => send<{ data: { sent: boolean } }>('POST', `/users/${id}/invite`, {}),
  jobRoles: () => call<{ data: JobRole[] }>('/job-roles'),
  createJobRole: (body: { name: string; division?: string | null }) => send<{ data: JobRole }>('POST', '/job-roles', body),
  updateJobRole: (id: string, body: { name?: string; division?: string | null }) => send<{ data: JobRole }>('PATCH', `/job-roles/${id}`, body),
  competencies: (id: string) => call<{ data: Competency[] }>(`/job-roles/${id}/competencies`),
  importSummary: () => call<{ data: ImportSummary }>('/imports/summary'),
  // alur impor yang sama dengan layar HR, lewat gerbang Admin Tenant
  importKinds: (area: ImportArea) => call<{ data: ImportKind[] }>(`/imports/${area}/templates`),
  async upload(area: ImportArea, file: File) {
    const headers = new Headers({ 'Content-Type': 'application/octet-stream' })
    const t = token()
    if (t) headers.set('Authorization', `Bearer ${t}`)
    const res = await fetch(`${BASE}${ROOT}/imports/${area}/${ADMIN_IMPORT_KIND[area]}?filename=${encodeURIComponent(file.name)}`, { method: 'POST', headers, body: file })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Terjadi kesalahan')
    return body as { data: ImportBatch }
  },
  preview: (area: ImportArea, id: string, mapping: Mapping, options: Record<string, string>) =>
    send<{ data: ImportPreview }>('POST', `/imports/${area}/batches/${id}/preview`, { mapping, options }),
  commit: (area: ImportArea, id: string, mapping: Mapping, options: Record<string, string>) =>
    send<{ data: ImportBatch }>('POST', `/imports/${area}/batches/${id}/commit`, { mapping, options }),
}
