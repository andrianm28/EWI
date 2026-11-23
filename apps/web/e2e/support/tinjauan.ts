import { cocok, responsData as data, type Penangan, type Terkirim } from './api'
import { ID_KOMPETENSI } from './tna-gap'

// Paritas B7 web: mock tinjauan temuan AI per gap (docs/designs/paritas-mockup/b7-tinjauan-web.md).
// Data karangan tangan mengikuti kontrak docs/designs/b7-tinjauan-hr.md; alur yang sama terhadap API sungguhan:
// apps/api/tests/integration/tinjauan-hr.test.js (blok "tinjauan per gap").

const ID_DIMAS = 'e1111111-1111-4111-8111-111111111111'
const ID_SARI = 'e2222222-2222-4222-8222-222222222222'
export const T_DRAF = 'f0000000-0000-4000-8000-000000000001'
export const T_PERBAIKAN = 'f0000000-0000-4000-8000-000000000002'
export const T_PELATIHAN = 'f0000000-0000-4000-8000-000000000003'

/** Teks rincian temuan: tidak boleh tampil di layar tinjauan (PO-6). */
export const RINCIAN_RAHASIA = 'RINCIAN-RAHASIA'

type Kategori = 'training' | 'non_training'
interface Temuan {
  id: string; userId: string; userName: string; title: string; category: Kategori; confidence: number
  reviewStatus: 'draft' | 'approved' | 'edited' | 'rejected'; held: boolean; handedOffAt: string | null
}

function butir(t: Temuan) {
  return {
    ...t, projectId: 'p1', sessionId: 's1', detail: RINCIAN_RAHASIA, competencyId: ID_KOMPETENSI, competencyName: 'Analisis insiden',
    metricName: null, target: null, actual: null, scoringAgreement: true, reviewedByName: null, reviewedAt: null, reviewNote: null,
    originalTitle: null, originalDetail: null, originalCategory: null, createdAt: '2026-11-20T03:00:00.000Z',
    heldAt: t.held ? '2026-11-21T03:00:00.000Z' : null, heldByName: t.held ? 'HR' : null, holdNote: null,
    suggestedClassification: t.confidence < 0.5 ? 'needs_review' : t.category === 'training' ? 'training' : 'improvement',
    reviewDueAt: '2026-11-24T03:00:00.000Z', overdue: false,
  }
}

export interface OpsiTinjauan {
  /** Bawaan: EliteMentor, penugasan langsung tersedia. */
  delivery?: { target: 'elitementor' | 'lms'; label: string; assignAvailable: boolean }
  /** Bawaan true. */
  inaEnabled?: boolean
  /** Ganti daftar temuan awal (bawaan tiga temuan mockup). */
  temuan?: Temuan[]
  /** Rekomendasi katalog untuk temuan pelatihan tanpa rencana (bawaan ST-A2). null = perlu modul baru. */
  rekomendasi?: { source: string; ref: string; title: string; url: string | null; programTier: string | null } | null
}

export const TEMUAN_MOCKUP: Temuan[] = [
  { id: T_DRAF, userId: ID_DIMAS, userName: 'Dimas', title: 'Kesulitan menentukan akar masalah (teknik analisis)', category: 'training', confidence: 0.9, reviewStatus: 'draft', held: false, handedOffAt: null },
  { id: T_PERBAIKAN, userId: ID_SARI, userName: 'Sari', title: 'Tidak ada template baku', category: 'non_training', confidence: 0.92, reviewStatus: 'approved', held: false, handedOffAt: null },
  { id: T_PELATIHAN, userId: ID_SARI, userName: 'Sari', title: 'Praktik dan umpan balik sangat minim', category: 'training', confidence: 0.88, reviewStatus: 'edited', held: false, handedOffAt: null },
]

const REKOMENDASI = { source: 'elitementor', ref: 'ST-A2', title: 'RCA & Post-Incident Report', url: null, programTier: 'intermediate' }

/**
 * Penangan GET /tna/review (filter gap), klasifikasi, solusi, rencana, penugasan, dan serah ke Improvement Needs.
 * State ikut berubah seperti API: klasifikasi mengubah kategori, rencana dan penugasan tercatat per temuan.
 */
