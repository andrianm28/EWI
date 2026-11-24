import { test, expect, type Page, type Route } from '@playwright/test'

// B13 Learning Intervention: Library, Program & Course, Permintaan & pengembangan, Draf modul. API di-mock.
// Spek: docs/designs/b13-learning-intervention.md.
const VENDOR = 'Mahaka Institute'
const job = { id: 'jr-1', name: 'Engineer Service Delivery' }
const mod = (o: Record<string, unknown>) => ({
  level: 'advanced', stream: 'Specific Technical', catalogItemId: null, jobRoles: [job], counts: { K: 1, S: 1, A: 1 },
  status: { key: 'none', via: null }, priority: null, recommendation: 'vendor', request: null, draft: null, ...o,
})
const RCA = mod({ id: 'm-1', code: 'ST-A2', name: 'Root Cause Analysis', recommendation: 'dev', priority: { rank: 1, share: 0.6, cumulativeShare: 0.6, label: 'Root Cause Analysis' } })
const PM = { id: 'jr-2', name: 'Project Manager' }
const ITIL = mod({ id: 'm-2', code: 'TC-B1', name: 'ITIL Foundation', level: 'basic', stream: 'Technical Competencies', jobRoles: [job, PM] })
const DRAFT = {
  id: 'd-1', moduleId: 'm-1', moduleCode: 'ST-A2', moduleName: 'Root Cause Analysis', moduleLevel: 'advanced', moduleStream: 'Specific Technical',
  moduleObjective: 'Mampu menemukan akar masalah', status: 'draft', generatedBy: 'template', reviewerName: null, reviewNote: null,
  objectives: [{ kind: 'K', item: 'Konsep 5 Whys', text: 'Menjelaskan konsep 5 Whys pada tes tertulis (skor ≥ 80%)', assessment: 'Tes tertulis' }],
  sessions: [{ order: 1, title: 'Pembuka', detail: 'Relevansi', covers: 'Semua tujuan' }],
  assessments: [{ kind: 'K', title: 'Knowledge', detail: 'Tes tertulis, lulus bila skor ≥ 80%.', objectives: 1 }],
}

async function setup(page: Page, calls: { method: string; url: string; body: unknown }[] = [], opt: { singleJob?: boolean; slowPareto?: boolean; draft?: Record<string, unknown> } = {}) {
  const user = { id: 'u-1', tenantId: 't-1', email: 'hr@demo.test', role: 'hr_admin' }
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  // PK-16: form kata sandi hanya tampil bila API mengizinkan (dev/staging)
  await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: true, emailLink: true } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna'], products: ['full_suite'], flags: { 'module.dna': true, 'module.tna': true, 'module.li': true } } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  let draft = { ...DRAFT, ...opt.draft }
  await page.route(/\/api\/li\//, async (r: Route) => {
    const req = r.request(); const url = new URL(req.url()); const path = url.pathname.replace(/^.*\/api\/li/, '')
    const body = req.postData() ? JSON.parse(req.postData()!) : null
    calls.push({ method: req.method(), url: `${path}${url.search}`, body })
    if (path === '/modules' && req.method() === 'GET') {
      const prio = url.searchParams.get('priority') === 'pareto'
      // respons filter Pareto sengaja lambat: menguji penjaga urutan permintaan (respons basi diabaikan)
      if (prio && opt.slowPareto) await new Promise((ok) => setTimeout(ok, 800))
      const none = url.searchParams.get('level') === 'intermediate'
      return r.fulfill({ json: {
        data: none ? [] : prio ? [RCA] : [RCA, ITIL], vendorName: VENDOR,
        kpis: { modules: 2, knowledge: 2, skill: 2, attitude: 2, streams: 2 },
        pareto: { available: true, count: 1, codes: ['ST-A2'], cumulativeShare: 0.6, withoutGapData: 1, unlinkedFindings: 0 },
        filters: { jobRoles: opt.singleJob ? [job] : [job, PM], streams: ['Specific Technical', 'Technical Competencies'] },
      } })
    }
    const m = path.match(/^\/modules\/(m-\d)$/)
    if (m && req.method() === 'GET') {
      const row = m[1] === 'm-1' ? RCA : ITIL
      return r.fulfill({ json: { data: { ...row, objective: 'Tujuan modul', vendorName: VENDOR, items: [{ kind: 'K', text: 'Konsep dasar' }, { kind: 'S', text: 'Praktik' }, { kind: 'A', text: 'Teliti' }] } } })
    }
    if (path === '/modules/m-2/request') return r.fulfill({ status: 201, json: { data: { id: 'rq-1' } } })
    if (path === '/requests/bulk') return r.fulfill({ status: 201, json: { data: { created: 1, skipped: 0 } } })
    if (path === '/modules/m-1/draft' || path === '/modules/m-3/draft') return r.fulfill({ status: 201, json: { data: draft } })
    if (path === '/requests' && req.method() === 'GET') {
      return r.fulfill({ json: { vendorName: VENDOR, data: {
        vendor: [{ id: 'rq-1', moduleId: 'm-2', moduleCode: 'TC-B1', moduleName: 'ITIL Foundation', vendorName: VENDOR, status: 'requested', requestedAt: '2026-11-19' }],
        drafts: [{ id: 'd-1', moduleId: 'm-1', moduleCode: 'ST-A2', moduleName: 'Root Cause Analysis', status: draft.status, reviewerName: null, reviewNote: null }],
        candidates: [{ id: 'm-3', code: 'ST-B9', name: 'Alur Layanan SLA', priority: { rank: 2, share: 0.2, cumulativeShare: 0.8 } }],
      } } })
    }
    if (path === '/catalog') return r.fulfill({ json: { data: [{ id: 'c-1', title: 'Course RCA di LMS', source: 'moodle', externalRef: 'C-1' }] } })
    if (path === '/modules/m-1' && req.method() === 'PATCH') return r.fulfill({ json: { data: RCA } })
    if (path === '/drafts/d-1' && req.method() === 'DELETE') return r.fulfill({ status: 204, body: '' })
    if (path === '/requests/rq-1') return r.fulfill({ json: { data: { id: 'rq-1', status: body.status } } })
    if (path === '/programs') {
      return r.fulfill({ json: { vendorName: VENDOR, data: {
        jobRoles: [{ ...job, hasDictionary: true }, { id: 'jr-2', name: 'Project Manager', hasDictionary: false }], jobRoleId: url.searchParams.get('jobRoleId') ?? 'jr-1',
        level: url.searchParams.get('level') ?? 'basic', levels: [{ level: 'basic', count: 1 }, { level: 'intermediate', count: 0 }, { level: 'advanced', count: 1 }],
        kpis: { courses: 2, available: 0, inProgress: 0, noSource: 2 },
        groups: [{ stream: 'Specific Technical', modules: [RCA] }, { stream: 'Technical Competencies', modules: [ITIL] }], pareto: { available: true, codes: ['ST-A2'] },
      } } })
    }
    if (path === '/drafts/d-1' && req.method() === 'GET') return r.fulfill({ json: { data: draft } })
    if (path === '/drafts/d-1' && req.method() === 'PUT') { draft = { ...draft, ...body }; return r.fulfill({ json: { data: draft } }) }
    if (path === '/drafts/d-1/submit') { draft = { ...draft, status: 'sme_review' }; return r.fulfill({ json: { data: draft } }) }
    if (path === '/drafts/d-1/review') { draft = { ...draft, status: body.decision, reviewerName: body.reviewerName }; return r.fulfill({ json: { data: draft } }) }
    return r.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: `mock tidak ada: ${path}` } } })
  })
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigasi utama' })

