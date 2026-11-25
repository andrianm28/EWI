// Tanggal relatif dalam WIB (UTC+7), sama dengan layar dan API, supaya test tidak kedaluwarsa seperti tanggal tetap.

/** Tanggal YYYY-MM-DD (WIB) n hari dari hari ini, mis. tenggat penugasan yang dibatasi besok sampai 30 hari lagi. */
export function tanggalWib(n: number): string {
  return new Date(Date.now() + 7 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10)
}
