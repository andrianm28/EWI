<script setup lang="ts">
// B12 · Konfigurasi platform. Empat kartu mockup (isolasi data, model AI, kebijakan bawaan, autentikasi), dua isian
// yang berlaku untuk semua tenant, kesepakatan AI–HR, biaya token mingguan, log audit platform, percobaan masuk.
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import {
  ATTEMPT_LABEL, platform, type AiCostRow, type AiQualityRow, type AttemptRow, type PlatformLogRow, type PlatformSettings,
} from '@/api/platform'
import { UiButton, UiCard, UiErrorSummary, UiField, UiNote, UiStatus } from '@/ui'

const settings = ref<PlatformSettings | null>(null)
const quality = ref<AiQualityRow[]>([])
const cost = ref<AiCostRow[]>([])
const log = ref<PlatformLogRow[]>([])
const attempts = ref<AttemptRow[]>([])
const loading = ref(true)
const loadError = ref('')
const notice = ref('')
const errors = ref<{ message: string; fieldId?: string }[]>([])
const busy = ref(false)
const confirmLower = ref(false)
const form = reactive({ sessionIdleMinutes: '', aiHrAgreementTarget: '' })
const fail = (e: unknown) => (e instanceof ApiError ? e.message : 'Terjadi kesalahan. Coba lagi.')

function fill(s: PlatformSettings) {
  settings.value = s
  form.sessionIdleMinutes = String(s.editable.sessionIdleMinutes)
  form.aiHrAgreementTarget = String(s.editable.aiHrAgreementTarget)
}

