<script setup lang="ts" generic="Row extends Record<string, unknown>">
// Tabel data rapat (IBM Carbon): header bisa diurutkan, toolbar, caption, keadaan kosong.
// Pengurutan di sisi klien atas `rows`. Sel khusus lewat slot #cell-<key>="{ row, value }".
// Baris bisa diklik (`.row.lk` mockup) lewat `rowTo`: sel `rowLinkKey` menjadi tautan, klik di mana pun pada baris
// mengikuti tautan itu kecuali klik pada elemen interaktif lain.
// Baris terpilih (mockup: baris berlatar #ECEFF5, paritas DN-12) lewat `selectedKey`: klik baris memancarkan `select`.
// Sediakan juga kontrol yang bisa difokus di salah satu sel (mis. tombol nama) untuk pengguna papan ketik.
import { computed } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import UiIcon from './UiIcon.vue'

export interface Column {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'right'
  mono?: boolean
  /** Nilai untuk pengurutan bila berbeda dari row[key]. */
  sortValue?: (row: Record<string, unknown>) => unknown
}
export interface SortState { key: string; dir: 'asc' | 'desc' }

const props = withDefaults(defineProps<{
  columns: Column[]
  rows: Row[]
  rowKey: string
  caption: string
  captionHidden?: boolean
  emptyText?: string
  /** Tujuan baris; null/undefined = baris biasa. */
  rowTo?: (row: Row) => RouteLocationRaw | null | undefined
  /** Kolom yang isinya menjadi tautan baris (bawaan kolom pertama). */
  rowLinkKey?: string
  /** Kunci baris terpilih; bila diisi (termasuk null), baris bisa dipilih dengan klik dan memancarkan `select`. */
  selectedKey?: string | null
}>(), { captionHidden: false, emptyText: 'Belum ada data.', rowTo: undefined, rowLinkKey: undefined, selectedKey: undefined })
const emit = defineEmits<{ select: [row: Row] }>()
const selectable = computed(() => props.selectedKey !== undefined)
const isSelected = (row: Row) => selectable.value && props.selectedKey === String(row[props.rowKey])

const sort = defineModel<SortState | null>('sort', { default: null })

function toggle(col: Column) {
  if (sort.value?.key !== col.key) sort.value = { key: col.key, dir: 'asc' }
  else if (sort.value.dir === 'asc') sort.value = { key: col.key, dir: 'desc' }
  else sort.value = null
}

function compare(a: unknown, b: unknown): number {
  const emptyA = a == null || a === ''
  const emptyB = b == null || b === ''
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1 // kosong selalu di bawah
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' })
}

const sorted = computed(() => {
  const s = sort.value
  const col = s && props.columns.find((c) => c.key === s.key)
  if (!s || !col) return props.rows
  const val = (r: Row) => (col.sortValue ? col.sortValue(r) : r[col.key])
  const sign = s.dir === 'asc' ? 1 : -1
  return [...props.rows].sort((x, y) => {
    const a = val(x), b = val(y)
    const emptyA = a == null || a === '', emptyB = b == null || b === ''
    if (emptyA || emptyB) return compare(a, b)
    return sign * compare(a, b)
  })
})

