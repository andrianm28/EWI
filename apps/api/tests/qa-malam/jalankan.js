'use strict';
// B18 QA malam (docs/designs/b18-e2e-qa-malam.md bagian 5): menjalankan persona fiktif lewat aplikasi sungguhan
// (createApp + Postgres + penyedia AI), memeriksa hasilnya, dan mengembalikan laporan. Berkas ini ada di tests/,
// jadi tidak ikut image produksi. Dipanggil dari test integrasi (penyedia stub) dan dari cli.js (`npm run qa:malam`).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { estimateCost } = require('../../src/ai');
const { FLAGS } = require('../../src/core/flags');
const { buatPerekam, operasiAi, ringkasPanggilan } = require('./perekam');
const { periksaPersona, ringkasRun, langgar } = require('./pemeriksa');
const { galatQa } = require('./galat');
const { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah, siapkanTenantKenari, kodeGalat } = require('../alur/driver');
const { JABATAN, KOMPETENSI, KARYAWAN_LAIN, PERIODE, TERLARANG } = require('../alur/data');

const BATAS_GILIRAN = 20; // pengaman putaran bila AI tidak pernah berhenti bertanya
const AKHIRAN_DB_UJI = /(_qa|_test)$/;

/** Nama database dari URL koneksi (bagian path terakhir, tanpa parameter). */
const namaDatabase = (url) => String(url || '').split('?')[0].split('/').pop();
const galatPengaman = (pesan) => galatQa('QA_PENGAMAN', `QA malam ditolak: ${pesan}`);

/** Menolak run di luar lingkungan uji (spek 5.3). Dipanggil sebelum menyentuh database. */
function pengaman(env) {
  if (env.NODE_ENV !== 'test') throw galatPengaman('NODE_ENV harus test');
  const namaDb = namaDatabase(env.DATABASE_URL);
  if (!AKHIRAN_DB_UJI.test(namaDb)) throw galatPengaman(`nama database "${namaDb}" harus berakhiran _qa atau _test`);
  if (['staging', 'production', 'prod'].includes(String(env.EWI_ENV || '').toLowerCase())) throw galatPengaman(`EWI_ENV=${env.EWI_ENV}`);
  if (env.MAIL_PROVIDER && env.MAIL_PROVIDER !== 'memory') throw galatPengaman('MAIL_PROVIDER harus memory');
}

/** Database yang benar-benar tersambung juga harus database uji, bukan hanya string di env. Mengembalikan namanya. */
async function cekDatabase(db) {
  const [r] = await db.query('SELECT current_database() AS nama', { type: 'SELECT' });
  if (!AKHIRAN_DB_UJI.test(r.nama)) throw galatPengaman(`database tersambung "${r.nama}" harus berakhiran _qa atau _test`);
  return r.nama;
}

/** Dengan model sungguhan, harga token wajib ada: tanpa harga estimateCost null dan biaya run tidak terlihat (spek 5.4). */
function cekKonfigurasi(ai, aiConfig = {}) {
  if (ai.name !== 'bedrock') return;
  if (aiConfig.priceInputPerMTok == null || aiConfig.priceOutputPerMTok == null) {
    throw galatQa('QA_KONFIGURASI', 'QA malam ditolak: AI_PRICE_INPUT_PER_MTOK dan AI_PRICE_OUTPUT_PER_MTOK wajib diisi untuk penyedia bedrock');
  }
}

function hashPrompt() {
  const isi = fs.readFileSync(path.join(__dirname, '../../src/ai/prompts.js'));
  return crypto.createHash('sha256').update(isi).digest('hex');
}

const intiTemuan = (f) => ({ category: f.category, title: f.title, detail: f.detail });

