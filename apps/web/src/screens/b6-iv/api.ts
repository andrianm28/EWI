// Klien API wawancara akar masalah (B6). Bentuk data: docs/designs/b6-wawancara-akar-masalah.md bagian 6 dan 15.
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

export type Step = 'expired' | 'consent' | 'chat' | 'summary' | 'done' | 'closed'
export type SummaryState = 'confirmed' | 'disputed' | 'unchecked' | 'pending' | 'not_applicable'
export interface Turn { speaker: 'ai' | 'human'; text: string; at: string }
export interface ListSession {
  id: string; intervieweeId: string; status: string; inviteExpiresAt?: string | null; focusLabel?: string | null; durationMinutes?: number | null
}
export interface SessionView {
  id: string; status: string; step?: Step; summaryState?: SummaryState; focusLabel?: string | null; inviteExpiresAt?: string | null
  transcriptVisible?: boolean; turns?: Turn[]; consentVersionRequired?: string | null
  answerCount?: number; questionLimit?: number; restartCount?: number; restartsLeft?: number
  summaryAt?: string | null; summaryConfirmedAt?: string | null; aiLabel?: string; sessionCode?: string
  /** B8: persetujuan ditarik (sesi berhenti, data tetap sampai HR menghapus). */
  consentWithdrawnAt?: string | null
}
export interface SummaryFinding { title: string; detail: string | null; category: 'training' | 'non_training'; confidence: number | null }
export interface Summary { findings: SummaryFinding[]; createdAt: string; confirmedAt: string | null; state: SummaryState }

const call = <T>(path: string, init: RequestInit = {}) => api<T>(`/tna/sessions${path}`, init, useSessionStore().token)
const post = <T>(path: string, body: unknown = {}) => call<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const iv = {
  list: () => call<{ data: ListSession[] }>(''),
  session: (id: string) => call<{ data: SessionView }>(`/${id}`),
  consent: (id: string, consentVersion: string) => post<{ data: { question: Turn | null } }>(`/${id}/consent`, { consentVersion }),
  answer: (id: string, text: string) => post<{ data: { question: Turn | null; done: boolean } }>(`/${id}/turns`, { text }),
  complete: (id: string) => post<{ data: { status: string } }>(`/${id}/complete`),
  makeSummary: (id: string) => post<{ data: Summary }>(`/${id}/summary`),
  getSummary: (id: string) => call<{ data: Summary }>(`/${id}/summary`),
  confirm: (id: string, body: { accurate?: false; note?: string }) => post<{ data: { status: string; summaryState: SummaryState } }>(`/${id}/summary/confirm`, body),
  restart: (id: string) => post<{ data: { status: string; restartCount: number; restartsLeft: number } }>(`/${id}/restart`),
}

/** Sama dengan stepOf di server (summary.js), untuk respons tanpa `step`. */
export function stepOf(s: SessionView, now = Date.now()): Step {
  if (s.step) return s.step
  if (s.status === 'scheduled') return s.inviteExpiresAt && new Date(s.inviteExpiresAt).getTime() <= now ? 'expired' : 'consent'
  if (s.status === 'in_progress') return s.summaryAt ? 'summary' : 'chat'
  return s.status === 'completed' ? 'done' : 'closed'
}

/** Label status di daftar sesi (B6 bagian 15). */
export function listStatus(s: ListSession, now = Date.now()) {
  if (s.status === 'scheduled') return s.inviteExpiresAt && new Date(s.inviteExpiresAt).getTime() <= now ? 'Berakhir' : 'Belum mulai'
  return ({ in_progress: 'Berjalan', completed: 'Selesai', abandoned: 'Dibatalkan' } as Record<string, string>)[s.status] ?? s.status
}
export const isOpenListSession = (s: ListSession) => listStatus(s) === 'Belum mulai' || s.status === 'in_progress'
