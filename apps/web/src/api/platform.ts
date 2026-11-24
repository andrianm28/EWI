// Klien API konsol Super Admin (B12). Bentuk data sama dengan spek docs/designs/b12-super-admin.md §Bentuk jawaban.
import { ApiError, api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
const ROOT = '/platform'

export type TenantStatus = 'suspended' | 'active' | 'pending_admin' | 'draft'
export interface PlatformTenant {
  id: string; slug: string; name: string; status: TenantStatus
  adminEmail: string | null; users: number; activeModules: number; createdAt: string
}
export interface TenantList { kpis: { tenants: number; activeTenants: number; users: number; modulesAvailable: number }; tenants: PlatformTenant[] }
export interface CreateTenantInput { name: string; adminEmail: string; adminName?: string; id?: string }
export interface CreateTenantResult { tenant: { id: string; slug: string; name: string; status: TenantStatus }; slug: string; invitation: 'sent' | 'failed' }
export interface CheckTenantResult { slug: string; exists: boolean; report: { step: string; status: string; detail: string }[] }
export interface TenantModule {
  key: string; name: string; available: boolean; earlyAccess: boolean; entitled: boolean | null
  flagOn: boolean; killSwitch: boolean; effective: boolean
}
export interface PlatformSettings {
  editable: { sessionIdleMinutes: number; aiHrAgreementTarget: number }
  display: {
    encryption: 'local' | 'kms'; aiModel: { provider: string; model: string }
    ssoTenants: number; idleEnforcedTenants: number; idleEnforcement: 'not_yet' | 'per_tenant'
  }
  encryptionProvider: 'local' | 'kms'
}
export interface AgreementPoint { day: string; reviewed: number; approved: number; agreement: number | null; enoughData: boolean }
export interface AiQualityRow {
  tenantId: string; name: string; reviewed: number; approved: number; agreement: number | null
  meetsTarget: boolean | null; enoughData: boolean; daily: AgreementPoint[]
}
export interface AiCostRow {
  tenantId: string; name: string; week: string; sessions: number; calls: number
  tokensIn: number; tokensOut: number; costUsd: number; costMissing: boolean
}
export interface PlatformLogRow {
  id: string; at: string; actorEmail: string | null; action: 'create' | 'update'; resource: string
  targetTenantName: string | null; meta: Record<string, unknown>
}
export type AttemptOutcome = 'unknown_org' | 'unknown_account' | 'invalid_link'
export interface AttemptRow { day: string; outcome: AttemptOutcome; count: number }

export const TENANT_STATUS: Record<TenantStatus, { label: string; tone: 'success' | 'info' | 'neutral' | 'warning' }> = {
  active: { label: 'Aktif', tone: 'success' },
  pending_admin: { label: 'Menunggu admin', tone: 'info' },
  draft: { label: 'Draf', tone: 'neutral' },
  suspended: { label: 'Ditangguhkan', tone: 'warning' },
}
export const ATTEMPT_LABEL: Record<AttemptOutcome, string> = {
  unknown_org: 'Organisasi tidak dikenal',
  unknown_account: 'Akun tidak dikenal',
  invalid_link: 'Link masuk tidak valid',
}

const token = () => useSessionStore().token

// Jawaban yang bentuknya tidak dikenal menjadi ApiError berpesan, bukan layar kosong (cek data asli 24 Nov).
const BAD_TENANTS = 'Data tenant tidak bisa dibaca. Muat ulang halaman; bila masih gagal, hubungi tim ELGOS.'
const BAD_MODULES = 'Data modul tidak bisa dibaca. Tutup panel lalu coba lagi.'
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const isModule = (x: unknown): x is TenantModule => isObj(x) && typeof x.key === 'string'
function shaped<T>(res: { data: unknown }, ok: (x: unknown) => boolean, message: string): { data: T } {
  if (!isObj(res) || !ok(res.data)) throw new ApiError(200, 'BAD_RESPONSE', message)
  return res as { data: T }
}
const call = <T>(path: string, init: RequestInit = {}) => api<T>(`${ROOT}${path}`, init, token())
const send = <T>(method: string, path: string, body?: unknown) => call<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const platform = {
  tenants: async () => shaped<TenantList>(await call<{ data: unknown }>('/tenants'),
    (x) => isObj(x) && isObj(x.kpis) && Array.isArray(x.tenants), BAD_TENANTS),
  checkTenant: (body: CreateTenantInput) => send<{ data: CheckTenantResult }>('POST', '/tenants?dryRun=1', body),
  createTenant: (body: CreateTenantInput) => send<{ data: CreateTenantResult }>('POST', '/tenants', body),
  reinvite: (tenantId: string) => send<{ data: { invitation: 'sent' } }>('POST', `/tenants/${tenantId}/invite`, {}),
  modules: async (tenantId: string) => shaped<TenantModule[]>(await call<{ data: unknown }>(`/tenants/${tenantId}/modules`),
    (x) => Array.isArray(x) && x.every(isModule), BAD_MODULES),
  setModule: async (tenantId: string, key: string, enabled: boolean) =>
    shaped<TenantModule>(await send<{ data: unknown }>('PUT', `/tenants/${tenantId}/modules/${key}`, { enabled }), isModule, BAD_MODULES),
  settings: () => call<{ data: PlatformSettings }>('/settings'),
  updateSettings: (patch: Partial<PlatformSettings['editable']>) => send<{ data: PlatformSettings }>('PUT', '/settings', patch),
  aiQuality: (days = 30) => call<{ data: AiQualityRow[] }>(`/ai-quality?days=${days}`),
  aiCost: (weeks = 8) => call<{ data: AiCostRow[] }>(`/ai-cost?weeks=${weeks}`),
  log: (limit = 50) => call<{ data: PlatformLogRow[] }>(`/log?limit=${limit}`),
  attempts: (days = 7) => call<{ data: AttemptRow[] }>(`/attempts?days=${days}`),
  /** Unduh CSV biaya token mingguan lewat fetch berotorisasi, lalu simpan sebagai berkas. */
  async downloadCostCsv(weeks = 8) {
    const headers = new Headers()
    const t = token()
    if (t) headers.set('Authorization', `Bearer ${t}`)
    const res = await fetch(`${BASE}${ROOT}/ai-cost?weeks=${weeks}&format=csv`, { headers })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Unduhan gagal')
    }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = 'biaya-ai-mingguan.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
