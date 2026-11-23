// Menu per tampilan, terjemahan fungsi `N` di mockup Pak Eji. Aturan tampil: docs/designs/b0-fondasi-ui.md bagian 5.2.
// `key` adalah nama rute. Butir baru muncul begitu sebuah paket mendaftarkan rute dengan nama itu.
import { reactive } from 'vue'
import type { IconName } from '@/ui/icons'
import type { SubmoduleKey } from '@/modules'
import type { ViewKey } from './views'

export interface MenuItem {
  key: string
  label: string | Partial<Record<ViewKey, string>>
  icon: IconName
  views: ViewKey[]
  group?: 'lna' | 'li'
  flag?: string
  submodule?: SubmoduleKey
  /** Butir peralihan: hilang untuk tampilan aktif begitu layar berandanya bisa dibuka (terdaftar dan gerbang lolos). */
  transitional?: boolean
}

export interface MenuGroup { key: 'lna' | 'li'; label: string; icon: IconName }

export const GROUPS: MenuGroup[] = [
  { key: 'lna', label: 'Learning Needs Analysis', icon: 'query_stats' },
  { key: 'li', label: 'Learning Intervention', icon: 'extension' },
]

const ALL: ViewKey[] = ['hr', 'atasan', 'karyawan', 'admin', 'super']

export const MENU: MenuItem[] = [
  { key: 'home', label: 'Beranda', icon: 'home', views: ALL, transitional: true },
  { key: 'dash', label: { hr: 'Dashboard utama', atasan: 'Dashboard tim' }, icon: 'dashboard', views: ['hr', 'atasan'] },
  { key: 'cc', label: 'Core Competencies', icon: 'flag', views: ['hr'], group: 'lna', submodule: 'cca' },
  { key: 'aiv', label: 'Wawancara AI', icon: 'record_voice_over', views: ['atasan'], group: 'lna', submodule: 'cca' },
  { key: 'dna', label: 'Developmental Needs', icon: 'account_tree', views: ['hr', 'atasan'], group: 'lna', submodule: 'dna' },
  { key: 'tna', label: 'Training Needs', icon: 'fact_check', views: ['hr', 'atasan'], group: 'lna', submodule: 'tna' },
  { key: 'ina', label: 'Improvement Needs', icon: 'build_circle', views: ['hr', 'atasan'], group: 'lna', submodule: 'ina' },
  { key: 'lib', label: 'Library', icon: 'local_library', views: ['hr'], group: 'li', flag: 'module.li' },
  { key: 'prog', label: 'Program & Course', icon: 'collections_bookmark', views: ['hr'], group: 'li', flag: 'module.li' },
  { key: 'req', label: 'Permintaan & pengembangan', icon: 'inventory_2', views: ['hr'], group: 'li', flag: 'module.li' },
  { key: 'ld', label: 'Learning Delivery', icon: 'school', views: ['hr'], flag: 'module.ld' },
  { key: 'lim', label: 'Learning Impact Measurement', icon: 'monitoring', views: ['hr', 'atasan'], flag: 'module.lim' },
  { key: 'cp', label: 'Career & Promotion', icon: 'workspace_premium', views: ['hr', 'atasan'], flag: 'promotion.recommendation' },
  // B8: hak subjek data karyawan, tanpa flag (sama dengan API-nya)
  { key: 'dsr', label: 'Permintaan data karyawan', icon: 'policy', views: ['hr'] },
  { key: 'my', label: 'Hasil saya', icon: 'person', views: ['karyawan'] },
  { key: 'aiv', label: 'Wawancara visi & nilai', icon: 'record_voice_over', views: ['karyawan'], submodule: 'cca' },
  { key: 'iv', label: 'Wawancara akar masalah', icon: 'forum', views: ['karyawan'], submodule: 'tna' },
  { key: 'li', label: 'Rencana belajar', icon: 'school', views: ['karyawan'] },
  // B15 tahap 3: wawancara ulang AI setelah belajar (atasan juga peserta pelatihan)
  { key: 'wu', label: 'Wawancara ulang', icon: 'forum', views: ['karyawan', 'atasan'], flag: 'lim.reinterview' },
  // Peralihan: karyawan masih membuka halaman DNA/TNA lama sampai "Hasil saya" (B8) terpasang, Admin Tenant
  // (juga HR, K2) sampai layar Pengguna (B11), dan Admin ETA (di halaman lama setara HR) sampai layar Tenant (B12)
  { key: 'dna', label: 'Developmental Needs', icon: 'account_tree', views: ['karyawan', 'admin', 'super'], submodule: 'dna', transitional: true },
  { key: 'tna', label: 'Training Needs', icon: 'fact_check', views: ['karyawan', 'admin', 'super'], submodule: 'tna', transitional: true },
  { key: 'users', label: 'Pengguna & peran', icon: 'group', views: ['admin'] },
  { key: 'jobs', label: 'Jabatan & kamus kompetensi', icon: 'badge', views: ['admin'] },
  { key: 'cfg', label: 'Impor data & integrasi', icon: 'upload_file', views: ['admin'] },
  { key: 'tenants', label: 'Tenant', icon: 'apartment', views: ['super'] },
  { key: 'platform', label: 'Konfigurasi platform', icon: 'tune', views: ['super'] },
]

