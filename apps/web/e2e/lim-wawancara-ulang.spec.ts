import { test, expect, type Page, type Route } from '@playwright/test'

// B15 tahap 3: karyawan menjalankan wawancara ulang AI sendiri (persetujuan → pertanyaan dengan pilihan → selesai tanpa
// skor) dan HR membuka hasil lewat alur empat langkah mockup Pak Eji. API di-mock. Spek: docs/designs/b15-impact-measurement.md bagian 12.
type Call = { method: string; url: string; body: unknown }
const Q = (position: number, kind: string, competency: string | null, text: string) =>
  ({ position, role: 'ai', kind, competency, text, options: ['Mengikuti langkah pelatihan', 'Bertanya ke rekan', 'Belum yakin'] })

async function login(page: Page, role: string, flags: Record<string, boolean>) {
  const user = { id: 'u-1', tenantId: 't-1', email: 'x@demo.test', role }
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: true, emailLink: true } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['lim'], products: ['full_suite'], flags: { 'module.lim': true, ...flags } } }))
  await page.route(/\/api\/(dna|tna|cca|li|my)\b/, (r) => r.fulfill({ json: { data: [] } }))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
}

/** Tiruan sesi karyawan: satu kompetensi, tiga pertanyaan. */
async function employeeApi(page: Page, calls: Call[]) {
  const s = { step: 'consent', consentVersionRequired: 'lim-consent-id-v1.0', competencies: ['Eskalasi Insiden'], turns: [] as unknown[], answerCount: 0, questionCount: 3 }
  const questions = [Q(1, 'scenario', 'Eskalasi Insiden', 'Server mati jam 2 pagi. Apa langkah pertama Anda?'), Q(3, 'verify', 'Eskalasi Insiden', 'Bagaimana Anda memastikan eskalasinya tepat?'), Q(5, 'apply', null, 'Apa yang berubah di pekerjaan Anda?')]
  let status = 'open'
  await page.route(/\/api\/lim\//, async (r: Route) => {
    const req = r.request(); const path = new URL(req.url()).pathname.replace(/^.*\/api\/lim/, '')
    const body = (() => { try { return JSON.parse(req.postData() ?? 'null') } catch { return null } })()
    calls.push({ method: req.method(), url: path, body })
    if (path === '/me/reinterviews') return r.fulfill({ json: { data: [{ planId: 'p-1', planTitle: 'Pilot L1', scheduledOn: '2026-11-25', status, competencies: status === 'completed' ? [] : ['Eskalasi Insiden'] }] } })
    if (path === '/me/reinterviews/p-1/session') return r.fulfill({ json: { data: s } })
    if (path === '/me/reinterviews/p-1/consent') {
      s.step = 'chat'; status = 'in_progress'; s.turns.push(questions[0]); return r.fulfill({ json: { data: { question: questions[0] } } })
    }
    if (path === '/me/reinterviews/p-1/turns') {
      s.answerCount += 1
      s.turns.push({ position: s.turns.length + 1, role: 'participant', kind: 'scenario', competency: null, text: body.text, options: null })
      if (s.answerCount >= 3) { s.step = 'done'; status = 'completed'; return r.fulfill({ json: { data: { question: null, done: true } } }) }
      s.turns.push(questions[s.answerCount]); return r.fulfill({ json: { data: { question: questions[s.answerCount], done: false } } })
    }
    return r.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: `mock tidak ada: ${path}` } } })
  })
}

