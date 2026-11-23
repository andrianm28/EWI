'use strict';
// B18 test alur (spek 3.3 baris "Modul mati" dan "Entitlement vs flag"): konfigurasi live di mana sebagian modul
// ditahan Go/No-Go. Modul yang mati atau tidak dilanggan ditolak di gerbang requireSubmodule; modul lain tetap jalan.
// Baris B9 (tindakan perbaikan dari tinjauan HR saat module.ina mati) ditambah saat B9 digabung.
const crypto = require('crypto');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { makeConfig } = require('../helpers');
const { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah } = require('../alur/driver');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Alur modul mati dan entitlement', () => {
  let db; let a; const tenantIds = [];
  const hr = {};
  const akhiran = crypto.randomBytes(3).toString('hex');

  const tenantDengan = async (kunci, opsi) => {
    const t = await siapkanTenant(db, { slug: `alur-mati-${kunci}-${akhiran}`, ...opsi });
    tenantIds.push(t.id);
    hr[kunci] = await tambahPengguna(db, t.id, { nama: 'HR Contoh', email: `hr@${kunci}-${akhiran}.test`, employeeId: 'E-HR', peran: 'hr_admin' });
  };

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const config = makeConfig();
    let st;
    a = langkah(createApp({ config, stores: (st = createStores(db)), ai: createStubProvider() }), pembuatMasuk(config, st.authSessions));
    // Live tanpa TNA dan modul 2–5: hanya DNA yang menyala.
    await tenantDengan('tanpa-tna', { flags: ['module.dna'] });
    // Semua flag menyala, tetapi tenant hanya melanggan DNA dan TNA satuan (bukan full_suite).
    await tenantDengan('satuan', { flags: ['module.dna', 'module.tna', 'module.ina', 'module.cca', 'module.li', 'module.ld'], produk: ['dna', 'tna'] });
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  it.each([
    ['tna', '/api/tna/review'],
    ['ina', '/api/ina/'],
    ['li', '/api/li/library'],
    ['ld', '/api/ld/dashboard'],
  ])('flag module.%s mati: %s ditolak FEATURE_DISABLED', async (_, path) => {
    const r = await a.mentah('get', path, hr['tanpa-tna']);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('modul yang menyala tetap jalan saat modul lain mati', async () => {
    expect((await a.mentah('get', '/api/dna/job-roles', hr['tanpa-tna'])).status).toBe(200);
  });

  it.each([
    ['ina', '/api/ina/'],
    ['cca', '/api/cca/'],
    ['li', '/api/li/library'],
    ['ld', '/api/ld/dashboard'],
  ])('flag menyala tanpa entitlement %s: %s ditolak NOT_ENTITLED', async (_, path) => {
    const r = await a.mentah('get', path, hr.satuan);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('NOT_ENTITLED');
  });

  it('modul yang dilanggan satuan tetap terbuka', async () => {
    expect((await a.mentah('get', '/api/dna/job-roles', hr.satuan)).status).toBe(200);
    expect((await a.mentah('get', '/api/tna/review', hr.satuan)).status).toBe(200);
  });
});
