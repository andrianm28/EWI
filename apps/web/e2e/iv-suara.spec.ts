import { test, expect, type Page, type WebSocketRoute } from '@playwright/test'
import { loginSebagai } from './support/sesi'
import { mockApi, permintaanBelumDimock, responsData as data, cocok, type Penangan } from './support/api'
import { sesiWawancara } from './support/wawancara'

// B19 wawancara suara di layar `iv`: pilihan Suara di Persetujuan, panel suara dengan caption dan giliran, Ubah,
// Ketik saja, dan pindah otomatis ke teks saat sambungan suara gagal. API di-mock; WebSocket di-mock page.routeWebSocket.
// Spek: docs/designs/b19-wawancara-suara.md bagian 2, 7, 10, 11. Alur sungguhan: apps/api/tests/integration/b19-suara.test.js.

const FLAGS = { 'tna.interview_summary': true, 'voice.realtime': true }
const VOICE_VERSION = 'tna-voice-consent-id-v0.1'

/** Mikrofon palsu (osilator) atau izin ditolak, dipasang sebelum halaman dimuat. */
async function mikrofon(page: Page, izin: 'boleh' | 'tolak') {
  // Skrip berupa teks: tsconfig e2e tidak memuat tipe DOM
  await page.addInitScript(`navigator.mediaDevices.getUserMedia = async () => {
    if (${JSON.stringify(izin)} === 'tolak') throw new DOMException('ditolak', 'NotAllowedError')
    const ctx = new AudioContext(); const osc = ctx.createOscillator(); const dest = ctx.createMediaStreamDestination()
    osc.connect(dest); osc.start(); return dest.stream
  }`)
}

/** Sesi s1 B6 ditambah bidang dan endpoint suara. */
function penangan() {
  const base = sesiWawancara({ pemilik: 'u-karyawan' })
  const terkirim = base.terkirim
  const st = { mode: 'text', turns: [] as Record<string, unknown>[], status: 'scheduled' }
  const p: Penangan = async (req) => {
    if (cocok(req, 'GET /tna/sessions/s1')) {
      const r = await base.penangan(req)
      const d = (r!.json as { data: Record<string, unknown> }).data
      return data({ ...d, status: st.status, step: st.status === 'scheduled' ? 'consent' : 'chat', mode: st.mode, turns: st.turns, voiceAvailable: true, hasVoiceConsent: st.mode === 'voice', aiDone: false, voiceConsentVersionRequired: VOICE_VERSION })
    }
    if (cocok(req, 'POST /tna/sessions/s1/consent')) {
      terkirim.push({ path: 'consent', body: req.body })
      const b = req.body as { mode?: string }
      st.status = 'in_progress'; st.mode = b.mode === 'voice' ? 'voice' : 'text'
      if (st.mode === 'voice') return data({ status: 'in_progress', consentVersion: 'tna-consent-id-v1.0', mode: 'voice', question: null })
      return base.penangan(req)
    }
    if (cocok(req, 'POST /tna/sessions/s1/voice/ticket')) {
      terkirim.push({ path: 'ticket', body: null })
      return data({ ticket: 'tiket-uji', path: '/api/voice/sessions/s1/stream', expiresIn: 60 })
    }
    if (cocok(req, 'POST /tna/sessions/s1/voice/switch')) {
      const b = req.body as { to: string }
      terkirim.push({ path: 'switch', body: b })
      st.mode = b.to
      return data(b.to === 'text' ? { mode: 'text', question: null } : { mode: 'voice' })
    }
    if (cocok(req, 'PATCH /tna/sessions/s1/turns/2')) {
      const b = req.body as { text: string }
      terkirim.push({ path: 'correct', body: b })
      return data({ id: 2, speaker: 'human', text: b.text, at: '', mode: 'voice', interrupted: false, corrected: true, originalText: 'Tools tiket lambet' })
    }
    return base.penangan(req)
  }
  return { penangan: p, terkirim }
}