// Buka-tutup grup accordion. Di tingkat modul karena tiap halaman memasang AppShell sendiri,
// jadi state komponen akan hilang setiap pindah halaman.
export const openGroups = reactive<Record<MenuGroup['key'], boolean>>({ lna: true, li: true })

export interface MenuContext {
  view: ViewKey
  /** Rute terdaftar dan gerbang meta-nya (views, flag, submodul, peran, entitlement) lolos. */
  routeOpen: (name: string) => boolean
  /** Layar beranda tampilan aktif sudah bisa dibuka. */
  homeReady: boolean
  flags: Record<string, boolean>
  canOpen: (key: SubmoduleKey) => boolean
}

export type MenuEntry =
  | { type: 'item'; key: string; label: string; icon: IconName; level: 0 | 1 }
  | { type: 'group'; key: 'lna' | 'li'; label: string; icon: IconName; children: { key: string; label: string; icon: IconName }[] }

export function labelOf(item: MenuItem, view: ViewKey): string {
  return typeof item.label === 'string' ? item.label : item.label[view] ?? Object.values(item.label)[0] ?? item.key
}

export function isVisible(item: MenuItem, ctx: MenuContext): boolean {
  if (!item.views.includes(ctx.view)) return false
  if (!ctx.routeOpen(item.key)) return false
  if (item.flag && ctx.flags[item.flag] !== true) return false
  if (item.submodule && !ctx.canOpen(item.submodule)) return false
  if (item.transitional && ctx.homeReady) return false
  return true
}

/** Menu untuk satu tampilan: butir tingkat atas dan grup accordion, urutan sesuai MENU. */
export function buildMenu(ctx: MenuContext): MenuEntry[] {
  const out: MenuEntry[] = []
  for (const item of MENU) {
    if (!isVisible(item, ctx)) continue
    const entry = { key: item.key, label: labelOf(item, ctx.view), icon: item.icon }
    if (!item.group) { out.push({ type: 'item', level: 0, ...entry }); continue }
    let group = out.find((e) => e.type === 'group' && e.key === item.group)
    if (!group) {
      const g = GROUPS.find((x) => x.key === item.group)!
      group = { type: 'group', key: g.key, label: g.label, icon: g.icon, children: [] }
      out.push(group)
    }
    if (group.type === 'group') group.children.push(entry)
  }
  return out
}

/** Label butir menu untuk judul top bar. */
export function menuLabel(key: string, view: ViewKey): string | null {
  const item = MENU.find((m) => m.key === key && m.views.includes(view)) ?? MENU.find((m) => m.key === key)
  return item ? labelOf(item, view) : null
}
