'use strict';
// B18: driver test alur lintas paket (spek 3.2). Satu-satunya tempat yang tahu cara menyiapkan tenant, masuk
// sebagai peran, dan memanggil langkah tiap modul lewat API. Bila kontrak API berubah, PR yang mengubahnya
// memperbaiki driver ini di PR yang sama, karena test alur dan QA malam ikut gerbang `npm test`.
// Penyiapan tenant, pengguna, entitlement, dan flag memakai SQL; selebihnya lewat API (supertest).
const request = require('supertest');
const { createTokenService } = require('../../src/core/auth/tokens');
const { currentConsentVersion } = require('../../src/core/consent');
const { FLAGS } = require('../../src/core/flags');
const { TENANT_LAIN, PERIODE } = require('./data');

/** Membuat tenant uji dengan entitlement (bawaan full_suite) dan flag yang diminta. */
async function siapkanTenant(db, { slug, nama = 'PT Contoh', flags = [FLAGS.MODULE_DNA, FLAGS.MODULE_TNA], produk = ['full_suite'] }) {
  const [[tenant]] = await db.query('INSERT INTO tenants (slug, name) VALUES (:slug, :nama) RETURNING id', { replacements: { slug, nama } });
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
      /**
       * B13: impor satu modul library KSA lewat impor CSV (unggah lalu simpan), lalu mengembalikan modulnya.
       * modul: { code, name, level, jobRoles, competencies, items: [[tipe K/S/A, butir], ...] }.
       */
      async imporModul(hr, { code, name, level = 'basic', jobRoles = '', competencies = '', items }) {
        const sel = (s) => `"${String(s).replace(/"/g, '""')}"`;
        const header = 'Kode Modul,Nama Modul,Level,Rumpun,Tujuan,Jabatan,Kompetensi,Tipe Butir,Butir';
        const baris = items.map(([tipe, butir], i) => (i === 0
          ? [code, name, level, '', '', jobRoles, competencies, tipe, butir]
          : [code, '', '', '', '', '', '', tipe, butir]).map(sel).join(','));
        const up = await request(app).post('/api/li/imports/li_modules?filename=modul.csv').set(masuk(hr))
          .set('Content-Type', 'application/octet-stream').send(Buffer.from(`${[header, ...baris].join('\n')}\n`)).expect(201);
        await kirim('post', `/api/li/imports/batches/${up.body.data.id}/commit`, hr, {}).expect(200);
        const modul = (await kirim('get', '/api/li/modules', hr).expect(200)).body.data.find((m) => m.code === code.toUpperCase());
        if (!modul) throw new Error(`Modul ${code} tidak ada setelah impor`);
        return modul;
      },
    },
    ld: {
      /**
       * B14: pelatihan offline dari satu modul; semua peserta hadir dan skor vendor diisi.
       * skor: [[pengguna, angka], ...]. Mengembalikan detail pelatihan.
       */
      async pelatihanOffline(hr, { title, moduleId, startsOn, endsOn = null, skor }) {
        const t = (await kirim('post', '/api/ld/trainings', hr, { title, moduleId, startsOn, endsOn }).expect(201)).body.data;
        await kirim('put', `/api/ld/trainings/${t.id}/participants`, hr, { userIds: skor.map(([p]) => p.id) }).expect(200);
        await kirim('put', `/api/ld/trainings/${t.id}/attendance`, hr, { allPresent: true }).expect(200);
        await kirim('put', `/api/ld/trainings/${t.id}/assessment`, hr, { mode: 'vendor_manual' }).expect(200);
        await kirim('put', `/api/ld/trainings/${t.id}/scores`, hr, { entries: skor.map(([p, score]) => ({ userId: p.id, score })) }).expect(200);
        return (await kirim('patch', `/api/ld/trainings/${t.id}`, hr, { status: 'done' }).expect(200)).body.data;
      },
    },
    cca: {
      /** B10 (flag cca.interview): HR menugaskan tier pimpinan; pimpinan menugaskan bawahan langsungnya. */
      async tugaskan(siapa, assigneeIds, dueDate) {
        return (await kirim('post', '/api/cca/assignments', siapa, { assigneeIds, dueDate }).expect(201)).body.data;
      },
      /** Tampilan penugasan sesuai peran: { role: hr|leader|employee, mine, ... }. */
      async penugasan(siapa) {
        return (await kirim('get', '/api/cca/assignments', siapa).expect(200)).body.data;
      },
    },
    lim: {
      /** B15: rencana pengukuran (HR). */
      async buatRencana(hr, rencana) {
        return (await kirim('post', '/api/lim/plans', hr, rencana).expect(201)).body.data;
      },
      async ringkasan(siapa, planId) {
        return (await kirim('get', `/api/lim/plans/${planId}/overview`, siapa).expect(200)).body.data;
      },
      async antrean(hr, planId) {
        return (await kirim('get', `/api/lim/plans/${planId}/queue`, hr).expect(200)).body.data;
      },
      /** Jadwal wawancara ulang per karyawan; date null membatalkan. */
      async jadwalkan(hr, planId, userIds, date) {
        return (await kirim('post', `/api/lim/plans/${planId}/queue/schedule`, hr, { userIds, date }).expect(200)).body.data;
      },
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
