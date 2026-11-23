import type { AssessmentStatus, CheckKey, Doc, Health, Training } from './api'

// Tone UiChip (P7 X-2: status di LD memakai chip terisi seperti mockup; UiStatus global tidak diubah, K-3)
export type Tone = 'training' | 'improvement' | 'review' | 'success' | 'critical' | 'neutral'
export const SOURCE_LABEL: Record<Training['source'], string> = { manual: 'Input manual di ELGOS', elitementor: 'EliteMentor', lms: 'LMS klien' }
export const HEALTH: Record<Health, { text: string; tone: Tone }> = {
  ok: { text: 'Sesuai jadwal', tone: 'success' }, watch: { text: 'Perlu perhatian', tone: 'review' }, late: { text: 'Terlambat', tone: 'critical' },
}
/** Chip jenis pelatihan (K-P7-1: offline = tone tersier, padanan `c-no` mockup). */
export const MODE: Record<Training['mode'], { text: string; tone: Tone }> = { online: { text: 'Online', tone: 'training' }, offline: { text: 'Offline', tone: 'improvement' } }
export const TIER_LABEL: Record<string, string> = { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' }
export const CHECK_LABEL: Record<CheckKey, string> = {
  schedule: 'Jadwal dan tempat', materials: 'Materi', participants: 'Daftar peserta', attendance: 'Daftar kehadiran', assessment: 'Asesmen dan hasil', documentation: 'Dokumentasi',
}
export const CHECK_SHORT: Record<CheckKey, string> = { schedule: 'Jadwal', materials: 'Materi', participants: 'Peserta', attendance: 'Kehadiran', assessment: 'Asesmen', documentation: 'Dokumentasi' }
export const ASSESSMENT: Record<AssessmentStatus, { label: string; text: string }> = {
  none: { label: 'Belum disiapkan', text: 'Pilih cara menjalankan asesmen. Disarankan lewat EliteMentor atau LMS agar skor langsung masuk ke ELGOS tanpa input ulang.' },
  awaiting: { label: 'Menunggu skor dari EliteMentor', text: 'Skor masuk otomatis setelah peserta mengerjakan asesmen di EliteMentor.' },
  synced: { label: 'Skor tersinkron dari EliteMentor', text: 'Semua peserta yang hadir sudah punya skor.' },
  manual_pending: { label: 'Input skor dari vendor, belum lengkap', text: 'Isi skor tiap peserta yang hadir. Skor dari vendor tidak bisa diaudit per jawaban.' },
  manual: { label: 'Skor dari vendor sudah lengkap', text: 'Skor diinput HR dari laporan vendor dan tidak bisa diaudit per jawaban.' },
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const tanggal = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : 'Belum ada')
/** Tanggal pendek tanpa tahun untuk kolom Batas ("30 Nov", mockup LD-5). */
export const tanggalPendek = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : 'Belum ada')
export function groupLabel(t: Training): { text: string; tone: Tone } {
  if (t.group === 'done') return { text: 'Selesai', tone: 'success' }
  if (t.group === 'cancelled') return { text: 'Dibatalkan', tone: 'neutral' }
  if (t.group === 'upcoming') return { text: 'Akan datang', tone: 'review' }
  return { text: 'Berjalan', tone: 'training' }
}
export const DOC_KIND_LABEL: Record<Doc['kind'], string> = { material: 'materi', photo: 'foto', video: 'video' }
