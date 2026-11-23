// Format angka bersama (paritas P8, R4): locale id-ID, desimal koma, paling banyak dua angka di belakang koma.
// Skor (target, aktual, gap) memakai skala 0–100 tanpa "%"; persentase sungguhan (kesiapan, progres) menambah "%" sendiri.
const NUMBER = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

/** Angka dengan koma desimal, mis. 93.4 → "93,4", 1234 → "1.234". */
export const formatNumber = (n: number) => NUMBER.format(n)

/** Skor 0–100 tanpa satuan; nilai kosong memakai `empty`. */
export const formatScore = (n: number | null | undefined, empty = '–') => (n === null || n === undefined ? empty : formatNumber(n))
