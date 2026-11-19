// Label tampilan B15. Teks statis mockup (jebakan, prinsip pelaporan) ada di sini, bukan di API (spek bagian 3).
import type { Coverage, Indicator, QueueRow, Strength, Verdict } from './api'

type Tone = 'success' | 'warning' | 'critical' | 'info' | 'neutral'
export const COVERAGE: Record<Coverage, { text: string; tone: Tone }> = {
  measured: { text: 'Terukur', tone: 'success' }, partial: { text: 'Sebagian', tone: 'warning' }, missing: { text: 'Belum ada data', tone: 'neutral' },
}
export const VERDICT: Record<Verdict, { text: string; tone: Tone }> = {
  terkonfirmasi: { text: 'Terkonfirmasi', tone: 'success' }, retensi_turun: { text: 'Retensi turun, perlu penguatan', tone: 'critical' }, belum_diukur: { text: 'Belum diukur', tone: 'neutral' },
}
export const STRENGTH: Record<Strength, { text: string; tone: Tone }> = {
  strong: { text: 'Indikasi kuat', tone: 'success' }, moderate: { text: 'Indikasi sedang', tone: 'info' },
  weak: { text: 'Indikasi lemah', tone: 'warning' }, no_data: { text: 'Belum ada data', tone: 'neutral' },
}
export const QUEUE_STATUS: Record<QueueRow['status'], { text: string; tone: Tone }> = {
  none: { text: 'Belum dijadwalkan', tone: 'warning' }, scheduled: { text: 'Terjadwal', tone: 'info' }, done: { text: 'Selesai', tone: 'success' },
}
export const WINDOW: Record<NonNullable<QueueRow['window']>, string> = { early: 'Belum waktunya', due: 'Waktunya sekarang', late: 'Lewat jendela 6 pekan' }
export const QUESTIONS = [
  { key: 'businessProblem', label: 'Masalah bisnis' },
  { key: 'desiredBehavior', label: 'Perubahan perilaku yang diinginkan' },
  { key: 'priorityCapabilities', label: 'Kapabilitas yang digeser lebih dulu' },
  { key: 'evidencePlan', label: 'Bukti perubahan' },
  { key: 'existingMetrics', label: 'Metrik bisnis yang sudah ada' },
] as const
export const PITFALLS = 'Jangan hanya mengukur yang mudah dikumpulkan seperti penyelesaian kursus, dan jangan menganggap semua program perlu ROI finansial. Pengukuran disesuaikan dengan ukuran dan pentingnya program.'
export const PRINCIPLE = 'Hubungan belajar dan hasil bukan bukti sebab-akibat otomatis; harga, musim, atau perubahan produk juga memengaruhi. ELGOS menampilkan garis bukti dan faktor lain yang perlu dicek.'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const tanggal = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '—')
export const score = (v: number | null) => (v === null ? '—' : String(v))
/** Nilai indikator dengan satuan: "92 mnt", "11%". */
export function withUnit(v: number | null, unit: string | null) {
  if (v === null) return '—'
  const n = String(v).replace('.', ',')
  if (!unit) return n
  return unit === '%' ? `${n}%` : `${n} ${unit}`
}
export const targetText = (i: Indicator) => (i.target === null ? '—' : `${i.direction === 'lower_better' ? '≤' : '≥'} ${withUnit(i.target, i.unit)}`)
