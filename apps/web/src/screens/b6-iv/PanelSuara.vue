<script setup lang="ts">
// B19: panel suara di langkah Wawancara (menggantikan kotak teks saat mode Suara). Tiket -> WebSocket -> auth, lalu
// mikrofon (PCM16 16 kHz) ke gateway dan audio AI (24 kHz) dari gateway. Spek: docs/designs/b19-wawancara-suara.md 7.2, 10.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { UiButton } from '@/ui'
import { ApiError } from '@/api/client'
import { iv, type Turn } from './api'
import { MIC_CONSTRAINTS, createPlayer, startMic, wsUrl, type Mic, type Player } from './audio'
import './iv.css'

const props = defineProps<{ sessionId: string; stream?: MediaStream | null }>()
const emit = defineEmits<{
  turn: [turn: Turn]
  caption: [caption: { speaker: 'ai' | 'human'; text: string } | null]
  ended: [reason: string, message?: string]
  type: []
}>()

type Phase = 'connecting' | 'listening' | 'speaking' | 'ended'
const phase = ref<Phase>('connecting')
const muted = ref(false)
const STATUS: Record<Phase, string> = { connecting: 'Menyambungkan…', listening: 'Mendengarkan', speaking: 'AI sedang bicara', ended: 'Sambungan suara selesai' }

let ws: WebSocket | null = null
let mic: Mic | null = null
let player: Player | null = null
let micStream: MediaStream | null = null
let ownStream = false
let finished = false
let draining: Player | null = null
const suspended = ref(false)

/** Konteks audio yang dibuat di luar klik (mis. sesudah muat ulang) bisa tertahan; lanjutkan pada interaksi berikutnya. */
function unlockAudio() {
  for (const c of [mic?.ctx, player?.ctx]) if (c && c.state === 'suspended') void c.resume()
  suspended.value = false
}
function checkSuspended() {
  suspended.value = [mic?.ctx, player?.ctx].some((c) => c && c.state === 'suspended')
  if (suspended.value) { addEventListener('pointerdown', unlockAudio, true); addEventListener('keydown', unlockAudio, true) }
}

function finish(reason: string, message?: string) {
  if (finished) return
  finished = true
  phase.value = 'ended'
  emit('caption', null)
  emit('ended', reason, message)
  // Selesai normal: penutup AI datang lebih cepat dari waktu nyata, biarkan diputar habis sebelum pemutar ditutup
  cleanup({ drain: reason === 'done' })
}

function cleanup({ drain = false } = {}) {
  removeEventListener('pointerdown', unlockAudio, true)
  removeEventListener('keydown', unlockAudio, true)
  mic?.stop(); mic = null
  const p = player; player = null
  if (p && drain && p.speaking) draining = p
  else p?.close()
  if (ws && ws.readyState <= WebSocket.OPEN) { try { ws.close(1000) } catch { /* sudah tertutup */ } }
  ws = null
  // Stream dari langkah Persetujuan dimiliki induk; stream yang dibuka panel sendiri dilepas di sini
  if (ownStream) micStream?.getTracks().forEach((t) => t.stop())
}

const send = (m: unknown) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)) }

function onMessage(e: MessageEvent<string>) {
  let m: { type: string; [k: string]: unknown }
  try { m = JSON.parse(e.data) } catch { return }
  switch (m.type) {
    case 'ready':
      phase.value = 'listening'
      break
    case 'audio':
      phase.value = 'speaking'
      player?.play(m.data as string)
      break
    case 'caption':
      emit('caption', { speaker: m.speaker as 'ai' | 'human', text: m.text as string })
      break
    case 'turn':
      emit('caption', null)
      emit('turn', m.turn as Turn)
      break
    case 'interrupted':
      player?.stop()
      phase.value = 'listening'
      break
    case 'error':
      // Gangguan sambungan boleh dicoba lagi; galat keadaan (batas waktu, flag, tab lain) tidak
      finish(m.code === 'VOICE_UNAVAILABLE' || m.code === 'VOICE_TICKET' ? 'provider' : 'blocked', m.message as string)
      break
    case 'ended':
      finish(m.reason as string)
      break
  }
}

async function connect() {
  try {
    micStream = props.stream && props.stream.active ? props.stream : null
    if (!micStream) { micStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS); ownStream = true }
    player = createPlayer(() => {
      if (draining) { draining.close(); draining = null }
      if (phase.value === 'speaking') phase.value = 'listening'
    })
    const t = (await iv.voiceTicket(props.sessionId)).data
    if (finished) return
    ws = new WebSocket(wsUrl(t.path))
    ws.onopen = () => send({ type: 'auth', ticket: t.ticket })
    ws.onmessage = onMessage
    ws.onclose = () => finish('provider', 'Sambungan suara terputus.')
    mic = await startMic(micStream, (b64) => { if (!muted.value) send({ type: 'audio', data: b64 }) })
    if (finished) { mic.stop(); mic = null; return }
    for (const c of [mic.ctx, player.ctx]) if (c.state === 'suspended') await c.resume().catch(() => {})
    checkSuspended()
  } catch (e) {
    const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
    // Tiket ditolak karena keadaan sesi (batas waktu, flag mati, ringkasan sudah dibuat): kembali ke suara tidak berguna
    if (e instanceof ApiError && (e.status === 403 || e.status === 409)) return finish('blocked', e.message)
    finish('provider', denied ? 'Izin mikrofon ditolak. Lanjutkan dengan mengetik.' : e instanceof ApiError ? e.message : 'Sambungan suara gagal dibuka.')
  }
}

function toggleMute() {
  muted.value = !muted.value
  send({ type: 'mute', on: muted.value })
}
const endTurn = () => send({ type: 'end_turn' })
function typeInstead() {
  send({ type: 'stop' })
  finished = true
  cleanup()
  emit('caption', null)
  emit('type')
}

onMounted(connect)
onBeforeUnmount(() => { finished = true; cleanup(); draining?.close(); draining = null })
</script>

<template>
  <section class="iv-voice" aria-label="Jawab dengan suara" data-testid="panel-suara">
    <p class="iv-voice__status" role="status">
      <span :class="['iv-voice__dot', `iv-voice__dot--${phase}`]" aria-hidden="true" />{{ muted && phase === 'listening' ? 'Mikrofon dibisukan' : STATUS[phase] }}
    </p>
    <div class="iv-actions">
      <UiButton variant="outlined" :aria-pressed="muted ? 'true' : 'false'" :disabled="phase === 'connecting' || phase === 'ended'" @click="toggleMute">Bisukan mikrofon</UiButton>
      <UiButton variant="tonal" :disabled="phase === 'connecting' || phase === 'ended' || muted" @click="endTurn">Selesai menjawab</UiButton>
      <UiButton variant="text" @click="typeInstead">Ketik saja</UiButton>
    </div>
    <p v-if="suspended" class="iv-small">Ketuk di mana saja di halaman ini untuk mengaktifkan suara.</p>
    <p class="el-muted iv-small">Pakai headset bila ada, supaya suara AI tidak tertangkap mikrofon.</p>
  </section>
</template>
