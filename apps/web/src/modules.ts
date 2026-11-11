// Submodul EWI Modul 01. Teks deskripsi mengikuti RG-1..RG-4 (rapat 10 Nov).
export type SubmoduleKey = 'cca' | 'dna' | 'tna' | 'ina'

export const SUBMODULES: { key: SubmoduleKey; code: string; title: string; summary: string }[] = [
  { key: 'cca', code: 'CCA', title: 'Core Competency Analysis', summary: 'Kompetensi inti dari strategi dan wawancara pimpinan.' },
  { key: 'dna', code: 'DNA', title: 'Development Need Analysis', summary: 'Gap tiap karyawan terhadap kompetensi jabatan dan jenjang karier.' },
  { key: 'tna', code: 'TNA', title: 'Training Needs Analysis', summary: 'Wawancara dipicu target OKR/KPI/SLA yang tidak tercapai, menghasilkan training plan.' },
  { key: 'ina', code: 'INA', title: 'Improvement Needs Analysis', summary: 'Masalah non-training seperti SOP dan tools.' },
]
