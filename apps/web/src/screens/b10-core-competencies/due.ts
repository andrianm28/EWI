// Tanggal penugasan dihitung dalam WIB (UTC+7), sama dengan API (spek 6.3), apa pun zona waktu peramban.
const WIB_MS = 7 * 3_600_000
const wibIso = (ms: number) => new Date(ms + WIB_MS).toISOString().slice(0, 10)
export const todayIso = () => wibIso(Date.now())
export const defaultDue = () => wibIso(Date.now() + 14 * 86_400_000)
