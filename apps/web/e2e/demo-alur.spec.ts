import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, navigasi, type Peran } from './support/sesi'
import { mockApi, mockApiDasar, permintaanBelumDimock } from './support/api'
import { papanGapTna } from './support/tna-gap'
import { tinjauanGap } from './support/tinjauan'
import { sesiWawancara } from './support/wawancara'
import { penanganHasilSaya } from './support/hasil-saya'
import { penanganAdminDemo, penanganCcHr, penanganCpDemo, penanganDnaDemo, penanganInaHr, penanganLdDemo, penanganLiDemo, penanganLimDemo, penanganSuperDemo, penanganAtasanDemo, penanganKaryawanDemo } from './support/demo-modul'
import { penanganDashboardDemo, penanganShellDemo, SESI_DEMO, tanggalDariHariIni } from './support/demo'

// Demo langsung 25 Nov: satu jalan-jalan per peran mengikuti cerita utama mockup Pak Eji (Main.dc.html).
// Setiap klik yang akan dilakukan pembawa demo harus mendarat di layar yang berfungsi: judul tampil, tanpa
// galat, tanpa layar kosong, dan tanpa permintaan API yang tidak di-mock. Detail tiap layar diuji di spec paketnya.

test.afterEach(({ page }) => { expect(permintaanBelumDimock(page)).toEqual([]) })

/** Masuk sebagai peran dengan semua layar demo menyala; permintaan shell (asisten, pengingat INA) selalu di-mock. */
async function masukDemo(page: Page, peran: Peran) {
  await mockApiDasar(page, penanganShellDemo)
  await loginSebagai(page, peran, SESI_DEMO())
}

/** Layar mendarat dengan h1 yang diharapkan dan tanpa ringkasan galat. */
async function mendarat(page: Page, judul: string | RegExp) {
  await expect(page.getByRole('heading', { level: 1, name: judul })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
}

/** Butir menu (grup accordion sudah terbuka bawaan) membuka layar dengan h1 yang diharapkan. */
async function bukaMenu(page: Page, butir: string, judul: string | RegExp = butir) {
  await navigasi(page).getByRole('link', { name: butir, exact: true }).click()
  await mendarat(page, judul)
}

/** Setiap tab bisa dipilih tanpa galat dan panelnya berisi (tidak kosong). */
async function semuaTab(page: Page, tab: string[]) {
  for (const nama of tab) {
    const t = page.getByRole('tab', { name: nama, exact: true })
    await t.click()
    await expect(t).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).not.toBeEmpty()
    await expect(page.getByRole('alert')).toHaveCount(0)
  }
}

test('demo HR: dashboard ke gap Training Needs, tugaskan wawancara, tinjauan temuan AI, lalu solusi', async ({ page }) => {
  await mockApi(page, papanGapTna({ peran: 'hr' }).penangan)
  await mockApi(page, tinjauanGap().penangan)
  await mockApi(page, penanganDashboardDemo)
  await masukDemo(page, 'hr')

  await test.step('Dashboard utama', async () => {
    await mendarat(page, 'Dashboard utama')
    await expect(page.getByTestId('pareto-baris').first()).toContainText('Analisis insiden')
  })
  await test.step('Pareto: gap teratas membuka detail gap', async () => {
    await page.getByTestId('pareto-baris').first().click()
    await expect(page).toHaveURL((u) => u.pathname === '/tna/gap')
    await mendarat(page, 'Analisis insiden')
  })
  await test.step('tugaskan wawancara akar masalah', async () => {
    await page.getByRole('button', { name: 'Mulai wawancara akar masalah' }).click()
    const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
    await form.getByRole('checkbox', { name: 'Dimas' }).check()
    await form.getByLabel('Tenggat').fill(tanggalDariHariIni(7))
    await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
    await expect(page.getByRole('status')).toContainText('1 wawancara ditugaskan')
  })
  await test.step('Langsung ke tinjauan HR: temuan AI dan solusi', async () => {
    await page.getByRole('link', { name: 'Langsung ke tinjauan HR' }).click()
    await mendarat(page, 'Tinjauan temuan AI')
    const solusi = page.locator('.el-card').filter({ has: page.getByRole('heading', { name: 'Solusi pelatihan' }) })
    await solusi.getByRole('button', { name: 'Tugaskan di EliteMentor' }).click()
    await expect(solusi.getByRole('note')).toContainText('Penugasan terkirim ke EliteMentor')
  })
  await test.step('kembali ke Training Needs lewat breadcrumb: tab ringkasan, kompetensi, OKR', async () => {
    await page.getByRole('navigation', { name: 'Lokasi' }).getByRole('link', { name: 'Training Needs' }).click()
    await mendarat(page, 'Training Needs')
    for (const tab of ['Ringkasan', 'Gap kompetensi', 'Gap OKR']) {
      await page.getByRole('tab', { name: tab }).click()
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
    }
  })
  await test.step('Dashboard: tombol Tinjau membuka antrean tinjauan lintas gap (b7-tinjauan-web.md butir 11)', async () => {
    await bukaMenu(page, 'Dashboard utama')
    await page.getByRole('link', { name: 'Tinjau' }).click()
    await mendarat(page, 'Review hasil AI')
  })
})

