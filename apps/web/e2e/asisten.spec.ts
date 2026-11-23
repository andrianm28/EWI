import { test, expect, type Page } from '@playwright/test'
import { cocok, mockApi, responsData, type PermintaanApi } from './support/api'
import { penanganHasilSaya } from './support/hasil-saya'
import { loginSebagai, semuaModulDengan, SEMUA_MODUL, type Peran } from './support/sesi'

// Paritas S1 / X-1: panel Asisten ELGOS (B17). Spek: docs/designs/paritas-mockup/b17-asisten-web.md

const DENGAN_ASISTEN = semuaModulDengan({ assistant: true })

const LABEL: Record<string, string> = { karyawan: 'Karyawan', atasan: 'Atasan', hr: 'HR / L&D', super: 'Super Admin' }
const SARAN: Record<string, string[]> = {
  karyawan: ['Apa rencana belajar saya?', 'Ada wawancara yang perlu saya ikuti?'],
  atasan: ['Bagaimana status wawancara tim saya?'],
  hr: ['Apa yang perlu saya lakukan hari ini?', 'Gap terbesar apa?'],
  super: ['Apa yang perlu saya lakukan hari ini?'],
}

interface OpsiAsisten {
  jawab?: (req: PermintaanApi) => { status?: number; json: unknown }
}

/** Me-mock GET /assistant dan POST /assistant/ask; mengembalikan daftar permintaan yang diterima. */
async function mockAsisten(page: Page, o: OpsiAsisten = {}) {
  const diterima: PermintaanApi[] = []
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /assistant')) {
      diterima.push(req)
      const view = req.query.get('view') ?? 'karyawan'
      const roleLabel = LABEL[view] ?? 'Karyawan'
      return responsData({
        view, roleLabel,
        greeting: `Halo, saya Asisten ELGOS. Tanyakan apa pun tentang urusan Anda sebagai ${roleLabel} di sini.`,
        suggestions: SARAN[view] ?? [],
        disclaimer: `Hanya menjawab dari data yang boleh Anda lihat sebagai ${roleLabel}. Jawaban dicatat di log audit.`,
        views: [{ key: view, label: roleLabel }],
      })
    }
    if (cocok(req, 'POST /assistant/ask')) {
      diterima.push(req)
      if (o.jawab) return o.jawab(req)
      return responsData({ answer: 'Rencana belajar Anda: Ticket Life Cycle (Basic, online).', action: { page: 'li', label: 'Rencana belajar' }, outcome: 'answered' })
    }
    return undefined
  })
  return diterima
}

const fab = (page: Page) => page.getByRole('button', { name: 'Buka Asisten ELGOS' })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Asisten ELGOS' })

async function masuk(page: Page, peran: Peran, opsi = DENGAN_ASISTEN) {
  await mockApi(page, penanganHasilSaya(`u-${peran}`))
  return loginSebagai(page, peran, opsi)
}

test('flag assistant mati: tidak ada tombol asisten', async ({ page }) => {
  await mockAsisten(page)
  await masuk(page, 'hr', SEMUA_MODUL)
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
  await expect(fab(page)).toHaveCount(0)
})

test('halaman login tidak menampilkan asisten', async ({ page }) => {
  await page.route('**/api/**', (r) => r.fulfill({ json: { data: [] } }))
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Masuk ke ELGOS' })).toBeVisible()
  await expect(fab(page)).toHaveCount(0)
})

