/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** '1' memasang halaman referensi komponen /ui-kit (e2e dan pengembangan). */
  readonly VITE_UI_KIT?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
