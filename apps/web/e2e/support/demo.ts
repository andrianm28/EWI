import { cocok, responsData as data, type Penangan } from './api'
import { semuaModulDengan, type OpsiSesi } from './sesi'
import { DASHBOARD_HR } from './dashboard'
import { ID_KOMPETENSI } from './tna-gap'

// Demo langsung 25 Nov (mockup Pak Eji): flag dan data tambahan untuk e2e/demo-alur.spec.ts.
// Semua flag layar mockup menyala, termasuk lim.reinterview (wawancara ulang LIM, spek B15 12.9).

/** Flag yang dinyalakan untuk demo, di atas SEMUA_MODUL. */
export const FLAG_DEMO: Record<string, boolean> = {
  'tna.interview_assignment': true, 'tna.interview_summary': true, 'tna.review_workspace': true,
  'cca.interview': true, 'dna.development': true, 'ina.ai_verification': true, assistant: true,
  'lim.reinterview': true,
}

/** Sesi demo: semua modul dan layar mockup. */
export const SESI_DEMO = (opsi: Omit<OpsiSesi, 'flags'> = {}): OpsiSesi => semuaModulDengan(FLAG_DEMO, opsi)

/** Dashboard HR demo: baris Pareto teratas menunjuk gap Analisis insiden yang ada di papan gap (support/tna-gap). */
export const DASHBOARD_DEMO = {
  ...DASHBOARD_HR,
  pareto: {
    ...DASHBOARD_HR.pareto,
    rows: [{ ...DASHBOARD_HR.pareto.rows[0]!, key: ID_KOMPETENSI, competencyId: ID_KOMPETENSI, label: 'Analisis insiden' }, ...DASHBOARD_HR.pareto.rows.slice(1)],
  },
}

export const penanganDashboardDemo: Penangan = (req) => (cocok(req, 'GET /dashboard') ? data(DASHBOARD_DEMO) : undefined)

const LABEL_PERAN: Record<string, string> = { karyawan: 'Karyawan', atasan: 'Atasan', hr: 'HR / L&D', admin: 'Admin Tenant' }

/**
 * Permintaan yang dikirim shell di setiap layar: Asisten ELGOS (B17) dan pengingat verifikasi INA.
 * `pendingVerifications` bawaan 0 supaya pengingat tidak menutupi layar demo.
 */
export const penanganShellDemo: Penangan = (req) => {
  if (cocok(req, 'GET /assistant')) {
    const view = req.query.get('view') ?? 'karyawan'
    const roleLabel = LABEL_PERAN[view] ?? 'Karyawan'
    return data({
      view, roleLabel,
      greeting: `Halo, saya Asisten ELGOS. Tanyakan apa pun tentang urusan Anda sebagai ${roleLabel} di sini.`,
      suggestions: ['Apa yang perlu saya lakukan hari ini?'],
      disclaimer: `Hanya menjawab dari data yang boleh Anda lihat sebagai ${roleLabel}. Jawaban dicatat di log audit.`,
      views: [{ key: view, label: roleLabel }],
    })
  }
  if (cocok(req, 'POST /assistant/ask')) return data({ answer: 'Ada 4 temuan menunggu tinjauan HR.', action: null, outcome: 'answered' })
  if (cocok(req, 'GET /ina/access/me')) return data({ level: null, pendingVerifications: 0 })
  return undefined
}
