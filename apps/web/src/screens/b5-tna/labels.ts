// Label tampilan papan gap (B5 bagian 16). Satu peta dipakai tabel, detail, dan ringkasan.
import { formatNumber } from '@/ui/format'
import type { Classification } from './api'

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  training: 'Training Needs', non_training: 'Improvement Needs', review: 'Perlu ditinjau HR', pending: 'Belum diwawancarai', ok: 'Dalam batas',
}
export const CLASSIFICATION_TONE: Record<Classification, 'training' | 'improvement' | 'review' | 'neutral' | 'success'> = {
  training: 'training', non_training: 'improvement', review: 'review', pending: 'neutral', ok: 'success',
}
export const interviewStatus = (r: { interviewedCount: number; assignedCount: number }) => `${r.interviewedCount} selesai · ${r.assignedCount} berjalan`
export const pct = (share: number) => `${Math.round(share * 100)}%`
/** Nilai OKR/skor lewat formatter bersama (paritas P8, R4): koma desimal id-ID, satuan di belakang. */
export const num = (v: number | null | undefined, unit?: string | null) => (v === null || v === undefined ? '–' : `${formatNumber(v)}${unit ? ` ${unit}` : ''}`)
