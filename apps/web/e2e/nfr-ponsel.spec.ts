import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, SEMUA_MODUL } from './support/sesi'
import { mockApi, responsData } from './support/api'

// UAT NFR-01 (25 Nov): layar utama tiap peran di lebar ponsel 390 px tanpa gulir horizontal.
// Temuan E-10: pengalih tiga tampilan Admin Tenant dan tabel Tenant Super Admin melebar (409 px dan 402 px).
const muat = (page: Page) => page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')

test.use({ viewport: { width: 390, height: 844 } })

test('NFR-01: Admin Tenant dengan tiga tampilan, Pengguna & peran tidak melebar di 390 px', async ({ page }) => {
  await mockApi(page, (req) => {
    if (req.path === '/tenant-admin/users') return responsData([{ id: 'u-1', name: 'Admin Satu', email: 'admin@contoh.test', employeeId: null, role: 'tenant_admin', roleLabel: 'Admin Tenant', jobRoleId: null, jobRoleName: null, careerLevelId: null, supervisorId: null, status: 'active', lastLoginAt: '2026-11-19T01:00:00Z', pendingLogin: false }])
    if (req.path.startsWith('/tenant-admin/')) return responsData([])
    return undefined
  })
  await loginSebagai(page, 'admin', { ...SEMUA_MODUL, peranLain: ['hr', 'karyawan'] })
  await page.goto('/admin/pengguna')
  const pengalih = page.getByRole('group', { name: 'Tampilan' })
  await expect(pengalih.getByRole('button')).toHaveCount(3)
  await expect(pengalih.getByRole('button', { name: 'Karyawan (saya)' })).toBeInViewport({ ratio: 1 })
  expect(await muat(page)).toBe(true)
})

test('NFR-01: Super Admin, layar Tenant tidak melebar di 390 px; tabel bergulir di dalam wadahnya', async ({ page }) => {
  await mockApi(page, (req) => {
    if (req.path === '/platform/tenants') {
      return responsData({ kpis: { tenants: 1, activeTenants: 1, users: 9, modulesAvailable: 8 }, tenants: [{ id: 't-1', slug: 'demo', name: 'Demo Organisasi', status: 'active', adminEmail: 'admin@demo.test', users: 9, activeModules: 8, createdAt: '2026-11-10T02:00:00Z' }] })
    }
    if (req.path === '/platform/tenants/t-1/modules') {
      return responsData([
        { key: 'wawancara-suara', name: 'Wawancara AI suara langsung', available: true, earlyAccess: true, entitled: false, flagOn: true, killSwitch: false, effective: false },
        { key: 'tna', name: 'Training Needs Analysis', available: true, earlyAccess: false, entitled: null, flagOn: true, killSwitch: false, effective: true },
      ])
    }
    if (req.path.startsWith('/platform/')) return responsData([])
    return undefined
  })
  await loginSebagai(page, 'super', SEMUA_MODUL)
  await page.goto('/tenants')
  await expect(page.getByRole('heading', { level: 1, name: 'Tenant' })).toBeVisible()
  await expect(page.getByText('admin@demo.test')).toBeAttached()
  await expect(page.getByText('Menyala, menunggu langganan')).toBeAttached()
  expect(await muat(page)).toBe(true)
})
