// Nada warna komponen bersama, satu sumber untuk layar paket (P9 smell "Tone terduplikasi").
/** UiChip: tiga jalur mockup (Training Needs, Improvement Needs, Perlu ditinjau HR) plus sukses, kritis, netral. */
export type ChipTone = 'training' | 'improvement' | 'review' | 'success' | 'critical' | 'neutral'
/** UiStatus: ikon + teks. */
export type StatusTone = 'success' | 'warning' | 'critical' | 'info' | 'neutral'
