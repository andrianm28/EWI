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

/**
 * Menjalankan `fn` selama flag atau produk tenant dimatikan, lalu memulihkannya walau `fn` gagal.
 * `{ flag }` mematikan satu feature flag; `{ produk }` mencabut satu entitlement (mis. 'full_suite').
 */
async function selamaMati(db, tenantId, { flag, produk }, fn) {
  const t = tenantId;
  const setel = (on) => (flag
    ? db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :flag, :on)
                ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t, flag, on } })
    : db.query(on ? 'INSERT INTO entitlements (tenant_id, product) VALUES (:t, :produk)' : 'DELETE FROM entitlements WHERE tenant_id = :t AND product = :produk', { replacements: { t, produk } }));
  await setel(false);
  try { return await fn(); } finally { await setel(true); }
}

/** Menyalakan flag tenant (mis. em.webhook_sync yang bawaannya mati). */
async function nyalakanFlag(db, tenantId, flag) {
  await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :flag, true)
                  ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = true`, { replacements: { t: tenantId, flag } });
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

/** Langkah alur lewat API saja (tanpa menulis store langsung). */
function langkah(app, masuk) {
  const kirim = (method, path, siapa, body) => {
    const r = request(app)[method](path).set(masuk(siapa));
    return body === undefined ? r : r.send(body);
  };
  const setuju = (karyawan, sid) => kirim('post', `/api/tna/sessions/${sid}/consent`, karyawan, { consentVersion: currentConsentVersion('tna') });
  /** Unggah lalu commit CSV lewat pengimpor bersama submodul (baris tanpa header). Mengembalikan hasil impor. */
  const imporCsv = async (siapa, submodul, jenis, header, baris) => {
    const up = await request(app).post(`/api/${submodul}/imports/${jenis}?filename=${jenis}.csv`).set(masuk(siapa))
      .set('Content-Type', 'application/octet-stream').send(Buffer.from(`${[header, ...baris].join('\n')}\n`)).expect(201);
    return (await kirim('post', `/api/${submodul}/imports/batches/${up.body.data.id}/commit`, siapa, {}).expect(200)).body.data.result;
  };
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
      /**
       * Impor file DNA lewat layar impor: unggah CSV (`baris` = baris teks, baris pertama judul kolom) dengan
       * saran pemetaan, lalu simpan dengan `opsi`. Mengembalikan ringkasan batch ({ status, result }).
       */
      async impor(hr, jenis, baris, opsi = {}) {
        const up = await request(app).post(`/api/dna/imports/${jenis}?filename=${jenis}.csv`).set(masuk(hr))
          .set('Content-Type', 'application/octet-stream').send(Buffer.from(`${baris.join('\n')}\n`)).expect(201);
        return (await kirim('post', `/api/dna/imports/batches/${up.body.data.id}/commit`, hr, { options: opsi }).expect(200)).body.data;
      },
      /** B4: kamus per jabatan beserta job function (flag dna.development). */
      async kamus(siapa, roleId) {
        return (await kirim('get', `/api/dna/job-roles/${roleId}/dictionary`, siapa).expect(200)).body.data;
      },
      /** B4: HR mengesahkan kamus jabatan. Mengembalikan { approved }. */
      async sahkanKamus(hr, roleId) {
        return (await kirim('post', `/api/dna/job-roles/${roleId}/dictionary/approve`, hr).expect(200)).body.data;
      },
      /** B4 Developmental Needs. Respons mentah, karena alurnya juga memeriksa penolakan per peran. */
      pengembangan: {
        ringkasan: (siapa, roleId) => kirim('get', `/api/dna/development/overview${roleId ? `?jobRoleId=${roleId}` : ''}`, siapa),
        kebutuhan: (siapa, roleId) => kirim('get', `/api/dna/development/employees?jobRoleId=${roleId}`, siapa),
        rencana: (siapa, pegawai) => kirim('get', `/api/dna/employees/${pegawai.id}/development-plan`, siapa),
      },
      /** B16 Career & Promotion (flag promotion.recommendation). Respons mentah. */
      karier: {
        peta: (siapa) => kirim('get', '/api/dna/career/map', siapa),
        keputusan: (siapa) => kirim('get', '/api/dna/career/decisions', siapa),
        putusanAtasan: (atasan, karyawan, decision, note) => kirim('post', `/api/dna/career/decisions/${karyawan.id}/supervisor`, atasan, { decision, note }),
        putusanHr: (hr, karyawan, decision, note) => kirim('post', `/api/dna/career/decisions/${karyawan.id}/hr`, hr, { decision, note }),
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
      /** B6: membaca ringkasan (hanya orang yang diwawancarai) dan mengulang wawancara. Respons mentah. */
      bacaRingkasan: (siapa, sid) => kirim('get', `/api/tna/sessions/${sid}/summary`, siapa),
      ulangi: (karyawan, sid) => kirim('post', `/api/tna/sessions/${sid}/restart`, karyawan),
      async sesiSaya(karyawan) {
        return (await kirim('get', '/api/tna/sessions', karyawan).expect(200)).body.data;
      },
      async sesi(siapa, sid) {
        return (await kirim('get', `/api/tna/sessions/${sid}`, siapa).expect(200)).body.data;
      },
    },
    /** B5 (flag tna.gap_board, tna.interview_assignment): papan gap dan penugasan wawancara dari satu gap. */
    gap: {
      async okr(siapa, period) {
        return (await kirim('get', `/api/tna/gaps/okr${period ? `?period=${period}` : ''}`, siapa).expect(200)).body.data.rows;
      },
      async ringkasan(siapa) {
        return (await kirim('get', '/api/tna/gaps/summary', siapa).expect(200)).body.data;
      },
      async detail(siapa, ref) {
        return (await kirim('get', `/api/tna/gaps/detail?${new URLSearchParams(ref)}`, siapa).expect(200)).body.data;
      },
      /** Referensi gap dari baris papan (sama dengan gapRefOf di layar). */
      refDari: (row) => (row.kind === 'competency' ? { kind: 'competency', competencyId: row.competencyId } : { kind: 'okr', metricType: row.metricType, name: row.name, period: row.period }),
      tugaskan: (siapa, body) => kirim('post', '/api/tna/assignments', siapa, body),
      batalkan: (siapa, sid) => kirim('post', `/api/tna/assignments/${sid}/cancel`, siapa),
    },
    li: {
      /** B13: unggah lalu commit CSV library modul KSA (baris tanpa header). Mengembalikan ringkasan hasil impor. */
      imporModul: (hr, baris) => imporCsv(hr, 'li', 'li_modules', 'Kode Modul,Nama Modul,Level,Rumpun,Tujuan,Jabatan,Kompetensi,Tipe Butir,Butir', baris),
      /** Katalog course Moodle (impor PK-18 lewat TNA), sumber `catalogItemId` saat modul dipasang. Baris: 'Kode,Judul'. */
      async imporCourse(hr, baris) {
        await imporCsv(hr, 'tna', 'catalog_courses', 'Kode Course,Judul Course', baris);
        return (await kirim('get', '/api/li/catalog', hr).expect(200)).body.data;
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
      /** Respons mentah: 201 terkirim; 409 REMINDER_RECENT (dalam 24 jam) atau INVALID_STATE (selesai/batal); 400 tanpa penerima. */
      pengingat: (hr, id) => kirim('post', `/api/ld/trainings/${id}/reminders`, hr),
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
      /** Ringkasan wawancara yang boleh dibaca (peserta sendiri, atau HR untuk tier pimpinan). */
      async ringkasan(siapa, assignmentId) {
        return (await kirim('get', `/api/cca/assignments/${assignmentId}/summary`, siapa).expect(200)).body.data;
      },
      /**
       * B10 tahap 2: peserta menyetujui teks persetujuan berlaku, menjawab empat pertanyaan, membuat ringkasan, lalu
       * mengirimnya. `jawaban` = satu teks (dipakai untuk keempat pertanyaan) atau daftar empat teks. Mengembalikan tema ringkasan.
       */
      async selesaikanWawancara(pengguna, assignmentId, jawaban) {
        const base = `/api/cca/assignments/${assignmentId}`;
        const daftar = Array.isArray(jawaban) ? jawaban : Array(4).fill(jawaban);
        await kirim('post', `${base}/consent`, pengguna, { consentVersion: currentConsentVersion('cca') }).expect(200);
        for (const text of daftar) await kirim('post', `${base}/turns`, pengguna, { text }).expect(200);
        const ringkasan = (await kirim('post', `${base}/summary`, pengguna).expect(201)).body.data;
        await kirim('post', `${base}/summary/confirm`, pengguna).expect(200);
        return ringkasan.themes;
      },
    },
    lim: {
      /** B15: rencana pengukuran (HR). */
      async buatRencana(hr, rencana) {
        return (await kirim('post', '/api/lim/plans', hr, rencana).expect(201)).body.data;
      },
      /** Rencana yang terlihat sesuai cakupan (atasan: hanya rencana berisi anggota timnya). */
      async daftarRencana(siapa) {
        return (await kirim('get', '/api/lim/plans', siapa).expect(200)).body.data;
      },
      /** Isian skor (HR: pre/post/kinerja; atasan: kinerja bawahan langsung). Mengembalikan { saved, rejected }. */
      async isiSkor(siapa, planId, entries) {
        return (await kirim('put', `/api/lim/plans/${planId}/measurements`, siapa, { entries }).expect(200)).body.data;
      },
      /** Skor per karyawan per kompetensi (HR). */
      async skor(hr, planId) {
        return (await kirim('get', `/api/lim/plans/${planId}/measurements`, hr).expect(200)).body.data;
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

module.exports = { siapkanTenant, selamaMati, nyalakanFlag, tambahPengguna, pembuatMasuk, hapusTenant, langkah, siapkanTenantKenari, kodeGalat };
