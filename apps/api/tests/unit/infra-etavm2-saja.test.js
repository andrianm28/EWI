'use strict';
// Aturan project: dev, staging, dan prod hanya di VPS etavm2; etavm1 tidak boleh dipakai lagi.
// Test ini menjaga agar tidak ada workflow GitHub Actions yang menjalankan job di runner etavm1
// dan tidak ada skrip yang menyiapkan runner atau deploy di etavm1. Spek: docs/designs/audit-23nov-etavm1.md
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../../..');
const workflowDir = path.join(root, '.github/workflows');

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filesUnder(p) : [p];
  });
}

describe('infra hanya etavm2', () => {
  it('tidak ada workflow yang memakai runner berlabel etavm1', () => {
    const pelanggar = fs.readdirSync(workflowDir)
      .filter((f) => /\.ya?ml$/.test(f))
      .filter((f) => fs.readFileSync(path.join(workflowDir, f), 'utf8')
        .split('\n')
        .some((line) => /runs-on:.*etavm1/.test(line)));
    expect(pelanggar).toEqual([]);
  });

  it('actionlint tidak lagi mengenal label runner etavm1', () => {
    const cfg = path.join(root, '.github/actionlint.yaml');
    const isi = fs.existsSync(cfg) ? fs.readFileSync(cfg, 'utf8') : '';
    expect(isi).not.toMatch(/etavm1/);
  });

  it('tidak ada skrip setup atau deploy untuk etavm1 di deploy/ dan infra/', () => {
    const skrip = [...filesUnder(path.join(root, 'deploy')), ...filesUnder(path.join(root, 'infra'))]
      .filter((p) => /etavm1/i.test(path.basename(p)));
    expect(skrip.map((p) => path.relative(root, p))).toEqual([]);
  });
});
