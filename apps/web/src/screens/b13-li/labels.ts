// Label Indonesia untuk status dan nilai Learning Intervention (API hanya mengirim kunci).
import type { ChipTone } from '@/ui/tones'
import type { DraftStatus, ItemKind, Level, ModuleRow, RequestStatus, StatusKey } from './api'

// Tone UiChip: status di layar LI tampil sebagai chip terisi seperti mockup (P6 K-P6-2); UiStatus global tidak diubah.
type Tone = Extract<ChipTone, 'success' | 'review' | 'training' | 'neutral'>
export const LEVEL_LABEL: Record<Level, string> = { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' }
export const KIND_LABEL: Record<ItemKind, string> = { K: 'Knowledge', S: 'Skill', A: 'Attitude' }

export function statusLabel(key: StatusKey, vendor: string): { text: string; tone: Tone } {
  switch (key) {
    case 'available': return { text: 'Tersedia', tone: 'success' }
    case 'dev_approved': return { text: 'Rancangan disetujui SME, course belum ada', tone: 'training' }
    case 'dev_review': return { text: 'Menunggu tinjauan SME', tone: 'review' }
    case 'dev_draft': return { text: 'Draf pengembangan', tone: 'training' }
    case 'delivered': return { text: `Modul dikirim ${vendor}`, tone: 'training' }
    case 'confirmed': return { text: `Dikonfirmasi ${vendor}`, tone: 'training' }
    case 'requested': return { text: `Diminta ke ${vendor}`, tone: 'review' }
    default: return { text: 'Belum tersedia', tone: 'neutral' }
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
export const pct = (v: number) => `${Math.round(v * 100)}%`
/** Chip Pareto mockup ("Pareto #1 · gap −33"). API tidak mengirim selisih skor, jadi yang tampil porsi gap (share). */
export function priorityLabel(m: Pick<ModuleRow, 'priority'>) {
  if (!m.priority) return ''
  return m.priority.share != null ? `Pareto #${m.priority.rank} · ${pct(m.priority.share)} gap` : `Pareto #${m.priority.rank}`
}
/** Chip jabatan: nama bila satu, "{n} jabatan" bila lebih (mockup `jobsLabel`). */
export function jobChip(m: Pick<ModuleRow, 'jobRoles'>) {
  if (!m.jobRoles.length) return 'Belum ada jabatan'
  return m.jobRoles.length === 1 ? m.jobRoles[0]!.name : `${m.jobRoles.length} jabatan`
}
/** Nama vendor pendek untuk tombol ("Mahaka Institute" → "Mahaka"), K-P6-3. */
export const shortVendor = (v: string) => v.trim().split(/\s+/)[0] || v
