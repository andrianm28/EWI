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
  it('tidak ada workflow yang menyebut etavm1 di luar komentar (runs-on satu baris, daftar, atau labels)', () => {
    const pelanggar = fs.readdirSync(workflowDir)
      .filter((f) => /\.ya?ml$/.test(f))
      .filter((f) => fs.readFileSync(path.join(workflowDir, f), 'utf8')
        .split('\n')
        .some((line) => /etavm1/i.test(line.replace(/#.*$/, ''))));
    expect(pelanggar).toEqual([]);
  });

  it('actionlint tidak lagi mengenal label runner etavm1', () => {
    const cfg = path.join(root, '.github/actionlint.yaml');
    const isi = fs.existsSync(cfg) ? fs.readFileSync(cfg, 'utf8') : '';
    expect(isi).not.toMatch(/etavm1/);
  });

  it('tidak ada skrip setup atau deploy untuk etavm1 di deploy/ dan infra/', () => {
    const semua = [...filesUnder(path.join(root, 'deploy')), ...filesUnder(path.join(root, 'infra'))];
    const namaEtavm1 = semua.filter((p) => /etavm1/i.test(path.basename(p)));
    // skrip shell di deploy/ adalah target deploy; tidak boleh ada yang masih menyasar etavm1
    const skripDeploy = semua.filter((p) => p.includes(`${path.sep}deploy${path.sep}`) && /\.sh$/.test(p))
      .filter((p) => /etavm1/i.test(fs.readFileSync(p, 'utf8')));
    expect([...namaEtavm1, ...skripDeploy].map((p) => path.relative(root, p))).toEqual([]);
  });
});
