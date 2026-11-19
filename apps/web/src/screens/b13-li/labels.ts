// Label Indonesia untuk status dan nilai Learning Intervention (API hanya mengirim kunci).
import type { DraftStatus, ItemKind, Level, ModuleRow, RequestStatus, StatusKey } from './api'

type Tone = 'success' | 'warning' | 'critical' | 'info' | 'neutral'
export const LEVEL_LABEL: Record<Level, string> = { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' }
export const KIND_LABEL: Record<ItemKind, string> = { K: 'Knowledge', S: 'Skill', A: 'Attitude' }

export function statusLabel(key: StatusKey, vendor: string): { text: string; tone: Tone } {
  switch (key) {
    case 'available': return { text: 'Tersedia', tone: 'success' }
    case 'dev_approved': return { text: 'Rancangan disetujui SME, course belum ada', tone: 'info' }
    case 'dev_review': return { text: 'Menunggu tinjauan SME', tone: 'warning' }
    case 'dev_draft': return { text: 'Draf pengembangan', tone: 'info' }
    case 'delivered': return { text: `Modul dikirim ${vendor}`, tone: 'info' }
    case 'confirmed': return { text: `Dikonfirmasi ${vendor}`, tone: 'info' }
    case 'requested': return { text: `Diminta ke ${vendor}`, tone: 'warning' }
    default: return { text: 'Belum ada sumber', tone: 'neutral' }
  }
}
export const REQUEST_LABEL: Record<RequestStatus, string> = {
  requested: 'Diminta', confirmed: 'Dikonfirmasi', delivered: 'Modul dikirim', installed: 'Dipasang', cancelled: 'Dibatalkan',
}
export const NEXT_REQUEST: Partial<Record<RequestStatus, { to: RequestStatus; label: string }>> = {
  requested: { to: 'confirmed', label: 'Catat: dikonfirmasi vendor' },
  confirmed: { to: 'delivered', label: 'Catat: modul diterima' },
  delivered: { to: 'installed', label: 'Catat: sudah dipasang' },
}
export const DRAFT_LABEL: Record<DraftStatus, string> = {
  draft: 'Draf, belum diajukan', sme_review: 'Menunggu tinjauan SME', approved: 'Disetujui SME', returned: 'Dikembalikan SME',
}
export const priorityLabel = (m: Pick<ModuleRow, 'priority'>) => (m.priority ? `Prioritas ${m.priority.rank}` : '')
export const jobLabel = (m: Pick<ModuleRow, 'jobRoles'>) => (m.jobRoles.length ? m.jobRoles.map((j) => j.name).join(', ') : 'Belum ada jabatan')
export const pct = (v: number) => `${Math.round(v * 100)}%`
