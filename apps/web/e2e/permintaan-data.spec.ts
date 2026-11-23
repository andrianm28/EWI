import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, navigasi } from './support/sesi'
import { mockApi, cocok } from './support/api'

// B8: antrean HR untuk permintaan data karyawan (keputusan user 23 Nov: layar HR minimal di PR B8 web).
// Spek: docs/designs/b8-karyawan.md "Layar HR: Permintaan data". API di-mock.

interface Kirim { method: string; path: string; body: unknown }
const ROWS = () => [
  { id: 'r1', userId: 'u-ani', userName: 'Ani', type: 'delete_data', status: 'open', reason: 'Resign', createdAt: '2026-11-18T03:00:00.000Z', dueAt: '2026-11-21T03:00:00.000Z', overdue: true, resolvedAt: null, resolvedByName: null },
  { id: 'r2', userId: 'u-beni', userName: 'Beni', type: 'withdraw_consent', status: 'open', reason: null, createdAt: '2026-11-22T03:00:00.000Z', dueAt: null, overdue: false, resolvedAt: null, resolvedByName: null },
  { id: 'r3', userId: 'u-hr', userName: 'Saya HR', type: 'withdraw_consent', status: 'open', reason: null, createdAt: '2026-11-22T04:00:00.000Z', dueAt: null, overdue: false, resolvedAt: null, resolvedByName: null },
]

async function buka(page: Page) {
  const sent: Kirim[] = []
  let rows = ROWS()
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /dashboard')) return { json: { data: {} } }
    if (cocok(req, 'GET /employees/data-requests')) {
      const st = req.query.get('status') ?? 'open'
      return { json: { data: st === 'all' ? rows : rows.filter((r) => r.status === st) } }
    }
    const f = cocok(req, 'POST /employees/data-requests/:id/fulfill')
    if (f) {
      sent.push({ method: 'POST', path: req.path, body: req.body })
      rows = rows.map((r) => (r.id === f.id ? { ...r, status: 'done', resolvedAt: '2026-11-23T03:00:00.000Z', resolvedByName: 'HR Contoh' } : r))
      const erase = (req.body as { erase?: boolean }).erase === true
      return { json: { data: erase ? { erased: true, deletedTurns: 12, deletedFindings: 2, deletedPlanItems: 1 } : { erased: false } } }
    }
    const d = cocok(req, 'DELETE /employees/:userId')
    if (d) { sent.push({ method: 'DELETE', path: req.path, body: null }); rows = rows.filter((r) => r.userId !== d.userId); return { json: { data: { deleted: true, userId: d.userId } } } }
    return undefined
  })
  await loginSebagai(page, 'hr')
  await navigasi(page).getByRole('link', { name: 'Permintaan data karyawan' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Permintaan data karyawan' })).toBeVisible()
  return sent
}

test('HR melihat antrean: tenggat, lewat tenggat, dan permintaannya sendiri tanpa tombol', async ({ page }) => {
  await buka(page)
  const ani = page.getByTestId('dsr-r1')
  await expect(ani).toContainText('Ani')
  await expect(ani).toContainText('Hapus data')
  await expect(ani).toContainText('Lewat tenggat')
  await expect(ani).toContainText('Alasan: Resign')
  await expect(page.getByTestId('dsr-r2')).toContainText('Tarik persetujuan wawancara')
  const sendiri = page.getByTestId('dsr-r3')
  await expect(sendiri).toContainText('Permintaan Anda sendiri diproses HR lain atau Admin ETA.')
  await expect(sendiri.getByRole('button')).toHaveCount(0)
})

test('tarik persetujuan: Tutup tanpa hapus, atau Tutup dan hapus lewat konfirmasi', async ({ page }) => {
  const sent = await buka(page)
  const beni = page.getByTestId('dsr-r2')
  await beni.getByRole('button', { name: 'Tutup dan hapus data wawancara' }).click()
  const panel = page.getByRole('region', { name: 'Konfirmasi hapus data wawancara' })
  await expect(panel).toContainText('tidak bisa dibatalkan')
  await panel.getByRole('button', { name: 'Ya, hapus data wawancara' }).click()
  await expect(page.getByRole('status')).toHaveText('Permintaan Beni ditutup. Dihapus: 12 giliran percakapan, 2 temuan, 1 rencana.')
  await expect(page.getByTestId('dsr-r2')).toHaveCount(0)
  expect(sent).toEqual([{ method: 'POST', path: '/employees/data-requests/r2/fulfill', body: { erase: true } }])
})

test('hapus data: menghapus akun karyawan lewat konfirmasi; filter Selesai memuat ulang', async ({ page }) => {
  const sent = await buka(page)
  await page.getByTestId('dsr-r1').getByRole('button', { name: 'Hapus akun dan data karyawan' }).click()
  await page.getByRole('region', { name: 'Konfirmasi hapus akun' }).getByRole('button', { name: 'Ya, hapus akun Ani' }).click()
  await expect(page.getByRole('status')).toHaveText('Akun dan data Ani dihapus.')
  expect(sent).toEqual([{ method: 'DELETE', path: '/employees/u-ani', body: null }])
  await page.getByTestId('dsr-r2').getByRole('button', { name: 'Tutup', exact: true }).click()
  await page.getByRole('group', { name: 'Status permintaan' }).getByRole('button', { name: 'Selesai' }).click()
  await expect(page.getByTestId('dsr-r2')).toContainText('Ditutup HR Contoh')
})