/** Menjalankan satu persona TNA dan mengembalikan rekaman untuk pemeriksa. Melempar QA_BATAS_TOKEN bila batas tercapai. */
async function jalankanPersonaTna({ db, aksi, slug, persona, perekam }) {
  // Batas token dilempar di dalam rute atau job (lihat perekam.js), jadi diperiksa setelah setiap langkah.
  const cekBatas = () => { if (perekam.rekaman.galatBatas) throw perekam.rekaman.galatBatas; };
  const ringkas = persona.alur === 'ringkasan';
  const t = await siapkanTenant(db, { slug, flags: [FLAGS.MODULE_DNA, FLAGS.MODULE_TNA, ...(ringkas ? [FLAGS.TNA_INTERVIEW_SUMMARY] : [])] });
  const hr = await tambahPengguna(db, t.id, { nama: 'HR Contoh', email: `hr@${slug}.test`, employeeId: 'E-HR', peran: 'hr_admin' });
  const karyawan = await tambahPengguna(db, t.id, {
    nama: persona.karyawan.nama, email: `karyawan@${slug}.test`, employeeId: 'E-UJI-01', peran: 'learner',
  });
  const lain = await tambahPengguna(db, t.id, { nama: KARYAWAN_LAIN.nama, email: KARYAWAN_LAIN.email, employeeId: KARYAWAN_LAIN.employeeId, peran: 'learner' });
  const { dna, tna } = aksi;
  const role = await dna.buatJabatan(hr, JABATAN, KOMPETENSI);
  await dna.tempatkan(hr, karyawan, role);
  await dna.tempatkan(hr, lain, role);
  const projectId = await aksi.buatProyek(hr, `QA malam ${persona.id}`);
  await tna.imporKinerja(hr, {
    period: PERIODE,
    projectId,
    rows: [
      ...persona.target.map((x) => ({ employeeId: karyawan.employeeId, metricType: 'kpi', name: x.kpi, target: x.target, actual: x.aktual })),
      { employeeId: lain.employeeId, metricType: 'kpi', ...KARYAWAN_LAIN.kpi },
    ],
  });
  const sesi = (await tna.jadwalkanWawancara(hr, projectId, PERIODE)).find((s) => s.intervieweeId === karyawan.id);

  const awal = perekam.rekaman.panggilan.length;
  const rekaman = {
    tenantId: t.id, penyedia: perekam.name, pertanyaan: [], galatWawancara: null, completeStatus: null, job: { status: 'not_started' },
    temuan: [], ringkasan: [], tautan: 0, payloads: [], terlarang: TERLARANG,
  };

  // Naskah tidak menyesuaikan diri dengan pertanyaan AI; setelah habis, jawaban cadangan dipakai.
  const w = await tna.jalankanWawancara(karyawan, sesi.id, (i) => (i < persona.naskah.length ? persona.naskah[i] : persona.jawabanCadangan),
    { batas: BATAS_GILIRAN });
  cekBatas();
  rekaman.pertanyaan = w.pertanyaan;
  if (w.gagal) rekaman.galatWawancara = { langkah: 'wawancara', ...w.gagal };

  if (!rekaman.galatWawancara && ringkas) {
    // B6: ringkasan dibuat dari penilaian pertama dan dibaca karyawan, jadi ikut diperiksa sebagai keluaran AI.
    const res = await tna.ringkasan(karyawan, sesi.id);
    cekBatas();
    if (res.status === 201) rekaman.ringkasan = res.body.data.findings.map(intiTemuan);
    else rekaman.galatWawancara = { langkah: 'ringkasan', status: res.status, kode: kodeGalat(res) };
  }
  if (!rekaman.galatWawancara) {
    rekaman.completeStatus = (ringkas ? await tna.kirimRingkasan(karyawan, sesi.id) : await tna.selesai(karyawan, sesi.id)).status;
    await aksi.tungguAnalisis();
    cekBatas();
    if (rekaman.completeStatus === 202) {
      const job = await tna.analisis(hr, sesi.id);
      rekaman.job = { status: job.status, lastError: job.lastError || null };
      rekaman.temuan = (await tna.antreanReview(hr, projectId)).map(intiTemuan);
      // BT-23: REVIEW_COLS tidak memuat linked_finding_id, jadi tautan dibaca langsung dari tabel temuan (spek 5.3 butir 7).
      const [r] = await db.query('SELECT count(*)::int AS n FROM lna_findings WHERE tenant_id = :t AND session_id = :s AND linked_finding_id IS NOT NULL',
        { replacements: { t: t.id, s: sesi.id }, type: 'SELECT' });
      rekaman.tautan = r.n;
    }
  }
  const panggilan = perekam.rekaman.panggilan.slice(awal);
  rekaman.payloads = panggilan.map(({ operasi, args }) => ({ operasi, args }));
  // Spek 5.3 butir 7: pemakaian dibaca dari ai_usage_logs (catatan aplikasi), lalu dibandingkan dengan perekam.
  const [u] = await db.query('SELECT count(*)::int AS n FROM ai_usage_logs WHERE tenant_id = :t AND session_id = :s',
    { replacements: { t: t.id, s: sesi.id }, type: 'SELECT' });
  rekaman.pemakaian = { panggilan: panggilan.filter((x) => !x.galat).length, tercatat: u.n };
  return rekaman;
}

