// Fungsi murni layar B8 (label dan pilihan tombol), dipakai "Hasil saya" dan "Rencana belajar".
// Spek: docs/designs/b8-karyawan.md "Layar web".
import type { LearningCard, MyCompetencyStatus, MyResults } from '@/api/lna'

type Tone = 'success' | 'warning' | 'critical' | 'neutral'

/** Status kompetensi mengikuti mockup (Menguasai / Sebagian / Belum), plus "Belum dinilai". */
export const COMPETENCY_STATUS: Record<MyCompetencyStatus, { label: string; tone: Tone }> = {
  met: { label: 'Menguasai', tone: 'success' },
  partial: { label: 'Sebagian', tone: 'warning' },
  gap: { label: 'Belum', tone: 'critical' },
  not_assessed: { label: 'Belum dinilai', tone: 'neutral' },
}

export function scoreText(score: number | null, required: number): string {
  return `${score ?? '—'} / ${required}`
}

// Label tampilan karyawan mengikuti mockup ("Belum dimulai"), sengaja berbeda dari PLAN_STATUS_LABEL HR di api/lna.ts.
export const PLAN_STATUS_LABEL: Record<LearningCard['status'], string> = {
  new: 'Belum dimulai',
  in_progress: 'Sedang berjalan',
  completed: 'Selesai',
}

export function planStatusLabel(card: Pick<LearningCard, 'status' | 'courseScore'>): string {
  if (card.status === 'completed' && card.courseScore !== null) return `Selesai · skor ${card.courseScore}`
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
export function launchLabel(card: Pick<LearningCard, 'status' | 'where'>): string {
  return card.status === 'completed' ? `Buka ${card.where.label}` : `Belajar dengan ${card.where.label}`
}

type Invitation = NonNullable<MyResults['invitations']>[number]

/** Tombol undangan wawancara: mulai, lanjutkan, atau tidak ada (undangan lewat). */
export function inviteAction(inv: Pick<Invitation, 'canStart' | 'canContinue'>): 'Mulai wawancara' | 'Lanjutkan wawancara' | null {
  if (inv.canContinue) return 'Lanjutkan wawancara'
  if (inv.canStart) return 'Mulai wawancara'
  return null
}

export const REQUEST_LABEL: Record<string, string> = {
  withdraw_consent: 'Tarik persetujuan wawancara',
  delete_data: 'Hapus data',
}