test('karyawan: menu Wawancara ulang, persetujuan, tiga pertanyaan dengan pilihan atau isian bebas, selesai tanpa skor', async ({ page }) => {
  const calls: Call[] = []
  await employeeApi(page, calls)
  await login(page, 'learner', { 'lim.reinterview': true })
  await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Wawancara ulang' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Wawancara ulang' })).toBeVisible()
  const card = page.getByTestId('wu-rencana')
  await expect(card).toContainText('Kompetensi: Eskalasi Insiden')
  await card.getByRole('button', { name: 'Mulai' }).click()

  const consent = page.getByTestId('wu-persetujuan')
  await expect(consent).toContainText('bukan dasar penilaian kinerja Anda')
  await expect(consent).toContainText('HR: skor dan alasan singkat per kompetensi, bukan percakapan Anda')
  await consent.getByRole('button', { name: 'Mulai wawancara' }).click()
  await expect(page.getByText('Centang persetujuan untuk melanjutkan')).toBeVisible()
  await page.getByLabel('Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara ulang.').check()
  await consent.getByRole('button', { name: 'Mulai wawancara' }).click()
  await expect.poll(() => calls.find((c) => c.url === '/me/reinterviews/p-1/consent')?.body).toEqual({ consentVersion: 'lim-consent-id-v1.0' })

  await expect(page.getByText('Konfirmasi hasil belajar')).toBeVisible()
  await expect(page.getByText('Pertanyaan 1 dari 3')).toBeVisible()
  await expect(page.getByTestId('wu-turn-ai')).toContainText('Situasi kerja · Eskalasi Insiden')
  await page.getByRole('group', { name: 'Pilihan jawaban' }).getByRole('button', { name: 'Mengikuti langkah pelatihan' }).click()
  await expect(page.getByText('Pertanyaan 2 dari 3')).toBeVisible()
  await page.getByPlaceholder('Atau ketik jawaban sendiri').fill('Saya cek matriks eskalasi dan konfirmasi ke on-call.')
  await page.getByRole('button', { name: 'Kirim' }).click()
  await expect(page.getByText('Pertanyaan 3 dari 3')).toBeVisible()
  await page.getByRole('group', { name: 'Pilihan jawaban' }).getByRole('button', { name: 'Bertanya ke rekan' }).click()

  await expect(page.getByTestId('wu-selesai')).toContainText('Jawaban Anda sudah tersimpan')
  await expect(page.getByTestId('wu-sesi')).not.toContainText(/skor/i)
  expect(calls.filter((c) => c.url === '/me/reinterviews/p-1/turns').map((c) => (c.body as { text: string }).text))
    .toEqual(['Mengikuti langkah pelatihan', 'Saya cek matriks eskalasi dan konfirmasi ke on-call.', 'Bertanya ke rekan'])
})

test('karyawan: menu Wawancara ulang tidak tampil bila flag lim.reinterview atau module.lim mati', async ({ page }) => {
  await employeeApi(page, [])
  await login(page, 'learner', {})
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Wawancara ulang' })).toHaveCount(0)
  await page.goto('/wawancara-ulang')
  await expect(page.getByRole('heading', { level: 1, name: 'Wawancara ulang' })).toHaveCount(0)
})

test('karyawan: flag fitur menyala tetapi module.lim mati, menu tetap tersembunyi (review kode)', async ({ page }) => {
  await employeeApi(page, [])
  await login(page, 'learner', { 'lim.reinterview': true, 'module.lim': false })
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Wawancara ulang' })).toHaveCount(0)
})

const PLAN = { id: 'p-1', title: 'Pilot L1', jobRoleId: null, jobRoleName: 'Engineer L1', periodFrom: null, periodUntil: null, businessProblem: 'x', desiredBehavior: 'x',
  priorityCapabilities: 'x', evidencePlan: 'x', existingMetrics: 'x', baselineLabel: null, afterLabel: null, status: 'active', valueEstimate: null, factors: [], modules: [] }
const CHAIN = ['Aktivitas', 'Pembelajaran', 'Kapabilitas', 'Penerapan', 'Kinerja', 'Hasil bisnis']
  .map((label, i) => ({ level: i + 1, key: `l${i + 1}`, label, source: 's', finding: i === 2 ? '1 dari 1 karyawan sudah diwawancara ulang' : 'Belum ada data', coverage: i === 2 ? 'measured' : 'missing' }))
