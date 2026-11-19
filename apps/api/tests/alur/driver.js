'use strict';
// B18: driver test alur lintas paket (spek 3.2). Satu-satunya tempat yang tahu cara menyiapkan tenant, masuk
// sebagai peran, dan memanggil langkah tiap modul lewat API. Bila kontrak API berubah, PR yang mengubahnya
// memperbaiki driver ini di PR yang sama, karena test alur dan QA malam ikut gerbang `npm test`.
// Penyiapan tenant, pengguna, entitlement, dan flag memakai SQL; selebihnya lewat API (supertest).
const request = require('supertest');
const { sign } = require('../../src/integrations/elitementor/webhook');
const { createTokenService } = require('../../src/core/auth/tokens');
const { currentConsentVersion } = require('../../src/core/consent');
const { FLAGS } = require('../../src/core/flags');
const { TENANT_LAIN, PERIODE } = require('./data');

/**
 * Membuat tenant uji dengan entitlement (bawaan full_suite) dan flag yang diminta.
 * `organisasiEm`: id organisasi EliteMentor, dipakai webhook untuk menemukan tenant (bawaan tidak ada).
 */
async function siapkanTenant(db, { slug, nama = 'PT Contoh', flags = [FLAGS.MODULE_DNA, FLAGS.MODULE_TNA], produk = ['full_suite'], organisasiEm = null }) {
  const [[tenant]] = await db.query(
    'INSERT INTO tenants (slug, name, elitementor_organization_id) VALUES (:slug, :nama, :organisasiEm) RETURNING id',
    { replacements: { slug, nama, organisasiEm } },
  );
  for (const product of produk) {
    await db.query('INSERT INTO entitlements (tenant_id, product) VALUES (:t, :product)', { replacements: { t: tenant.id, product } });
  }
  for (const key of flags) {
    await db.query('INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, true)', { replacements: { t: tenant.id, key } });
  }
  return { id: tenant.id, slug };
}

async function tambahPengguna(db, tenantId, { nama, email, employeeId, peran, atasanId = null }) {
  const [[row]] = await db.query(
    `INSERT INTO users (tenant_id, email, name, employee_id, role, status, supervisor_id)
     VALUES (:t, :email, :nama, :emp, :peran, 'active', :sup) RETURNING id`,
    { replacements: { t: tenantId, email, nama, emp: employeeId, peran, sup: atasanId } },
  );
  return { id: row.id, tenantId, email, nama, employeeId, peran };
}

/** Header masuk untuk seorang pengguna. Saat sesi menggantikan token (PR #20), hanya fungsi ini yang berubah. */
function pembuatMasuk(config) {
  const tokens = createTokenService(config.jwt);
  return (p) => ({ Authorization: `Bearer ${tokens.sign({ id: p.id, tenantId: p.tenantId, role: p.peran, email: p.email })}` });
}

/** Menghapus tenant uji; audit_logs append-only, jadi lewat mode pemeliharaan (pola poc-dna-tna.test.js). Tabel lain ikut lewat ON DELETE CASCADE. */
async function hapusTenant(db, ids) {
  if (!ids.length) return;
  await db.transaction(async (transaction) => {
    await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
    await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids }, transaction });
  });
}

const kodeGalat = (res) => (res.body && res.body.error && res.body.error.code) || `HTTP_${res.status}`;

