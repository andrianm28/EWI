'use strict';
// Flag tenant "demo" di seed-dev (hanya dev). Sama dengan sesi demo e2e (apps/web/e2e/support/sesi.ts SEMUA_MODUL
// + support/demo.ts FLAG_DEMO), supaya alur demo-alur.spec.ts tampil di stack dev dengan API asli.
// lim.reinterview menyala (sama dengan FLAG_DEMO, spek B15 12.9). platform.console menyala agar Super Admin demo bisa masuk konsol.
const DEMO_FLAGS = Object.freeze([
  // modul
  'module.cca', 'module.dna', 'module.tna', 'module.ina', 'module.li', 'module.ld', 'module.lim',
  // layar utama dan peran
  'dashboard.main', 'ina.dashboard', 'learner.home', 'promotion.recommendation', 'tna.gap_board',
  'admin.tenant', 'platform.console',
  // layar mockup demo 25 Nov
  'tna.interview_assignment', 'tna.interview_summary', 'tna.review_workspace',
  'cca.interview', 'dna.development', 'ina.ai_verification', 'assistant', 'lim.reinterview',
]);

module.exports = { DEMO_FLAGS };
