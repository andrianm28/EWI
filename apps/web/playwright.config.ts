import { defineConfig, devices } from '@playwright/test'

// E2E di setiap PR (keputusan P2). API di-mock lewat page.route, jadi tidak butuh backend/LLM.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Snapshot visual: toleransi kecil untuk beda anti-alias antar mesin; animasi dimatikan Playwright secara default
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  snapshotPathTemplate: '{testDir}/__snapshots__/{arg}{ext}',
  use: { baseURL: 'http://localhost:4174', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // VITE_UI_KIT=1 memasang halaman referensi komponen dan rute uji (tidak ada di build produksi).
    // Hasilnya ke dist-e2e supaya dist (yang bisa dipakai deploy) tidak pernah berisi rute uji.
    command: 'VITE_UI_KIT=1 npm run build-only -- --outDir dist-e2e && npm run preview -- --outDir dist-e2e',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