export function tinjauanGap(o: OpsiTinjauan = {}): { penangan: Penangan; terkirim: Terkirim[] } {
  const terkirim: Terkirim[] = []
  const temuan = (o.temuan ?? TEMUAN_MOCKUP).map((t) => ({ ...t }))
  const rencana = new Map<string, { id: string; assignmentStatus: 'sent' | null }>()
  const delivery = o.delivery ?? { target: 'elitementor', label: 'EliteMentor', assignAvailable: true }
  const rekomendasi = o.rekomendasi === undefined ? REKOMENDASI : o.rekomendasi

  const penangan: Penangan = (req) => {
    if (cocok(req, 'GET /tna/review')) {
      terkirim.push({ path: 'GET /tna/review', body: Object.fromEntries(req.query) })
      const aktif = temuan.filter((t) => t.reviewStatus !== 'rejected')
      const status = req.query.get('status') ?? 'draft'
      const rows = status === 'all' ? temuan : aktif.filter((t) => (status === 'draft' ? t.reviewStatus === 'draft' : t.reviewStatus !== 'draft'))
      const hitung = (s: string) => temuan.filter((t) => t.reviewStatus === s).length
      return {
        json: {
          data: rows.map(butir),
          counts: { draft: hitung('draft'), approved: hitung('approved'), edited: hitung('edited'), rejected: hitung('rejected'), held: 0, overdue: 0 },
          targetDays: 2,
          gap: { key: `c:${ID_KOMPETENSI}`, label: 'Analisis insiden' },
        },
      }
    }
    const kl = cocok(req, 'POST /tna/findings/:id/classify')
    if (kl) {
      terkirim.push({ path: `classify ${kl.id}`, body: req.body })
      const t = temuan.find((x) => x.id === kl.id)!
      const c = (req.body as { classification: string }).classification
      if (c === 'needs_review') t.held = true
      else { t.category = c === 'training' ? 'training' : 'non_training'; t.reviewStatus = t.reviewStatus === 'draft' ? 'approved' : 'edited' }
      return data(butir(t))
    }
    if (cocok(req, 'GET /tna/review/solutions')) {
      terkirim.push({ path: 'GET /tna/review/solutions', body: Object.fromEntries(req.query) })
      const putus = temuan.filter((t) => t.reviewStatus === 'approved' || t.reviewStatus === 'edited')
      return data({
        training: putus.filter((t) => t.category === 'training').map((t) => {
          const p = rencana.get(t.id)
          return {
            findingId: t.id, userId: t.userId, userName: t.userName, title: t.title, competencyName: 'Analisis insiden',
            recommendation: p ? null : rekomendasi,
            planItem: p ? {
              id: p.id, status: 'new', needsModule: !rekomendasi, catalogSource: rekomendasi?.source ?? null, catalogItemRef: rekomendasi?.ref ?? null,
              catalogItemTitle: rekomendasi?.title ?? null, assignmentStatus: p.assignmentStatus, assignmentTarget: p.assignmentStatus ? 'elitementor' : null, assignedAt: null,
            } : null,
          }
        }),
        improvement: putus.filter((t) => t.category === 'non_training').map((t) => ({ findingId: t.id, userId: t.userId, userName: t.userName, title: t.title, handedOffAt: t.handedOffAt })),
        delivery, inaEnabled: o.inaEnabled ?? true,
      })
    }
    const pl = cocok(req, 'POST /tna/findings/:id/plan')
    if (pl) {
      terkirim.push({ path: `plan ${pl.id}`, body: req.body })
      const p = { id: `plan-${pl.id.slice(-1)}`, assignmentStatus: null }
      rencana.set(pl.id, p)
      return data({ id: p.id, status: 'new' }, 201)
    }
    const as = cocok(req, 'POST /tna/plan-items/:id/assign')
    if (as) {
      terkirim.push({ path: `assign ${as.id}`, body: req.body })
      for (const p of rencana.values()) if (p.id === as.id) p.assignmentStatus = 'sent'
      return data({ id: as.id, status: 'new' })
    }
    if (cocok(req, 'POST /tna/review/improvement-handoff')) {
      terkirim.push({ path: 'handoff', body: req.body })
      const ids = (req.body as { findingIds: string[] }).findingIds
      for (const t of temuan) if (ids.includes(t.id)) t.handedOffAt = '2026-11-23T03:00:00.000Z'
      return data({ handedOff: ids, already: [], skipped: [] })
    }
    if (cocok(req, 'GET /tna/plan-items/export.csv')) {
      terkirim.push({ path: 'export.csv', body: null })
      return { json: 'ID Karyawan,Nama' }
    }
    return undefined
  }
  return { penangan, terkirim }
}
