import { test, expect, type Page } from '@playwright/test'
import { loginSebagai } from './support/sesi'
import { mockApi, cocok, type PermintaanApi } from './support/api'

// B10 tahap 2 (docs/designs/b10-core-competencies.md 11.8): sesi wawancara peserta dan kartu sintesis HR. API di-mock.
const FLAGS = { 'cca.interview': true }
const CONSENT = 'cca-consent-id-v1.0'
const THEMES = ['vision', 'mission', 'values', 'support']
const assignment = (status: string) => ({ id: 'as-1', tier: 'employee', status, dueDate: '2026-11-30', durationMinutes: 10, completedAt: null })
const question = (i: number) => ({ role: 'ai', theme: THEMES[i], text: `Pertanyaan contoh ${i + 1}?`, options: i === 0 ? ['Sangat jelas', 'Cukup jelas', 'Belum jelas'] : [] })

/** Mock sesi peserta dengan state: persetujuan, giliran, ringkasan, kirim. Mengembalikan daftar permintaan tulis. */
async function mockSesi(page: Page, o: { aiGagalSekali?: boolean } = {}) {
  const tulis: PermintaanApi[] = []
  const st = { status: 'assigned', turns: [] as Record<string, unknown>[], summary: false, gagal: !!o.aiGagalSekali, restartsLeft: 1 }
  const answers = () => st.turns.filter((t) => t.role === 'participant').length
  const session = () => ({
    assignment: { ...assignment(st.status), restartsLeft: st.restartsLeft },
    step: st.status === 'assigned' ? 'consent' : st.status === 'completed' ? 'done' : st.summary ? 'summary' : 'chat',
    consentVersionRequired: CONSENT, turns: st.turns, answerCount: answers(), questionCount: 4,
    summary: st.summary ? { themes: THEMES.map((theme) => ({ theme, question: 'Q', answer: `Ringkasan ${theme}.` })), createdAt: '2026-11-23T03:00:00Z' } : null,
  })
  const ask = () => {
    if (st.gagal) { st.gagal = false; return null }
    const q = question(answers())
    st.turns.push(q)
    return { position: answers() + 1, ...q }
  }
  await mockApi(page, (req) => {
    if (req.method !== 'GET' && req.path.startsWith('/cca/')) tulis.push(req)
    if (req.method === 'GET' && req.path === '/cca/assignments') return { json: { data: { role: 'employee', mine: { leader: null, employee: assignment(st.status) } } } }
    if (cocok(req, 'GET /cca/assignments/:id/session')) return { json: { data: session() } }
    if (cocok(req, 'POST /cca/assignments/:id/consent')) { st.status = 'in_progress'; return { json: { data: { question: ask() } } } }
    if (cocok(req, 'POST /cca/assignments/:id/turns')) {
      const text = (req.body as { text?: string }).text
      if (text !== undefined) st.turns.push({ role: 'participant', theme: THEMES[answers()], text, options: null })
      if (answers() >= 4) return { json: { data: { question: null, done: true } } }
      return { json: { data: { question: ask(), done: false } } }
    }
    if (cocok(req, 'POST /cca/assignments/:id/summary')) { st.summary = true; return { status: 201, json: { data: session().summary } } }
    if (cocok(req, 'POST /cca/assignments/:id/restart')) { st.turns = []; st.summary = false; st.restartsLeft = 0; return { json: { data: { restartsLeft: 0 } } } }
    if (cocok(req, 'POST /cca/assignments/:id/summary/confirm')) { st.status = 'completed'; return { json: { data: { status: 'completed' } } } }
    return undefined
  })
  return tulis
}

