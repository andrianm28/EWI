import type { Page, Request } from '@playwright/test'

// B18 (docs/designs/b18-e2e-qa-malam.md 4.2): mock API berbentuk fungsi, supaya parameter path, query, dan state
// antar-permintaan bisa ditangani. Satu rute `**/api/**` per halaman; penangan dicoba dari yang terakhir didaftarkan.
// Permintaan yang tidak ditangani siapa pun dijawab 404 BELUM_DIMOCK dan dicatat, supaya test tidak diam-diam
// bergantung pada backend yang tidak ada.

export interface PermintaanApi {
  method: string
  /** Path tanpa awalan /api, mis. "/tna/sessions/abc". */
  path: string
  query: URLSearchParams
  /** Body JSON yang sudah di-parse (null bila tidak ada atau bukan JSON). */
  body: unknown
}

export interface ResponsApi {
  status?: number
  json: unknown
}

/** Permintaan tulis yang dicatat penangan mock untuk diperiksa test, mis. `{ path: 'confirm', body: {} }`. */
export interface Terkirim { path: string; body: unknown }

/** Respons sukses dengan amplop `{ data }` yang dipakai API ELGOS. */
export const responsData = (data: unknown, status = 200): ResponsApi => ({ status, json: { data } })

/** Mengembalikan respons, atau undefined bila permintaan ini bukan urusannya (diteruskan ke penangan berikutnya). */
export type Penangan = (req: PermintaanApi) => ResponsApi | undefined | Promise<ResponsApi | undefined>

interface Tumpukan {
  test: Penangan[]
  dasar: Penangan[]
  belumDimock: string[]
  /** Penangan yang melempar galat (dijawab 500 MOCK_GALAT), mis. "GET /ina/actions/a-1: TypeError ...". */
  galat: string[]
}

const perHalaman = new WeakMap<Page, Tumpukan>()

function bacaBody(request: Request): unknown {
  try { return request.postDataJSON() } catch { return null }
}

async function pasang(page: Page): Promise<Tumpukan> {
  const ada = perHalaman.get(page)
  if (ada) return ada
  const t: Tumpukan = { test: [], dasar: [], belumDimock: [], galat: [] }
  perHalaman.set(page, t)
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const req: PermintaanApi = { method: request.method(), path: url.pathname.replace(/^\/api/, ''), query: url.searchParams, body: bacaBody(request) }
    // Penangan test lebih dulu, lalu penangan dasar dari loginSebagai; dalam tiap kelompok yang terakhir didaftarkan menang.
    for (const penangan of [...[...t.test].reverse(), ...[...t.dasar].reverse()]) {
      let respons: ResponsApi | undefined
      try {
        respons = await penangan(req)
      } catch (e) {
        t.galat.push(`${req.method} ${req.path}: ${String(e)}`)
        return route.fulfill({ status: 500, json: { error: { code: 'MOCK_GALAT', message: `Penangan mock gagal: ${String(e)}` } } })
      }
      if (respons) return route.fulfill({ status: respons.status ?? 200, json: respons.json })
    }
    t.belumDimock.push(`${req.method} ${req.path}`)
    return route.fulfill({ status: 404, json: { error: { code: 'BELUM_DIMOCK', message: `Tidak di-mock: ${req.method} ${req.path}` } } })
  })
  return t
}

/** Mendaftarkan penangan API untuk halaman ini. Boleh dipanggil berkali-kali, sebelum atau sesudah loginSebagai. */
export async function mockApi(page: Page, penangan: Penangan): Promise<void> {
  ;(await pasang(page)).test.push(penangan)
}

/** Dipakai loginSebagai: penangan sesi selalu kalah dari penangan test, apa pun urutan pemanggilannya. */
export async function mockApiDasar(page: Page, penangan: Penangan): Promise<void> {
  ;(await pasang(page)).dasar.push(penangan)
}

/** Permintaan yang sampai ke jaring pengaman (tidak ditangani penangan mana pun), mis. "GET /tna/review". */
export function permintaanBelumDimock(page: Page): string[] {
  return [...(perHalaman.get(page)?.belumDimock ?? [])]
}

/** Penangan mock yang melempar galat (dijawab 500 MOCK_GALAT); test yang sehat mengharapkan daftar kosong. */
export function galatMock(page: Page): string[] {
  return [...(perHalaman.get(page)?.galat ?? [])]
}

/**
 * Mencocokkan permintaan dengan pola "METHOD /path/:param". Mengembalikan parameter path, atau null.
 * Contoh: cocok(req, 'GET /tna/sessions/:id') -> { id: 'abc' }
 */
export function cocok(req: PermintaanApi, pola: string): Record<string, string> | null {
  const [method, path] = pola.split(' ')
  if (!method || !path || method !== req.method) return null
  const bagianPola = path.split('/')
  const bagian = req.path.split('/')
  if (bagianPola.length !== bagian.length) return null
  const params: Record<string, string> = {}
  for (const [i, p] of bagianPola.entries()) {
    const nilai = bagian[i] ?? ''
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(nilai)
    else if (p !== nilai) return null
  }
  return params
}
