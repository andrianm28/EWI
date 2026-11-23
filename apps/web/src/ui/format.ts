// Format angka bersama (paritas P8, R4): locale id-ID, titik pemisah ribuan, desimal koma, dibulatkan ke paling banyak
// dua angka di belakang koma. Skor (target, aktual, gap) memakai skala 0–100 tanpa "%"; persentase sungguhan
// (kesiapan, progres) menambah "%" sendiri. Tanda negatif selalu tanda minus "−" (U+2212), tidak pernah "-0".
const NUMBER = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
const MINUS = '−'

/** Angka dengan koma desimal, mis. 93.4 → "93,4", 1234 → "1.234", -5 → "−5". NaN/Infinity → `empty`. */
export function formatNumber(n: number, empty = '–'): string {
  if (!Number.isFinite(n)) return empty
  const text = NUMBER.format(n)
  // -0 dan nilai yang membulat ke 0 (mis. -0,001) tampil "0"
  if (/^-?0$/.test(text)) return '0'
  return text.startsWith('-') ? MINUS + text.slice(1) : text
}

/** Skor 0–100 tanpa satuan; nilai kosong atau bukan angka hingga memakai `empty`. */
export const formatScore = (n: number | null | undefined, empty = '–') => (n === null || n === undefined ? empty : formatNumber(n, empty))
