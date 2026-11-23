<script setup lang="ts">
// Layar HR Core Competencies: tab Corporate Vision & Mission, Corporate Values, dan Wawancara AI (flag cca.interview).
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { useSessionStore } from '@/stores/session'
import { UiAgentCard, UiBreadcrumb, UiTabs } from '@/ui'
import AssignmentsHr from './AssignmentsHr.vue'
import ProgramSection from './ProgramSection.vue'
import RequirementsTab from './RequirementsTab.vue'
import './cc.css'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const tabs = computed(() => [
  { key: 'vm', label: 'Corporate Vision & Mission' },
  { key: 'val', label: 'Corporate Values' },
  ...(session.hasFlag('cca.interview') ? [{ key: 'aiv', label: 'Wawancara AI' }] : []),
])
const tab = computed({
  get: () => (tabs.value.some((t) => t.key === route.query.tab) ? String(route.query.tab) : 'vm'),
  set: (key: string) => { void router.replace({ query: key === 'vm' ? {} : { tab: key } }) },
})
// Kartu Agen AI (mockup baris 308 dan 332): tombol hanya bila tab Wawancara AI ada
const aivTo = computed(() => (session.hasFlag('cca.interview') ? { name: 'cc', query: { tab: 'aiv' } } : null))
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Needs Analysis' }, { label: 'Core Competencies' }]" />
    <h1 class="el-h1">Core Competencies</h1>
    <p class="el-muted">Kompetensi inti perusahaan: persyaratan dari visi dan misi, nilai korporasi, dan wawancara AI untuk menilai gap karyawan.</p>
    <UiTabs id="cc" v-model="tab" :tabs="tabs" label="Bagian Core Competencies" />

    <div v-if="tab === 'vm'" id="cc-panel-vm" role="tabpanel" aria-labelledby="cc-tab-vm">
      <RequirementsTab group="vm">
        <UiAgentCard title="Wawancara pimpinan dan karyawan" action="Buka wawancara AI" :to="aivTo" data-testid="cc-agen-vm">
          AI mewawancarai pimpinan tentang visi dan misi, lalu mewawancarai karyawan untuk menilai gap terhadap jawaban pimpinan. Alurnya seperti DACUM, untuk pimpinan perusahaan. HR menugaskan ke atasan, atasan ke karyawan.
        </UiAgentCard>
      </RequirementsTab>
    </div>
    <div v-else-if="tab === 'val'" id="cc-panel-val" role="tabpanel" aria-labelledby="cc-tab-val">
      <UiAgentCard title="Wawancara nilai" action="Buka wawancara AI" :to="aivTo" data-testid="cc-agen-val">
        AI mewawancarai pimpinan tentang makna dan perilaku kunci tiap nilai 5C, lalu mewawancarai karyawan, terutama yang belum menyelesaikan program, untuk menilai gap terhadap jawaban pimpinan.
      </UiAgentCard>
      <ProgramSection :interview-to="aivTo" />
      <h2 class="el-h2 cc-gap-title">Gap perilaku per nilai</h2>
      <RequirementsTab group="values" />
    </div>
    <div v-else id="cc-panel-aiv" role="tabpanel" aria-labelledby="cc-tab-aiv">
      <AssignmentsHr />
    </div>
  </AppShell>
</template>