function langkah(app, masuk) {
  const kirim = (method, path, siapa, body) => {
    const r = request(app)[method](path).set(masuk(siapa));
    return body === undefined ? r : r.send(body);
  };
  const setuju = (karyawan, sid) => kirim('post', `/api/tna/sessions/${sid}/consent`, karyawan, { consentVersion: currentConsentVersion('tna') });
  const jawab = (karyawan, sid, text) => kirim('post', `/api/tna/sessions/${sid}/turns`, karyawan, { text });
  return {
    /** Respons mentah untuk memeriksa status penolakan (403/404) tanpa langkah modul. */
    mentah: (method, path, siapa, body) => kirim(method, path, siapa, body),
    /** Mengirim event webhook EliteMentor bertanda tangan HMAC (tanpa sesi pengguna). Respons mentah. */
    webhookEm(rahasia, event) {
      const body = JSON.stringify(event);
      const ts = String(Math.floor(Date.now() / 1000));
      return request(app).post('/api/integrations/elitementor/webhook').set('Content-Type', 'application/json')
        .set('X-EM-Timestamp', ts).set('X-EM-Signature', sign(rahasia, ts, body)).send(body);
    },
    /** Menunggu job analisis yang sedang antre selesai (dipicu saat sesi ditutup). */
    tungguAnalisis: () => app.locals.analysis.drain(),
    async buatProyek(hr, nama) {
      return (await kirim('post', '/api/projects', hr, { name: nama }).expect(201)).body.data.id;
    },
    dna: {
      async buatJabatan(hr, jabatan, kompetensi) {
        const role = (await kirim('post', '/api/dna/job-roles', hr, jabatan).expect(201)).body.data;
        const items = kompetensi.map((k) => (k.kind === 'job' ? { ...k, jobRoleId: role.id } : k));
        await kirim('post', '/api/dna/competencies/bulk', hr, { items }).expect(201);
        return role;
      },
      async tempatkan(hr, pengguna, role, level = role.levels[0]) {
        await kirim('put', `/api/dna/employees/${pengguna.id}/position`, hr, { jobRoleId: role.id, careerLevelId: level.id }).expect(200);
      },
    },
    tna: {
      async imporKinerja(hr, { period, projectId, rows }) {
        return (await kirim('post', '/api/tna/performance/import', hr, { period, projectId, rows }).expect(201)).body.data;
      },
      async jadwalkanWawancara(hr, projectId, period) {
        return (await kirim('post', `/api/tna/projects/${projectId}/interviews`, hr, { period }).expect(201)).body.data.sessions;
      },
      /** Persetujuan dengan versi aktif; mengembalikan respons mentah (pertanyaan pertama atau galat AI). */
      setuju,
      jawab,
      /**
       * Persetujuan lalu tanya-jawab sampai AI berhenti bertanya, paling banyak `batas` giliran.
       * jawabBerikut(i, pertanyaan) memberi jawaban giliran ke-i. Berhenti di respons pertama yang bukan 200 dan
       * mengembalikannya sebagai `gagal` ({ status, kode }) supaya pemanggil yang memutuskan artinya.
       */
      async jalankanWawancara(karyawan, sid, jawabBerikut, { batas = 20 } = {}) {
        const pertanyaan = [];
        let res = await setuju(karyawan, sid);
        for (let i = 0; res.status === 200 && res.body.data.question && i < batas; i += 1) {
          const q = res.body.data.question;
          pertanyaan.push(q.text);
          res = await jawab(karyawan, sid, jawabBerikut(i, q));
        }
        return { pertanyaan, gagal: res.status === 200 ? null : { status: res.status, kode: kodeGalat(res) } };
      },
      selesai: (karyawan, sid) => kirim('post', `/api/tna/sessions/${sid}/complete`, karyawan),
      /** B6 (flag tna.interview_summary): karyawan membuat ringkasan temuan, lalu mengirimnya ke HR. Respons mentah. */
      ringkasan: (karyawan, sid) => kirim('post', `/api/tna/sessions/${sid}/summary`, karyawan),
      kirimRingkasan: (karyawan, sid, keputusan = { accurate: true }) => kirim('post', `/api/tna/sessions/${sid}/summary/confirm`, karyawan, keputusan),
      async analisis(hr, sid) {
        return (await kirim('get', `/api/tna/sessions/${sid}/analysis`, hr).expect(200)).body.data;
      },
      async antreanReview(hr, projectId) {
        return (await kirim('get', `/api/tna/review?projectId=${projectId}`, hr).expect(200)).body.data;
      },
      /** PK-14: HR menyetujui, mengubah, atau menolak satu temuan hasil AI. */
      async reviewTemuan(hr, findingId, keputusan = { decision: 'approve' }) {
        return (await kirim('post', `/api/tna/findings/${findingId}/review`, hr, keputusan).expect(200)).body.data;
      },
      /** Temuan yang terlihat oleh pengguna sesuai cakupannya (RG-3). */
      async temuanTerlihat(siapa, projectId) {
        return (await kirim('get', `/api/tna/findings?projectId=${projectId}`, siapa).expect(200)).body.data;
      },
      transkrip: (siapa, sid) => kirim('get', `/api/tna/sessions/${sid}/transcript`, siapa),
    },
    li: {
      /** B13: unggah lalu commit CSV library modul KSA (baris tanpa header). Mengembalikan ringkasan hasil impor. */
      async imporModul(hr, baris) {
        const header = 'Kode Modul,Nama Modul,Level,Rumpun,Tujuan,Jabatan,Kompetensi,Tipe Butir,Butir';
        const up = await request(app).post('/api/li/imports/li_modules?filename=modul.csv').set(masuk(hr))
          .set('Content-Type', 'application/octet-stream').send(Buffer.from(`${[header, ...baris].join('\n')}\n`)).expect(201);
        return (await kirim('post', `/api/li/imports/batches/${up.body.data.id}/commit`, hr, {}).expect(200)).body.data.result;
      },
      /** Library modul (body lengkap: data, kpis, pareto). `query` contoh: 'priority=pareto'. */
      async pustaka(siapa, query = '') {
        return (await kirim('get', `/api/li/modules${query ? `?${query}` : ''}`, siapa).expect(200)).body;
      },
      async minta(hr, moduleId) {
        return (await kirim('post', `/api/li/modules/${moduleId}/request`, hr, {}).expect(201)).body.data;
      },
      /** Memajukan permintaan vendor satu langkah ({ status, catalogItemId? }). */
      async majukan(hr, requestId, body) {
        return (await kirim('patch', `/api/li/requests/${requestId}`, hr, body).expect(200)).body.data;
      },
    },
    ld: {
      /** B14: pelatihan offline isian HR ({ title, startsOn, venue?, ... }). */
      async buatPelatihan(hr, body) {
        return (await kirim('post', '/api/ld/trainings', hr, body).expect(201)).body.data;
      },
      /** Daftar pelatihan; membaca daftar juga menyinkronkan pelatihan online dari katalog LMS. */
      async daftar(hr, query = '') {
        return (await kirim('get', `/api/ld/trainings${query ? `?${query}` : ''}`, hr).expect(200)).body.data;
      },
      async detail(hr, id) {
        return (await kirim('get', `/api/ld/trainings/${id}`, hr).expect(200)).body.data;
      },
      /** Menambah peserta ({ userIds?, jobRoleId? }). */
      async tambahPeserta(hr, id, body) {
        return (await kirim('put', `/api/ld/trainings/${id}/participants`, hr, body).expect(200)).body.data;
      },
      async kehadiran(hr, id, entries) {
        return (await kirim('put', `/api/ld/trainings/${id}/attendance`, hr, { entries }).expect(200)).body.data;
      },
      /** Cara asesmen ({ mode: 'vendor_manual' } atau { mode: 'elitementor', assessmentRef }). */
      async asesmen(hr, id, body) {
        return (await kirim('put', `/api/ld/trainings/${id}/assessment`, hr, body).expect(200)).body.data;
      },
      async skor(hr, id, entries) {
        return (await kirim('put', `/api/ld/trainings/${id}/scores`, hr, { entries }).expect(200)).body.data;
      },
      async dashboard(hr) {
        return (await kirim('get', '/api/ld/dashboard', hr).expect(200)).body.data;
      },
      /** Respons mentah: 201 terkirim, 409 REMINDER_RECENT bila sudah dikirim dalam 24 jam. */
      pengingat: (hr, id) => kirim('post', `/api/ld/trainings/${id}/reminders`, hr),
    },
  };
}

/**
 * Tenant lain berisi data kenari (TENANT_LAIN di data.js). Datanya tidak boleh terlihat dari tenant yang diuji,
 * baik di respons API maupun di payload ke penyedia AI. Mengembalikan { id, projectId }.
 */
async function siapkanTenantKenari(db, a, slug) {
  const t = await siapkanTenant(db, { slug: `${slug}-lain`, nama: TENANT_LAIN.nama });
  const hr = await tambahPengguna(db, t.id, { nama: 'HR Lain', email: `hr@${slug}-lain.test`, employeeId: 'E-TL-HR', peran: 'hr_admin' });
  const k = await tambahPengguna(db, t.id, { ...TENANT_LAIN.karyawan, peran: 'learner' });
  const projectId = await a.buatProyek(hr, 'Proyek lain');
  await a.tna.imporKinerja(hr, { period: PERIODE, projectId, rows: [{ employeeId: k.employeeId, metricType: 'kpi', ...TENANT_LAIN.kpi }] });
  return { id: t.id, projectId };
}

module.exports = { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah, siapkanTenantKenari, kodeGalat };
