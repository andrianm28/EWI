'use strict';
// seed-dev: tenant demo menyalakan flag yang sama dengan sesi demo e2e, supaya demo di stack dev tidak kosong.
const fs = require('fs');
const path = require('path');
const { FLAGS } = require('../../src/core/flags');
const { DEMO_FLAGS } = require('../../scripts/demo-flags');

const WEB_SUPPORT = path.join(__dirname, '../../../web/e2e/support');
/** Pasangan kunci: true/false di blok objek setelah `marker` (mis. `export const FLAG_DEMO`). Marker wajib ada. */
function flagBlock(file, marker) {
  const src = fs.readFileSync(path.join(WEB_SUPPORT, file), 'utf8');
  const start = src.indexOf(marker);
  expect([file, marker, start >= 0]).toEqual([file, marker, true]);
  const open = src.indexOf('{', src.indexOf('=', start));
  const block = src.slice(open, src.indexOf('}', open) + 1);
  return Object.fromEntries([...block.matchAll(/'?([a-z_.]+)'?\s*:\s*(true|false)/g)].map((m) => [m[1], m[2] === 'true']));
}

describe('seed-dev: flag tenant demo', () => {
  test('semua flag demo dikenal API', () => {
    const known = new Set(Object.values(FLAGS));
    expect(DEMO_FLAGS.filter((f) => !known.has(f))).toEqual([]);
  });

  test('sama dengan sesi demo e2e: {...SEMUA_MODUL, ...FLAG_DEMO} yang bernilai true; lim.reinterview menyala (B15 12.9)', () => {
    const merged = { ...flagBlock('sesi.ts', 'export const SEMUA_MODUL'), ...flagBlock('demo.ts', 'export const FLAG_DEMO') };
    const expected = Object.keys(merged).filter((k) => merged[k]);
    expect(expected.length).toBeGreaterThan(10);
    expect([...DEMO_FLAGS].sort()).toEqual(expected.sort());
    expect(DEMO_FLAGS).toContain(FLAGS.LIM_REINTERVIEW);
    expect(DEMO_FLAGS).toContain(FLAGS.VOICE_REALTIME); // B19: wawancara suara di demo 25 Nov
  });
  // Penjaga produksi dan pemakaian DEMO_FLAGS diuji sebagai perilaku di tests/integration/seed-dev.test.js
});
