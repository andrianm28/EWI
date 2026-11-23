<script setup lang="ts">
// B11 · Pengguna & peran. Admin tenant mengundang akun, mengatur peran, jabatan, dan status di perusahaannya saja.
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { tenantAdmin, type AdminUser, type JobRole, type RoleOption } from '@/api/tenantAdmin'
import { useSessionStore } from '@/stores/session'
import AdminLinks from './AdminLinks.vue'
import { UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiField, UiNote, type UiColumn, type UiSortState } from '@/ui'

const session = useSessionStore()
const users = ref<AdminUser[]>([])
const total = ref(0)
const sso = ref(false)
const roles = ref<RoleOption[]>([])
const jobs = ref<JobRole[]>([])
const loading = ref(true)
const loadError = ref('')
const notice = ref('')
const errors = ref<{ message: string; fieldId?: string }[]>([])
const busy = ref(false)
const search = ref('')
const sort = ref<UiSortState | null>(null)

const fail = (e: unknown) => (e instanceof ApiError ? e.message : 'Terjadi kesalahan. Coba lagi.')

async function load() {
  loadError.value = ''
  try {
    const [u, r, j] = await Promise.all([tenantAdmin.users(), tenantAdmin.roles(), tenantAdmin.jobRoles()])
    users.value = u.data
    total.value = u.meta.total
    sso.value = u.meta.sso
    roles.value = r.data
    jobs.value = j.data
  } catch (e) {
    loadError.value = fail(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Nama', sortable: true },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'roleLabel', label: 'Peran', sortable: true },
  { key: 'jobRoleName', label: 'Jabatan', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'aksi', label: 'Aksi' },
]
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = q ? users.value.filter((u) => `${u.name ?? ''} ${u.email}`.toLowerCase().includes(q)) : users.value
  return list as unknown as Record<string, unknown>[]
})
const asUser = (row: Record<string, unknown>) => row as unknown as AdminUser
// akun hasil impor yang belum pernah masuk juga tampil "Diundang" (spek 6.1)
// P8 R3 (K-3): status berupa chip terisi seperti mockup (`chip c-ok`), bukan UiStatus
const statusOf = (u: AdminUser) => (u.status === 'disabled' ? { label: 'Nonaktif', tone: 'neutral' as const } : u.pendingLogin ? { label: 'Diundang', tone: 'training' as const } : { label: 'Aktif', tone: 'success' as const })
const isSelf = (u: AdminUser) => u.id === session.user?.id
const locked = (u: AdminUser) => u.role === 'eta_admin'

// ---------- undang / ubah ----------
const formOpen = ref(false)
const editing = ref<AdminUser | null>(null)
const form = reactive({ name: '', email: '', role: 'learner', jobRoleId: '', employeeId: '' })

function openForm(u?: AdminUser) {
  editing.value = u ?? null
  Object.assign(form, { name: u?.name ?? '', email: u?.email ?? '', role: u?.role ?? 'learner', jobRoleId: u?.jobRoleId ?? '', employeeId: u?.employeeId ?? '' })
  errors.value = []
  notice.value = ''
  formOpen.value = true
}