test('menu Learning Intervention muncul saat flag module.li menyala; Library menampilkan KPI, Pareto, dan detail', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await expect(nav(page).getByRole('button', { name: 'Learning Intervention' })).toBeVisible()
  await nav(page).getByRole('link', { name: 'Library' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible()
  await expect(page.getByRole('note').filter({ hasText: 'Prioritas Pareto 20/80' })).toContainText('1 modul prioritas Pareto (ST-A2) menyumbang sekitar 60% total gap. 1 modul lain belum punya data gap.')
  await expect(page.getByTestId('jumlah-modul')).toHaveText('2 dari 2 modul')
  await expect(page.getByTestId('detail-modul')).toContainText('Root Cause Analysis')
  await expect(page.getByTestId('detail-modul')).toContainText('Sumber yang disarankan: Dikembangkan bersama ELGOS.')
  await expect(page.getByText(`ELGOS tidak mengirim apa pun ke ${VENDOR}`)).toBeVisible()

  await page.getByRole('group', { name: 'Prioritas' }).getByRole('button', { name: 'Prioritas Pareto saja' }).click()
  await expect(page.getByTestId('jumlah-modul')).toHaveText('1 dari 2 modul')
  expect(calls.some((c) => c.url.includes('priority=pareto'))).toBe(true)

  await page.getByRole('group', { name: 'Prioritas' }).getByRole('button', { name: 'Semua modul' }).click()
  await page.getByRole('button', { name: /ITIL Foundation/ }).click()
  await page.getByRole('button', { name: `Minta ke ${VENDOR}` }).click()
  await expect(page.getByTestId('info')).toContainText('Permintaan TC-B1 dicatat')
  expect(calls.find((c) => c.url === '/modules/m-2/request')?.method).toBe('POST')
})

test('Kembangkan dengan ELGOS: draf melewati empat tahap, diajukan, lalu keputusan SME dicatat HR', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await page.goto('/lib')
  await page.getByRole('button', { name: 'Kembangkan dengan ELGOS' }).click()
  await expect(page).toHaveURL(/\/req\/draf\/d-1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Root Cause Analysis' })).toBeVisible()
  await expect(page.getByText('1 dari 1 tujuan terukur.')).toBeVisible()

  // tujuan tanpa angka ditandai, dan tombol ajukan terkunci
  await page.getByLabel('Tujuan terukur 1').fill('Memahami konsep akar masalah')
  await expect(page.getByText('Tambahkan kriteria ukur berupa angka')).toBeVisible()
  await page.getByLabel('Tujuan terukur 1').fill('Menjelaskan 5 Whys dengan benar pada 4 dari 5 soal')
  for (const [next, label] of [['Lanjut: rancang materi', 'Rancangan materi'], ['Lanjut: asesmen', 'Asesmen'], ['Lanjut: tinjau dan ajukan', 'Tinjau dan ajukan']]) {
    await page.getByRole('button', { name: next }).click()
    await expect(page.getByRole('heading', { level: 2, name: label })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Kirim ke SME untuk tinjauan' }).click()
  await expect(page.getByTestId('status-draf')).toHaveText('Menunggu tinjauan SME')
  expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ objectives: [{ text: 'Menjelaskan 5 Whys dengan benar pada 4 dari 5 soal' }] })

  await expect(page.getByRole('button', { name: 'Catat: disetujui SME' })).toBeDisabled()
  await page.getByLabel('Nama SME yang meninjau').fill('Budi')
  await page.getByRole('button', { name: 'Catat: disetujui SME' }).click()
  await expect(page.getByTestId('status-draf')).toHaveText('Disetujui SME')
  expect(calls.find((c) => c.url === '/drafts/d-1/review')?.body).toMatchObject({ decision: 'approved', reviewerName: 'Budi' })

  // rancangan disetujui: modul menjadi tersedia setelah course katalog ditautkan
  await page.goto('/lib')
  await page.getByLabel('Pilih course').selectOption('c-1')
  await page.getByRole('button', { name: 'Tautkan course' }).click()
  await expect(page.getByTestId('info')).toHaveText('Course ditautkan. Modul kini tersedia.')
  expect(calls.find((c) => c.method === 'PATCH' && c.url === '/modules/m-1')?.body).toEqual({ catalogItemId: 'c-1' })
})

test('Program & Course dan Permintaan: kamus belum ada, permintaan massal, dan langkah vendor dicatat', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await page.goto('/prog')
  await expect(page.getByRole('heading', { level: 1, name: 'Program & Course' })).toBeVisible()
  // X-1 paritas: kelas li-* bersama tetap termuat saat /prog dibuka langsung (tanpa Library)
  await expect(page.getByRole('group', { name: 'Jabatan' })).toHaveCSS('display', 'flex')
  await expect(page.getByTestId('course-TC-B1')).toContainText('Belum tersedia')
  await page.getByRole('button', { name: 'Minta semua modul generik di program ini' }).click()
  await expect(page.getByTestId('info')).toHaveText('1 permintaan dicatat.')
  expect(calls.find((c) => c.url === '/requests/bulk')?.body).toEqual({ scope: 'program', jobRoleId: 'jr-1', level: 'basic' })
  await page.getByRole('button', { name: /Project Manager/ }).click()
  await expect(page.getByText('Kamus kompetensi dan library modul untuk Project Manager belum tersedia')).toBeVisible()

  await nav(page).getByRole('link', { name: 'Permintaan & pengembangan' }).click()
  await expect(page.getByTestId('permintaan-TC-B1')).toContainText('Diminta')
  // LI-26 paritas: dibuka langsung, Permintaan tetap dua kolom (li-split dari li.css)
  await page.goto('/req')
  await expect(page.getByTestId('permintaan-TC-B1')).toBeVisible()
  await expect(page.locator('.li-split')).toHaveCSS('display', 'grid')
  await expect(page.getByTestId('draf-ST-A2')).toContainText('Draf, belum diajukan')
  await page.getByRole('button', { name: 'Catat: dikonfirmasi vendor' }).click()
  await expect.poll(() => calls.find((c) => c.url === '/requests/rq-1')?.body).toEqual({ status: 'confirmed' })
})