test('karyawan: persetujuan, empat pertanyaan dengan pilihan atau isian bebas, ringkasan, lalu kirim', async ({ page }) => {
  const tulis = await mockSesi(page)
  await loginSebagai(page, 'karyawan', { flags: FLAGS })
  await page.goto('/aiv')
  await page.getByRole('button', { name: 'Mulai wawancara' }).click()

  const sesi = page.getByTestId('cc-sesi')
  await expect(sesi.getByText('bukan penilaian kinerja')).toBeVisible()
  await expect(sesi.getByText('hanya angka gabungan seluruh karyawan')).toBeVisible()
  await sesi.getByRole('button', { name: 'Mulai wawancara' }).click()
  await expect(page.getByText('Centang persetujuan untuk melanjutkan').first()).toBeVisible()
  await sesi.getByLabel('Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara.').check()
  await sesi.getByRole('button', { name: 'Mulai wawancara' }).click()

  await expect(sesi.getByText('Pertanyaan 1 dari 4')).toBeVisible()
  await sesi.getByRole('group', { name: 'Pilihan jawaban' }).getByRole('button', { name: 'Cukup jelas' }).click()
  for (const jawaban of ['Mendukung lewat layanan cepat.', 'Credible.', 'Contoh dari pimpinan.']) {
    await expect(sesi.getByTestId('cc-turn-participant').last()).toBeVisible()
    await sesi.getByLabel('Jawaban').fill(jawaban)
    await sesi.getByRole('button', { name: 'Kirim' }).click()
  }
  await expect(sesi.getByTestId('cc-turn-participant')).toHaveCount(4)
  await sesi.getByRole('button', { name: 'Buat ringkasan' }).click()

  await expect(sesi.getByText('Periksa ringkasan ini sebelum dianggap final.')).toBeVisible()
  await expect(sesi.getByTestId('cc-ringkasan')).toContainText('Ringkasan support.')
  await expect(sesi.getByRole('button', { name: 'Ulangi wawancara' })).toBeVisible()
  await sesi.getByRole('button', { name: 'Sesuai, kirim' }).click()
  await expect(sesi.getByRole('heading', { name: 'Ringkasan AI' })).toBeVisible()
  await expect(sesi.getByRole('note').filter({ hasText: 'Terkirim. Hasil diringkas ke HR dan atasan hanya melihat status selesai.' })).toBeVisible()

  expect(tulis.map((r) => `${r.method} ${r.path.replace('/cca/assignments/as-1', '')}`)).toEqual([
    'POST /consent', 'POST /turns', 'POST /turns', 'POST /turns', 'POST /turns', 'POST /summary', 'POST /summary/confirm',
  ])
  expect(tulis[0].body).toEqual({ consentVersion: CONSENT })
  expect(tulis[1].body).toEqual({ text: 'Cukup jelas' })
})

test('P7 AIV-2/4/6/7/9: daftar ber-bullet, sesi di kartu mandiri, audit agen, ringkasan berbingkai, kembali ke penugasan', async ({ page }) => {
  await mockSesi(page)
  await loginSebagai(page, 'karyawan', { flags: FLAGS })
  await page.goto('/aiv')
  const kartu = page.getByTestId('cc-wawancara-karyawan')
  await expect(kartu.locator('.cc-list')).toHaveCSS('list-style-type', 'disc')
  await expect(kartu.locator('.cc-list')).toHaveCSS('margin-bottom', '16px')
  await expect(page.getByText('AI mewawancarai Anda tentang pemahaman')).toHaveCSS('margin-top', '0px')
  await kartu.getByRole('button', { name: 'Mulai wawancara' }).click()
  // AIV-6: isi kartu penugasan disembunyikan, sesi tampil di kartu sendiri
  await expect(page.getByTestId('cc-wawancara-karyawan')).toHaveCount(0)
  const sesi = page.getByTestId('cc-sesi')
  await expect(sesi).toBeVisible()
  await sesi.getByLabel('Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara.').check()
  await sesi.getByRole('button', { name: 'Mulai wawancara' }).click()
  await expect(sesi.locator('.el-audit')).toContainText('Agen ELGOS (POC) · log audit: 0 jawaban')
  await expect(sesi.getByTestId('cc-turn-ai').first()).toContainText('ELGOS AI')
  for (const jawaban of ['a', 'b', 'c', 'd']) {
    await sesi.getByLabel('Jawaban').fill(jawaban)
    await sesi.getByRole('button', { name: 'Kirim' }).click()
    await expect(sesi.getByTestId('cc-turn-participant').last()).toContainText(jawaban)
  }
  await sesi.getByRole('button', { name: 'Buat ringkasan' }).click()
  await sesi.getByRole('button', { name: 'Sesuai, kirim' }).click()
  const baris = sesi.locator('.cc-mod').first()
  await expect(baris).toHaveCSS('border-top-style', 'solid')
  await sesi.getByRole('button', { name: 'Kembali ke penugasan' }).click()
  await expect(page.getByTestId('cc-wawancara-karyawan')).toBeVisible()
})