/**
 * opsi: { db, config, ai, persona: [...], env, maksToken, commit }
 * Mengembalikan laporan; tidak menulis berkas (lihat cli.js).
 */
async function jalankanQaMalam({ db, config, ai, persona, env = process.env, maksToken = Infinity, commit = null }) {
  pengaman(env);
  await cekDatabase(db);
  cekKonfigurasi(ai, config.ai);
  const daftar = persona.map((p) => ({ alur: 'selesai', ...p }));
  const perekam = buatPerekam(ai, { maksToken });
  let st;
  const aksi = langkah(createApp({ config, stores: (st = createStores(db)), ai: perekam }), pembuatMasuk(config, st.authSessions));
  const slug = `qa-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const tenantIds = [];
  const hasil = [];
  const mulai = new Date();
  try {
    tenantIds.push((await siapkanTenantKenari(db, aksi, slug)).id);
    for (const [i, p] of daftar.entries()) {
      const dasar = { id: p.id, versi: p.versi || null, alur: p.alur };
      let rekaman;
      try {
        rekaman = await jalankanPersonaTna({ db, aksi, slug: `${slug}-${i}`, persona: p, perekam });
        tenantIds.push(rekaman.tenantId);
      } catch (e) {
        if (e.code !== 'QA_BATAS_TOKEN') throw e;
        hasil.push({ ...dasar, pelanggaran: [langgar('infrastruktur', 'QA_BATAS_TOKEN', e.message)], klasifikasi: { dihitung: false, alasan: 'batas token' } });
        break;
      }
      hasil.push({
        ...dasar, ...periksaPersona(p, rekaman),
        pertanyaan: rekaman.pertanyaan, ringkasan: rekaman.ringkasan, temuan: rekaman.temuan, tautan: rekaman.tautan, pemakaian: rekaman.pemakaian,
      });
    }
  } finally {
    // Job analisis yang masih antre tidak boleh berjalan di atas tenant yang dihapus.
    await aksi.tungguAnalisis().catch(() => {});
    // Tenant yang gagal di tengah penyiapan dibersihkan lewat slug.
    const sisa = await db.query('SELECT id FROM tenants WHERE slug LIKE :s', { replacements: { s: `${slug}%` }, type: 'SELECT' });
    await hapusTenant(db, [...new Set([...tenantIds, ...sisa.map((r) => r.id)])]);
  }

  const { token, latensi } = ringkasPanggilan(perekam.rekaman.panggilan);
  const biayaUsd = estimateCost({ provider: perekam.name, inputTokens: token.input, outputTokens: token.output }, config.ai || {});
  const ringkas = ringkasRun(hasil);
  // Spek 5.1: operasi AI yang ditawarkan penyedia tetapi tidak terpanggil oleh persona mana pun ditulis terang.
  const cakupan = {
    operasi: Object.fromEntries(Object.entries(latensi).map(([op, v]) => [op, v.jumlah])),
    belumDiuji: operasiAi(ai).filter((op) => !latensi[op]).sort(),
    alur: hasil.reduce((a, h) => ({ ...a, [h.alur]: (a[h.alur] || 0) + 1 }), {}),
  };
  return {
    kode: ringkas.kode,
    mulai: mulai.toISOString(),
    selesai: new Date().toISOString(),
    slug,
    penyedia: perekam.name,
    model: perekam.model,
    region: (config.ai && config.ai.region) || null,
    commit,
    hashPrompt: hashPrompt(),
    klasifikasi: ringkas.klasifikasi,
    cakupan,
    token,
    biayaUsd,
    latensi,
    persona: hasil,
  };
}

module.exports = { jalankanQaMalam, pengaman, cekDatabase, cekKonfigurasi, namaDatabase, galatPengaman };