test('Learning Intervention tidak tampil dan tidak bisa dibuka saat flag mati', async ({ page }) => {
  await setup(page)
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna'], flags: { 'module.dna': true, 'module.tna': true } } }))
  await page.reload()
  await expect(nav(page).getByRole('button', { name: 'Learning Intervention' })).toHaveCount(0)
  await page.goto('/lib')
  await expect(page).toHaveURL(/\/$/)
})

test('Learning Intervention tidak tampil dan tidak bisa dibuka bila tenant tidak punya full_suite, walau flag menyala', async ({ page }) => {
  await setup(page)
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna'], products: ['dna', 'tna'], flags: { 'module.dna': true, 'module.tna': true, 'module.li': true } } }))
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('button', { name: 'Learning Intervention' })).toHaveCount(0)
  await page.goto('/lib')
  await expect(page).toHaveURL(/\/$/)
})

test('P3 X-3: breadcrumb bersama di Library, Program, dan Permintaan', async ({ page }) => {
  await setup(page)
  for (const [path, teks] of [['/lib', 'Library'], ['/prog', 'Program & Course'], ['/req', 'Permintaan & pengembangan']] as const) {
    await page.goto(path)
    const crumb = page.getByRole('navigation', { name: 'Lokasi' })
    await expect(crumb).toHaveText(new RegExp(`Learning Intervention\\s*›\\s*${teks}`))
    await expect(crumb).toHaveCSS('font-size', '12px')
  }
})