for (const peran of ['karyawan', 'atasan', 'hr', 'super'] as const) {
  test(`${peran}: FAB membuka panel dengan label peran, salam, saran, dan catatan kaki`, async ({ page }) => {
    const diterima = await mockAsisten(page)
    await masuk(page, peran)
    await fab(page).click()
    const p = panel(page)
    await expect(p).toBeVisible()
    await expect(fab(page)).toHaveCount(0)
    await expect(p).toContainText(`Tanyakan urusan Anda · ${LABEL[peran]}`)
    await expect(p).toContainText(`Halo, saya Asisten ELGOS. Tanyakan apa pun tentang urusan Anda sebagai ${LABEL[peran]} di sini.`)
    for (const s of SARAN[peran]!) await expect(p.getByRole('button', { name: s })).toBeVisible()
    await expect(p).toContainText(`Hanya menjawab dari data yang boleh Anda lihat sebagai ${LABEL[peran]}. Jawaban dicatat di log audit.`)
    await expect(p.getByRole('textbox', { name: 'Pertanyaan' })).toBeFocused()
    await expect(p.getByRole('textbox', { name: 'Pertanyaan' })).toHaveAttribute('placeholder', 'Tanya apa saja')
    expect(diterima[0]!.query.get('view')).toBe(peran)
  })
}

test('Admin Tenant: tidak ada asisten (di luar lingkup B17)', async ({ page }) => {
  await mockAsisten(page)
  await masuk(page, 'admin')
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
  await expect(fab(page)).toHaveCount(0)
})

test('karyawan bertanya, mendapat jawaban dengan tombol Buka, panel tetap terbuka setelah pindah halaman', async ({ page }) => {
  const diterima = await mockAsisten(page)
  await masuk(page, 'karyawan')
  await fab(page).click()
  const p = panel(page)
  const input = p.getByRole('textbox', { name: 'Pertanyaan' })
  await input.fill('Apa rencana belajar saya?')
  await input.press('Enter')
  await expect(p.getByText('Rencana belajar Anda: Ticket Life Cycle (Basic, online).')).toBeVisible()
  await expect(p.locator('.b17-msg--me')).toHaveText(/Anda\s*Apa rencana belajar saya\?/)
  await expect(input).toHaveValue('')
  const ask = diterima.find((r) => r.method === 'POST')!
  expect(ask.body).toEqual({ question: 'Apa rencana belajar saya?', view: 'karyawan' })

  // Rencana belajar dimuat tanpa galat (ringkasan galat halaman itu sendiri sengaja mengambil fokus)
  await mockApi(page, (req) => (cocok(req, 'GET /my/learning-plan') ? { json: { data: [], delivery: null } } : undefined))
  await p.getByRole('button', { name: 'Buka Rencana belajar' }).click()
  await expect(page).toHaveURL(/\/li$/)
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).getByText('Rencana belajar Anda: Ticket Life Cycle (Basic, online).')).toBeVisible()
  await expect(panel(page).getByRole('textbox', { name: 'Pertanyaan' })).toBeFocused()
})

test('chip saran mengirim pertanyaannya', async ({ page }) => {
  const diterima = await mockAsisten(page)
  await masuk(page, 'hr')
  await fab(page).click()
  await panel(page).getByRole('button', { name: 'Gap terbesar apa?' }).click()
  await expect(panel(page).locator('.b17-msg--me')).toContainText('Gap terbesar apa?')
  await expect.poll(() => diterima.find((r) => r.method === 'POST')?.body).toEqual({ question: 'Gap terbesar apa?', view: 'hr' })
})

test('aksi ke halaman yang tidak bisa dibuka tidak menampilkan tombol', async ({ page }) => {
  await mockAsisten(page, { jawab: () => responsData({ answer: 'Ada 3 draf menunggu.', action: { page: 'review', label: 'Tinjauan HR' }, outcome: 'answered' }) })
  await masuk(page, 'karyawan')
  await fab(page).click()
  await panel(page).getByRole('textbox', { name: 'Pertanyaan' }).fill('Ada tinjauan?')
  await panel(page).getByRole('button', { name: 'Kirim' }).click()
  await expect(panel(page).getByText('Ada 3 draf menunggu.')).toBeVisible()
  await expect(panel(page).getByRole('button', { name: /^Buka / })).toHaveCount(0)
})