const router = useRouter()
const linkKey = computed(() => props.rowLinkKey ?? props.columns[0]?.key)
const targetOf = (row: Row) => props.rowTo?.(row) ?? null
// Klik pada kontrol lain di dalam baris tidak mengikuti tautan baris. Jangan menaruh kontrol interaktif di sel
// `rowLinkKey`: isi sel itu dibungkus RouterLink, jadi kontrol di sana bersarang di dalam tautan.
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, details, [contenteditable], [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'
function onRowClick(e: MouseEvent, row: Row) {
  if (selectable.value && !targetOf(row)) {
    if (e.button !== 0 || e.defaultPrevented || (e.target as Element | null)?.closest(INTERACTIVE)) return
    emit('select', row)
    return
  }
  const to = targetOf(row)
  if (!to || e.defaultPrevented || (e.button !== 0 && e.button !== 1)) return
  if ((e.target as Element | null)?.closest(INTERACTIVE)) return
  // Pengguna sedang menyeleksi teks di baris ini (seleksi di tempat lain tidak menghalangi)
  const sel = window.getSelection()
  if (sel?.toString() && sel.anchorNode && (e.currentTarget as Node).contains(sel.anchorNode)) return
  // Klik tengah atau dengan pengubah: perilaku peramban untuk tautan, yaitu tab baru
  if (e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey) {
    e.preventDefault()
    window.open(router.resolve(to).href, '_blank', 'noopener')
    return
  }
  void router.push(to)
}

const ariaSort = (col: Column) => (sort.value?.key === col.key ? (sort.value.dir === 'asc' ? 'ascending' : 'descending') : 'none')
const sortIcon = (col: Column) => (sort.value?.key === col.key ? (sort.value.dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more')
</script>

<template>
  <div class="el-table">
    <div v-if="$slots.toolbar" class="el-table__toolbar"><slot name="toolbar" /></div>
    <div class="el-table__scroll">
      <table>
        <caption :class="{ 'el-sr-only': captionHidden }">{{ caption }}</caption>
        <thead>
          <tr>
            <th
              v-for="c in columns" :key="c.key" scope="col" :class="{ 'is-right': c.align === 'right' }"
              :aria-sort="c.sortable ? ariaSort(c) : undefined"
            >
              <button v-if="c.sortable" type="button" class="el-table__sort" @click="toggle(c)">
                {{ c.label }}<UiIcon :name="sortIcon(c)" :size="14" />
              </button>
              <template v-else>{{ c.label }}</template>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sorted" :key="String(row[rowKey])" :class="{ 'is-link': targetOf(row) || selectable, 'is-selected': isSelected(row) }" @click="onRowClick($event, row)" @auxclick="onRowClick($event, row)">
            <td v-for="c in columns" :key="c.key" :class="{ 'is-right': c.align === 'right', 'el-mono': c.mono }">
              <RouterLink v-if="c.key === linkKey && targetOf(row)" :to="targetOf(row)!" class="el-table__link">
                <slot :name="`cell-${c.key}`" :row="row" :value="row[c.key]">{{ row[c.key] ?? '–' }}</slot>
              </RouterLink>
              <slot v-else :name="`cell-${c.key}`" :row="row" :value="row[c.key]">{{ row[c.key] ?? '–' }}</slot>
            </td>
          </tr>
          <tr v-if="!sorted.length">
            <td :colspan="columns.length" class="el-table__empty">{{ emptyText }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style>
.el-table { border: 1px solid var(--el-outline-variant); border-radius: 12px; background: var(--el-surface-card); overflow: hidden; }
.el-table__toolbar {
  display: flex; gap: 12px; flex-wrap: wrap; align-items: center; padding: 12px 16px;
  border-bottom: 1px solid var(--el-outline-variant);
}
.el-table__scroll { overflow-x: auto; }
.el-table table { width: 100%; border-collapse: collapse; }
.el-table caption { text-align: left; padding: 12px 16px; font-weight: 500; caption-side: top; }
.el-table th {
  text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase;
  color: var(--el-on-surface-variant); background: var(--el-surface-1); border-bottom: 1px solid var(--el-outline-variant);
  white-space: nowrap;
}
.el-table td { padding: 12px 16px; border-bottom: 1px solid var(--el-outline-variant); vertical-align: middle; }
.el-table tbody tr:last-child td { border-bottom: 0; }
.el-table tbody tr:hover td { background: var(--el-surface-1); }
.el-table .is-right { text-align: right; }
.el-table tr.is-link { cursor: pointer; }
/* Baris terpilih tetap tersorot saat di-hover; tema gelap memakai surface-3 karena surface-2 sama dengan latar kartu */
.el-table { --el-table-selected: var(--el-surface-2); }
:root[data-theme='dark'] .el-table { --el-table-selected: var(--el-surface-3); }
.el-table tbody tr.is-selected td, .el-table tbody tr.is-selected:hover td { background: var(--el-table-selected); }
.el-table__link { color: inherit; text-decoration: none; }
.el-table__link:hover { text-decoration: underline; }
.el-table__sort {
  display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; padding: 0; font: inherit;
  letter-spacing: inherit; text-transform: inherit; color: inherit; cursor: pointer;
}
.el-table th[aria-sort='ascending'], .el-table th[aria-sort='descending'] { color: var(--el-primary); }
.el-table__empty { text-align: center; color: var(--el-on-surface-variant); padding: 32px 16px; }
</style>