test('demo HR: Core Competencies, Developmental Needs, dan Improvement Needs', async ({ page }) => {
  await mockApi(page, penanganDashboardDemo)
  await mockApi(page, penanganCcHr)
  await mockApi(page, penanganDnaDemo)
  await mockApi(page, penanganInaHr)
  await masukDemo(page, 'hr')

  await test.step('Core Competencies: tiga tab', async () => {
    await bukaMenu(page, 'Core Competencies')
    await semuaTab(page, ['Corporate Vision & Mission', 'Corporate Values', 'Wawancara AI'])
  })
  await test.step('Developmental Needs: empat tab, rencana pegawai dibuka', async () => {
    await bukaMenu(page, 'Developmental Needs')
    await semuaTab(page, ['Ringkasan', 'Kamus kompetensi', 'Kurikulum Basic · Intermediate · Advanced', 'Kebutuhan pengembangan pegawai'])
    await page.getByRole('tabpanel').getByRole('button', { name: /Ani/ }).first().click()
    await expect(page.getByText('Fokus pada modul Basic yang belum tercapai: ST-B1.')).toBeVisible()
  })
  await test.step('Improvement Needs: tabel tindakan, klik baris membuka formulir ubah', async () => {
    await bukaMenu(page, 'Improvement Needs')
    await page.getByRole('table', { name: 'Tindakan perbaikan' }).getByRole('link', { name: 'Perbarui SOP eskalasi insiden' }).click()
    await expect(page.getByTestId('ina-form').getByRole('heading', { name: 'Ubah tindakan' })).toBeVisible()
  })
})

test('demo HR: Library ke Program & Course, Permintaan, draf modul, lalu Learning Delivery, LIM, dan Career & Promotion', async ({ page }) => {
  await mockApi(page, penanganDashboardDemo)
  await mockApi(page, penanganLiDemo())
  await mockApi(page, penanganLdDemo)
  await mockApi(page, penanganLimDemo)
  await mockApi(page, penanganCpDemo)
  await masukDemo(page, 'hr')

  await test.step('Library: daftar dan detail modul', async () => {
    await bukaMenu(page, 'Library')
    await expect(page.getByTestId('detail-modul')).toContainText('Root Cause Analysis')
    await page.getByRole('button', { name: /ITIL Foundation/ }).click()
    await expect(page.getByTestId('detail-modul')).toContainText('ITIL Foundation')
  })
  await test.step('Program & Course', async () => {
    await bukaMenu(page, 'Program & Course')
    await expect(page.getByText('Root Cause Analysis').first()).toBeVisible()
  })
  await test.step('Permintaan & pengembangan: buka draf modul', async () => {
    await bukaMenu(page, 'Permintaan & pengembangan', 'Permintaan & pengembangan modul')
    await page.getByRole('link', { name: 'Buka' }).first().click()
    await mendarat(page, 'Root Cause Analysis')
  })
  await test.step('Learning Delivery: empat tab', async () => {
    await bukaMenu(page, 'Learning Delivery')
    await semuaTab(page, ['Ringkasan', 'Sedang berjalan', 'Akan datang', 'Pelatihan offline'])
  })
  await test.step('Learning Impact Measurement: empat tab', async () => {
    await bukaMenu(page, 'Learning Impact Measurement')
    await semuaTab(page, ['Ringkasan', 'Per kompetensi', 'Dampak bisnis', 'Pengukuran AI'])
  })
  await test.step('Career & Promotion: tiga tab', async () => {
    await bukaMenu(page, 'Career & Promotion')
    await semuaTab(page, ['Karyawan per divisi', 'Jalur jenjang', 'Keputusan promosi'])
  })
})

test('demo HR: Asisten ELGOS dibuka dari layar mana pun dan menjawab saran', async ({ page }) => {
  await mockApi(page, penanganDashboardDemo)
  await masukDemo(page, 'hr')
  await mendarat(page, 'Dashboard utama')
  await page.getByRole('button', { name: 'Buka Asisten ELGOS' }).click()
  const panel = page.getByRole('dialog', { name: 'Asisten ELGOS' })
  await panel.getByRole('button', { name: 'Apa yang perlu saya lakukan hari ini?' }).click()
  await expect(panel).toContainText('Ada 4 temuan menunggu tinjauan HR.')
})

