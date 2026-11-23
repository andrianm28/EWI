import { cocok, responsData as data, type Penangan, type ResponsApi, type Terkirim } from './api'

// B6 Wawancara akar masalah: mock berstate untuk sesi s1, dipakai iv.spec.ts dan alur/jalur-utama.spec.ts.
// Data karangan tangan mengikuti kontrak di docs/designs/b6-wawancara-akar-masalah.md, bukan fixture tangkapan;
// alur yang sama terhadap API sungguhan: apps/api/tests/integration/alur-gap-wawancara.test.js.

export interface StateSesi {
  status: string; summaryAt: string | null; restartCount: number; summaryConfirmedAt: string | null; summaryDisputed: boolean
  turns: { speaker: 'ai' | 'human'; text: string; at: string }[]
}

export interface OpsiSesiWawancara {
  /** ID pengguna yang diwawancarai di daftar sesi. */
  pemilik: string
  state?: Partial<StateSesi>
  /** false: sesi dibuka orang lain, API menyembunyikan percakapan. */
  interviewee?: boolean
  /** Ganti respons GET ringkasan, mis. untuk galat. */
  summary?: ResponsApi
}

const TEMUAN_RINGKASAN = [
  { title: 'Belum paham langkah eskalasi insiden', detail: 'Mengaku belum pernah dilatih eskalasi.', category: 'training', confidence: 0.8 },
  { title: 'Alat pemantauan sering lambat', detail: 'Dasbor butuh 5 menit untuk dimuat.', category: 'non_training', confidence: null },
]

function stepOf(s: StateSesi) {
  if (s.status === 'scheduled') return 'consent'
  if (s.status === 'in_progress') return s.summaryAt ? 'summary' : 'chat'
  return s.status === 'completed' ? 'done' : 'closed'
}
function summaryStateOf(s: StateSesi) {
  if (s.summaryConfirmedAt) return s.summaryDisputed ? 'disputed' : 'confirmed'
  if (s.status === 'completed') return 'unchecked'
  return s.summaryAt ? 'pending' : 'not_applicable'
}

/** Penangan untuk daftar sesi (s1 terbuka, s0 riwayat) dan seluruh langkah sesi s1, dengan state antar-permintaan. */
export function sesiWawancara(o: OpsiSesiWawancara): { penangan: Penangan; terkirim: Terkirim[] } {
  const terkirim: Terkirim[] = []
  const s: StateSesi = { status: 'scheduled', summaryAt: null, restartCount: 0, summaryConfirmedAt: null, summaryDisputed: false, turns: [], ...o.state }
  const ringkasan = () => ({ findings: TEMUAN_RINGKASAN, createdAt: s.summaryAt, confirmedAt: null, state: 'pending' })
  const penangan: Penangan = (req) => {
    if (cocok(req, 'GET /tna/sessions')) return data([
      { id: 's1', projectId: 'p1', intervieweeId: o.pemilik, intervieweeName: 'Dimas', status: s.status, triggerCount: 0, focusKind: 'competency', focusLabel: 'Analisis insiden', durationMinutes: 15, inviteExpiresAt: '2026-12-05T16:59:59.000Z' },
      { id: 's0', projectId: 'p1', intervieweeId: o.pemilik, intervieweeName: 'Dimas', status: 'completed', triggerCount: 1, focusKind: null, focusLabel: null, durationMinutes: null, inviteExpiresAt: '2026-11-10T16:59:59.000Z' },
    ])
    if (cocok(req, 'GET /tna/sessions/s1')) {
      const base = { id: 's1abcdef-0000-4000-8000-000000000000', status: s.status, step: stepOf(s), summaryState: summaryStateOf(s), focusLabel: 'Analisis insiden', durationMinutes: 15 }
      if (o.interviewee === false) return data({ ...base, transcriptVisible: false })
      return data({
        ...base, transcriptVisible: true, turns: s.turns, consentVersionRequired: 'tna-consent-id-v1.0',
        answerCount: s.turns.filter((t) => t.speaker === 'human').length, questionLimit: 5, restartCount: s.restartCount, restartsLeft: 2 - s.restartCount,
        summaryAt: s.summaryAt, summaryConfirmedAt: s.summaryConfirmedAt, aiLabel: 'ELGOS-AI', sessionCode: 'S1ABCDEF',
      })
    }
    if (cocok(req, 'POST /tna/sessions/s1/consent')) {
      terkirim.push({ path: 'consent', body: req.body })
      s.status = 'in_progress'
      const q = { speaker: 'ai' as const, text: 'Ceritakan analisis insiden terakhir yang Anda kerjakan.', at: '' }
      s.turns.push(q)
      return data({ status: 'in_progress', consentVersion: 'tna-consent-id-v1.0', question: q })
    }
    if (cocok(req, 'POST /tna/sessions/s1/turns')) {
      const body = req.body as { text: string }
      terkirim.push({ path: 'turns', body })
      s.turns.push({ speaker: 'human', text: body.text, at: '' })
      return data({ question: null, done: true })
    }
    if (cocok(req, 'GET /tna/sessions/s1/summary')) return o.summary ?? data(ringkasan())
    if (cocok(req, 'POST /tna/sessions/s1/summary')) {
      terkirim.push({ path: 'summary', body: null })
      s.summaryAt = s.summaryAt ?? '2026-11-20T03:00:00.000Z'
      return data(ringkasan(), 201)
    }
    if (cocok(req, 'POST /tna/sessions/s1/summary/confirm')) {
      terkirim.push({ path: 'confirm', body: req.body })
      s.status = 'completed'; s.summaryConfirmedAt = '2026-11-20T03:05:00.000Z'; s.summaryDisputed = (req.body as { accurate?: boolean }).accurate === false
      return data({ status: 'completed', analysis: { status: 'queued' }, summaryState: summaryStateOf(s) }, 202)
    }
    if (cocok(req, 'POST /tna/sessions/s1/restart')) {
      terkirim.push({ path: 'restart', body: null })
      s.status = 'scheduled'; s.summaryAt = null; s.turns = []; s.restartCount += 1
      return data({ status: 'scheduled', restartCount: s.restartCount, restartsLeft: 2 - s.restartCount })
    }
    if (cocok(req, 'POST /tna/sessions/s1/complete')) {
      terkirim.push({ path: 'complete', body: null })
      s.status = 'completed'
      return data({ status: 'completed', analysis: { status: 'queued' } }, 202)
    }
    return undefined
  }
  return { penangan, terkirim }
}
