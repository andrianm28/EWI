import { test, expect, type Page } from '@playwright/test'
import { loginSebagai } from '../support/sesi'
import { mockApi, cocok, permintaanBelumDimock } from '../support/api'
import { fixture } from '../support/fixture'

// B18 (docs/designs/b18-e2e-qa-malam.md 4.2): antarmuka support/ yang dipakai spec alur dan spec paket.
// Seam: loginSebagai (diamati lewat shell) dan mockApi (diamati lewat fetch dari halaman).
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigasi utama' })
interface Jawaban { status: number; body: { data?: unknown; error?: unknown } }
const ambil = (page: Page, path: string, init?: { method: string; body?: unknown }): Promise<Jawaban> => page.evaluate(async ({ path, init }) => {
  const res = await fetch(`/api${path}`, init ? { method: init.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : undefined)
  return { status: res.status, body: (await res.json()) as { data?: unknown; error?: unknown } }
}, { path, init })

test('loginSebagai HR: masuk lewat tautan email, identitas dan menu sesuai peran', async ({ page }) => {
  const user = await loginSebagai(page, 'hr')
  expect(user.role).toBe('hr_admin')
  await expect(page.getByTestId('identitas')).toHaveText('HR / L&D · hr@contoh.test')
  await expect(nav(page).getByRole('link', { name: 'Training Needs' })).toBeVisible()
})

test('loginSebagai karyawan: tampilan Karyawan tanpa pemilih tampilan', async ({ page }) => {
  await loginSebagai(page, 'karyawan')
  await expect(page.getByTestId('identitas')).toContainText('Karyawan')
  await expect(page.getByRole('group', { name: 'Tampilan' })).toHaveCount(0)
})

test('loginSebagai: flag yang dimatikan menyembunyikan butir modulnya', async ({ page }) => {
  await loginSebagai(page, 'hr', { flags: { 'module.tna': false } })
  await expect(nav(page).getByRole('link', { name: 'Developmental Needs' })).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'Training Needs' })).toHaveCount(0)
})

test('mockApi menang atas mock sesi walau didaftarkan lebih dulu', async ({ page }) => {
  await mockApi(page, (req) => (req.path === '/me/access'
    ? { json: { submodules: ['dna', 'tna'], products: ['full_suite'], flags: { 'module.dna': true, 'module.tna': false } } }
    : undefined))
  await loginSebagai(page, 'hr')
  await expect(nav(page).getByRole('link', { name: 'Training Needs' })).toHaveCount(0)
})

test('mockApi: parameter path, query, body, dan state antar-permintaan', async ({ page }) => {
  await loginSebagai(page, 'hr')
  let jawaban = 0
  await mockApi(page, (req) => {
    const p = cocok(req, 'POST /tna/sessions/:id/turns')
    if (!p) return undefined
    jawaban += 1
    return { status: 201, json: { data: { sesi: p.id, ke: jawaban, mode: req.query.get('mode'), teks: (req.body as { text: string }).text } } }
  })
  expect(await ambil(page, '/tna/sessions/s-1/turns?mode=uji', { method: 'POST', body: { text: 'jawaban pertama' } }))
    .toEqual({ status: 201, body: { data: { sesi: 's-1', ke: 1, mode: 'uji', teks: 'jawaban pertama' } } })
  expect((await ambil(page, '/tna/sessions/s-1/turns', { method: 'POST', body: { text: 'kedua' } })).body.data).toMatchObject({ ke: 2 })
})

test('permintaan yang tidak di-mock dijawab 404 BELUM_DIMOCK dan dicatat', async ({ page }) => {
  await loginSebagai(page, 'hr')
  const r = await ambil(page, '/tidak/ada')
  expect(r).toEqual({ status: 404, body: { error: { code: 'BELUM_DIMOCK', message: 'Tidak di-mock: GET /tidak/ada' } } })
  expect(permintaanBelumDimock(page)).toContain('GET /tidak/ada')
})

test('fixture data/ dipakai lewat mockApi (respons API sungguhan yang ditangkap ulang)', async ({ page }) => {
  await loginSebagai(page, 'karyawan')
  const temuan = fixture('tna-temuan')
  await mockApi(page, (req) => (cocok(req, 'GET /tna/findings') ? { json: temuan } : undefined))
  const r = await ambil(page, '/tna/findings?projectId=00000000-0000-4000-8000-000000000005')
  expect(r.body.data).toEqual([expect.objectContaining({ userName: 'Rina Contoh', category: 'training' })])
})