test('demo Atasan: Dashboard tim, Wawancara AI, Training Needs dengan Wawancara untuk Anda, dan modul tim', async ({ page }) => {
  const papan = papanGapTna({ peran: 'atasan' })
  await mockApi(page, papan.penangan)
  await mockApi(page, sesiWawancara({ pemilik: 'u-atasan' }).penangan)
  await mockApi(page, penanganDnaDemo)
  await mockApi(page, penanganLimDemo)
  await mockApi(page, penanganCpDemo)
  await mockApi(page, penanganAtasanDemo)
  await masukDemo(page, 'atasan')

  await test.step('Dashboard tim', async () => {
    await mendarat(page, 'Dashboard tim')
    await expect(page.getByTestId('pareto-baris').first()).toContainText('Root Cause Analysis')
  })
  await test.step('Wawancara AI: status tim', async () => {
    await bukaMenu(page, 'Wawancara AI')
    await expect(page.getByRole('row', { name: /Karyawan A/ })).toContainText('Selesai')
  })
  await test.step('Developmental Needs', async () => {
    await bukaMenu(page, 'Developmental Needs')
    await semuaTab(page, ['Ringkasan', 'Kamus kompetensi', 'Kurikulum Basic · Intermediate · Advanced', 'Kebutuhan pengembangan pegawai'])
  })
  await test.step('Training Needs: papan gap dan Wawancara untuk Anda', async () => {
    await bukaMenu(page, 'Training Needs')
    await semuaTab(page, ['Ringkasan', 'Gap kompetensi', 'Gap OKR'])
    await page.getByTestId('tna-my-sessions').getByRole('link', { name: 'Mulai wawancara' }).click()
    await mendarat(page, 'Wawancara akar masalah')
    await expect(page.getByText('Topik: Analisis insiden')).toBeVisible()
  })
  await test.step('Improvement Needs, LIM, Career & Promotion', async () => {
    await bukaMenu(page, 'Improvement Needs')
    await expect(page.getByRole('table', { name: 'Tindakan perbaikan' })).toBeVisible()
    await bukaMenu(page, 'Learning Impact Measurement')
    await expect(page.getByText('Pilot L1').first()).toBeVisible()
    await bukaMenu(page, 'Career & Promotion')
    await expect(page.getByText('Ani').first()).toBeVisible()
  })
})

test('demo Karyawan: Hasil saya, wawancara akar masalah, Wawancara visi & nilai, dan Rencana belajar', async ({ page }) => {
  await mockApi(page, sesiWawancara({ pemilik: 'u-karyawan' }).penangan)
  await mockApi(page, penanganKaryawanDemo)
  await mockApiDasar(page, penanganHasilSaya('u-karyawan'))
  await masukDemo(page, 'karyawan')

  await test.step('Hasil saya', async () => {
    await mendarat(page, 'Hasil saya')
    await expect(page.getByText('Otomasi infrastruktur').first()).toBeVisible()
  })
  await test.step('undangan wawancara: persetujuan lalu percakapan', async () => {
    await page.getByTestId('my-invitations').getByRole('link', { name: 'Mulai wawancara' }).click()
    await mendarat(page, 'Wawancara akar masalah')
    await page.getByRole('checkbox', { name: 'Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara.' }).check()
    await page.getByRole('button', { name: 'Lanjut ke wawancara' }).click()
    await expect(page.getByRole('log', { name: 'Percakapan wawancara' })).toContainText('Ceritakan analisis insiden terakhir')
  })
  await test.step('menu Wawancara akar masalah: daftar sesi', async () => {
    await bukaMenu(page, 'Wawancara akar masalah')
    await expect(page.getByText('Analisis insiden').first()).toBeVisible()
  })
  await test.step('Wawancara visi & nilai', async () => {
    await bukaMenu(page, 'Wawancara visi & nilai', 'Wawancara AI')
    await expect(page.getByTestId('cc-wawancara-karyawan')).toContainText('Ditugaskan')
  })
  await test.step('Rencana belajar', async () => {
    await bukaMenu(page, 'Rencana belajar')
    await expect(page.getByText('Analisis insiden').first()).toBeVisible()
  })
  await test.step('kembali ke Hasil saya', async () => {
    await bukaMenu(page, 'Hasil saya')
  })
})

test('demo Admin Tenant: Pengguna & peran, Jabatan & kamus kompetensi, Impor data & integrasi', async ({ page }) => {
  await mockApi(page, penanganAdminDemo)
  await masukDemo(page, 'admin')
  await mendarat(page, 'Pengguna & peran')
  await expect(page.getByRole('table').getByText('Karyawan A')).toBeVisible()
  await bukaMenu(page, 'Jabatan & kamus kompetensi')
  await page.getByRole('row').filter({ hasText: 'Engineer Service Delivery' }).getByRole('button', { name: 'Lihat kamus' }).click()
  await expect(page.getByTestId('job-kamus')).toContainText('Root Cause Analysis')
  await bukaMenu(page, 'Impor data & integrasi')
  await expect(page.getByText('DACUM_SD_v2.1.xlsx').first()).toBeVisible()
})

test('demo Super Admin: Tenant dengan panel modul, lalu Konfigurasi platform', async ({ page }) => {
  await mockApi(page, penanganSuperDemo)
  await masukDemo(page, 'super')
  await mendarat(page, 'Tenant')
  await page.getByRole('table', { name: 'Daftar tenant' }).getByRole('row').filter({ hasText: 'PT Elitery' }).getByRole('button', { name: 'Modul' }).click()
  await expect(page.getByRole('region', { name: 'Modul PT Elitery' }).getByRole('row').filter({ hasText: 'Training Needs' })).toContainText('Aktif')
  await bukaMenu(page, 'Konfigurasi platform')
  await expect(page.getByText('PT Elitery').first()).toBeVisible()
})
