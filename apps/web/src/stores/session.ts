import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api/client'
import type { SubmoduleKey } from '@/modules'

export interface SessionUser {
  id: string
  tenantId: string
  email: string
  name?: string
  role: string
}

interface Access {
  submodules: SubmoduleKey[]
  flags: Record<string, boolean>
}

const STORAGE_KEY = 'ewi.token'

function readToken(): string | null {
  try { return sessionStorage.getItem(STORAGE_KEY) } catch { return null }
}

export const useSessionStore = defineStore('session', () => {
  const token = ref<string | null>(readToken())
  const user = ref<SessionUser | null>(null)
  const access = ref<Access | null>(null)

  const isAuthenticated = computed(() => !!token.value)

  function canOpen(key: SubmoduleKey) {
    return !!access.value?.submodules.includes(key) && access.value.flags[`module.${key}`] === true
  }

  async function login(tenant: string, email: string, password: string) {
    const res = await api<{ token: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ tenant, email, password }),
    })
    token.value = res.token
    user.value = res.user
    try { sessionStorage.setItem(STORAGE_KEY, res.token) } catch { /* abaikan */ }
    await loadAccess()
  }

  async function loadAccess() {
    access.value = await api<Access>('/me/access', {}, token.value)
  }

  function logout() {
    token.value = null
    user.value = null
    access.value = null
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* abaikan */ }
  }

  return { token, user, access, isAuthenticated, canOpen, login, loadAccess, logout }
})
