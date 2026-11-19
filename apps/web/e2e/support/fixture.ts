import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Membaca fixture JSON dari support/data/ (lihat README di sana). Lewat fs, karena impor JSON di modul ES
// butuh atribut impor yang tidak dipakai di repo ini.
const FOLDER = fileURLToPath(new URL('./data/', import.meta.url))

export function fixture<T = unknown>(nama: string): T {
  return JSON.parse(readFileSync(`${FOLDER}${nama}.json`, 'utf8')) as T
}
