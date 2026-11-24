<script setup lang="ts">
// Persetujuan wawancara TNA (PM-9, teks legal v1.0) dengan perilaku mockup: tombol selalu aktif, tanpa centang muncul ringkasan galat.
// B19: bila suara tersedia, fieldset "Cara menjawab" (Ketik bawaan / Suara) dengan persetujuan suara terpisah (v0.1, draf).
import { ref } from 'vue'
import { UiButton, UiErrorSummary } from '@/ui'
import type { AgreePayload, Mode } from './api'
import { MIC_CONSTRAINTS } from './audio'
import './iv.css'

const props = defineProps<{ version: string; busy?: boolean; voiceAvailable?: boolean; voiceVersion?: string | null }>()
const emit = defineEmits<{ agree: [payload: AgreePayload]; later: [] }>()
const agreed = ref(false)
const mode = ref<Mode>('text')
const voiceAgreed = ref(false)
const checking = ref(false)
const errors = ref<{ message: string; fieldId?: string }[]>([])

async function next() {
  const list: { message: string; fieldId?: string }[] = []
  if (!agreed.value) list.push({ message: 'Centang persetujuan untuk melanjutkan', fieldId: 'iv-consent' })
  if (mode.value === 'voice' && !voiceAgreed.value) list.push({ message: 'Centang persetujuan suara, atau pilih Ketik', fieldId: 'iv-voice-consent' })
  errors.value = list
  // UiErrorSummary mengambil fokus dan dibacakan; tautannya membawa ke kotak centang
  if (list.length) return
  if (mode.value !== 'voice' || !props.voiceVersion) return emit('agree', { mode: 'text' })
  // Izin mikrofon diminta di sini; stream diteruskan ke panel suara supaya izin tidak diminta dua kali
  checking.value = true
  try {
    const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
    emit('agree', { mode: 'voice', voiceConsentVersion: props.voiceVersion, stream })
  } catch {
    mode.value = 'text'
    errors.value = [{ message: 'Mikrofon tidak bisa dipakai (izin ditolak atau tidak ada mikrofon). Pilihan kembali ke Ketik; Anda bisa melanjutkan dengan mengetik.', fieldId: 'iv-mode-text' }]
  } finally { checking.value = false }
}
</script>

<template>
  <section class="iv-consent" data-testid="consent">
    <UiErrorSummary :errors="errors" />
      <h2 class="iv-h2">Persetujuan sebelum mulai</h2>
      <p>
        Wawancara ini membantu perusahaan memahami mengapa sebagian target kerja Anda belum tercapai dan dukungan apa yang Anda butuhkan,
        misalnya pelatihan, alat kerja, atau perbaikan proses. Wawancara ini <strong>bukan penilaian kinerja</strong> dan tidak dipakai
        untuk sanksi atau keputusan promosi.
      </p>
      <h3 class="iv-h3">Yang akan terjadi</h3>
      <ul class="iv-bullets">
        <li>Anda bercakap lewat teks dengan asisten AI. Anda bisa berhenti dan melanjutkan nanti.</li>
        <li>Asisten AI akan menyebut KPI Anda yang belum tercapai beserta target dan realisasinya. Bila angkanya salah, sampaikan saat wawancara.</li>
        <li>Setelah selesai, AI menyusun ringkasan, temuan, dan rekomendasi. <strong>Tim HR meninjau hasil itu</strong> sebelum dipakai.</li>
      </ul>
      <h3 class="iv-h3">Siapa melihat apa</h3>
      <ul class="iv-bullets">
        <li><strong>Anda:</strong> seluruh percakapan, ringkasan, dan rekomendasi untuk Anda.</li>
        <li><strong>Atasan langsung dan HR:</strong> ringkasan dan temuan, bukan percakapan lengkap Anda.</li>
        <li><strong>Tim teknis ETA:</strong> hanya untuk memperbaiki masalah teknis, dan setiap akses tercatat.</li>
      </ul>
      <p>
        Percakapan Anda diproses oleh model AI Claude melalui Amazon Web Services di Singapura, disimpan terenkripsi,
        dan tidak dipakai untuk melatih model AI.
      </p>
      <h3 class="iv-h3">Hak Anda</h3>
      <ul class="iv-bullets">
        <li>Ikut wawancara ini sukarela. Menolak atau berhenti <strong>tidak berdampak</strong> pada penilaian atau status kerja Anda.</li>
        <li>Anda bisa menarik persetujuan, meminta salinan, atau meminta data Anda dikoreksi atau dihapus dengan menghubungi HR.</li>
        <li>Mohon tidak menuliskan informasi kesehatan, keyakinan, atau data pribadi orang lain.</li>
      </ul>
      <label class="el-check">
        <input id="iv-consent" v-model="agreed" type="checkbox" data-testid="consent-check">
        <span>Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara.</span>
      </label>
      <fieldset v-if="voiceAvailable && voiceVersion" class="iv-mode" data-testid="mode-jawab">
        <legend>Cara menjawab</legend>
        <div class="iv-mode__options">
          <label class="el-check"><input id="iv-mode-text" v-model="mode" type="radio" name="iv-mode" value="text"><span>Ketik</span></label>
          <label class="el-check"><input id="iv-mode-voice" v-model="mode" type="radio" name="iv-mode" value="voice"><span>Suara</span></label>
        </div>
        <template v-if="mode === 'voice'">
          <p>
            Dengan suara, AI bertanya dengan suara dan Anda menjawab lewat mikrofon. Suara Anda diproses oleh Google Gemini Live di
            Google Cloud, dan lokasi pemrosesannya tidak dijamin di Indonesia. <strong>ELGOS tidak menyimpan rekaman suara</strong>,
            hanya teks percakapannya. Anda bisa pindah ke mengetik kapan saja.
          </p>
          <label class="el-check">
            <input id="iv-voice-consent" v-model="voiceAgreed" type="checkbox" data-testid="voice-consent-check">
            <span>Saya setuju suara saya diproses seperti dijelaskan di atas.</span>
          </label>
          <p class="el-muted iv-small">{{ voiceVersion }}</p>
        </template>
      </fieldset>
      <div class="iv-actions">
        <UiButton :disabled="busy || checking" @click="next">Lanjut ke wawancara</UiButton>
        <UiButton variant="outlined" @click="emit('later')">Tidak sekarang</UiButton>
      </div>
      <p class="el-muted iv-small">{{ version }}</p>
  </section>
</template>

