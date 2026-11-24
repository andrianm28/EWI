'use strict';
// seed-dev: tenant demo menyalakan flag yang sama dengan sesi demo e2e, supaya demo di stack dev tidak kosong.
const fs = require('fs');
const path = require('path');
const { FLAGS } = require('../../src/core/flags');
const { DEMO_FLAGS } = require('../../scripts/demo-flags');

const WEB_SUPPORT = path.join(__dirname, '../../../web/e2e/support');
/** Kunci bernilai true di blok objek setelah `marker` (mis. `export const FLAG_DEMO`). */
function trueKeys(file, marker) {
  const src = fs.readFileSync(path.join(WEB_SUPPORT, file), 'utf8');
  const start = src.indexOf(marker);
  const block = src.slice(start, src.indexOf('}', src.indexOf('{', src.indexOf('=', start)) + 1));
  return [...block.matchAll(/'?([a-z_.]+)'?\s*:\s*true/g)].map((m) => m[1]);
}

describe('seed-dev: flag tenant demo', () => {
  test('semua flag demo dikenal API', () => {
    const known = new Set(Object.values(FLAGS));
    expect(DEMO_FLAGS.filter((f) => !known.has(f))).toEqual([]);
  });

  test('sama dengan sesi demo e2e (SEMUA_MODUL + FLAG_DEMO); lim.reinterview tetap mati', () => {
    const web = new Set([...trueKeys('sesi.ts', 'export const SEMUA_MODUL'), ...trueKeys('demo.ts', 'export const FLAG_DEMO')]);
    expect([...web].length).toBeGreaterThan(10);
    expect(new Set(DEMO_FLAGS)).toEqual(web);
    expect(DEMO_FLAGS).not.toContain(FLAGS.LIM_REINTERVIEW);
  });

  test('seed-dev memakai DEMO_FLAGS dan menolak produksi', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../scripts/seed-dev.js'), 'utf8');
    expect(src).toMatch(/require\('\.\/demo-flags'\)/);
    expect(src).toMatch(/for \(const key of DEMO_FLAGS\)/);
    expect(src).toMatch(/NODE_ENV === 'production'\) throw/);
  });
});
