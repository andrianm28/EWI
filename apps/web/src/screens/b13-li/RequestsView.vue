<script setup lang="ts">
// Permintaan & pengembangan modul (mockup, layar `req`): jalur vendor dan jalur pengembangan bersama ELGOS.
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import './li.css'
import { ApiError } from '@/api/client'
import { UiBreadcrumb, UiButton, UiCard, UiChip, UiNote, UiStatus } from '@/ui'
import { li, type CatalogItem, type RequestStatus, type Requests, type VendorRequest } from './api'
import { DRAFT_LABEL, NEXT_REQUEST, REQUEST_LABEL, priorityLabel } from './labels'

const router = useRouter()
const res = ref<Requests | null>(null)
const error = ref('')
const busy = ref(false)
const catalog = ref<CatalogItem[]>([])
const course = reactive<Record<string, string>>({})

async function load() {
  try { res.value = await li.requests(); error.value = '' } catch (e) { error.value = e instanceof ApiError ? e.message : 'Daftar tidak bisa dimuat' }
}
onMounted(async () => {
  await load()
  try { catalog.value = (await li.catalog()).data } catch { /* tanpa katalog */ }
})
const vendor = computed(() => res.value?.vendorName ?? 'vendor')
const active = computed(() => (res.value?.data.vendor ?? []).filter((r) => r.status !== 'cancelled'))

async function act(fn: () => Promise<unknown>) {
  busy.value = true; error.value = ''
  try { await fn(); await load() } catch (e) { error.value = e instanceof ApiError ? e.message : 'Tindakan gagal' } finally { busy.value = false }
}
const move = (r: VendorRequest, to: RequestStatus) => act(() => li.moveRequest(r.id, to, to === 'installed' ? course[r.id] || undefined : undefined))
async function develop(moduleId: string) {
  busy.value = true; error.value = ''
  try { const { data } = await li.startDraft(moduleId); await router.push({ name: 'req-draf', params: { id: data.id } }) }
  catch (e) { error.value = e instanceof ApiError ? e.message : 'Draf tidak bisa dibuat' } finally { busy.value = false }
}
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Intervention' }, { label: 'Permintaan & pengembangan' }]" />
    <h1 class="el-h1">Permintaan &amp; pengembangan modul</h1>
    <p class="el-muted">Dua jalur untuk memiliki modul: meminta dari {{ vendor }}, atau mengembangkan sendiri bersama ELGOS berdasarkan tujuan pembelajaran dari DACUM Tool 1 dan 2.</p>
    <UiNote v-if="error" tone="critical" data-testid="galat">{{ error }}</UiNote>

    <div v-if="res" class="li-split li-gap">
      <UiCard as="section" aria-label="Permintaan ke vendor">
        <h2 class="el-h3">Diminta ke {{ vendor }} <span class="el-muted">· {{ active.length }}</span></h2>
        <p v-if="!active.length" class="el-muted">Belum ada permintaan. Mulai dari Library atau Program &amp; Course.</p>
        <div v-for="r in active" :key="r.id" class="li-req" :data-testid="`permintaan-${r.moduleCode}`">
          <div class="li-row">
            <span><span class="el-mono">{{ r.moduleCode }}</span> <b>{{ r.moduleName }}</b></span>
            <UiStatus :tone="r.status === 'installed' ? 'success' : 'info'">{{ REQUEST_LABEL[r.status] }}</UiStatus>
          </div>
          <label v-if="r.status === 'delivered' && catalog.length" class="el-label li-gap">Course di katalog (opsional)
            <select v-model="course[r.id]" class="el-input"><option value="">Belum ada</option><option v-for="c in catalog" :key="c.id" :value="c.id">{{ c.title }}</option></select>
          </label>
          <div v-if="r.status !== 'installed'" class="li-actions">
            <UiButton v-if="NEXT_REQUEST[r.status]" variant="tonal" size="sm" :disabled="busy" @click="move(r, NEXT_REQUEST[r.status]!.to)">{{ NEXT_REQUEST[r.status]!.label }}</UiButton>
            <UiButton variant="text" size="sm" :disabled="busy" @click="move(r, 'cancelled')">Batalkan</UiButton>
          </div>
        </div>
        <p class="el-muted li-small li-gap">Alur: diminta → dikonfirmasi {{ vendor }} → modul dikirim → dipasang di EliteMentor. HR mencatat tiap langkah; ELGOS tidak mengirim apa pun ke {{ vendor }}.</p>
      </UiCard>

      <UiCard as="section" aria-label="Pengembangan bersama ELGOS">
        <h2 class="el-h3">Dikembangkan dengan ELGOS <span class="el-muted">· {{ res.data.drafts.length }} draf</span></h2>
        <p v-if="!res.data.drafts.length" class="el-muted">Belum ada draf. Pilih modul di Library lalu "Kembangkan dengan ELGOS".</p>
        <div v-for="d in res.data.drafts" :key="d.id" class="li-req li-row" :data-testid="`draf-${d.moduleCode}`">
          <span><span class="el-mono">{{ d.moduleCode }}</span> <b>{{ d.moduleName }}</b><br><span class="el-muted li-small">{{ DRAFT_LABEL[d.status] }}</span></span>
          <UiButton variant="tonal" size="sm" :to="{ name: 'req-draf', params: { id: d.id } }">Buka</UiButton>
        </div>
        <h3 class="el-h3 li-gap">Disarankan dikembangkan sendiri</h3>
        <p class="el-muted li-small">Modul spesifik proses perusahaan yang belum punya sumber ({{ res.data.candidates.length }} modul).</p>
        <div v-for="c in res.data.candidates" :key="c.id" class="li-req li-row">
          <span><span class="el-mono">{{ c.code }}</span> {{ c.name }} <UiChip v-if="c.priority" tone="review" icon="flag">{{ priorityLabel(c) }}</UiChip></span>
          <UiButton variant="outlined" size="sm" :disabled="busy" @click="develop(c.id)">Kembangkan</UiButton>
        </div>
      </UiCard>
    </div>
  </AppShell>
</template>

<style>
.li-req { padding: 12px 0; border-bottom: 1px solid var(--el-outline-variant); }
.li-req .li-actions { margin-top: 8px; }
</style>