/** Gateway suara tiruan: setelah auth mengirim ready, sapaan AI, dan menjawab end_turn dengan giliran. */
async function gateway(page: Page, { gagal = false, pesanAuth }: { gagal?: boolean; pesanAuth?: Record<string, unknown> } = {}) {
  let sisaGagal = gagal ? 1 : 0 // hanya sambungan pertama yang gagal
  const diterima: Record<string, unknown>[] = []
  let soket: WebSocketRoute | null = null
  await page.routeWebSocket(/\/api\/voice\/sessions\/s1\/stream$/, (ws) => {
    soket = ws
    const kirim = (m: unknown) => ws.send(JSON.stringify(m))
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw))
      diterima.push(m)
      if (m.type === 'auth') {
        if (sisaGagal > 0) { sisaGagal -= 1; kirim({ type: 'error', code: 'VOICE_UNAVAILABLE', message: 'Wawancara suara sedang tidak tersedia.' }); ws.close({ code: 1000 }); return }
        if (pesanAuth) { kirim(pesanAuth); return }
        kirim({ type: 'ready' })
        kirim({ type: 'caption', speaker: 'ai', text: 'Halo, apa kendala' })
        kirim({ type: 'turn', turn: { id: 1, speaker: 'ai', text: 'Halo, apa kendala terbesar Anda?', at: '', mode: 'voice', interrupted: false, corrected: false } })
      }
      if (m.type === 'end_turn') {
        kirim({ type: 'caption', speaker: 'human', text: 'Tools tiket' })
        kirim({ type: 'turn', turn: { id: 2, speaker: 'human', text: 'Tools tiket lambet', at: '', mode: 'voice', interrupted: false, corrected: false } })
      }
    })
  })
  return { diterima, putus: () => soket?.close({ code: 1011 }) }
}

async function setup(page: Page, izin: 'boleh' | 'tolak' = 'boleh', opsi: { gagal?: boolean; pesanAuth?: Record<string, unknown> } = {}) {
  await mikrofon(page, izin)
  const { penangan: p, terkirim } = penangan()
  await mockApi(page, p)
  const gw = await gateway(page, opsi)
  await loginSebagai(page, 'karyawan', { submodules: ['cca', 'dna', 'tna', 'ina'], flags: FLAGS })
  await page.goto('/iv/s1')
  return { terkirim, gw }
}
async function setujuSuara(page: Page) {
  await page.getByTestId('consent-check').check()
  await page.getByRole('radio', { name: 'Suara' }).check()
  await page.getByTestId('voice-consent-check').check()
  await page.getByRole('button', { name: 'Lanjut ke wawancara' }).click()
}

test.afterEach(({ page }) => { expect(permintaanBelumDimock(page)).toEqual([]) })

test('Suara: persetujuan suara terkirim, panel menampilkan status, caption, dan giliran; Ubah jawaban terakhir', async ({ page }) => {
  const { terkirim, gw } = await setup(page)
  const mode = page.getByRole('group', { name: 'Cara menjawab' })
  await expect(mode.getByRole('radio', { name: 'Ketik' })).toBeChecked()
  // Suara tanpa centang persetujuan suara: ringkasan galat
  await page.getByTestId('consent-check').check()
  await mode.getByRole('radio', { name: 'Suara' }).check()
  await expect(mode).toContainText('ELGOS tidak menyimpan rekaman suara')
  await page.getByRole('button', { name: 'Lanjut ke wawancara' }).click()
  await expect(page.getByRole('alert')).toContainText('Centang persetujuan suara')
  await page.getByTestId('voice-consent-check').check()
  await page.getByRole('button', { name: 'Lanjut ke wawancara' }).click()

  const panel = page.getByTestId('panel-suara')
  await expect(panel.getByRole('status')).toHaveText('Mendengarkan')
  expect(terkirim.find((t) => t.path === 'consent')!.body).toMatchObject({ mode: 'voice', voiceConsentVersion: VOICE_VERSION })
  await expect(page.getByTestId('turn-ai')).toHaveText(/Halo, apa kendala terbesar Anda\?/)
  await expect(page.getByLabel('Jawaban', { exact: true })).toHaveCount(0) // kotak teks diganti panel suara
  expect(gw.diterima[0]).toEqual({ type: 'auth', ticket: 'tiket-uji' })

  const bisu = panel.getByRole('button', { name: 'Bisukan mikrofon' })
  await expect(bisu).toHaveAttribute('aria-pressed', 'false')
  await bisu.click()
  await expect(bisu).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.getByRole('status')).toHaveText('Mikrofon dibisukan')
  await bisu.click()
  await panel.getByRole('button', { name: 'Selesai menjawab' }).click()
  await expect(page.getByTestId('turn-human')).toContainText('Tools tiket lambet')
  expect(gw.diterima.map((m) => m.type)).toEqual(expect.arrayContaining(['auth', 'mute', 'end_turn']))

  await page.getByTestId('turn-human').getByRole('button', { name: 'Ubah' }).click()
  await page.getByLabel('Ubah jawaban terakhir').fill('Tools tiket lambat')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByTestId('turn-human')).toContainText('Tools tiket lambat')
  await expect(page.getByTestId('turn-human')).toContainText('diubah')
  expect(terkirim.find((t) => t.path === 'correct')!.body).toEqual({ text: 'Tools tiket lambat' })
})

