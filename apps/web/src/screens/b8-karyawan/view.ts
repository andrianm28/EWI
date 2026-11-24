// Fungsi murni layar B8 (label dan pilihan tombol), dipakai "Hasil saya" dan "Rencana belajar".
// Spek: docs/designs/b8-karyawan.md "Layar web".
// Angka memakai formatter bersama (koma desimal id-ID, paritas P8 R4).
import { EMPTY, formatNumber } from '@/ui/format'
import type { StatusTone } from '@/ui/tones'
import type { DataRequestType, LearningCard, MyCompetencyStatus, MyResults } from '@/api/lna'

type Tone = Exclude<StatusTone, 'info'>

/** Status kompetensi mengikuti mockup (Menguasai / Sebagian / Belum), plus "Belum dinilai". */
export const COMPETENCY_STATUS: Record<MyCompetencyStatus, { label: string; tone: Tone }> = {
  met: { label: 'Menguasai', tone: 'success' },
  partial: { label: 'Sebagian', tone: 'warning' },
  gap: { label: 'Belum', tone: 'critical' },
  not_assessed: { label: 'Belum dinilai', tone: 'neutral' },
}

export function competencyStatus(status: string): { label: string; tone: Tone } {
  return COMPETENCY_STATUS[status as MyCompetencyStatus] ?? COMPETENCY_STATUS.not_assessed
}

export function scoreText(score: number | null, required: number): string {
  return `${score === null ? EMPTY : formatNumber(score)} / ${formatNumber(required)}`
}

// Label tampilan karyawan mengikuti mockup ("Belum dimulai"), sengaja berbeda dari PLAN_STATUS_LABEL HR di api/lna.ts.
export const PLAN_STATUS_LABEL: Record<LearningCard['status'], string> = {
  new: 'Belum dimulai',
  in_progress: 'Sedang berjalan',
  completed: 'Selesai',
}

export function planStatusLabel(card: Pick<LearningCard, 'status' | 'courseScore'>): string {
  if (card.status === 'completed' && card.courseScore !== null) return `Selesai · skor ${formatNumber(card.courseScore)}`
  return PLAN_STATUS_LABEL[card.status] ?? card.status
}

/** "Belum dimulai: 1 · Sedang berjalan: 2 · Selesai: 1"; status bernilai 0 dilewati. */
export function planSummary(byStatus: Record<string, number>): string {
  return (Object.keys(PLAN_STATUS_LABEL) as LearningCard['status'][])
    .filter((k) => (byStatus[k] ?? 0) > 0)
    .map((k) => `${PLAN_STATUS_LABEL[k]}: ${byStatus[k]}`)
    .join(' · ')
}

/** Teks tombol tautan keluar ke tempat belajar. */
export function launchLabel(card: Pick<LearningCard, 'status' | 'where'> & { mode?: string | null }): string {
  if (card.status === 'completed') return `Buka ${card.where.label}`
  // LI-2: pelatihan offline diujikan di tempat lewat EliteMentor/LMS
  return isOffline(card.mode) ? `Ujian di ${card.where.label}` : `Belajar dengan ${card.where.label}`
}

const isOffline = (mode?: string | null) => (mode ?? '').toLowerCase() === 'offline'
/** LI-1 / K-P7-1: chip mode online = training, offline = tersier (padanan `c-no` mockup). */
export function modeTone(mode: string): 'training' | 'improvement' | 'neutral' {
  if (isOffline(mode)) return 'improvement'
  return mode.toLowerCase() === 'online' ? 'training' : 'neutral'
}

type Invitation = NonNullable<MyResults['invitations']>[number]

/** Tombol undangan wawancara: mulai, lanjutkan, atau tidak ada (undangan lewat). */
export function inviteAction(inv: Pick<Invitation, 'canStart' | 'canContinue'>): 'Mulai wawancara' | 'Lanjutkan wawancara' | null {
  if (inv.canContinue) return 'Lanjutkan wawancara'
  if (inv.canStart) return 'Mulai wawancara'
  return null
}

export const REQUEST_STATUS_LABEL: Record<'open' | 'done' | 'cancelled', string> = { open: 'Terbuka', done: 'Selesai', cancelled: 'Dibatalkan' }

/**
 * Akun ber-peran utama HR atau Admin ETA tidak meminta hapus lewat Data saya; sama dengan pemeriksaan API
 * (peran utama akun, bukan peran aktif B2) dan DELETE /employees/:userId.
 */
export function isAdminAccount(user: { role: string; primaryRole?: string } | null): boolean {
  const main = user?.primaryRole || user?.role
  return main === 'hr_admin' || main === 'eta_admin'
}

export const REQUEST_LABEL: Record<DataRequestType, string> = {
  withdraw_consent: 'Tarik persetujuan wawancara',
  delete_data: 'Hapus data',
}