async function load() {
  loadError.value = ''
  try {
    const [s, q, c, l, a] = await Promise.all([platform.settings(), platform.aiQuality(), platform.aiCost(), platform.log(), platform.attempts()])
    fill(s.data); quality.value = q.data; cost.value = c.data; log.value = l.data; attempts.value = a.data
  } catch (e) {
    loadError.value = fail(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const target = computed(() => settings.value?.editable.aiHrAgreementTarget ?? 85)
const idleRow = computed(() => {
  const s = settings.value
  if (!s) return ''
  if (s.display.idleEnforcement === 'not_yet') return 'Belum ditegakkan (sesi berlaku 8 jam)'
  return `${s.editable.sessionIdleMinutes} menit tanpa aktivitas, di ${s.display.idleEnforcedTenants} tenant`
})

function parsed() {
  const errs: { message: string; fieldId?: string }[] = []
  const idle = Number(form.sessionIdleMinutes)
  const agree = Number(form.aiHrAgreementTarget)
  if (!/^\d+$/.test(form.sessionIdleMinutes.trim()) || idle < 5 || idle > 480) errs.push({ message: 'Batas waktu sesi harus bilangan bulat 5–480 menit.', fieldId: 'pf-sesi' })
  if (!/^\d+$/.test(form.aiHrAgreementTarget.trim()) || agree < 50 || agree > 100) errs.push({ message: 'Target kesepakatan AI–HR harus bilangan bulat 50–100.', fieldId: 'pf-target' })
  errors.value = errs
  return errs.length ? null : { sessionIdleMinutes: idle, aiHrAgreementTarget: agree }
}

async function save(confirmed = false) {
  notice.value = ''
  const patch = parsed()
  if (!patch || !settings.value) return
  if (!confirmed && patch.sessionIdleMinutes < settings.value.editable.sessionIdleMinutes) { confirmLower.value = true; return }
  confirmLower.value = false
  busy.value = true
  try {
    fill((await platform.updateSettings(patch)).data)
    notice.value = 'Konfigurasi disimpan. Nilai berlaku untuk semua tenant.'
    log.value = (await platform.log()).data
  } catch (e) {
    errors.value = [{ message: fail(e) }]
  } finally { busy.value = false }
}

const fmtPct = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('id-ID')}%`)
const fmtNum = (n: number) => n.toLocaleString('id-ID')
const fmtUsd = (n: number) => `US$${n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const fmtTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })
const RESOURCE: Record<string, string> = { tenant: 'Tenant', 'tenant.invitation': 'Undangan', 'tenant.module': 'Modul tenant', 'platform.setting': 'Konfigurasi platform' }
function logDetail(r: PlatformLogRow) {
  const m = r.meta
  if (r.resource === 'tenant.module') return `${String(m.module ?? '')} ${m.enabled ? 'dinyalakan' : 'dimatikan'}`
  if (r.resource === 'platform.setting') return `${String(m.key ?? '')}: ${String(m.from ?? '')} → ${String(m.to ?? '')}`
  if (r.resource === 'tenant') return `dibuat (${String(m.slug ?? '')})`
  return r.action === 'create' ? 'dikirim' : 'diubah'
}

async function downloadCsv() {
  errors.value = []
  try { await platform.downloadCostCsv() } catch (e) { errors.value = [{ message: fail(e) }] }
}
</script>

<template>
  <AppShell>
    <h1 class="el-h1">Konfigurasi platform</h1>
    <p class="el-muted pf__lead">Pengaturan di halaman ini berlaku untuk semua tenant ELGOS.</p>

    <UiNote v-if="loadError" tone="critical">{{ loadError }}</UiNote>
    <p v-else-if="loading" class="el-muted">Memuat konfigurasi…</p>
    <template v-else-if="settings">
      <p v-if="notice" class="pf__notice" role="status">{{ notice }}</p>
      <UiErrorSummary :errors="errors" />

      <div class="el-grid el-grid-2">
        <UiCard>
          <h2 class="el-h3">Isolasi data</h2>
          <dl class="pf__dl">
            <dt>Isolasi per tenant</dt><dd>Setiap query memfilter tenant dari sesi; data tenant tidak bisa dibaca tenant lain.</dd>
            <dt>Enkripsi data</dt><dd>{{ settings.display.encryption === 'kms' ? 'Kunci per tenant di AWS KMS' : 'Kunci induk lokal (non-produksi)' }}</dd>
          </dl>
        </UiCard>
        <UiCard>
          <h2 class="el-h3">Model AI wawancara</h2>
          <dl class="pf__dl">
            <dt>Model</dt><dd>{{ settings.display.aiModel.provider }}<template v-if="settings.display.aiModel.model"> · {{ settings.display.aiModel.model }}</template></dd>
            <dt>Kesepakatan AI–HR</dt><dd>Target {{ settings.editable.aiHrAgreementTarget }}%</dd>
          </dl>
        </UiCard>
        <UiCard>
          <h2 class="el-h3">Kebijakan bawaan</h2>
          <dl class="pf__dl">
            <dt>Retensi log audit</dt><dd>12 bulan</dd>
            <dt>Anonimisasi dashboard agregat</dt><dd>Aktif</dd>
            <dt>Persetujuan karyawan wajib</dt><dd>Aktif</dd>
          </dl>
        </UiCard>
        <UiCard>
          <h2 class="el-h3">Autentikasi</h2>
          <dl class="pf__dl">
            <dt>SSO perusahaan per tenant</dt><dd>{{ settings.display.ssoTenants }} tenant</dd>
            <dt>Verifikasi dua langkah</dt><dd>Tidak dipakai (login lewat link email, PD-10)</dd>
            <dt>Batas waktu sesi</dt><dd>{{ idleRow }}</dd>
          </dl>
        </UiCard>
      </div>

      <UiCard class="pf__section">
        <h2 class="el-h3">Ubah konfigurasi</h2>
        <form novalidate @submit.prevent="save()">
          <div class="el-grid el-grid-2">
            <UiField id="pf-sesi" v-slot="{ attrs }" label="Batas waktu sesi (menit)" hint="5–480 menit tanpa aktivitas. Ditegakkan setelah tahap sesi diam aktif.">
              <input v-bind="attrs" v-model="form.sessionIdleMinutes" class="el-input" type="text" inputmode="numeric" autocomplete="off" />
            </UiField>
            <UiField id="pf-target" v-slot="{ attrs }" label="Target kesepakatan AI–HR (%)" hint="50–100. Dipakai kartu kesepakatan di bawah.">
              <input v-bind="attrs" v-model="form.aiHrAgreementTarget" class="el-input" type="text" inputmode="numeric" autocomplete="off" />
            </UiField>
          </div>
          <UiNote v-if="confirmLower" tone="warning" class="pf__section" data-testid="konfirmasi-sesi">
            Menurunkan batas sesi berlaku untuk semua tenant: pengguna yang diam lebih lama akan diminta masuk lagi.
            <div class="pf__row pf__section">
              <UiButton size="sm" :disabled="busy" @click="save(true)">Ya, turunkan batas sesi</UiButton>
              <UiButton size="sm" variant="text" @click="confirmLower = false">Batal</UiButton>
            </div>
          </UiNote>
          <div class="pf__row pf__section">
            <UiButton type="submit" :disabled="busy">Simpan konfigurasi</UiButton>
          </div>
        </form>
      </UiCard>

      <UiCard class="pf__section">
        <h2 class="el-h3">Kesepakatan AI–HR (30 hari)</h2>
        <p class="el-muted">Persentase temuan AI yang disetujui HR tanpa diubah. Target {{ target }}%. Tenant dengan kurang dari 10 temuan ditinjau belum dinilai.</p>
        <table class="pf__table">
          <caption class="el-sr-only">Kesepakatan AI–HR per tenant</caption>
          <thead><tr><th scope="col">Tenant</th><th scope="col">Ditinjau</th><th scope="col">Disetujui</th><th scope="col">Kesepakatan</th><th scope="col">Status</th></tr></thead>
          <tbody>
            <tr v-for="q in quality" :key="q.tenantId">
              <th scope="row">{{ q.name }}</th>
              <td>{{ fmtNum(q.reviewed) }}</td>
              <td>{{ fmtNum(q.approved) }}</td>
              <td>{{ fmtPct(q.agreement) }}</td>
              <td>
                <UiStatus v-if="!q.enoughData" tone="neutral">Data belum cukup (n &lt; 10)</UiStatus>
                <UiStatus v-else-if="q.meetsTarget" tone="success">Memenuhi target</UiStatus>
                <UiStatus v-else tone="warning">Di bawah target</UiStatus>
              </td>
            </tr>
            <tr v-if="!quality.length"><td colspan="5" class="el-muted">Belum ada temuan AI yang ditinjau HR.</td></tr>
          </tbody>
        </table>
      </UiCard>

      <UiCard class="pf__section">
        <div class="pf__row pf__between">
          <h2 class="el-h3">Biaya token mingguan</h2>
          <UiButton variant="outlined" size="sm" icon="download" @click="downloadCsv">Unduh CSV</UiButton>
        </div>
        <table class="pf__table">
          <caption class="el-sr-only">Biaya token mingguan</caption>
          <thead><tr><th scope="col">Minggu</th><th scope="col">Tenant</th><th scope="col">Sesi</th><th scope="col">Panggilan</th><th scope="col">Token masuk</th><th scope="col">Token keluar</th><th scope="col">Biaya</th></tr></thead>
          <tbody>
            <tr v-for="c in cost" :key="`${c.week}-${c.tenantId}`">
              <td>{{ c.week }}</td>
              <th scope="row">{{ c.name }}</th>
              <td>{{ fmtNum(c.sessions) }}</td>
              <td>{{ fmtNum(c.calls) }}</td>
              <td>{{ fmtNum(c.tokensIn) }}</td>
              <td>{{ fmtNum(c.tokensOut) }}</td>
              <td>{{ fmtUsd(c.costUsd) }}<span v-if="c.costMissing" class="el-muted"> (sebagian biaya belum tercatat)</span></td>
            </tr>
            <tr v-if="!cost.length"><td colspan="7" class="el-muted">Belum ada pemakaian AI.</td></tr>
          </tbody>
        </table>
      </UiCard>

      <div class="el-grid el-grid-2 pf__section">
        <UiCard>
          <h2 class="el-h3">Log audit platform</h2>
          <table class="pf__table">
            <caption class="el-sr-only">Log audit platform</caption>
            <thead><tr><th scope="col">Waktu</th><th scope="col">Pelaku</th><th scope="col">Tindakan</th><th scope="col">Tenant</th></tr></thead>
            <tbody>
              <tr v-for="r in log" :key="r.id">
                <td>{{ fmtTime(r.at) }}</td>
                <td>{{ r.actorEmail ?? 'Akun dihapus' }}</td>
                <td>{{ RESOURCE[r.resource] ?? r.resource }}: {{ logDetail(r) }}</td>
                <td>{{ r.targetTenantName ?? '–' }}</td>
              </tr>
              <tr v-if="!log.length"><td colspan="4" class="el-muted">Belum ada tindakan platform.</td></tr>
            </tbody>
          </table>
        </UiCard>
        <UiCard>
          <h2 class="el-h3">Percobaan masuk tanpa tenant (7 hari)</h2>
          <table class="pf__table">
            <caption class="el-sr-only">Percobaan masuk tanpa tenant</caption>
            <thead><tr><th scope="col">Tanggal</th><th scope="col">Jenis</th><th scope="col">Jumlah</th></tr></thead>
            <tbody>
              <tr v-for="a in attempts" :key="`${a.day}-${a.outcome}`">
                <td>{{ a.day }}</td>
                <td>{{ ATTEMPT_LABEL[a.outcome] }}</td>
                <td>{{ fmtNum(a.count) }}</td>
              </tr>
              <tr v-if="!attempts.length"><td colspan="3" class="el-muted">Tidak ada percobaan.</td></tr>
            </tbody>
          </table>
          <p class="el-muted pf__small">Hanya hitungan per jam; tidak ada email, IP, atau identitas yang disimpan.</p>
        </UiCard>
      </div>
    </template>
  </AppShell>
</template>

<style scoped>
.pf__lead { margin: 0 0 16px; }
.pf__section { margin-top: 16px; }
.pf__row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pf__between { justify-content: space-between; }
.pf__notice { margin: 0 0 12px; color: var(--el-success); font-weight: 500; }
.pf__dl { display: grid; grid-template-columns: minmax(140px, 40%) 1fr; gap: 8px 16px; margin: 8px 0 0; }
.pf__dl dt { font-weight: 500; }
.pf__dl dd { margin: 0; }
.pf__table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.pf__table th, .pf__table td { text-align: left; padding: 8px; border-bottom: 1px solid var(--el-outline-variant, #ddd); font-weight: normal; }
.pf__table thead th { font-weight: 600; }
.pf__small { font-size: 0.875rem; margin: 8px 0 0; }
</style>