test('mikrofon ditolak: galat di ringkasan galat dan pilihan kembali ke Ketik', async ({ page }) => {
  const { terkirim } = await setup(page, 'tolak')
  await setujuSuara(page)
  await expect(page.getByRole('alert')).toContainText('Mikrofon tidak bisa dipakai')
  await expect(page.getByRole('radio', { name: 'Ketik' })).toBeChecked()
  expect(terkirim.filter((t) => t.path === 'consent')).toEqual([])
})

test('Ketik saja pindah ke mode teks; sambungan suara gagal pindah otomatis dengan tombol Kembali ke suara', async ({ page }) => {
  const { terkirim } = await setup(page)
  await setujuSuara(page)
  await expect(page.getByTestId('panel-suara').getByRole('status')).toHaveText('Mendengarkan')
  await page.getByRole('button', { name: 'Ketik saja' }).click()
  await expect(page.getByLabel('Jawaban', { exact: true })).toBeVisible()
  expect(terkirim.filter((t) => t.path === 'switch').map((t) => t.body)).toEqual([{ to: 'text' }])
})

test('ended provider (gateway gagal) -> teks dengan pesan dan Kembali ke suara', async ({ page }) => {
  const { terkirim } = await setup(page, 'boleh', { gagal: true })
  await setujuSuara(page)
  await expect(page.getByText('Wawancara suara sedang tidak tersedia. Anda bisa melanjutkan dengan mengetik.')).toBeVisible()
  await expect(page.getByLabel('Jawaban', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Kembali ke suara' }).click()
  await expect(page.getByTestId('panel-suara').getByRole('status')).toHaveText('Mendengarkan')
  expect(terkirim.filter((t) => t.path === 'switch').map((t) => t.body)).toEqual([{ to: 'text' }, { to: 'voice' }])
})

test('dibuka di tab lain (superseded): tidak pindah mode, tawarkan Lanjutkan di sini', async ({ page }) => {
  const { terkirim } = await setup(page, 'boleh', { pesanAuth: { type: 'ended', reason: 'superseded' } })
  await setujuSuara(page)
  await expect(page.getByTestId('suara-di-tab-lain')).toContainText('dibuka di tab atau perangkat lain')
  expect(terkirim.filter((t) => t.path === 'switch')).toEqual([])
  await expect(page.getByRole('button', { name: 'Lanjutkan di sini' })).toBeVisible()
})

test('galat keadaan (batas waktu) -> teks tanpa Kembali ke suara', async ({ page }) => {
  const { terkirim } = await setup(page, 'boleh', { pesanAuth: { type: 'error', code: 'INVALID_STATE', message: 'Batas waktu suara habis.' } })
  await setujuSuara(page)
  await expect(page.getByText('Batas waktu suara habis. Lanjutkan dengan mengetik.')).toBeVisible()
  await expect(page.getByLabel('Jawaban', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kembali ke suara' })).toHaveCount(0)
  expect(terkirim.filter((t) => t.path === 'switch').map((t) => t.body)).toEqual([{ to: 'text' }])
})
