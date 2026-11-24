// B17 Asisten ELGOS: pemanggil dan tipe. Panel: screens/b17-asisten/ShellExtra.vue. Spek: docs/designs/b17-asisten-elgos.md
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

export type AssistantView = 'karyawan' | 'atasan' | 'hr' | 'super'
export type AssistantOutcome = 'answered' | 'refused' | 'no_answer'
export interface AssistantIntro {
  view: AssistantView
  roleLabel: string
  greeting: string
  suggestions: string[]
  disclaimer: string
  views: { key: AssistantView; label: string }[]
}
export interface AssistantAnswer {
  answer: string
  /** Halaman tujuan tombol (nama rute B0: my, li, iv, tna, review, ina) */
  action: { page: string; label: string } | null
  outcome: AssistantOutcome
}

function call<T>(path: string, init: RequestInit = {}) {
  return api<T>(path, init, useSessionStore().token)
}

export const assistant = {
  intro: (view?: AssistantView) => call<{ data: AssistantIntro }>(`/assistant${view ? `?view=${view}` : ''}`),
  /** 429 RATE_LIMITED bila lebih dari 20 pertanyaan dalam 10 menit. */
  ask: (question: string, view?: AssistantView, signal?: AbortSignal) =>
    call<{ data: AssistantAnswer }>('/assistant/ask', { method: 'POST', body: JSON.stringify({ question, view }), signal }),
}
