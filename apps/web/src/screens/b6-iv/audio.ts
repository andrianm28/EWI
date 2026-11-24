// B19: audio wawancara suara di browser. Mikrofon -> AudioWorklet -> PCM16 mono 16 kHz (base64, potongan 100 ms);
// audio AI PCM16 24 kHz diputar terjadwal dan bisa dihentikan seketika saat karyawan menyela.
// Spek: docs/designs/b19-wawancara-suara.md bagian 7.2 dan 10.

const IN_RATE = 16000
const OUT_RATE = 24000
const CHUNK = 1600 // 100 ms pada 16 kHz

// Modul worklet dimuat dari Blob supaya tidak perlu berkas statis terpisah. Turun sampel dengan interpolasi linear.
const WORKLET = `
class ElgosPcm16 extends AudioWorkletProcessor {
  constructor() { super(); this.step = sampleRate / ${IN_RATE}; this.t = 0; this.prev = 0; this.out = new Int16Array(${CHUNK}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let t = this.t;
    while (t < ch.length) {
      const i = Math.floor(t); const f = t - i;
      const a = i === 0 ? this.prev : ch[i - 1]; const b = ch[i];
      const v = Math.max(-1, Math.min(1, a + (b - a) * f));
      this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === ${CHUNK}) { this.port.postMessage(this.out.buffer, [this.out.buffer]); this.out = new Int16Array(${CHUNK}); this.n = 0; }
      t += this.step;
    }
    this.t = t - ch.length; this.prev = ch[ch.length - 1];
    return true;
  }
}
registerProcessor('elgos-pcm16', ElgosPcm16);
`

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export function fromBase64(b64: string): ArrayBuffer {
  const s = atob(b64)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i)
  return bytes.buffer
}

/** Constraint mikrofon (V2/V4): peredam gema penting karena suara AI keluar dari speaker yang sama. */
export const MIC_CONSTRAINTS: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }

export interface Mic { readonly ctx: AudioContext; stop(): void }

/** Mulai menangkap mikrofon dari stream yang sudah diizinkan; onChunk menerima PCM16 16 kHz base64. */
export async function startMic(stream: MediaStream, onChunk: (b64: string) => void): Promise<Mic> {
  const ctx = new AudioContext()
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
  try { await ctx.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
  const src = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'elgos-pcm16')
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onChunk(toBase64(e.data))
  // Node tanpa keluaran bisa tidak diproses di sebagian mesin: sambungkan lewat gain 0 ke destination (tidak terdengar)
  const mute = ctx.createGain()
  mute.gain.value = 0
  src.connect(node)
  node.connect(mute).connect(ctx.destination)
  return {
    ctx,
    stop() {
      node.port.onmessage = null
      try { src.disconnect(); node.disconnect(); mute.disconnect() } catch { /* sudah lepas */ }
      void ctx.close()
    },
  }
}

export interface Player { play(b64: string): void; stop(): void; close(): void; readonly speaking: boolean; readonly ctx: AudioContext }

/** Pemutar audio AI: potongan dijadwalkan berurutan; stop() memotong semua yang sedang/akan diputar. */
export function createPlayer(onIdle?: () => void): Player {
  const ctx = new AudioContext({ sampleRate: OUT_RATE })
  let next = 0
  const live = new Set<AudioBufferSourceNode>()
  return {
    ctx,
    get speaking() { return live.size > 0 },
    play(b64) {
      const pcm = new Int16Array(fromBase64(b64))
      if (!pcm.length) return
      const buf = ctx.createBuffer(1, pcm.length, OUT_RATE)
      const ch = buf.getChannelData(0)
      for (let i = 0; i < pcm.length; i += 1) ch[i] = pcm[i]! / 0x8000
      const node = ctx.createBufferSource()
      node.buffer = buf
      node.connect(ctx.destination)
      if (ctx.state === 'suspended') void ctx.resume()
      next = Math.max(next, ctx.currentTime + 0.05)
      node.start(next)
      next += buf.duration
      live.add(node)
      node.onended = () => { live.delete(node); if (!live.size && onIdle) onIdle() }
    },
    stop() {
      for (const n of live) { try { n.stop() } catch { /* sudah berhenti */ } }
      live.clear()
      next = 0
    },
    close() { this.stop(); void ctx.close() },
  }
}

/** URL WebSocket dari path API (`/api/voice/...`), mengikuti VITE_API_BASE_URL bila absolut. */
export function wsUrl(path: string, base = import.meta.env.VITE_API_BASE_URL ?? '/api', loc: Location = window.location): string {
  const origin = /^https?:\/\//.test(base) ? new URL(base).origin : loc.origin
  return origin.replace(/^http/, 'ws') + path
}
