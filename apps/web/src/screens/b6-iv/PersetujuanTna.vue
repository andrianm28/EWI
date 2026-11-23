<script setup lang="ts">
// Persetujuan wawancara TNA (PM-9, teks legal v1.0) dengan perilaku mockup: tombol selalu aktif, tanpa centang muncul ringkasan galat.
import { ref } from 'vue'
import { UiButton, UiErrorSummary } from '@/ui'
import './iv.css'

defineProps<{ version: string; busy?: boolean }>()
const emit = defineEmits<{ agree: []; later: [] }>()
const agreed = ref(false)
const errors = ref<{ message: string; fieldId?: string }[]>([])

function next() {
  if (!agreed.value) {
    errors.value = [{ message: 'Centang persetujuan untuk melanjutkan', fieldId: 'iv-consent' }]
    // UiErrorSummary mengambil fokus dan dibacakan; tautannya membawa ke kotak centang
    return
  }
  errors.value = []
  emit('agree')
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
      <div class="iv-actions">
        <UiButton :disabled="busy" @click="next">Lanjut ke wawancara</UiButton>
        <UiButton variant="outlined" @click="emit('later')">Tidak sekarang</UiButton>
      </div>
      <p class="el-muted iv-small">{{ version }}</p>
  </section>
</template>

