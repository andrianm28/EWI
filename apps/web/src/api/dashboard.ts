// GET /api/dashboard (B3). Bentuk respons: docs/designs/b3-dashboard.md bagian 3.2.
import { api } from './client'

export interface Agreement { percent: number | null; approved: number; reviewed: number; targetPercent: number }
export interface AnalysisDays { median: number; sessions: number; targetDays: number }
export interface DashboardModule { no: number; key: 'lna' | 'li' | 'ld' | 'lim' | 'cp'; active: boolean; parts?: { key: string; active: boolean }[] }
export interface ParetoRow { key: string; label: string; people: number; score: number; share: number; cumulativeShare: number; hot: boolean }
export type ActionKey = 'review_pending' | 'interviews_open' | 'plan_needs_module' | 'non_training_findings' | 'competencies_unapproved'

export interface DashboardSummary {
  scope: 'all' | 'team'
  people: number
  kpis: {
    employeesAnalyzed: number | null
    competencyGaps: number | null
    okrGaps: number | null
    aiHrAgreement: Agreement | null
    analysisDays: AnalysisDays | null
  }
  modules: DashboardModule[]
  pareto: { rows: ParetoRow[]; total: number; hotCount: number } | null
  actions: { key: ActionKey; count: number }[]
}

export async function fetchDashboard(token: string | null): Promise<DashboardSummary> {
  return (await api<{ data: DashboardSummary }>('/dashboard', {}, token)).data
}
