import type { AssessmentStatus, CheckKey, Doc, Health, Training } from './api'

type Tone = 'success' | 'warning' | 'critical' | 'info' | 'neutral'
export const SOURCE_LABEL: Record<Training['source'], string> = { manual: 'Input HR', elitementor: 'EliteMentor', lms: 'LMS klien' }
export const HEALTH: Record<Health, { text: string; tone: Tone }> = {
  ok: { text: 'Sesuai jadwal', tone: 'success' }, watch: { text: 'Perlu perhatian', tone: 'warning' }, late: { text: 'Terlambat', tone: 'critical' },
}
export const CHECK_LABEL: Record<CheckKey, string> = {
  schedule: 'Jadwal dan tempat', materials: 'Materi', participants: 'Daftar peserta', attendance: 'Daftar kehadiran', assessment: 'Asesmen dan hasil', documentation: 'Dokumentasi',
}
export const CHECK_SHORT: Record<CheckKey, string> = { schedule: 'Jadwal', materials: 'Materi', participants: 'Peserta', attendance: 'Kehadiran', assessment: 'Asesmen', documentation: 'Dokumentasi' }
export const ASSESSMENT: Record<AssessmentStatus, { label: string; text: string }> = {
  none: { label: 'Belum disiapkan', text: 'Pilih cara asesmen supaya dampak pelatihan bisa diukur.' },
  awaiting: { label: 'Menunggu skor dari EliteMentor', text: 'Skor masuk otomatis setelah peserta mengerjakan asesmen di EliteMentor.' },
  synced: { label: 'Skor tersinkron dari EliteMentor', text: 'Semua peserta yang hadir sudah punya skor.' },
  manual_pending: { label: 'Input skor dari vendor, belum lengkap', text: 'Isi skor tiap peserta yang hadir. Skor dari vendor tidak bisa diaudit per jawaban.' },
  manual: { label: 'Skor dari vendor sudah lengkap', text: 'Skor diinput HR dari laporan vendor dan tidak bisa diaudit per jawaban.' },
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const tanggal = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : 'Belum ada')
export function groupLabel(t: Training): { text: string; tone: Tone } {
  if (t.group === 'done') return { text: 'Selesai', tone: 'success' }
  if (t.group === 'cancelled') return { text: 'Dibatalkan', tone: 'neutral' }
  if (t.group === 'upcoming') return { text: 'Akan datang', tone: 'info' }
  return { text: 'Berjalan', tone: 'info' }
}
export const DOC_KIND_LABEL: Record<Doc['kind'], string> = { material: 'materi', photo: 'foto', video: 'video' }