test('Esc dan tombol Tutup menutup panel; fokus kembali ke FAB', async ({ page }) => {
  await mockAsisten(page)
  await masuk(page, 'hr')
  await fab(page).click()
  await expect(panel(page).getByRole('textbox', { name: 'Pertanyaan' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(fab(page)).toBeFocused()

  await fab(page).click()
  await panel(page).getByRole('button', { name: 'Tutup' }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(fab(page)).toBeFocused()
})

test('galat 429: pesan API tampil dan draf kembali ke input', async ({ page }) => {
  await mockAsisten(page, { jawab: () => ({ status: 429, json: { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak pertanyaan. Coba lagi beberapa menit lagi.' } } }) })
  await masuk(page, 'karyawan')
  await fab(page).click()
  const input = panel(page).getByRole('textbox', { name: 'Pertanyaan' })
  await input.fill('Apa rencana belajar saya?')
  await input.press('Enter')
  await expect(panel(page).getByText('Terlalu banyak pertanyaan. Coba lagi beberapa menit lagi.')).toBeVisible()
  await expect(input).toHaveValue('Apa rencana belajar saya?')
})

test('ganti tampilan mengosongkan percakapan dan memakai label tampilan baru', async ({ page }) => {
  const diterima = await mockAsisten(page)
  await masuk(page, 'hr', { ...DENGAN_ASISTEN, peranLain: ['karyawan'] })
  await fab(page).click()
  await panel(page).getByRole('button', { name: 'Gap terbesar apa?' }).click()
  await expect(panel(page).locator('.b17-msg--me')).toHaveCount(1)

  await page.getByRole('group', { name: 'Tampilan' }).getByRole('button', { name: 'Karyawan (saya)' }).click()
  await expect(page).toHaveURL(/\/my$/)
  await expect(panel(page)).toContainText('Tanyakan urusan Anda · Karyawan')
  await expect(panel(page).locator('.b17-msg--me')).toHaveCount(0)
  expect(diterima.filter((r) => r.method === 'GET').map((r) => r.query.get('view'))).toEqual(['hr', 'karyawan'])
})

test('snapshot: panel terbuka dengan percakapan (karyawan)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockAsisten(page)
  await masuk(page, 'karyawan')
  await fab(page).click()
  await panel(page).getByRole('button', { name: 'Apa rencana belajar saya?' }).click()
  await expect(panel(page).getByRole('button', { name: 'Buka Rencana belajar' })).toBeVisible()
  await expect(panel(page)).toHaveScreenshot('asisten-panel-karyawan.png')
})

test('keluar lalu masuk lagi: panel tertutup dan percakapan lama hilang', async ({ page }) => {
  await mockAsisten(page)
  await mockApi(page, (req) => (cocok(req, 'POST /auth/logout') ? { status: 200, json: {} } : undefined))
  const user = await masuk(page, 'hr')
  // Masuk lagi lewat formulir di aplikasi yang sama (tanpa muat ulang), supaya store Pinia tetap hidup
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /auth/tenants')) return { json: { data: [] } }
    if (cocok(req, 'GET /auth/methods')) return { json: { password: true, emailLink: true } }
    if (cocok(req, 'POST /auth/login')) return { json: { token: 'token-hr-2', user } }
    return undefined
  })
  await fab(page).click()
  await panel(page).getByRole('button', { name: 'Gap terbesar apa?' }).click()
  await expect(panel(page).locator('.b17-msg--me')).toHaveCount(1)
  await page.getByRole('button', { name: 'Keluar' }).click()
  await expect(page.getByRole('heading', { name: 'Masuk ke ELGOS' })).toBeVisible()
  await expect(fab(page)).toHaveCount(0)

  await page.getByLabel('Organisasi').fill('contoh')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Kata sandi').fill('x')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(fab(page)).toBeVisible()
  await expect(panel(page)).toHaveCount(0)
  await fab(page).click()
  await expect(panel(page).locator('.b17-msg--me')).toHaveCount(0)
})
