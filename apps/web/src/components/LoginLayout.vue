<script setup lang="ts">
// Tata letak dua panel layar masuk (mockup Pak Eji, Main.dc.html bagian LOGIN). Dipakai /login dan /masuk.
// Spek: docs/designs/b1-login.md, docs/designs/paritas-mockup/p4-login.md (L1, L4–L7).
// Isi panel kanan lewat slot; panel kepercayaan kiri dan baris meta audit sama untuk semua langkah.
import { UiAuditLine, UiIcon } from '@/ui'
</script>

<template>
  <div class="lg">
    <aside class="lg-l" aria-label="Tentang ELGOS">
      <div>
        <div class="lg-brand"><div class="lg-logo" aria-hidden="true">EG</div><div><div class="lg-name">ELGOS</div><div class="lg-tag">Elite Learning &amp; Growth Operating System</div></div></div>
        <p class="lg-small">Workforce intelligence berbasis AI: dari gap kompetensi sampai dampak bisnis.</p>
      </div>
      <div>
        <p class="lg-hero">Kebutuhan belajar yang terukur, keputusan talenta yang berbukti.</p>
        <p class="lg-lead">Platform analisis dan pengembangan kompetensi untuk organisasi yang mengutamakan kepercayaan dan kepatuhan.</p>
      </div>
      <ul class="lg-trust">
        <li><UiIcon name="verified_user" /><span>Akses berbasis peran dan log audit di setiap sesi</span></li>
        <li><UiIcon name="lock" /><span>Data tiap perusahaan terisolasi; persetujuan karyawan tercatat</span></li>
        <!-- K3: klaim kepatuhan hanya UU PDP; tidak ada klaim OJK -->
        <li><UiIcon name="policy" /><span>Dirancang mengikuti UU PDP No. 27/2022</span></li>
      </ul>
    </aside>

    <main id="isi-login" class="lg-r">
      <div class="lg-c">
        <slot />
        <UiAuditLine class="lg-meta">Sesi dienkripsi · percobaan masuk dicatat di log audit tenant</UiAuditLine>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Ukuran mengikuti mockup: dua panel membungkus (flex-wrap), sehingga di layar sempit panel kiri turun ke atas (L6, L7) */
.lg { min-height: 100vh; display: flex; flex-wrap: wrap; background: var(--el-surface); color: var(--el-on-surface); }
.lg-l { flex: 1 1 420px; min-width: 0; background: var(--el-primary); color: var(--el-on-primary); padding: 48px; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; }
.lg-brand { display: flex; align-items: center; gap: 12px; }
.lg-logo {
  width: 40px; height: 40px; border-radius: 12px; flex: none; display: flex; align-items: center; justify-content: center;
  background: var(--el-on-primary); color: var(--el-primary); font-weight: 700; font-size: 15px; letter-spacing: 0.5px;
}
.lg-name { font-weight: 500; font-size: 18px; }
.lg-tag { font-size: 12px; opacity: .8; }
.lg-small { font-size: 12px; opacity: .7; margin: 12px 0 0; max-width: 440px; }
.lg-hero { font-size: 32px; line-height: 40px; font-weight: 400; max-width: 440px; margin: 0; }
.lg-lead { opacity: .85; max-width: 440px; margin: 16px 0 0; }
.lg-trust { display: flex; flex-direction: column; gap: 12px; font-size: 13px; list-style: none; padding: 0; margin: 0; }
.lg-trust li { display: flex; gap: 10px; align-items: center; }
.lg-r { flex: 1 1 460px; min-width: 0; display: flex; align-items: center; justify-content: center; padding: 32px; }
.lg-c { width: 100%; max-width: 420px; }
.lg-meta { margin-top: 28px; }
/* Judul, sub, dan baris tombol dipakai bersama oleh setiap langkah (L3, L6) */
.lg-c :slotted(.lg-h1) { font-size: 24px; line-height: 32px; font-weight: 400; margin: 0 0 4px; }
.lg-c :slotted(.lg-h1:focus) { outline: none; }
.lg-c :slotted(.lg-sub) { color: var(--el-on-surface-variant); margin: 0 0 8px; }
.lg-c :slotted(.lg-row) { margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
</style>
