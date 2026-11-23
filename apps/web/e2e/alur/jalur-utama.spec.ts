import { test, expect } from '@playwright/test'
import { loginSebagai, navigasi, SEMUA_MODUL, type OpsiSesi, type Peran } from '../support/sesi'
import { mockApi, cocok, permintaanBelumDimock } from '../support/api'
import { DASHBOARD_HR } from '../support/dashboard'
import { papanGapTna, C1, E1, P1 } from '../support/tna-gap'
import { sesiWawancara } from '../support/wawancara'

// B18 4.5 (docs/designs/b18-e2e-qa-malam.md): tiga jalur utama, satu test per jalur, langkah ditandai test.step.
// Seam: layar lewat browser setelah masuk lewat tautan email (loginSebagai), API di-mock lewat support/.
// Detail tiap layar (galat, variasi flag, peran lain) diuji di spec paketnya: dashboard.spec.ts, tna-gap.spec.ts, iv.spec.ts.

/** SEMUA_MODUL ditambah flag fitur yang dipakai jalur ini (bawaan produksi mati). */
const denganFlag = (flags: Record<string, boolean>): OpsiSesi => ({ ...SEMUA_MODUL, flags: { ...SEMUA_MODUL.flags, ...flags } })

// Layar tidak boleh bergantung pada endpoint yang tidak di-mock (jaring pengaman support/api.ts)
test.afterEach(({ page }) => { expect(permintaanBelumDimock(page)).toEqual([]) })

// Jalur 1 butuh layar "Hasil saya" (rute `my`) dari spek B8: store sesi baru menawarkan "Karyawan (saya)" setelah
// layar beranda karyawan ada. PR layar B8 mengaktifkan test ini bersama baris karyawan di menu-peran.spec.ts.
const MENU_UTAMA: { peran: Peran; label: string; butirPertama: string }[] = [
  { peran: 'hr', label: 'HR / L&D', butirPertama: 'Dashboard utama' },
  { peran: 'atasan', label: 'Atasan', butirPertama: 'Dashboard tim' },
  { peran: 'admin', label: 'Admin Tenant', butirPertama: 'Pengguna & peran' },
]
for (const m of MENU_UTAMA) {
  test.fixme(`jalur 1 (${m.peran}): masuk lewat tautan email, menu sesuai peran, ganti ke Karyawan (saya) dan kembali`, async ({ page }) => {
    const tampilan = page.getByRole('group', { name: 'Tampilan' })
    await test.step('masuk lewat tautan email: menu tampilan utama', async () => {
      await loginSebagai(page, m.peran, { ...SEMUA_MODUL, peranLain: ['karyawan'] })
      await expect(navigasi(page).getByRole('link').first()).toHaveText(m.butirPertama)
      await expect(tampilan.getByRole('button', { name: m.label })).toHaveAttribute('aria-pressed', 'true')
    })
    await test.step('ganti ke Karyawan (saya): menu karyawan', async () => {
      await tampilan.getByRole('button', { name: 'Karyawan (saya)' }).click()
      await expect(navigasi(page).getByRole('link')).toHaveText(['Hasil saya', 'Wawancara visi & nilai', 'Wawancara akar masalah', 'Rencana belajar'])
    })
    await test.step('kembali ke tampilan utama', async () => {
      await tampilan.getByRole('button', { name: m.label }).click()
      await expect(navigasi(page).getByRole('link').first()).toHaveText(m.butirPertama)
    })
  })
}

