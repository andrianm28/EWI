// R3-3: impor file XLSX/CSV dengan template ELGOS (unggah -> petakan kolom -> pratinjau -> simpan).
import { ApiError, api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type Submodule = 'dna' | 'tna' | 'cca' | 'lim'
export interface ImportField { key: string; header: string; required: boolean; oneOf: string | null; help: string | null; example: string | number | null }
export interface ImportOption { key: string; label: string; type: 'text' | 'date' | 'project' | 'lim_plan'; required?: boolean }
export interface ImportKind { key: string; label: string; description: string; fields: ImportField[]; options: ImportOption[] }
export type Mapping = Record<string, string | null>
export interface ImportResult { imported: number; rejectedCount: number; rejected: { row: number; reason: string }[]; [k: string]: unknown }
export interface ImportBatch {
  id: string; kind: string; filename: string; status: 'uploaded' | 'committed'; rowCount: number; headers: string[]
  mapping: Mapping; options: Record<string, string>; result: ImportResult | null; createdAt: string; committedAt: string | null
  createdByName: string | null; sample?: Record<string, unknown>[]
}
export interface ImportPreview {
  valid: number; rejectedCount: number; rejected: { row: number; reason: string }[]
  sample: { row: number; values: Record<string, unknown> }[]
}

const token = () => useSessionStore().token
const call = <T>(path: string, init: RequestInit = {}) => api<T>(path, init, token())
const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) })

/** fetch dengan token untuk respons non-JSON (unduhan file). Dipakai juga oleh lna.ts. */
export async function raw(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const t = token()
  if (t) headers.set('Authorization', `Bearer ${t}`)
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Terjadi kesalahan')
  }
  return res
}

/** Mengunduh `path` (dengan token) sebagai berkas `filename`. */
export async function downloadFile(path: string, filename: string) {
  const res = await raw(path)
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const imports = {
  templates: (sm: Submodule) => call<{ data: ImportKind[] }>(`/${sm}/imports/templates`),
  history: (sm: Submodule) => call<{ data: ImportBatch[] }>(`/${sm}/imports/batches`),
  async upload(sm: Submodule, kind: string, file: File) {
    const res = await raw(`/${sm}/imports/${kind}?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
    })
    return (await res.json()) as { data: ImportBatch }
  },
  preview: (sm: Submodule, id: string, mapping: Mapping, options: Record<string, string>) =>
    post<{ data: ImportPreview }>(`/${sm}/imports/batches/${id}/preview`, { mapping, options }),
  commit: (sm: Submodule, id: string, mapping: Mapping, options: Record<string, string>) =>
    post<{ data: ImportBatch }>(`/${sm}/imports/batches/${id}/commit`, { mapping, options }),
  /** R3-2: undang karyawan yang belum pernah masuk (link email berlaku 7 hari). */
  invitePending: () => post<{ data: { sent: number } }>('/invitations', {}),
  /** Unduh template lewat fetch (butuh token), lalu simpan sebagai file. */
  async downloadTemplate(sm: Submodule, kind: string, format: 'xlsx' | 'csv') {
    await downloadFile(`/${sm}/imports/templates/${kind}.${format}`, `template-elgos-${kind}.${format}`)
  },
}