test('paritas S4: judul top bar Learning Intervention mengikuti TITLES mockup', async ({ page }) => {
  await setup(page)
  for (const [path, teks] of [['/lib', 'Library'], ['/prog', 'Program & Course'], ['/req', 'Permintaan & pengembangan']] as const) {
    await page.goto(path)
    await expect(page.getByTestId('judul-layar')).toHaveText(`Learning Intervention · ${teks}`)
    await expect(page).toHaveTitle(`Learning Intervention · ${teks} · ELGOS`)
  }
})

test('P6 LI-5/LI-7: filter berupa baris chip dan baris modul seperti mockup', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls, { singleJob: true })
  await page.goto('/lib')
  await expect(page.getByText('Saat ini seluruh modul berlaku untuk jabatan Engineer Service Delivery. Semua modul Knowledge, Skill, dan Attitude (KSA) yang teridentifikasi dari DACUM Tool 2.')).toBeVisible()
  await expect(page.getByText('Butir Knowledge')).toBeVisible()
  await expect(page.getByText('DACUM Tool 2 dan 3, 2 rumpun')).toBeVisible()
  await expect(page.getByText('sikap kerja')).toBeVisible()

  const filters = page.getByTestId('filter-modul')
  await expect(filters.locator('select')).toHaveCount(0)
  for (const [grup, awal] of [['Jabatan', 'Semua jabatan'], ['Prioritas', 'Semua modul'], ['Tipe', 'Semua'], ['Level', 'Semua'], ['Rumpun', 'Semua']]) {
    await expect(filters.getByRole('group', { name: grup }).getByRole('button', { name: awal, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await filters.getByRole('group', { name: 'Tipe' }).getByRole('button', { name: 'Skill' }).click()
  await expect(filters.getByRole('group', { name: 'Tipe' }).getByRole('button', { name: 'Skill' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => calls.some((c) => c.url.includes('type=S'))).toBe(true)

  const rca = page.getByRole('button', { name: /Root Cause Analysis/ })
  for (const t of ['ST-A2', 'Specific Technical · Advanced', 'K 1', 'S 1', 'A 1', 'Engineer Service Delivery', 'Pareto #1 · 60% gap', 'Belum tersedia']) await expect(rca).toContainText(t)
  await expect(page.getByRole('button', { name: /ITIL Foundation/ })).toContainText('2 jabatan')
  await expect(rca).toHaveCSS('background-color', 'rgb(236, 239, 245)')

  const detail = page.getByTestId('detail-modul')
  // N2: tenant satu jabatan menyebut jabatan itu walau filter "Semua jabatan"
  await expect(detail).toContainText('Termasuk modul yang bersama-sama menyumbang sekitar 60% total gap jabatan Engineer Service Delivery (kumulatif sampai urutan ini). Sediakan lebih dulu.')
  // LI-9/LI-10: meta, status, Pareto, dan jabatan berupa chip
  await expect(detail.locator('.el-chip')).toContainText(['ST-A2', 'Advanced', 'Specific Technical', 'Belum tersedia', 'Pareto #1 · 60% gap', 'Engineer Service Delivery'])
  // LI-12: ikon auto_awesome dan dua tombol sebaris
  const minta = (await detail.getByRole('button', { name: 'Minta ke Mahaka Institute' }).boundingBox())!
  const kembang = detail.getByRole('button', { name: 'Kembangkan dengan ELGOS' })
  await expect(kembang.locator('svg path')).toHaveAttribute('d', /^m760-600/)
  expect(Math.abs((await kembang.boundingBox())!.y - minta.y)).toBeLessThan(2)
  // LI-3: jumlah modul prioritas yang spesifik perusahaan (hanya tanpa filter tipe/level/rumpun/prioritas)
  const note = page.getByRole('note').filter({ hasText: 'Prioritas Pareto 20/80' })
  await expect(note).not.toContainText('bersifat spesifik perusahaan')
  await filters.getByRole('group', { name: 'Tipe' }).getByRole('button', { name: 'Semua', exact: true }).click()
  await expect(page.getByRole('note').filter({ hasText: 'Prioritas Pareto 20/80' })).toContainText('1 modul prioritas bersifat spesifik perusahaan dan perlu dikembangkan bersama ELGOS.')
  await expect(detail).toContainText('Usulan awal, dapat diubah.')
  await expect(page.getByRole('button', { name: 'Minta modul prioritas yang generik ke Mahaka' })).toBeVisible()
})

test('P6 LI-27: wizard dua kolom, stepper dan catatan pendekatan di kartu kiri', async ({ page }) => {
  await setup(page)
  await page.goto('/req/draf/d-1')
  const stepper = page.getByTestId('draf-langkah')
  const konten = page.getByTestId('draf-konten')
  await expect(stepper.getByRole('list', { name: 'Tahap pengembangan modul' })).toBeVisible()
  await expect(stepper).toContainText('Pendekatan: backward design')
  const a = (await stepper.boundingBox())!
  const b = (await konten.boundingBox())!
  expect(Math.round(a.width)).toBe(240)
  expect(b.x).toBeGreaterThan(a.x + a.width)
  expect(Math.abs(b.y - a.y)).toBeLessThan(2)
  await expect(page.getByRole('button', { name: 'Lanjut: rancang materi' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Simpan perubahan' })).toBeHidden()
  await page.getByText('Kelola draf').click()
  await expect(page.getByRole('button', { name: 'Simpan perubahan' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hapus draf' })).toBeVisible()
  for (const n of ['Lanjut: rancang materi', 'Lanjut: asesmen', 'Lanjut: tinjau dan ajukan']) await page.getByRole('button', { name: n }).click()
  await expect(konten).toContainText('Seluruh tujuan pembelajaran terukur (1 dari 1).')
  await expect(konten).toContainText('Setiap tujuan memiliki instrumen asesmen dan kriteria lulus.')
})

test('P6 Program & Permintaan: kartu jabatan, tab, catatan, dan chip hitungan seperti mockup', async ({ page }) => {
  await setup(page)
  await page.goto('/prog')
  await expect(page.getByRole('button', { name: /Engineer Service Delivery/ })).toContainText('Kamus tersedia')
  // LI-14 (keputusan user 24 Nov): hijau bila kamus ada, netral bila belum; tanpa chip "Contoh (dummy)"
  await expect(page.getByRole('button', { name: /Engineer Service Delivery/ }).locator('.el-chip')).toHaveClass(/el-chip--success/)
  const tanpaKamus = page.getByRole('button', { name: /Project Manager/ }).locator('.el-chip')
  await expect(tanpaKamus).toHaveText('Belum tersedia')
  await expect(tanpaKamus).toHaveClass(/el-chip--neutral/)
  await expect(page.getByText('Contoh (dummy)')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Basic · 1 course' })).toBeVisible()
  await expect(page.getByText('Program ini untuk jabatan Engineer Service Delivery.')).toBeVisible()
  await expect(page.getByText('Diminta / draf')).toBeVisible()
  await expect(page.getByTestId('course-TC-B1').getByRole('button', { name: 'Minta ke Mahaka' })).toBeVisible()
  // LI-18: catatan Pareto menyebut kode course prioritas di program ini
  await expect(page.getByRole('note').filter({ hasText: 'Prioritas Pareto:' })).toHaveText('Prioritas Pareto: 1 dari 2 course di program ini adalah prioritas Pareto: ST-A2. Course prioritas tampil paling atas di tiap rumpun.')
  await expect(page.getByTestId('course-ST-A2')).toContainText('Pareto #1 · 60% gap')
  await page.goto('/req')
  await expect(page.getByText('dengan bantuan templat ELGOS')).toBeVisible()
  await expect(page.getByTestId('jumlah-draf')).toHaveText('1 draf')
  await expect(page.getByTestId('jumlah-permintaan')).toHaveText('1')
})

test('P6 Permintaan: kandidat "Kembangkan" membuat draf dan membuka wizard', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await page.goto('/req')
  const kandidat = page.getByTestId('kandidat-ST-B9')
  await expect(kandidat).toContainText('Pareto #2 · 20% gap')
  await kandidat.getByRole('button', { name: 'Kembangkan' }).click()
  await expect(page).toHaveURL(/\/req\/draf\/d-1$/)
  expect(calls.find((c) => c.url === '/modules/m-3/draft')?.method).toBe('POST')
})

test('P6 Library: hasil filter kosong memberi pesan dan tombol hapus semua filter', async ({ page }) => {
  await setup(page)
  await page.goto('/lib')
  const filters = page.getByTestId('filter-modul')
  await filters.getByRole('group', { name: 'Level' }).getByRole('button', { name: 'Intermediate' }).click()
  await expect(page.getByTestId('jumlah-modul')).toHaveText('0 dari 2 modul')
  await expect(page.getByText('Tidak ada modul yang cocok dengan filter.')).toBeVisible()
  await expect(page.getByTestId('detail-modul')).toHaveCount(0)
  await page.getByRole('button', { name: 'Hapus semua filter' }).click()
  await expect(page.getByTestId('jumlah-modul')).toHaveText('2 dari 2 modul')
  await expect(filters.getByRole('group', { name: 'Level' }).getByRole('button', { name: 'Semua', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('P6 Library: respons filter yang basi tidak menimpa pilihan terbaru', async ({ page }) => {
  await setup(page, [], { slowPareto: true })
  await page.goto('/lib')
  const prio = page.getByTestId('filter-modul').getByRole('group', { name: 'Prioritas' })
  await expect(page.getByTestId('jumlah-modul')).toHaveText('2 dari 2 modul')
  // P9 IR-6: tunggu respons Pareto yang lambat (800 ms) benar-benar tiba, bukan jeda waktu tetap
  const pareto = page.waitForResponse((r) => r.url().includes('/api/li/modules') && r.url().includes('priority=pareto'))
  await prio.getByRole('button', { name: 'Prioritas Pareto saja' }).click()
  await prio.getByRole('button', { name: 'Semua modul' }).click()
  await (await pareto).finished()
  await page.evaluate('new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))')
  await expect(page.getByTestId('jumlah-modul')).toHaveText('2 dari 2 modul')
})

test('P6 Draf: Simpan perubahan, simpan otomatis saat pindah langkah dan keluar, hapus dengan konfirmasi', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await page.goto('/req/draf/d-1')
  const puts = () => calls.filter((c) => c.method === 'PUT')

  // M2: Simpan perubahan dari menu Kelola draf
  await page.getByLabel('Tujuan terukur 1').fill('Menjelaskan 5 Whys pada 4 dari 5 soal')
  await page.getByText('Kelola draf').click()
  await page.getByRole('button', { name: 'Simpan perubahan' }).click()
  await expect(page.getByTestId('info')).toHaveText('Perubahan disimpan.')
  expect(puts().at(-1)?.body).toMatchObject({ objectives: [{ text: 'Menjelaskan 5 Whys pada 4 dari 5 soal' }] })

  // M1: tanpa perubahan, pindah langkah tidak menyimpan; dengan perubahan, tersimpan otomatis
  const before = puts().length
  await page.getByRole('button', { name: 'Lanjut: rancang materi' }).click()
  expect(puts().length).toBe(before)
  await page.getByLabel('Isi sesi 1').fill('Relevansi dengan tugas harian')
  await page.getByRole('button', { name: 'Lanjut: asesmen' }).click()
  await expect.poll(() => puts().length).toBe(before + 1)
  expect(puts().at(-1)?.body).toMatchObject({ sessions: [{ detail: 'Relevansi dengan tugas harian' }] })
  // N1: cakupan asesmen "n dari m tujuan"
  await expect(page.getByTestId('draf-konten')).toContainText('1 dari 1 tujuan tercakup')

  // M1: keluar lewat breadcrumb dengan perubahan → disimpan dulu
  await page.getByLabel('Instrumen dan kriteria lulus Knowledge').fill('Tes tertulis 10 soal, lulus bila skor ≥ 80%.')
  await page.getByRole('navigation', { name: 'Lokasi' }).getByRole('link', { name: 'Permintaan & pengembangan' }).click()
  await expect(page).toHaveURL(/\/req$/)
  expect(puts().at(-1)?.body).toMatchObject({ assessments: [{ detail: 'Tes tertulis 10 soal, lulus bila skor ≥ 80%.' }] })

  // hapus draf: perlu konfirmasi, Batal membatalkan
  await page.goto('/req/draf/d-1')
  await page.getByText('Kelola draf').click()
  await page.getByRole('button', { name: 'Hapus draf' }).click()
  await expect(page.getByText('Yakin hapus draf ini?')).toBeVisible()
  await page.getByRole('button', { name: 'Batal' }).click()
  await expect(page.getByText('Yakin hapus draf ini?')).toBeHidden()
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  await page.getByRole('button', { name: 'Hapus draf' }).click()
  await page.getByRole('button', { name: 'Ya, hapus' }).click()
  await expect(page).toHaveURL(/\/req$/)
  expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/drafts/d-1')
})

// P9 CD-1: keluar atau sesi habis di layar draf tidak boleh tertahan simpan otomatis onBeforeRouteLeave
async function putDrafButuhToken(page: Page, calls: { method: string; url: string; body: unknown }[], status = 401) {
  await page.route('**/api/li/drafts/d-1', async (r: Route) => {
    const req = r.request()
    if (req.method() !== 'PUT') return r.fallback()
    calls.push({ method: 'PUT', url: '/drafts/d-1', body: JSON.parse(req.postData() ?? 'null') })
    const auth = await req.headerValue('authorization')
    return r.fulfill({ status, json: { error: { code: auth ? 'SESSION_EXPIRED' : 'UNAUTHORIZED', message: 'Sesi berakhir' } } })
  })
}

test('P9 CD-1: tombol Keluar di layar draf dengan perubahan langsung ke login, tanpa simpan tanpa token', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await putDrafButuhToken(page, calls)
  await page.goto('/req/draf/d-1')
  await page.getByLabel('Tujuan terukur 1').fill('Menjelaskan 5 Whys pada 4 dari 5 soal')
  await page.getByRole('button', { name: 'Keluar' }).click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Keluar' })).toHaveCount(0)
  expect(calls.filter((c) => c.method === 'PUT')).toEqual([])
})

test('P9 CD-1: sesi habis saat simpan otomatis waktu meninggalkan draf: tetap pindah ke login', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await putDrafButuhToken(page, calls)
  await page.goto('/req/draf/d-1')
  await page.getByLabel('Tujuan terukur 1').fill('Menjelaskan 5 Whys pada 4 dari 5 soal')
  await page.getByRole('navigation', { name: 'Lokasi' }).getByRole('link', { name: 'Permintaan & pengembangan' }).click()
  await expect(page).toHaveURL(/\/login\?alasan=sesi-habis/)
  // satu percobaan simpan dengan token; tidak ada percobaan ulang tanpa token
  expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
})

// Review 24 Nov: PUT draf yang ditahan sampai `release()` dipanggil (simpan otomatis sedang berjalan)
async function tahanPutDraf(page: Page, calls: { method: string; url: string; body: unknown }[]) {
  let release!: () => void
  const held = new Promise<void>((ok) => { release = ok })
  await page.route('**/api/li/drafts/d-1', async (r: Route) => {
    if (r.request().method() !== 'PUT') return r.fallback()
    calls.push({ method: 'PUT', url: '/drafts/d-1', body: JSON.parse(r.request().postData() ?? 'null') })
    await held
    return r.fulfill({ json: { data: { ...DRAFT, ...JSON.parse(r.request().postData() ?? '{}') } } })
  })
  return () => release()
}

// Review 24 Nov: klik ganda Lanjut saat simpan otomatis berjalan tidak melompati langkah. Dua klik sinkron di satu
// tugas peramban tiba sebelum tombol dirender nonaktif, jadi yang diuji adalah penjaga `busy` di go() sendiri.
test('Draf: klik ganda Lanjut saat simpan otomatis hanya maju satu langkah dan menyimpan sekali', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  const release = await tahanPutDraf(page, calls)
  try {
    await page.goto('/req/draf/d-1')
    await page.getByLabel('Tujuan terukur 1').fill('Menjelaskan 5 Whys pada 4 dari 5 soal')
    const next = page.getByRole('button', { name: 'Lanjut: rancang materi' })
    await next.evaluate((b) => { const el = b as unknown as { click(): void }; el.click(); el.click() })
    await expect(next).toBeDisabled()
  } finally { release() }
  await expect(page.getByRole('heading', { name: 'Rancangan materi' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kembali' })).toBeEnabled()
  expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
})

// Review 24 Nov (egm): keluar saat simpan otomatis dari Lanjut masih berjalan menunggu simpan itu, bukan menyimpan dua kali
test('Draf: keluar saat simpan otomatis berjalan menunggu simpan itu lalu pindah, satu PUT', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  const release = await tahanPutDraf(page, calls)
  try {
    await page.goto('/req/draf/d-1')
    await page.getByLabel('Tujuan terukur 1').fill('Menjelaskan 5 Whys pada 4 dari 5 soal')
    await page.getByRole('button', { name: 'Lanjut: rancang materi' }).click()
    await expect.poll(() => calls.filter((c) => c.method === 'PUT').length).toBe(1)
    await page.getByRole('navigation', { name: 'Lokasi' }).getByRole('link', { name: 'Permintaan & pengembangan' }).click()
  } finally { release() }
  await expect(page).toHaveURL(/\/req$/)
  await expect(page.getByRole('dialog', { name: 'Tinggalkan tanpa menyimpan?' })).toHaveCount(0)
  expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
})

// Review 24 Nov (egm): kembali lewat tombol Back peramban, simpan gagal, "Tinggalkan" mengulang navigasi Back (tanpa entri riwayat ganda)
test('Draf: Back peramban dengan simpan gagal: dialog memuat pesan API, Tinggalkan kembali tanpa entri riwayat baru', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await page.route('**/api/li/drafts/d-1', async (r: Route) => {
    if (r.request().method() !== 'PUT') return r.fallback()
    calls.push({ method: 'PUT', url: '/drafts/d-1', body: null })
    return r.fulfill({ status: 500, json: { error: { code: 'INTERNAL', message: 'Penyimpanan draf sedang gangguan' } } })
  })
  await page.goto('/req')
  await page.getByTestId('draf-ST-A2').getByRole('link', { name: 'Buka' }).click()
  await expect(page).toHaveURL(/\/req\/draf\/d-1$/)
  const panjang = await page.evaluate<number>('history.length')
  await page.getByLabel('Tujuan terukur 1').fill('Menjelaskan 5 Whys pada 4 dari 5 soal')
  await page.goBack()
  const dialog = page.getByRole('dialog', { name: 'Tinggalkan tanpa menyimpan?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Penyimpanan draf sedang gangguan')
  await expect(page).toHaveURL(/\/req\/draf\/d-1$/)
  // ringkasan galat tidak ikut diumumkan selama dialog terbuka
  await expect(page.locator('.el-errsum')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Tinggalkan tanpa menyimpan' }).click()
  await expect(page).toHaveURL(/\/req$/)
  expect(await page.evaluate<number>('history.length')).toBe(panjang)
})

// Review 24 Nov: simpan otomatis gagal saat meninggalkan draf tidak boleh mengunci layar
test('Draf: simpan otomatis gagal saat keluar menawarkan "Tinggalkan tanpa menyimpan?"', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await page.route('**/api/li/drafts/d-1', async (r: Route) => {
    if (r.request().method() !== 'PUT') return r.fallback()
    calls.push({ method: 'PUT', url: '/drafts/d-1', body: null })
    return r.fulfill({ status: 500, json: { error: { code: 'INTERNAL', message: 'Draf tidak bisa disimpan' } } })
  })
  await page.goto('/req/draf/d-1')
  await page.getByLabel('Tujuan terukur 1').fill('Menjelaskan 5 Whys pada 4 dari 5 soal')
  const crumb = page.getByRole('navigation', { name: 'Lokasi' }).getByRole('link', { name: 'Permintaan & pengembangan' })
  await crumb.click()
  const dialog = page.getByRole('dialog', { name: 'Tinggalkan tanpa menyimpan?' })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/req\/draf\/d-1$/)
  // Tetap di sini: dialog tertutup, perubahan masih ada
  await dialog.getByRole('button', { name: 'Tetap di sini' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('Tujuan terukur 1')).toHaveValue('Menjelaskan 5 Whys pada 4 dari 5 soal')
  // coba lagi lalu tinggalkan: pindah tanpa simpan ulang
  await crumb.click()
  await expect(dialog).toBeVisible()
  const putsBefore = calls.filter((c) => c.method === 'PUT').length
  await dialog.getByRole('button', { name: 'Tinggalkan tanpa menyimpan' }).click()
  await expect(page).toHaveURL(/\/req$/)
  expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(putsBefore)
})

// Paritas P8 (docs/designs/paritas-mockup/p8-keputusan-r1-r22.md)
test('P8 R8: rancangan modul memakai label jujur "Templat ELGOS"', async ({ page }) => {
  await setup(page)
  await page.goto('/req/draf/d-1')
  await expect(page.getByText('Templat ELGOS menyusun draf dari tujuan pembelajaran di DACUM Tool 1 (job function) dan Tool 2 (KSA), dengan prinsip instructional design. Anda meninjau tiap tahap sebelum lanjut.')).toBeVisible()
  await expect(page.locator('.el-audit')).toHaveText(/^Templat ELGOS\s*·\s*sumber: DACUM Tool 1 dan Tool 2\s*·\s*draf perlu persetujuan SME sebelum dipakai$/)
  await expect(page.getByText('Agen ELGOS')).toHaveCount(0)
})

test('P8 R20: kalimat vendor menjadi petunjuk kecil di bawah tombol Minta; alur Permintaan sama dengan mockup', async ({ page }) => {
  await setup(page)
  await page.goto('/lib')
  await expect(page.getByText('Tombol "Minta" hanya mencatat')).toHaveCount(0)
  const detail = page.getByTestId('detail-modul')
  const minta = detail.getByRole('button', { name: `Minta ke ${VENDOR}` })
  const hint = detail.getByText(`Tombol Minta hanya mencatat permintaan di ELGOS; ELGOS tidak mengirim apa pun ke ${VENDOR}.`)
  await expect(hint).toBeVisible()
  await expect(hint).toHaveCSS('font-size', '12px')
  await expect(minta).toHaveAttribute('aria-describedby', (await hint.getAttribute('id'))!)
  expect((await hint.boundingBox())!.y).toBeGreaterThan((await minta.boundingBox())!.y)

  await page.goto('/req')
  await expect(page.getByText(`Alur: diminta → dikonfirmasi ${VENDOR} → modul dikirim → dipasang di EliteMentor.`, { exact: true })).toBeVisible()
  const hintReq = page.getByText(`HR mencatat tiap langkah; ELGOS tidak mengirim apa pun ke ${VENDOR}.`, { exact: true })
  await expect(hintReq).toHaveCSS('font-size', '12px')
})

test('gap B1: draf lama berisi tujuan string dan asesmen tanpa hitungan tetap bisa disunting dan disimpan', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await setup(page, calls, { draft: {
    objectives: ['Menjelaskan langkah 5 Whys pada insiden P2'],
    assessments: [{ kind: 'K', title: 'Knowledge', detail: 'Tes tertulis, lulus bila skor ≥ 80%.' }],
  } })
  await page.goto('/req/draf/d-1')
  await expect(page.getByLabel('Tujuan terukur 1')).toHaveValue('Menjelaskan langkah 5 Whys pada insiden P2')
  await page.getByLabel('Tujuan terukur 1').fill('Menjelaskan langkah 5 Whys pada 4 dari 5 insiden P2')
  await page.getByRole('button', { name: 'Lanjut: rancang materi' }).click()
  await page.getByRole('button', { name: 'Lanjut: asesmen' }).click()
  await expect(page.getByText('1 dari 1 tujuan tercakup')).toBeVisible()
  await expect(page.getByText(/undefined/)).toHaveCount(0)
  expect(errors).toEqual([])
  const put = calls.find((c) => c.method === 'PUT' && c.url === '/drafts/d-1')
  expect((put?.body as { objectives: { kind: string; text: string }[] }).objectives[0]).toMatchObject({ kind: 'K', text: 'Menjelaskan langkah 5 Whys pada 4 dari 5 insiden P2' })
})