test('jalur 2: HR dari Dashboard utama ke Training Needs, membuka detail gap, lalu menugaskan wawancara', async ({ page }) => {
  const { penangan, terkirim } = papanGapTna({ peran: 'hr' })
  await mockApi(page, penangan)
  await mockApi(page, (req) => (cocok(req, 'GET /dashboard') ? { json: { data: DASHBOARD_HR } } : undefined))

  await test.step('masuk lewat tautan email: mendarat di Dashboard utama', async () => {
    await loginSebagai(page, 'hr', denganFlag({ 'tna.interview_assignment': true }))
    await expect(page).toHaveURL((u) => u.pathname === '/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard utama' })).toBeVisible()
  })
  await test.step('menu Training Needs: papan gap, tab Gap kompetensi', async () => {
    await navigasi(page).getByRole('link', { name: 'Training Needs' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Training Needs' })).toBeVisible()
    await page.getByRole('tab', { name: 'Gap kompetensi' }).click()
  })
  await test.step('gap Analisis insiden: halaman detail', async () => {
    await page.getByRole('table', { name: 'Gap kompetensi' }).getByRole('link', { name: 'Analisis insiden' }).click()
    await expect(page).toHaveURL((u) => u.pathname === '/tna/gap')
    await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  })
  await test.step('tugaskan wawancara: karyawan, tenggat, durasi', async () => {
    const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
    await form.getByRole('checkbox', { name: 'Dimas' }).check()
    await form.getByLabel('Tenggat').fill('2026-12-05')
    await form.getByRole('radio', { name: '15 menit' }).check()
    await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
    await expect(page.getByRole('status')).toContainText('1 wawancara ditugaskan')
    expect(terkirim).toEqual([{
      path: '/assignments',
      body: { projectId: P1, gap: { kind: 'competency', competencyId: C1 }, mode: 'affected', employeeIds: [E1], dueDate: '2026-12-05', durationMinutes: 15 },
    }])
  })
})

// Spek 4.5 memulai jalur 3 dari "Hasil saya" (undangan di beranda karyawan). Layar itu belum ada (B8), jadi jalur ini
// mulai dari butir menu Wawancara akar masalah; PR layar B8 menambahkan langkah awal dari "Hasil saya".
test('jalur 3: karyawan membuka undangan wawancara akar masalah, menyetujui, menjawab, dan mengirim ringkasan ke HR', async ({ page }) => {
  const { penangan, terkirim } = sesiWawancara({ pemilik: 'u-karyawan' })
  await mockApi(page, penangan)

  await test.step('masuk lewat tautan email: menu Wawancara akar masalah menampilkan undangan', async () => {
    await loginSebagai(page, 'karyawan', denganFlag({ 'tna.interview_summary': true }))
    await navigasi(page).getByRole('link', { name: 'Wawancara akar masalah' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Wawancara akar masalah' })).toBeVisible()
    await page.getByRole('link', { name: 'Analisis insiden' }).click()
    await expect(page.getByText('Topik: Analisis insiden')).toBeVisible()
  })
  await test.step('persetujuan: galat bila kotak belum dicentang, lalu dicentang', async () => {
    await page.getByRole('button', { name: 'Lanjut ke wawancara' }).click()
    await expect(page.getByRole('alert')).toContainText('Centang persetujuan untuk melanjutkan')
    await page.getByRole('checkbox', { name: 'Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara.' }).check()
    await page.getByRole('button', { name: 'Lanjut ke wawancara' }).click()
  })
  await test.step('percakapan: pertanyaan AI dijawab', async () => {
    const percakapan = page.getByRole('log', { name: 'Percakapan wawancara' })
    await expect(percakapan).toContainText('Ceritakan analisis insiden terakhir yang Anda kerjakan.')
    await page.getByLabel('Jawaban').fill('Saya belum pernah dilatih eskalasi.')
    await page.getByRole('button', { name: 'Kirim' }).click()
    await expect(percakapan).toContainText('Saya belum pernah dilatih eskalasi.')
  })
  await test.step('ringkasan temuan diperiksa lalu dikirim ke HR', async () => {
    await page.getByRole('button', { name: 'Lihat ringkasan temuan' }).click()
    await expect(page.getByRole('heading', { name: 'Ringkasan temuan AI' })).toBeVisible()
    await expect(page.getByText('Belum paham langkah eskalasi insiden')).toBeVisible()
    await page.getByRole('button', { name: 'Sesuai, kirim ke HR' }).click()
    await expect(page.getByText('Ringkasan sudah dikirim ke HR untuk ditinjau.')).toBeVisible()
  })
  expect(terkirim.map((t) => t.path)).toEqual(['consent', 'turns', 'summary', 'confirm'])
})
