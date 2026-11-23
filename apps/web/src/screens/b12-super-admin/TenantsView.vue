<script setup lang="ts">
// B12 · Tenant. Super Admin melihat semua tenant, membuat tenant baru, mengirim ulang undangan Admin Tenant,
// dan menyalakan modul per tenant. Hanya metadata dan angka; isi wawancara tidak pernah tampil di sini.
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { platform, TENANT_STATUS, type PlatformTenant, type TenantList, type TenantModule } from '@/api/platform'
import { UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiField, UiKpiCard, UiNote, UiStatus, type UiColumn, type UiSortState } from '@/ui'

const list = ref<TenantList | null>(null)
const encryption = ref<'local' | 'kms'>('local')
const loading = ref(true)
const loadError = ref('')
const notice = ref('')
const noticeTone = ref<'success' | 'warning'>('success')
const errors = ref<{ message: string; fieldId?: string }[]>([])
const sort = ref<UiSortState | null>(null)
const fail = (e: unknown) => (e instanceof ApiError ? e.message : 'Terjadi kesalahan. Coba lagi.')

async function load() {
  loadError.value = ''
  try {
    const [t, s] = await Promise.all([platform.tenants(), platform.settings()])
    list.value = t.data
    encryption.value = s.data.encryptionProvider
  } catch (e) {
    loadError.value = fail(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Tenant', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'adminEmail', label: 'Admin tenant', mono: true },
  { key: 'users', label: 'Pengguna', sortable: true, align: 'right' },
  { key: 'activeModules', label: 'Modul aktif', sortable: true, align: 'right' },
  { key: 'aksi', label: 'Aksi' },
]
const rows = computed(() => (list.value?.tenants ?? []) as unknown as Record<string, unknown>[])
const asTenant = (row: Record<string, unknown>) => row as unknown as PlatformTenant

async function act(fn: () => Promise<string>) {
  errors.value = []
  notice.value = ''; noticeTone.value = 'success'
  try { notice.value = await fn(); await load() } catch (e) { errors.value = [{ message: fail(e) }] }
}
const reinvite = (t: PlatformTenant) => act(async () => { await platform.reinvite(t.id); return `Undangan dikirim ulang ke admin ${t.name}.` })

// ---------- buat tenant ----------
const formOpen = ref(false)
const busy = ref(false)
const form = reactive({ name: '', adminEmail: '', adminName: '', id: '' })
const checked = ref<{ slug: string; exists: boolean; for: string } | null>(null)
const formKey = () => `${form.name.trim()}|${form.adminEmail.trim()}|${form.id.trim()}`

function openForm() {
  Object.assign(form, { name: '', adminEmail: '', adminName: '', id: '' })
  checked.value = null
  errors.value = []
  notice.value = ''
  formOpen.value = true
}

function validate() {
  const errs: { message: string; fieldId?: string }[] = []
  if (!form.name.trim()) errs.push({ message: 'Isi nama perusahaan.', fieldId: 'tn-nama' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail.trim())) errs.push({ message: 'Isi email admin tenant yang benar, misalnya admin@perusahaan.co.id.', fieldId: 'tn-email' })
  if (encryption.value === 'kms' && !form.id.trim()) errs.push({ message: 'Isi ID tenant dari infra (UUID di Terraform).', fieldId: 'tn-id' })
  errors.value = errs
  return errs.length === 0
}
const input = () => ({ name: form.name.trim(), adminEmail: form.adminEmail.trim(), adminName: form.adminName.trim() || undefined, id: form.id.trim() || undefined })

async function check() {
  if (!validate()) return
  busy.value = true
  try {
    const res = await platform.checkTenant(input())
    checked.value = { slug: res.data.slug, exists: res.data.exists, for: formKey() }
  } catch (e) {
    errors.value = [{ message: fail(e) }]
  } finally { busy.value = false }
}
const canCreate = computed(() => !!checked.value && checked.value.for === formKey() && !checked.value.exists)

async function create() {
  if (!validate() || !canCreate.value) return
  busy.value = true
  try {
    const res = await platform.createTenant(input())
    formOpen.value = false
    noticeTone.value = res.data.invitation === 'sent' ? 'success' : 'warning'
    notice.value = res.data.invitation === 'sent'
      ? `Tenant ${res.data.tenant.name} dibuat. Undangan dikirim ke ${form.adminEmail.trim()} (berlaku 7 hari).`
      : `Tenant ${res.data.tenant.name} dibuat, tetapi email undangan gagal terkirim. Kirim ulang dari tabel.`
    await load()
  } catch (e) {
    errors.value = [{ message: fail(e) }]
  } finally { busy.value = false }
}

// ---------- panel modul ----------
const selected = ref<PlatformTenant | null>(null)
const modules = ref<TenantModule[]>([])
const moduleError = ref('')
async function openModules(t: PlatformTenant) {
  selected.value = t
  moduleError.value = ''
  try { modules.value = (await platform.modules(t.id)).data } catch (e) { moduleError.value = fail(e) }
}
async function toggle(m: TenantModule, enabled: boolean) {
  if (!selected.value) return
  moduleError.value = ''
  try {
    const row = (await platform.setModule(selected.value.id, m.key, enabled)).data
    modules.value = modules.value.map((x) => (x.key === row.key ? row : x))
    await load()
  } catch (e) { moduleError.value = fail(e) }
}
function moduleStatus(m: TenantModule): { label: string; tone: 'success' | 'warning' | 'neutral' | 'info' } {
  if (m.killSwitch) return { label: 'Dimatikan darurat', tone: 'warning' }
  if (m.effective) return { label: 'Aktif', tone: 'success' }
  if (m.flagOn && m.entitled === false) return { label: 'Menyala, menunggu langganan', tone: 'info' }
  return { label: 'Mati', tone: 'neutral' }
}
const accessLabel = (m: TenantModule) => (m.entitled === null ? 'Tidak perlu langganan' : m.entitled ? 'Berlangganan' : 'Belum berlangganan')
</script>

<template>
  <AppShell>
    <h1 class="el-h1">Tenant</h1>
    <p class="el-muted sa__lead">Super admin mengonfigurasi multi-tenant: satu tenant adalah satu perusahaan dengan datanya sendiri. Transkrip wawancara tidak pernah tampil di konsol ini.</p>

    <UiNote v-if="loadError" tone="critical">{{ loadError }}</UiNote>
    <p v-else-if="loading" class="el-muted">Memuat tenant…</p>
    <template v-else-if="list">
      <div class="el-grid el-grid-3">
        <UiKpiCard data-testid="kpi-tenant" label="Tenant aktif" :value="list.kpis.activeTenants" :note="`dari ${list.kpis.tenants} tenant terdaftar`" />
        <UiKpiCard label="Total pengguna" :value="list.kpis.users" note="seluruh tenant" />
        <UiKpiCard label="Modul tersedia" :value="list.kpis.modulesAvailable" note="dapat diaktifkan per tenant" />
      </div>

      <div v-if="notice" class="sa__notice sa__section" role="status"><UiNote :tone="noticeTone">{{ notice }}</UiNote></div>
      <UiErrorSummary v-if="!formOpen" :errors="errors" />

      <UiCard v-if="formOpen" class="sa__section" data-testid="tn-form">
        <h2 class="el-h3">Buat tenant baru</h2>
        <form novalidate @submit.prevent="create">
          <UiErrorSummary :errors="errors" />
          <div class="el-grid el-grid-2">
            <UiField id="tn-nama" v-slot="{ attrs }" label="Nama perusahaan" hint="Slug dibuat dari nama ini dan tidak bisa diganti setelah tenant dibuat.">
              <input v-bind="attrs" v-model="form.name" class="el-input" type="text" maxlength="255" autocomplete="off" placeholder="PT Contoh Sejahtera" />
            </UiField>
            <UiField id="tn-email" v-slot="{ attrs }" label="Email admin tenant" hint="Link undangan dikirim ke alamat ini dan berlaku 7 hari.">
              <input v-bind="attrs" v-model="form.adminEmail" class="el-input" type="email" maxlength="320" autocomplete="off" placeholder="admin@contoh.co.id" />
            </UiField>
            <UiField id="tn-admin" v-slot="{ attrs }" label="Nama admin tenant" hint="Opsional.">
              <input v-bind="attrs" v-model="form.adminName" class="el-input" type="text" maxlength="255" autocomplete="off" />
            </UiField>
            <UiField v-if="encryption === 'kms'" id="tn-id" v-slot="{ attrs }" label="ID tenant (dari infra)" hint="UUID yang sudah dibuat di Terraform (tenant_ids).">
              <input v-bind="attrs" v-model="form.id" class="el-input sa__mono" type="text" maxlength="36" autocomplete="off" />
            </UiField>
          </div>
          <p class="el-muted sa__section">Admin tenant menerima undangan dan menyiapkan pengguna, jabatan, dan data sendiri.</p>
          <p v-if="checked && checked.for === formKey()" class="sa__slug" data-testid="slug-hasil">
            Slug: <code>{{ checked.slug }}</code>
            <UiStatus v-if="checked.exists" tone="warning">Slug ini sudah dipakai tenant lain. Ganti nama perusahaan.</UiStatus>
            <UiStatus v-else tone="success">Slug tersedia</UiStatus>
          </p>
          <div class="sa__row sa__section">
            <UiButton variant="outlined" :disabled="busy" @click="check">Periksa</UiButton>
            <UiButton type="submit" :disabled="busy || !canCreate">Buat tenant</UiButton>
            <UiButton variant="text" @click="formOpen = false">Batal</UiButton>
          </div>
        </form>
      </UiCard>

      <UiDataTable v-model:sort="sort" :columns="COLUMNS" :rows="rows" row-key="id" caption="Daftar tenant" caption-hidden empty-text="Belum ada tenant." class="sa__section">
        <template #toolbar>
          <UiChip>{{ list.kpis.tenants }} tenant</UiChip>
          <UiButton v-if="!formOpen" size="sm" @click="openForm">Buat tenant baru</UiButton>
        </template>
        <template #cell-name="{ row }"><b>{{ asTenant(row).name }}</b><br /><span class="el-muted sa__mono">{{ asTenant(row).slug }}</span></template>
        <template #cell-status="{ row }"><UiStatus :tone="TENANT_STATUS[asTenant(row).status].tone">{{ TENANT_STATUS[asTenant(row).status].label }}</UiStatus></template>
        <!-- TEN-5: "{aktif} / {tersedia}" -->
        <template #cell-activeModules="{ row }"><span class="el-mono">{{ asTenant(row).activeModules }} / {{ list.kpis.modulesAvailable }}</span></template>
        <template #cell-adminEmail="{ row }">{{ asTenant(row).adminEmail ?? 'Belum ada' }}</template>
        <template #cell-aksi="{ row }">
          <div class="sa__row">
            <UiButton variant="text" size="sm" @click="openModules(asTenant(row))">Modul</UiButton>
            <UiButton v-if="asTenant(row).status === 'pending_admin'" variant="text" size="sm" @click="reinvite(asTenant(row))">Kirim ulang undangan</UiButton>
          </div>
        </template>
      </UiDataTable>

      <section v-if="selected" class="sa__section" role="region" :aria-label="`Modul ${selected.name}`">
        <UiCard>
          <div class="sa__row sa__between">
            <h2 class="el-h3">Modul {{ selected.name }}</h2>
            <UiButton variant="text" size="sm" @click="selected = null">Tutup</UiButton>
          </div>
          <UiNote v-if="moduleError" tone="critical">{{ moduleError }}</UiNote>
          <table class="sa__table">
            <caption class="el-sr-only">Modul {{ selected.name }}</caption>
            <thead><tr><th scope="col">Modul</th><th scope="col">Akses</th><th scope="col">Status</th><th scope="col">Nyalakan</th></tr></thead>
            <tbody>
              <tr v-for="m in modules" :key="m.key">
                <th scope="row">{{ m.name }} <UiChip v-if="m.earlyAccess" tone="review">Akses awal</UiChip></th>
                <td>{{ accessLabel(m) }}</td>
                <td><UiStatus :tone="moduleStatus(m).tone">{{ moduleStatus(m).label }}</UiStatus></td>
                <td>
                  <input :id="`mod-${m.key}`" type="checkbox" :checked="m.flagOn" :disabled="!m.available" :aria-label="`Aktifkan ${m.name}`"
                    @change="toggle(m, ($event.target as HTMLInputElement).checked)" />
                </td>
              </tr>
            </tbody>
          </table>
          <UiNote class="sa__section">Menyalakan modul berlangganan menambah akses untuk tenant ini. Setiap perubahan dicatat di log audit tenant dan log audit platform.</UiNote>
        </UiCard>
      </section>
    </template>
  </AppShell>
</template>

<style scoped>
.sa__lead { margin: 0 0 16px; }
.sa__section { margin-top: 16px; }
.sa__row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.sa__between { justify-content: space-between; }
.sa__notice { margin: 0 0 12px; }
.sa__mono { font-family: var(--el-font-mono, monospace); font-size: 0.875rem; }
.sa__slug { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 12px 0 0; }
.sa__table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.sa__table th, .sa__table td { text-align: left; padding: 8px; border-bottom: 1px solid var(--el-outline-variant, #ddd); }
</style>
