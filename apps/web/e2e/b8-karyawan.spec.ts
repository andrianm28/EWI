import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, type OpsiSesi, type Peran } from './support/sesi'
import { mockApi, cocok, type ResponsApi } from './support/api'

// B8 layar web: "Hasil saya" (rute my) dan "Rencana belajar" (rute li). Spek: docs/designs/b8-karyawan.md "Layar web".
// API di-mock lewat support/ B18.

const ON = { 'learner.home': true }
const data = (d: unknown, status = 200): ResponsApi => ({ status, json: { data: d } })

function hasil(me: string, over: Record<string, unknown> = {}) {
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
    invitations: [{ sessionId: 's1', submodule: 'tna', status: 'scheduled', inviteExpiresAt: '2026-12-05T16:59:59.000Z', expired: false, canStart: true, canContinue: false, consentVersionRequired: 'tna-consent-id-v1.0' }],
    interviews: [],
    plan: { total: 0, byStatus: {} },
    privacy: { exportPath: `/api/employees/${me}/export`, requestsPath: '/api/employees/me/data-requests', openRequests: [] },
    ...over,
  }
}

async function masuk(page: Page, peran: Peran = 'karyawan', opsi: OpsiSesi = {}, over: Record<string, unknown> = {}) {
  const me = `u-${peran}`
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /my/results')) return data(hasil(me, over))
    return undefined
  })
  return loginSebagai(page, peran, { ...opsi, flags: { ...ON, ...opsi.flags } })
}

test('karyawan mendarat di Hasil saya dengan skor vs target dan status kompetensi', async ({ page }) => {
  await masuk(page)
  await expect(page).toHaveURL(/\/my$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Hasil saya' })).toBeVisible()
  await expect(page.getByText('Posisi: Engineer Service Delivery · L1.')).toBeVisible()
  const tabel = page.getByRole('table')
  await expect(tabel.getByRole('row', { name: /ST-B4.*Manajemen tiket.*3 \/ 3.*Menguasai/ })).toBeVisible()
  await expect(tabel.getByRole('row', { name: /—.*Analisis insiden.*3 \/ 4.*Sebagian/ })).toBeVisible()
  await expect(tabel.getByRole('row', { name: /TC-I1.*Otomasi infrastruktur.*1 \/ 4.*Belum/ })).toBeVisible()
  await expect(tabel.getByRole('row', { name: /ST-A2.*Komunikasi pelanggan.*— \/ 2.*Belum dinilai/ })).toBeVisible()
})
