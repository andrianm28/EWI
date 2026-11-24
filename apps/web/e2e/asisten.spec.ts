import { test, expect, type Page } from '@playwright/test'
import { cocok, mockApi, responsData, type PermintaanApi } from './support/api'
import { penanganHasilSaya } from './support/hasil-saya'
import { loginSebagai, semuaModulDengan, SEMUA_MODUL, type Peran } from './support/sesi'
import { tinjauanGap, T_DRAF } from './support/tinjauan'

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
  jawab?: (req: PermintaanApi) => { status?: number; json: unknown } | Promise<{ status?: number; json: unknown }>
  intro?: (req: PermintaanApi) => { status?: number; json: unknown } | undefined
}

/** Me-mock GET /assistant dan POST /assistant/ask; mengembalikan daftar permintaan yang diterima. */
async function mockAsisten(page: Page, o: OpsiAsisten = {}) {
  const diterima: PermintaanApi[] = []
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /assistant')) {
      diterima.push(req)
      const ganti = o.intro?.(req)
      if (ganti) return ganti
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

for (const peran of ['karyawan', 'atasan', 'hr'] as const) {
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

test('Keputusan user 23 Nov: tampilan Super Admin tanpa asisten; akun eta_admin yang sama memakainya dari tampilan HR', async ({ page }) => {
  const diterima = await mockAsisten(page)
  await masuk(page, 'super', { ...DENGAN_ASISTEN, peranLain: ['hr'] })
  const tampilan = page.getByRole('group', { name: 'Tampilan' })
  await expect(tampilan.getByRole('button', { name: 'Super Admin' })).toHaveAttribute('aria-pressed', 'true')
  await expect(fab(page)).toHaveCount(0)
  expect(diterima.filter((r) => r.query.get('view') === 'super')).toEqual([])
  await tampilan.getByRole('button', { name: 'HR / L&D' }).click()
  await expect(fab(page)).toBeVisible()
  await fab(page).click()
  await expect(panel(page)).toContainText('Tanyakan urusan Anda · HR / L&D')
})

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

test('P9 IR-1: HR menekan "Buka Tinjauan HR" dari asisten dan sampai di antrean tinjauan, bukan layar per gap', async ({ page }) => {
  await mockApi(page, tinjauanGap().penangan)
  await mockAsisten(page, { jawab: () => responsData({ answer: 'Ada 1 draf menunggu tinjauan.', action: { page: 'review', label: 'Tinjauan HR' }, outcome: 'answered' }) })
  await masuk(page, 'hr', semuaModulDengan({ assistant: true, 'tna.review_workspace': true }))
  await fab(page).click()
  await panel(page).getByRole('textbox', { name: 'Pertanyaan' }).fill('Ada tinjauan?')
  await panel(page).getByRole('button', { name: 'Kirim' }).click()
  await panel(page).getByRole('button', { name: 'Buka Tinjauan HR' }).click()
  await expect(page).toHaveURL(/\/m\/tna\/review$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Review hasil AI' })).toBeVisible()
  await expect(page.getByTestId(`review-item-${T_DRAF}`)).toBeVisible()
  await expect(page.getByText('Alamat gap tidak lengkap')).toHaveCount(0)
})

test('P9 CD-2: FAB asisten dan pengingat verifikasi INA bertumpuk tanpa saling menutupi', async ({ page }) => {
  await mockAsisten(page)
  await mockApi(page, (req) => (cocok(req, 'GET /ina/access/me') ? responsData({ level: null, pendingVerifications: 2 }) : undefined))
  await masuk(page, 'karyawan', semuaModulDengan({ assistant: true, 'ina.ai_verification': true }))
  const pengingat = page.getByTestId('ina-pengingat')
  await expect(pengingat).toContainText('2 verifikasi tindakan perbaikan menunggu jawaban Anda.')
  await expect(fab(page)).toBeVisible()
  const a = (await fab(page).boundingBox())!
  const b = (await pengingat.boundingBox())!
  const tumpang = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  expect(tumpang).toBe(false)
  // tombol Buka pengingat tetap bisa diklik (tidak tertutup FAB)
  await pengingat.getByRole('link', { name: 'Buka' }).click({ trial: true })
  // panel asisten terbuka juga tidak menutupi pengingat
  await fab(page).click()
  const p = (await panel(page).boundingBox())!
  expect(p.y + p.height <= b.y || b.y + b.height <= p.y).toBe(true)
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

// P9 CD-12: jawaban lama yang tiba setelah ganti tampilan lalu kembali (kunci sama) tidak masuk percakapan baru
test('P9 CD-12: jawaban basi setelah ganti tampilan bolak-balik dibuang', async ({ page }) => {
  let lepas: (() => void) | null = null
  await mockAsisten(page, {
    jawab: (req) => (req.body as { question: string }).question === 'Pertanyaan lambat'
      ? new Promise((ok) => { lepas = () => ok(responsData({ answer: 'JAWABAN-BASI', action: null, outcome: 'answered' })) })
      : responsData({ answer: 'Jawaban baru', action: null, outcome: 'answered' }),
  })
  await masuk(page, 'hr', { ...DENGAN_ASISTEN, peranLain: ['karyawan'] })
  await fab(page).click()
  const input = panel(page).getByRole('textbox', { name: 'Pertanyaan' })
  await input.fill('Pertanyaan lambat')
  await input.press('Enter')
  await expect(panel(page)).toContainText('Sedang menyiapkan jawaban…')
  const tampilan = page.getByRole('group', { name: 'Tampilan' })
  await tampilan.getByRole('button', { name: 'Karyawan (saya)' }).click()
  await expect(panel(page)).toContainText('Tanyakan urusan Anda · Karyawan')
  await tampilan.getByRole('button', { name: 'HR / L&D' }).click()
  await expect(panel(page)).toContainText('Tanyakan urusan Anda · HR / L&D')
  await input.fill('Pertanyaan baru')
  await input.press('Enter')
  await expect(panel(page).getByText('Jawaban baru')).toBeVisible()
  await expect.poll(() => lepas !== null).toBe(true)
  // review 24 Nov: tanpa jeda tetap; tunggu respons lambat benar-benar tiba, lalu satu pertanyaan lagi sebagai pembatas
  // (jawabannya tiba sesudah respons basi, jadi saat jawaban itu tampil respons basi pasti sudah diproses)
  const basi = page.waitForResponse((r) => r.url().includes('/api/assistant/ask') && (r.request().postData() ?? '').includes('Pertanyaan lambat'))
  lepas!()
  await (await basi).finished()
  await input.fill('Pertanyaan pembatas')
  await input.press('Enter')
  await expect(panel(page).getByText('Jawaban baru')).toHaveCount(2)
  await expect(panel(page).getByText('JAWABAN-BASI')).toHaveCount(0)
  await expect(panel(page).locator('.b17-msg--me')).toHaveCount(2)
})

test('snapshot: panel terbuka dengan percakapan (karyawan)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockAsisten(page)
  await masuk(page, 'karyawan')
  await fab(page).click()
  await panel(page).getByRole('button', { name: 'Apa rencana belajar saya?' }).click()
  await expect(panel(page).getByRole('button', { name: 'Buka Rencana belajar' })).toBeVisible()
  // Potret elemen kecil yang padat teks: beda antialiasing Chromium lokal vs CI sekitar 4% (snapshot halaman penuh
  // tetap di bawah 2% karena banyak ruang kosong). Struktur dan warna tetap terjaga oleh ambang 6%.
  await expect(panel(page)).toHaveScreenshot('asisten-panel-karyawan.png', { maxDiffPixelRatio: 0.06 })
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

// Review independen egm (B17): state galat, menunggu, dan batas tampilan
test('review: server menolak tampilan (403 VIEW_FORBIDDEN): tombol asisten disembunyikan', async ({ page }) => {
  await mockAsisten(page, { intro: () => ({ status: 403, json: { error: { code: 'VIEW_FORBIDDEN', message: 'Tampilan ini tidak tersedia untuk peran Anda' } } }) })
  await masuk(page, 'karyawan')
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
  await expect(fab(page)).toHaveCount(0)
})

test('review: salam gagal dimuat (500): salam dan catatan bawaan tampil tanpa chip', async ({ page }) => {
  await mockAsisten(page, { intro: () => ({ status: 500, json: {} }) })
  await masuk(page, 'karyawan')
  await fab(page).click()
  await expect(panel(page).getByText('Halo, saya Asisten ELGOS. Tanyakan apa pun tentang urusan Anda sebagai Karyawan di sini.')).toBeVisible()
  await expect(panel(page).locator('.b17-chip')).toHaveCount(0)
})

test('review: selama menunggu ada gelembung "Sedang menyiapkan jawaban…" dan Kirim nonaktif', async ({ page }) => {
  let lepas: () => void = () => {}
  const tunggu = new Promise<void>((r) => { lepas = r })
  await mockAsisten(page, { jawab: async () => { await tunggu; return responsData({ answer: 'Selesai.', action: null, outcome: 'answered' }) } })
  await masuk(page, 'karyawan')
  await fab(page).click()
  const input = panel(page).getByRole('textbox', { name: 'Pertanyaan' })
  await input.fill('Apa rencana belajar saya?')
  await input.press('Enter')
  await expect(panel(page).getByText('Sedang menyiapkan jawaban…')).toBeVisible()
  await expect(panel(page).getByRole('button', { name: 'Kirim' })).toBeDisabled()
  lepas()
  await expect(panel(page).getByText('Selesai.')).toBeVisible()
  await expect(panel(page).getByText('Sedang menyiapkan jawaban…')).toHaveCount(0)
})

for (const [nama, respons] of [
  ['503 AI_UNAVAILABLE', { status: 503, json: { error: { code: 'AI_UNAVAILABLE', message: 'Asisten sedang tidak tersedia.' } } }],
] as const) {
  test(`review: galat ${nama} menampilkan pesan API`, async ({ page }) => {
    await mockAsisten(page, { jawab: () => respons })
    await masuk(page, 'karyawan')
    await fab(page).click()
    await panel(page).getByRole('textbox', { name: 'Pertanyaan' }).fill('Halo')
    await panel(page).getByRole('button', { name: 'Kirim' }).click()
    await expect(panel(page).getByText('Asisten sedang tidak tersedia.')).toBeVisible()
  })
}

test('review: 502 tanpa badan JSON (proxy) dan jaringan putus memakai pesan cadangan', async ({ page }) => {
  await mockAsisten(page)
  await masuk(page, 'karyawan')
  let n = 0
  await page.route('**/api/assistant/ask', (r) => {
    n += 1
    return n === 1 ? r.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' }) : r.abort('failed')
  })
  await fab(page).click()
  const input = panel(page).getByRole('textbox', { name: 'Pertanyaan' })
  await input.fill('Satu')
  await input.press('Enter')
  await expect(panel(page).getByText('Asisten sedang tidak bisa menjawab. Coba lagi nanti.')).toHaveCount(1)
  await expect(input).toHaveValue('Satu')
  await input.fill('Dua')
  await input.press('Enter')
  await expect(panel(page).getByText('Asisten sedang tidak bisa menjawab. Coba lagi nanti.')).toHaveCount(2)
})

test('review: isian kosong atau spasi saja tidak dikirim', async ({ page }) => {
  const diterima = await mockAsisten(page)
  await masuk(page, 'karyawan')
  await fab(page).click()
  const input = panel(page).getByRole('textbox', { name: 'Pertanyaan' })
  await input.fill('   ')
  await input.press('Enter')
  await expect(input).toHaveAttribute('maxlength', '500')
  // review 24 Nov: pembatas positif; POST pertama yang tiba harus pertanyaan berikutnya, bukan isian spasi
  await input.fill('Apa rencana belajar saya?')
  await input.press('Enter')
  await expect.poll(() => diterima.filter((r) => r.method === 'POST').map((r) => (r.body as { question: string }).question))
    .toEqual(['Apa rencana belajar saya?'])
})

test('review: permintaan yang menggantung dihentikan setelah 30 detik dengan pesan cadangan', async ({ page }) => {
  await page.clock.install()
  await mockAsisten(page)
  await masuk(page, 'karyawan')
  await page.route('**/api/assistant/ask', () => { /* tidak pernah dijawab */ })
  await fab(page).click()
  const input = panel(page).getByRole('textbox', { name: 'Pertanyaan' })
  await input.fill('Halo')
  await input.press('Enter')
  await expect(panel(page).getByText('Sedang menyiapkan jawaban…')).toBeVisible()
  await page.clock.fastForward(31_000)
  await expect(panel(page).getByText('Asisten sedang tidak bisa menjawab. Coba lagi nanti.')).toBeVisible()
  await expect(panel(page).getByRole('button', { name: 'Kirim' })).toBeEnabled()
})

test('review: layar sempit dengan drawer terbuka: tombol asisten tidak tampil di atas scrim', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 })
  await mockAsisten(page)
  await masuk(page, 'karyawan')
  await expect(fab(page)).toBeVisible()
  await page.locator('#tombol-menu').click()
  await expect(page.getByTestId('scrim')).toBeVisible()
  await expect(fab(page)).toBeHidden()
})
