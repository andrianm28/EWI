import type { Penangan, ResponsApi } from './api'
import { cocok } from './api'

// B8 "Hasil saya" (GET /my/results) dan permintaan data sendiri (GET /employees/me/data-requests): satu sumber data
// untuk spec paket (b8-karyawan.spec.ts) dan jalur 3 B18 (alur/jalur-utama.spec.ts).

export const SESI_UNDANGAN = 's1'

/** Isi /my/results untuk pengguna `me`; `ubah` menimpa bagian tingkat atas (mis. `competencies: null`). */
export function hasilSaya(me: string, ubah: Record<string, unknown> = {}) {
  return {
    person: { id: me, name: 'Dimas', jobRoleName: 'Engineer Service Delivery', careerLevelName: 'L1' },
    competencies: {
      items: [
        { competencyId: 'c1', code: 'ST-B4', name: 'Manajemen tiket', required: 3, score: 3, status: 'met' },
        { competencyId: 'c2', code: null, name: 'Analisis insiden', required: 4, score: 3, status: 'partial' },
        { competencyId: 'c3', code: 'TC-I1', name: 'Otomasi infrastruktur', required: 4, score: 1, status: 'gap' },
        { competencyId: 'c4', code: 'ST-A2', name: 'Komunikasi pelanggan', required: 2, score: null, status: 'not_assessed' },
      ],
      summary: { total: 4, assessed: 3, met: 1, partial: 1, gaps: 1 },
    },
    invitations: [{ sessionId: SESI_UNDANGAN, submodule: 'tna', status: 'scheduled', inviteExpiresAt: '2026-12-05T16:59:59.000Z', expired: false, canStart: true, canContinue: false, consentVersionRequired: 'tna-consent-id-v1.0' }],
    interviews: [],
    plan: { total: 0, byStatus: {} },
    privacy: { exportPath: `/api/employees/${me}/export`, requestsPath: '/api/employees/me/data-requests', openRequests: [] },
    ...ubah,
  }
}

/** Penangan dasar Hasil saya; pasang dengan mockApiDasar supaya kalah dari mock milik test. */
export function penanganHasilSaya(me: string, ubah: Record<string, unknown> = {}): Penangan {
  const data = (d: unknown): ResponsApi => ({ json: { data: d } })
  return (req) => {
    if (cocok(req, 'GET /my/results')) return data(hasilSaya(me, ubah))
    if (cocok(req, 'GET /employees/me/data-requests')) return data([])
    return undefined
  }
}