test('karyawan: pertanyaan gagal dimuat bisa diminta ulang', async ({ page }) => {
  const tulis = await mockSesi(page, { aiGagalSekali: true })
  await loginSebagai(page, 'karyawan', { flags: FLAGS })
  await page.goto('/aiv')
  await page.getByRole('button', { name: 'Mulai wawancara' }).click()
  const sesi = page.getByTestId('cc-sesi')
  await sesi.getByLabel('Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara.').check()
  await sesi.getByRole('button', { name: 'Mulai wawancara' }).click()
  await expect(sesi.getByText('Pertanyaan berikutnya belum termuat.')).toBeVisible()
  await sesi.getByRole('button', { name: 'Muat pertanyaan' }).click()
  await expect(sesi.getByText('Pertanyaan contoh 1?')).toBeVisible()
  expect(tulis[1]).toMatchObject({ method: 'POST', path: '/cca/assignments/as-1/turns', body: {} })
})

test('karyawan: mengulang wawancara sekali langsung memuat pertanyaan pertama', async ({ page }) => {
  const tulis = await mockSesi(page)
  await loginSebagai(page, 'karyawan', { flags: FLAGS })
  await page.goto('/aiv')
  await page.getByRole('button', { name: 'Mulai wawancara' }).click()
  const sesi = page.getByTestId('cc-sesi')
  await sesi.getByLabel('Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara.').check()
  await sesi.getByRole('button', { name: 'Mulai wawancara' }).click()
  for (let i = 0; i < 4; i += 1) {
    await expect(sesi.getByTestId('cc-turn-ai')).toHaveCount(i + 1)
    await sesi.getByRole('textbox', { name: 'Jawaban' }).fill(`Jawaban ${i + 1}`)
    await sesi.getByRole('button', { name: 'Kirim' }).click()
  }
  await sesi.getByRole('button', { name: 'Buat ringkasan' }).click()
  await sesi.getByRole('button', { name: 'Ulangi wawancara' }).click()
  await expect(sesi.getByText('Pertanyaan 1 dari 4')).toBeVisible()
  await expect(sesi.getByTestId('cc-turn-ai')).toHaveCount(1)
  expect(tulis.slice(-2).map((r) => `${r.method} ${r.path.replace('/cca/assignments/as-1', '')}`)).toEqual(['POST /restart', 'POST /turns'])
  expect(tulis[tulis.length - 1].body).toEqual({})
})

const SYNTH = {
  minRespondents: 5,
  employeeBatch: 5,
  kpis: { themes: 2, leadersCompleted: 2, employeesCompleted: '5–9' },
  themes: [
    { requirementId: 'r-1', name: 'Kolaborasi lintas tim', sourceKind: 'vision', sourceTitle: 'Corporate Vision', leaderAgree: 100, leaderRespondents: 1, employeeAligned: 80, employeeRespondents: '5–9', gap: 20, hot: true, actualScore: null, actualSource: null },
    { requirementId: 'r-2', name: 'Fokus pelanggan', sourceKind: 'vision', sourceTitle: 'Corporate Vision', leaderAgree: 100, leaderRespondents: 1, employeeAligned: null, employeeRespondents: '<5', gap: null, hot: false, actualScore: 70, actualSource: 'manual' },
  ],
}