const RESULT = {
  userId: 'u-a', factors: ['Alat monitoring baru dipasang Oktober 2026.'],
  indicators: [{ id: 'i-1', name: 'MTTR insiden P1', level: 'performance', source: 'Sistem tiket', unit: 'mnt', direction: 'lower_better', baseline: 92, current: 71, target: 75, improved: true, targetMet: true, strength: 'moderate', strengthSource: 'rules' }],
  reinterviews: [{
    id: 'ri-1', completedAt: '2026-11-25T03:00:00Z', generatedBy: 'rules', confidence: 'medium', chain: CHAIN,
    competencies: [{ competencyId: 'k1', name: 'Eskalasi Insiden', post: 85, reinterview: 70, performance: 72, reason: 'Langkah eskalasi tepat, cara memastikan hasil belum disebut.' }],
    benchmark: [{ competencyId: 'k1', name: 'Eskalasi Insiden', post: 85, reinterview: 70, performance: 72, retention: 'retention_drop', application: 'applied' }],
    recommendations: ['Jadwalkan penguatan Eskalasi Insiden dan ulangi wawancara dalam 4 pekan.'],
  }],
}

test('HR: "Lihat hasil" membuka empat langkah mockup tanpa transkrip; rekomendasi dan keyakinan tanpa kata AI', async ({ page }) => {
  const calls: { url: string; body: unknown }[] = []
  await page.route(/\/api\/lim\//, async (r: Route) => {
    const path = new URL(r.request().url()).pathname.replace(/^.*\/api\/lim/, '')
    const body = r.request().postData() ? JSON.parse(r.request().postData()!) : null
    if (r.request().method() === 'POST') calls.push({ url: path, body })
    if (path === '/plans/p-1/queue/schedule') return r.fulfill({ json: { data: { scheduled: ['u-b'], skipped: [], rejected: [], notified: 1 } } })
    if (path === '/plans/p-1/reinterviews/u-a/review') return r.fulfill({ status: 204, body: '' })
    if (path === '/plans') return r.fulfill({ json: { data: [{ id: 'p-1', title: 'Pilot L1', jobRoleName: 'Engineer L1', moduleCount: 1, participantCount: 2 }] } })
    if (path === '/plans/p-1/overview') return r.fulfill({ json: { data: { plan: PLAN, participants: 2, chain: CHAIN, insight: { level: 1, text: 'x' }, competencies: [], indicators: [], valueEstimate: null, factors: [], generatedBy: 'rules' } } })
    if (path === '/plans/p-1/queue') return r.fulfill({ json: { data: [
      { userId: 'u-a', name: 'Karyawan A', competencies: [{ competencyId: 'k1', name: 'Eskalasi Insiden' }], postCompletedOn: '2026-10-20', dueFrom: '2026-11-17', dueUntil: '2026-12-01', status: 'done', window: null, scheduledOn: null, score: 70, reinterviewId: 'ri-1', canView: true },
      { userId: 'u-b', name: 'Karyawan B', competencies: [{ competencyId: 'k1', name: 'Eskalasi Insiden' }], postCompletedOn: '2026-10-20', dueFrom: '2026-11-17', dueUntil: '2026-12-01', status: 'scheduled', window: 'due', scheduledOn: '2026-11-25', score: null, reinterviewId: null, canView: false },
    ] } })
    if (path === '/plans/p-1/reinterviews/u-a') return r.fulfill({ json: { data: RESULT } })
    return r.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: `mock tidak ada: ${path}` } } })
  })
  await login(page, 'hr_admin', { 'lim.reinterview': true })
  await page.goto('/lim')
  await page.getByRole('tab', { name: 'Pengukuran AI' }).click()
  const q = page.getByRole('table', { name: 'Antrean wawancara ulang' })
  await expect(q.getByRole('button', { name: 'Lihat hasil Karyawan B' })).toHaveCount(0)
  // LIM-6: label mockup "Dijadwalkan". Gap C6 25 Nov (mengganti T-1): "Mulai sekarang" membuka wawancara hari ini dan mengabari karyawan
  await expect(q.getByRole('row', { name: /Karyawan B/ })).toContainText('Dijadwalkan')
  await expect(q.getByRole('button', { name: 'Jadwalkan Karyawan B' })).toHaveCount(0)
  await q.getByRole('button', { name: 'Mulai sekarang Karyawan B' }).click()
  await expect(page.getByTestId('info')).toHaveText('Karyawan B dikabari lewat email dan bisa mulai wawancara ulang hari ini dari menu Wawancara ulang.')
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
  expect(calls.find((c) => c.url === '/plans/p-1/queue/schedule')?.body).toEqual({ userIds: ['u-b'], date: today, notify: true })
  await expect(page.getByText('Karyawan mengerjakannya sendiri dari menu Wawancara ulang setelah dijadwalkan.')).toBeVisible()
  await q.getByRole('button', { name: 'Lihat hasil Karyawan A' }).click()

  const flow = page.getByTestId('wu-hasil')
  // mockup M:1063-1073: saat alur terbuka, kartu agen dan antrean diganti panel langkah dan kartu isi
  await expect(page.getByRole('heading', { name: 'Agen AI · Pengukuran dampak' })).toHaveCount(0)
  await expect(flow.getByRole('list', { name: 'Langkah hasil wawancara ulang' })).toContainText('Konfirmasi hasil belajar')
  await expect(flow.getByTestId('wu-skor')).toContainText('Langkah eskalasi tepat')
  await expect(flow.getByTestId('wu-skor')).toContainText('70')
  // LIM-8: baris audit mockup (M:1111)
  await expect(flow.getByText('ELGOS-AI (POC) · log audit: 1 kompetensi dinilai · dibuka HR tercatat')).toBeVisible()
  await flow.getByRole('button', { name: 'Lihat benchmark kinerja' }).click()
  await expect(flow).toContainText('Hasil belajar tidak bertahan')
  await expect(flow).toContainText('Kemampuan terlihat di kinerja')
  await flow.getByRole('button', { name: 'Lanjut ke hasil bisnis' }).click()
  await expect(flow).toContainText('Indikator tingkat tim, bukan per orang')
  await expect(flow).toContainText('92 mnt → 71 mnt')
  await expect(flow).toContainText('Alat monitoring baru dipasang Oktober 2026.')
  await flow.getByRole('button', { name: 'Lihat ringkasan' }).click()
  await expect(flow.getByTestId('wu-keyakinan')).toContainText('tingkat keyakinan dari data pengukuran: Sedang')
  await expect(flow.getByTestId('wu-rekomendasi')).toHaveText(['Jadwalkan penguatan Eskalasi Insiden dan ulangi wawancara dalam 4 pekan.'])
  await expect(flow).not.toContainText('Rekomendasi AI')
  // Gap C6 (mockup limFinish): "Simpan hasil" hanya di langkah Ringkasan, mencatat tinjauan hasil yang dibaca lalu kembali ke antrean
  await flow.getByRole('button', { name: 'Simpan hasil' }).click()
  await expect(page.getByTestId('info')).toHaveText('Hasil wawancara ulang Karyawan A disimpan.')
  expect(calls.find((c) => c.url === '/plans/p-1/reinterviews/u-a/review')?.body).toEqual({ reinterviewId: 'ri-1' })
  await expect(q).toBeVisible()
  await q.getByRole('button', { name: 'Lihat hasil Karyawan A' }).click()
  await expect(flow.getByRole('button', { name: 'Simpan hasil' })).toHaveCount(0)
  await flow.getByRole('button', { name: 'Kembali ke antrean' }).click()
  await expect(q).toBeVisible()
})