async function submit() {
  const errs: { message: string; fieldId?: string }[] = []
  if (!form.name.trim()) errs.push({ message: 'Isi nama pengguna.', fieldId: 'usr-nama' })
  if (!editing.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.push({ message: 'Isi email kerja yang benar, misalnya nama@perusahaan.co.id.', fieldId: 'usr-email' })
  errors.value = errs
  if (errs.length) return
  busy.value = true
  try {
    const shared = { name: form.name.trim(), jobRoleId: form.jobRoleId || null, employeeId: form.employeeId.trim() || null }
    if (editing.value) {
      // peran akun sendiri tidak dikirim: API menolak perubahan peran diri sendiri
      await tenantAdmin.updateUser(editing.value.id, isSelf(editing.value) ? shared : { ...shared, role: form.role })
      notice.value = 'Perubahan disimpan.'
    } else {
      const res = await tenantAdmin.inviteUser({ ...shared, email: form.email.trim(), role: form.role })
      notice.value = res.invited ? `Undangan dikirim ke ${res.data.email}. Link berlaku 7 hari.` : `Akun ${res.data.email} dibuat, tetapi email undangan gagal dikirim. Kirim ulang dari tabel.`
    }
    formOpen.value = false
    await load()
  } catch (e) {
    errors.value = [{ message: fail(e) }]
  } finally {
    busy.value = false
  }
}

async function act(fn: () => Promise<string>) {
  errors.value = []
  notice.value = ''
  try { notice.value = await fn(); await load() } catch (e) { errors.value = [{ message: fail(e) }] }
}
const resend = (u: AdminUser) => act(async () => { await tenantAdmin.resendInvite(u.id); return `Undangan dikirim ulang ke ${u.email}.` })
const setStatus = (u: AdminUser, status: 'active' | 'disabled') => act(async () => {
  await tenantAdmin.updateUser(u.id, { status })
  return status === 'disabled' ? `Akun ${u.email} dinonaktifkan.` : `Akun ${u.email} diaktifkan kembali.`
})
</script>

<template>
  <AppShell>
    <AdminLinks current="users" />
    <h1 class="el-h1">Pengguna &amp; peran</h1>
    <p class="el-muted adm__lead">Admin tenant mengelola akun dan peran di perusahaannya saja. Data tidak terlihat oleh tenant lain.</p>

    <UiNote v-if="loadError" tone="critical">{{ loadError }}</UiNote>
    <p v-else-if="loading" class="el-muted">Memuat pengguna…</p>
    <template v-else>
      <!-- ADM-2: note sukses hijau; role=status di pembungkus agar tetap dibacakan -->
      <div v-if="notice" role="status" class="adm__notice"><UiNote tone="success" data-testid="adm-info">{{ notice }}</UiNote></div>
      <UiErrorSummary v-if="!formOpen" :errors="errors" />

      <UiCard v-if="formOpen" class="adm__section" data-testid="usr-form">
        <h2 class="el-h3">{{ editing ? `Ubah ${editing.email}` : 'Undang pengguna' }}</h2>
        <form novalidate @submit.prevent="submit">
          <UiErrorSummary :errors="errors" />
          <div class="el-grid el-grid-2">
            <UiField id="usr-nama" v-slot="{ attrs }" label="Nama">
              <input v-bind="attrs" v-model="form.name" class="el-input" type="text" maxlength="255" autocomplete="off" />
            </UiField>
            <UiField v-if="!editing" id="usr-email" v-slot="{ attrs }" label="Email kerja" hint="Link undangan dikirim ke alamat ini dan berlaku 7 hari.">
              <input v-bind="attrs" v-model="form.email" class="el-input" type="email" maxlength="255" autocomplete="off" />
            </UiField>
            <UiField id="usr-peran" v-slot="{ attrs }" label="Peran" :hint="editing && isSelf(editing) ? 'Peran akun Anda sendiri hanya bisa diubah admin lain.' : undefined">
              <select v-bind="attrs" v-model="form.role" class="el-input" :disabled="!!editing && isSelf(editing)">
                <option v-for="r in roles" :key="r.key" :value="r.key">{{ r.label }}</option>
              </select>
            </UiField>
            <UiField id="usr-jabatan" v-slot="{ attrs }" label="Jabatan">
              <select v-bind="attrs" v-model="form.jobRoleId" class="el-input">
                <option value="">Belum ditentukan</option>
                <option v-for="j in jobs" :key="j.id" :value="j.id">{{ j.name }}</option>
              </select>
            </UiField>
            <UiField id="usr-nik" v-slot="{ attrs }" label="ID karyawan" hint="Opsional. Dipakai untuk mencocokkan data kinerja.">
              <input v-bind="attrs" v-model="form.employeeId" class="el-input" type="text" maxlength="64" autocomplete="off" />
            </UiField>
          </div>
          <div class="adm__row adm__section">
            <UiButton type="submit" :disabled="busy">{{ editing ? 'Simpan' : 'Kirim undangan' }}</UiButton>
            <UiButton variant="text" @click="formOpen = false">Batal</UiButton>
          </div>
        </form>
      </UiCard>

      <UiDataTable v-model:sort="sort" :columns="COLUMNS" :rows="rows" row-key="id" caption="Pengguna" caption-hidden empty-text="Tidak ada pengguna yang cocok." class="adm__section">
        <template #toolbar>
          <UiChip data-testid="usr-jumlah">{{ total }} pengguna</UiChip>
          <UiChip v-if="sso" tone="success">SSO aktif</UiChip>
          <label class="el-sr-only" for="usr-cari">Cari pengguna</label>
          <input id="usr-cari" v-model="search" class="el-input adm__search" type="search" placeholder="Cari nama atau email" />
          <UiButton v-if="!formOpen" size="sm" icon="person_add" class="adm__push" data-testid="usr-undang" @click="openForm()">Undang pengguna</UiButton>
        </template>
        <template #cell-name="{ row }"><b class="adm__nowrap">{{ asUser(row).name ?? 'Tanpa nama' }}</b></template>
        <!-- ADM-4: email mono 12px -->
        <template #cell-email="{ row }"><span class="el-mono adm__email">{{ asUser(row).email }}</span></template>
        <template #cell-roleLabel="{ row }"><UiChip>{{ asUser(row).roleLabel }}</UiChip></template>
        <template #cell-jobRoleName="{ row }">{{ asUser(row).jobRoleName ?? '' }}</template>
        <template #cell-status="{ row }"><UiChip :tone="statusOf(asUser(row)).tone">{{ statusOf(asUser(row)).label }}</UiChip></template>
        <template #cell-aksi="{ row }">
          <span v-if="locked(asUser(row))" class="el-muted">Dikelola ETA</span>
          <div v-else class="adm__row">
            <UiButton variant="text" size="sm" @click="openForm(asUser(row))">Ubah</UiButton>
            <UiButton v-if="asUser(row).pendingLogin && asUser(row).status !== 'disabled'" variant="text" size="sm" @click="resend(asUser(row))">Kirim ulang undangan</UiButton>
            <template v-if="!isSelf(asUser(row))">
              <UiButton v-if="asUser(row).status === 'disabled'" variant="text" size="sm" @click="setStatus(asUser(row), 'active')">Aktifkan</UiButton>
              <UiButton v-else variant="text" size="sm" @click="setStatus(asUser(row), 'disabled')">Nonaktifkan</UiButton>
            </template>
          </div>
        </template>
      </UiDataTable>
      <UiNote class="adm__section">Setiap perubahan peran dan status dicatat di log audit. Akun Super Admin dikelola oleh ETA.</UiNote>
    </template>
  </AppShell>
</template>

<style scoped>
.adm__lead { margin: 0 0 16px; }
.adm__section { margin-top: 16px; }
.adm__row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.adm__notice { margin: 0 0 12px; }
.adm__search { height: 40px; min-width: 220px; }
/* ADM-3/4/5 */
.adm__push { margin-left: auto; }
.adm__email { font-size: 12px; }
.adm__nowrap { white-space: nowrap; }
</style>