test('HR: sintesis menandai gap besar, menyembunyikan angka di bawah 5 responden, dan mengisi nilai aktual; pratinjau sesi', async ({ page }) => {
  const tulis: PermintaanApi[] = []
  await mockApi(page, (req) => {
    if (req.method === 'GET' && req.path === '/cca/assignments') return { json: { data: { role: 'hr', mine: { leader: null, employee: null }, kpis: { leadersEligible: 0, leadersAssigned: 0, leadersCompleted: 0, employeesAssigned: 0, employeesCompleted: 0 }, leaders: [] } } }
    if (req.method === 'GET' && req.path === '/cca/synthesis') return { json: { data: SYNTH } }
    if (req.method === 'POST' && req.path === '/cca/synthesis/apply') { tulis.push(req); return { json: { data: { applied: [{ requirementId: 'r-1', previous: { actualScore: null, actualSource: null } }], skipped: [] } } } }
    if (req.method === 'GET' && req.path === '/cca/interview/preview') {
      tulis.push(req)
      return { json: { data: { tier: req.query.get('tier'), questions: THEMES.map((theme, i) => ({ position: i + 1, theme, text: `Pratinjau ${i + 1} Corporate Vision`, options: [] })) } } }
    }
    if (req.method === 'GET' && req.path.startsWith('/cca/')) return { json: { data: [] } }
    return undefined
  })
  await loginSebagai(page, 'hr', { flags: FLAGS })
  await page.goto('/cc?tab=aiv')
  // P5 AH-1: KPI ke-4 Tema tersintesis dari sintesis
  const hr = page.getByTestId('cc-wawancara-hr')
  await expect(hr.locator('.el-kpi__label')).toHaveText(['Pimpinan ditugaskan', 'Wawancara pimpinan selesai', 'Karyawan selesai', 'Tema tersintesis'])
  const kartu = page.getByTestId('cc-sintesis')
  // P5 AH-6/AH-7: daftar tema mockup, bukan tabel
  await expect(kartu).toContainText('Tema dari wawancara pimpinan, dan seberapa jauh jawaban karyawan sejalan.')
  await expect(kartu.getByRole('table')).toHaveCount(0)
  const panas = kartu.getByTestId('cc-tema').filter({ hasText: 'Kolaborasi lintas tim' })
  await expect(panas).toContainText('Visi')
  await expect(panas).toContainText('pimpinan sepakat 100% · karyawan sejalan 80% · gap −20')
  const bar = panas.getByRole('progressbar')
  await expect(bar).toHaveAttribute('aria-valuenow', '80')
  await expect(bar).toHaveClass(/el-bar--critical/)
  const sedikit = kartu.getByTestId('cc-tema').filter({ hasText: 'Fokus pelanggan' })
  await expect(sedikit).toContainText('pimpinan sepakat 100% · karyawan sejalan - · gap -')
  await expect(sedikit.getByRole('progressbar')).not.toHaveClass(/el-bar--critical/)
  await expect(kartu.getByText('Angka karyawan diperbarui setiap 5 penyelesaian baru', { exact: false })).toBeVisible()

  // aksi sekunder di bagian lipat
  await expect(kartu.getByRole('button', { name: /Isi dari sintesis/ })).toHaveCount(0)
  await kartu.getByText('Kelola nilai aktual dan pratinjau').click()
  const kelola = kartu.getByTestId('cc-sintesis-kelola')
  await expect(kelola.getByRole('row', { name: /Fokus pelanggan/ }).getByRole('button', { name: /Isi dari sintesis/ })).toHaveCount(0)
  await kelola.getByRole('button', { name: 'Isi dari sintesis Kolaborasi lintas tim' }).click()
  await expect(kartu.getByRole('status')).toHaveText('Nilai aktual Kolaborasi lintas tim diisi dari sintesis. Nilai sebelumnya: kosong.')
  expect(tulis[0].body).toEqual({ requirementIds: ['r-1'] })

  await kartu.getByRole('button', { name: 'Pratinjau sesi pimpinan' }).click()
  await expect(kartu.getByTestId('cc-pratinjau')).toContainText('Dukungan: Pratinjau 4 Corporate Vision')
  expect(tulis[1].query.get('tier')).toBe('leader')
  await kartu.getByRole('button', { name: 'Pratinjau sesi karyawan' }).click()
  await expect.poll(() => tulis.length).toBe(3)
  expect(tulis[2].query.get('tier')).toBe('employee')

  await kartu.getByRole('link', { name: 'Lihat Corporate Values' }).click()
  await expect(page.getByRole('tab', { name: 'Corporate Values' })).toHaveAttribute('aria-selected', 'true')
})

test('P5 AH-9: sintesis tanpa daftar tema menampilkan pesan galat, bukan kartu rusak', async ({ page }) => {
  await mockApi(page, (req) => {
    if (req.method === 'GET' && req.path === '/cca/assignments') return { json: { data: { role: 'hr', mine: { leader: null, employee: null }, kpis: { leadersEligible: 0, leadersAssigned: 0, leadersCompleted: 0, employeesAssigned: 0, employeesCompleted: 0 }, leaders: [] } } }
    if (req.method === 'GET' && req.path.startsWith('/cca/')) return { json: { data: [] } }
    return undefined
  })
  await loginSebagai(page, 'hr', { flags: FLAGS })
  await page.goto('/cc?tab=aiv')
  await expect(page.getByTestId('cc-sintesis')).toContainText('Sintesis belum bisa dimuat')
  await expect(page.getByTestId('cc-sintesis').getByText('Lihat Vision & Mission')).toHaveCount(0)
})
