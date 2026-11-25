'use strict';
// B19 bagian 9: konfigurasi suara divalidasi saat boot.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { loadConfig } = require('../../src/config/env');

const base = { EWI_JWT_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x/y' };
const prod = { ...base, NODE_ENV: 'production', MAIL_PROVIDER: 'ses', MAIL_FROM: 'a@b.c', ENCRYPTION_PROVIDER: 'kms', KMS_KEY_ID: 'k', BEDROCK_MODEL_ID: 'm', AI_PROVIDER: 'bedrock' };

function keyFile(content) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'b19-')), 'sa.json');
  fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  return p;
}
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const saKey = { type: 'service_account', project_id: 'elgos-dev', client_email: 'elgos-voice@elgos-dev.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), private_key_id: 'abc' };

describe('konfigurasi suara (B19)', () => {
  test('bawaan di luar produksi: penyedia fake, model gemini-3.8-live, lokasi Mumbai (hasil smoke 25 Nov), jeda 1200 ms', () => {
    const c = loadConfig({ ...base, NODE_ENV: 'test' });
    expect(c.voice).toMatchObject({ provider: 'fake', model: 'gemini-3.8-live', location: 'asia-south1', silenceMs: 1200 });
  });

  test('harga bawaan gemini-3.8-live per modalitas (halaman harga Vertex, 25 Nov 2026); env bisa menimpa; model lain tanpa harga', () => {
    const c = loadConfig({ ...base, NODE_ENV: 'test' });
    expect(c.voice).toMatchObject({ priceInputPerMTok: 0.75, priceOutputPerMTok: 4.5, priceAudioInputPerMTok: 3, priceAudioOutputPerMTok: 12 });
    const o = loadConfig({ ...base, NODE_ENV: 'test', VOICE_PRICE_AUDIO_OUTPUT_PER_MTOK: '10' });
    expect(o.voice.priceAudioOutputPerMTok).toBe(10);
    const other = loadConfig({ ...base, NODE_ENV: 'test', VOICE_MODEL: 'model-lain' });
    expect(other.voice).toMatchObject({ priceInputPerMTok: null, priceAudioInputPerMTok: null });
    expect(() => loadConfig({ ...base, NODE_ENV: 'test', VOICE_PRICE_AUDIO_INPUT_PER_MTOK: 'abc' })).toThrow(/suara tidak valid/);
  });

  test('bawaan di produksi: suara mati (none)', () => {
    expect(loadConfig(prod).voice.provider).toBe('none');
  });

  test('fake ditolak di produksi', () => {
    expect(() => loadConfig({ ...prod, VOICE_PROVIDER: 'fake' })).toThrow(/VOICE_PROVIDER=fake/);
  });

  test('penyedia tidak dikenal ditolak', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'test', VOICE_PROVIDER: 'openai' })).toThrow(/VOICE_PROVIDER harus/);
  });

  test('gemini-vertex tanpa kunci gagal boot dengan pesan jelas', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'test', VOICE_PROVIDER: 'gemini-vertex' })).toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'test', VOICE_PROVIDER: 'gemini-vertex', GOOGLE_APPLICATION_CREDENTIALS: '/tidak/ada.json' })).toThrow(/tidak bisa dibaca/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'test', VOICE_PROVIDER: 'gemini-vertex', GOOGLE_APPLICATION_CREDENTIALS: keyFile('{}') })).toThrow(/bukan kunci service account/);
  });

  test('gemini-vertex dengan kunci: project dari kunci, bisa ditimpa GOOGLE_CLOUD_PROJECT; kunci tidak ikut di config', () => {
    const file = keyFile(saKey);
    const c = loadConfig({ ...base, NODE_ENV: 'test', VOICE_PROVIDER: 'gemini-vertex', GOOGLE_APPLICATION_CREDENTIALS: file, VOICE_LOCATION: 'global', VOICE_ALLOW_GLOBAL: 'true' });
    expect(c.voice).toMatchObject({ provider: 'gemini-vertex', project: 'elgos-dev', location: 'global', credentialsFile: file });
    expect(JSON.stringify(c.voice)).not.toContain('PRIVATE KEY');
    const c2 = loadConfig({ ...base, NODE_ENV: 'test', VOICE_PROVIDER: 'gemini-vertex', GOOGLE_APPLICATION_CREDENTIALS: file, GOOGLE_CLOUD_PROJECT: 'lain' });
    expect(c2.voice.project).toBe('lain');
  });

  test('lokasi global (data bisa diproses di mana saja) hanya bila VOICE_ALLOW_GLOBAL=true', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'test', VOICE_LOCATION: 'global' })).toThrow(/VOICE_ALLOW_GLOBAL/);
    expect(loadConfig({ ...base, NODE_ENV: 'test', VOICE_LOCATION: 'global', VOICE_ALLOW_GLOBAL: 'true' }).voice.location).toBe('global');
  });

  test('lokasi hanya huruf kecil, angka, tanda hubung', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'test', VOICE_LOCATION: 'evil.com/x' })).toThrow(/VOICE_LOCATION/);
  });
});
