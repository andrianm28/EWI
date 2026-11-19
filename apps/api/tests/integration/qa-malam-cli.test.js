'use strict';
// B18 QA malam: titik masuk `npm run qa:malam` (spek 5.3). Seam: main(argv, env, log) -> kode keluar.
// Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { main } = require('../qa-malam/cli');
const { muatPersona, FOLDER_PERSONA } = require('../qa-malam/persona');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const diam = { tulis: () => {}, galat: () => {} };

run('npm run qa:malam (penyedia stub)', () => {
  const env = { NODE_ENV: 'test', DATABASE_URL: process.env.DATABASE_URL, DB_SCHEMA: process.env.DB_SCHEMA || 'ewi', AI_PROVIDER: 'stub', MAIL_PROVIDER: 'memory' };
  const folderSatuPersona = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-persona-'));
    const [p] = muatPersona(FOLDER_PERSONA);
    fs.writeFileSync(path.join(dir, `${p.id}.json`), JSON.stringify(p));
    return dir;
  };

  it('menjalankan persona, menulis laporan JSON dan Markdown, dan keluar dengan kode run', async () => {
    const keluaran = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-hasil-'));
    const kode = await main(['--persona', folderSatuPersona(), '--keluaran', keluaran], env, diam);
    expect(kode).toBe(0);
    const berkas = fs.readdirSync(keluaran).sort();
    expect(berkas).toEqual([expect.stringMatching(/^qa-malam-\d{4}-\d{2}-\d{2}\.json$/), expect.stringMatching(/^qa-malam-\d{4}-\d{2}-\d{2}\.md$/)]);
    const json = JSON.parse(fs.readFileSync(path.join(keluaran, berkas[0]), 'utf8'));
    expect(json).toMatchObject({ kode: 0, penyedia: 'stub' });
    expect(json.persona).toHaveLength(1);
    expect(fs.readFileSync(path.join(keluaran, berkas[1]), 'utf8')).toMatch(/# QA malam ELGOS/);
  });

  it('--siapkan-db ditolak dengan kode 2 untuk database yang tidak berakhiran _qa, tanpa menyentuh schema', async () => {
    // URL ditulis tetap (host tidak tersambung): test ini tidak boleh bergantung pada DATABASE_URL pengembang,
    // yang bisa saja berakhiran _qa.
    const pesan = [];
    const kode = await main(['--siapkan-db', '--persona', folderSatuPersona()], { ...env, DATABASE_URL: 'postgres://u@127.0.0.1:1/ewi_test' },
      { tulis: () => {}, galat: (m) => pesan.push(m) });
    expect(kode).toBe(2);
    expect(pesan.join('\n')).toMatch(/_qa/);
  });

  it('persona tidak sah membuat kode 2 sebelum run', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-persona-rusak-'));
    fs.writeFileSync(path.join(dir, 'rusak.json'), '{');
    const pesan = [];
    expect(await main(['--persona', dir], env, { tulis: () => {}, galat: (m) => pesan.push(m) })).toBe(2);
    expect(pesan.join('\n')).toMatch(/rusak\.json/);
  });

  it('pengaman menolak database bukan uji dengan kode 2', async () => {
    expect(await main(['--persona', folderSatuPersona()], { ...env, DATABASE_URL: 'postgres://u@db:5432/ewi' }, diam)).toBe(2);
  });

  it('selalu memakai secret JWT acak per run; EWI_JWT_SECRET dari env tidak dipakai (aturan 5)', async () => {
    const keluaran = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-hasil-'));
    expect(await main(['--persona', folderSatuPersona(), '--keluaran', keluaran], { ...env, EWI_JWT_SECRET: 'pendek' }, diam)).toBe(0);
  });

  it('QA_MALAM_MAX_TOKENS yang tidak sah ditolak sebelum database disiapkan', async () => {
    const pesan = [];
    const envQa = { ...env, DATABASE_URL: 'postgres://u@127.0.0.1:1/ewi_qa', QA_MALAM_MAX_TOKENS: '0' };
    expect(await main(['--siapkan-db', '--persona', folderSatuPersona()], envQa, { tulis: () => {}, galat: (m) => pesan.push(m) })).toBe(2);
    expect(pesan.join('\n')).toMatch(/^QA_KONFIGURASI: QA_MALAM_MAX_TOKENS/);
  });

  it('bedrock dengan kunci akses AWS jangka panjang (tanpa session token) ditolak sebelum panggilan apa pun', async () => {
    // Penyedia palsu bernama bedrock: test ini tidak pernah membuat klien AWS sungguhan, walau pengamannya rusak.
    const dipanggil = [];
    const palsu = () => {
      const p = { name: 'bedrock', model: 'model-uji' };
      for (const op of ['verify', 'nextQuestion', 'analyzeTna', 'assessCompetencies']) p[op] = async () => { dipanggil.push(op); throw new Error('tidak boleh dipanggil'); };
      return p;
    };
    const pesan = [];
    const envBedrock = {
      ...env, AI_PROVIDER: 'bedrock', BEDROCK_REGION: 'ap-southeast-3', BEDROCK_MODEL_ID: 'model-uji', AI_PRICE_INPUT_PER_MTOK: '1', AI_PRICE_OUTPUT_PER_MTOK: '2',
      AWS_ACCESS_KEY_ID: 'AKIAUJICONTOH', AWS_SECRET_ACCESS_KEY: 'rahasia-uji',
    };
    expect(await main(['--persona', folderSatuPersona()], envBedrock, { tulis: () => {}, galat: (m) => pesan.push(m) }, { buatPenyedia: palsu })).toBe(2);
    expect(pesan.join('\n')).toMatch(/^QA_PENGAMAN: .*jangka panjang/);
    expect(dipanggil).toEqual([]);
  });
});
