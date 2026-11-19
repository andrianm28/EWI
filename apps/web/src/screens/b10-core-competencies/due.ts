// Batas waktu default penugasan: 14 hari dari hari ini (tanggal lokal peramban).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const todayIso = () => iso(new Date())
export const defaultDue = () => iso(new Date(Date.now() + 14 * 86_400_000))
