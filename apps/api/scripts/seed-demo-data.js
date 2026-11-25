'use strict';
// Data demo per layar untuk tenant "demo" (dipanggil seed-dev.js; dev dan staging saja, lihat header seed-dev).
// Tujuan: setiap langkah apps/web/e2e/demo-alur.spec.ts menampilkan isi nyata dari API asli, bukan layar kosong.
// Aturan:
// - Idempoten: setiap baris dicari lewat kunci alaminya dulu (find-or-insert), jadi seed aman dijalankan ulang.
// - Langkah perbaikan (gap demo 25 Nov) mengembalikan keadaan demo saat seed diulang: draf seed lama berbentuk string,
//   penugasan CC Budi dari seed lama, peserta ITIL yang tidak aktif, dan atasan Learner Demo. Hanya baris buatan seed.
// - Temuan AI adalah baris seed (tidak pernah memanggil LLM). Judul/detail temuan disimpan lewat store TNA,
//   sehingga terenkripsi per tenant seperti data asli.
// - Tidak ada data untuk Super Admin: konsol Super Admin hanya membaca metadata tenant (denyEmployeeContent).

const { generateDraft } = require('../src/modules/li/design');
const { validateProgramConfig } = require('../src/modules/cca/program-report');

const DAY = 24 * 60 * 60 * 1000;
// Kompetensi milik seed (seed-dev + seed ini). Hanya ini yang disahkan dan diberi tingkat.
const SEEDED_COMPETENCIES = ['Memahami kontrak proyek', 'Menjalankan SOP L1', 'Troubleshooting jaringan dasar', 'Komunikasi pelanggan',
  'Analisis insiden', 'Otomasi infrastruktur'];
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

/** Cari satu baris lewat kunci; bila belum ada, sisipkan. Nama tabel dan kolom berasal dari kode ini, bukan input. */
async function findOrInsert(c, table, keys, values = {}) {
  const keyCols = Object.keys(keys);
  const where = keyCols.map((k, i) => `${k} IS NOT DISTINCT FROM $${i + 1}`).join(' AND ');
  const { rows: [found] } = await c.query(`SELECT id FROM ${table} WHERE ${where} LIMIT 1`, Object.values(keys));
  if (found) return found.id;
  const all = { ...keys, ...values };
  const cols = Object.keys(all);
  const { rows: [row] } = await c.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, Object.values(all));
  return row.id;
}
/** Sisipkan baris tabel penghubung (tanpa id) bila belum ada. */
async function link(c, table, row) {
  const cols = Object.keys(row);
  await c.query(`INSERT INTO ${table} (${cols.join(', ')}) SELECT ${cols.map((_, i) => `$${i + 1}`).join(', ')}
                 WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE ${cols.map((k, i) => `${k} = $${i + 1}`).join(' AND ')})`, Object.values(row));
}

/**
 * c: klien pg (search_path schema ELGOS). stores: createStores(...) untuk data terenkripsi (temuan).
 * ids: { tenantId, jobRoleId, levelIds, hrId, spvId, memberIds: [dimas, rina, budi] }.
 */
async function seedDemoData(c, { stores, tenantId: t, jobRoleId, levelIds, hrId, spvId, headId, memberIds }) {
  const [dimas, rina, budi] = memberIds;
  // Kolom terenkripsi (evidence, judul/detail temuan dan tindakan INA, ringkasan CC) ditulis lewat cipher store dengan kunci tenant
  const enc = (v) => stores.cipher.encrypt(t, v);

  // ---------- Karyawan demo (learner@demo.test): jabatan, jenjang, atasan ----------
  const { rows: [learner] } = await c.query(
    `UPDATE users SET job_role_id = COALESCE(job_role_id, $2), career_level_id = COALESCE(career_level_id, $3),
            supervisor_id = COALESCE(supervisor_id, $4), employee_id = COALESCE(employee_id, 'D-LEARNER')
      WHERE tenant_id = $1 AND email = 'learner@demo.test' RETURNING id`, [t, jobRoleId, levelIds[1], spvId]);
  if (!learner) throw new Error('seed-demo-data: akun learner@demo.test tidak ditemukan di tenant demo');
  // seed-dev membuat Learner Demo dengan HR sebagai atasan; data demo memperlakukannya sebagai anggota tim Atasan Demo
  // (CC, LD, LIM, promosi). Hanya nilai bawaan seed itu yang dipindah, atasan yang diubah lewat aplikasi tidak disentuh.
  await c.query('UPDATE users SET supervisor_id = $3 WHERE tenant_id = $1 AND id = $2 AND supervisor_id = $4', [t, learner.id, spvId, hrId]);
  const team = [dimas, rina, budi, learner.id];

  // ---------- Kamus kompetensi disahkan HR + target skor (syarat papan gap R2) ----------
  for (const [name, kind, importance] of [['Analisis insiden', 'job', 5], ['Otomasi infrastruktur', 'job', 3]]) {
    await findOrInsert(c, 'lna_competencies', { tenant_id: t, job_role_id: kind === 'job' ? jobRoleId : null, name },
      { kind, source: 'hr_rule', importance });
  }
  // Hanya kompetensi seed yang disahkan; draf lain di tenant (mis. staging) tidak disentuh
  await c.query(`UPDATE lna_competencies SET required_score = COALESCE(required_score, 3), approved_at = COALESCE(approved_at, now()),
                        approved_by = COALESCE(approved_by, $2) WHERE tenant_id = $1 AND name = ANY($3::text[])`, [t, hrId, SEEDED_COMPETENCIES]);
  const { rows: comps } = await c.query('SELECT id, name FROM lna_competencies WHERE tenant_id = $1 AND name = ANY($2::text[])', [t, SEEDED_COMPETENCIES]);
  const comp = Object.fromEntries(comps.map((x) => [x.name, x.id]));

  // Developmental Needs (B4): kode, rumpun, dan tingkat BIA kamus jabatan + job function hasil DACUM
  const TIERED = [
    ['Analisis insiden', 'ST-B1', 'Penanganan insiden', 'basic', 1], ['Menjalankan SOP L1', 'ST-B2', 'Penanganan insiden', 'basic', 1],
    ['Troubleshooting jaringan dasar', 'ST-I1', 'Infrastruktur', 'intermediate', 2], ['Memahami kontrak proyek', 'ST-I2', 'Layanan pelanggan', 'intermediate', 3],
    ['Otomasi infrastruktur', 'ST-A1', 'Infrastruktur', 'advanced', 2],
  ];
  const FUNCTIONS = { 1: 'Menangani insiden tingkat 1', 2: 'Merawat infrastruktur pelanggan', 3: 'Menjaga layanan sesuai kontrak' };
  const fnIds = {};
  for (const [order, name] of Object.entries(FUNCTIONS)) {
    fnIds[order] = await findOrInsert(c, 'lna_job_functions', { tenant_id: t, job_role_id: jobRoleId, fn_order: Number(order) }, { name });
  }
  for (const [name, code, stream, tier, fn] of TIERED) {
    if (!comp[name]) continue;
    await c.query(`UPDATE lna_competencies SET code = COALESCE(code, $3), stream = COALESCE(stream, $4), program_tier = COALESCE(program_tier, $5),
                          definition = COALESCE(definition, $6) WHERE tenant_id = $1 AND id = $2`,
    [t, comp[name], code, stream, tier, `Mampu ${name.toLowerCase()} sesuai standar Service Delivery L1.`]);
    await link(c, 'lna_job_function_competencies', { tenant_id: t, job_function_id: fnIds[fn], competency_id: comp[name] });
  }

  // Skor wawancara manual: Analisis insiden jadi gap terbesar (Pareto teratas), Otomasi infrastruktur untuk Hasil saya
  const SCORES = {
    'Analisis insiden': [1, 2, 1, 2], 'Otomasi infrastruktur': [3, 2, 2, 2],
    'Memahami kontrak proyek': [null, null, null, 3], 'Menjalankan SOP L1': [null, null, null, 2],
    'Troubleshooting jaringan dasar': [null, null, null, 3], 'Komunikasi pelanggan': [null, null, null, 4],
  };
  for (const [name, row] of Object.entries(SCORES)) {
    for (const [i, userId] of team.entries()) {
      if (row[i] === null || !comp[name]) continue;
      await findOrInsert(c, 'lna_assessments', { tenant_id: t, user_id: userId, competency_id: comp[name], source: 'manual_interview' },
        { score: row[i], confidence: 1, evidence: await enc('Contoh hasil wawancara manual (seed demo)'), assessor: 'Tim ETA', assessed_at: '2026-11-10' });
    }
  }

  // ---------- Proyek POC dan target KPI/OKR yang meleset ----------
  const projectId = await findOrInsert(c, 'lna_projects', { tenant_id: t, name: 'Pilot L1' },
    { division: 'Service Delivery', status: 'active', period_start: '2026-11-01', period_end: '2026-12-31', created_by: hrId });
  const PERF = [
    ['okr', 'Waktu penyelesaian insiden P2 (jam)', 4, [6, 7, 5, 4], 'lower', 'angka'],
    ['kpi', 'Kepuasan pelanggan (%)', 90, [82, 85, 80, 91], 'higher', 'persen'],
  ];
  for (const [metricType, name, target, actuals, direction, valueType] of PERF) {
    for (const [i, userId] of team.entries()) {
      const actual = actuals[i];
      const met = direction === 'lower' ? actual <= target : actual >= target;
      await findOrInsert(c, 'lna_performance_records', { tenant_id: t, user_id: userId, metric_type: metricType, name, period: '2026-11' },
        { project_id: projectId, target, actual, is_met: met, direction, value_type: valueType, source: 'seed' });
    }
  }

  // ---------- Career & Promotion (gap B3): syarat = lulus program jenjang berikutnya + OKR >= 80% ----------
  // Learner Demo (Junior -> Senior, OKR 100%) sudah direkomendasikan atasan: HR melihat Setujui/Tunda.
  // Budi (Probation -> Junior, OKR 80%) memenuhi syarat tanpa keputusan: atasan melihat Rekomendasikan, HR "Menunggu atasan".
  // Rina (OKR 57%) tetap "Belum memenuhi syarat".
  for (const [userId, tiers] of [[learner.id, ['basic', 'intermediate']], [budi, ['basic']]]) {
    for (const tier of tiers) {
      await c.query(`INSERT INTO lna_program_completions (tenant_id, user_id, program_tier, status, passed_at, recorded_by)
                     VALUES ($1, $2, $3, 'passed', '2026-11-05', $4) ON CONFLICT (tenant_id, user_id, program_tier) DO NOTHING`, [t, userId, tier, hrId]);
    }
  }
  // Siklus Junior -> Senior lewat store (aturan C6 + baris audit). Bila HR sudah memutuskan saat gladi, siklus terbuka baru
  // dibuat lagi (kecuali sudah disetujui: store menolak), jadi tombol Setujui kembali setelah seed diulang.
  const { rows: [{ career_level_id: learnerLevel }] } = await c.query('SELECT career_level_id FROM users WHERE tenant_id = $1 AND id = $2', [t, learner.id]);
  const { rows: openCycle } = await c.query(`SELECT 1 FROM lna_promotion_decisions WHERE tenant_id = $1 AND user_id = $2 AND to_level_id = $3 AND hr_decision IS NULL`,
    [t, learner.id, levelIds[2]]);
  if (learnerLevel === levelIds[1] && !openCycle.length) {
    await stores.promotion.supervisorDecide(t, {
      userId: learner.id, fromLevelId: levelIds[1], toLevelId: levelIds[2], okrAchievement: 100, decision: 'recommend', by: spvId,
      note: 'Konsisten menyelesaikan insiden P2 dalam SLA dan sudah lulus program Intermediate.',
    }, { event: 'supervisor_decision', decision: 'recommend', employeeId: learner.id, fromLevelId: levelIds[1], toLevelId: levelIds[2], decidedByName: 'Atasan Demo', role: 'supervisor', source: 'seed' });
  }

  // ---------- Sesi wawancara akar masalah (TNA) ----------
  const session = (userId, status, extra = {}) => findOrInsert(c, 'lna_interview_sessions',
    { tenant_id: t, project_id: projectId, submodule: 'tna', interviewee_id: userId, focus_kind: 'competency', focus_competency_id: comp['Analisis insiden'] },
    { job_role_id: jobRoleId, status, mode: 'text', language: 'id', assigned_by: hrId, duration_minutes: 30, focus_label: 'Analisis insiden', ...extra });
  const done = { started_at: '2026-11-18T03:00:00Z', ended_at: '2026-11-18T03:25:00Z', consent_at: '2026-11-18T03:00:00Z', consent_version: 'tna-consent-id-v1.0' };
  const sDimas = await session(dimas, 'completed', done);
  const sRina = await session(rina, 'completed', done);
  const sBudi = await session(budi, 'completed', done);
  // Job analisis selesai per sesi: temuan "hasil AI" (dasar angka kesepakatan AI–HR dan lama analisis di dashboard)
  const jobs = {};
  for (const sid of [sDimas, sRina, sBudi]) {
    jobs[sid] = await findOrInsert(c, 'lna_analysis_jobs', { tenant_id: t, session_id: sid, submodule: 'tna' },
      { status: 'done', attempts: 1, started_at: '2026-11-18T03:26:00Z', finished_at: '2026-11-18T03:27:00Z', result: JSON.stringify({ provider: 'seed' }) });
  }
  // Undangan terbuka: karyawan demo ("Mulai wawancara" di Hasil saya) dan atasan ("Wawancara untuk Anda")
  await session(learner.id, 'scheduled', { invite_expires_at: new Date(Date.now() + 7 * DAY) });
  await session(spvId, 'scheduled', { invite_expires_at: new Date(Date.now() + 7 * DAY) });

  // ---------- Temuan AI (baris seed) di tinjauan HR: 4 menunggu, 3 sudah direview ----------
  const FINDINGS = [
    [sDimas, dimas, 'training', 'Belum menguasai teknik 5 Whys untuk analisis insiden', 'Dimas menghentikan analisis di gejala pertama tanpa menelusuri akar masalah.', null],
    [sDimas, dimas, 'non_training', 'SOP eskalasi insiden P2 belum diperbarui', 'Langkah eskalasi di SOP masih merujuk tim lama sehingga insiden tertahan.', null],
    [sBudi, budi, 'training', 'Belum terbiasa menulis laporan pasca-insiden', 'Laporan pasca-insiden belum memuat linimasa dan tindakan pencegahan.', null],
    [sBudi, budi, 'non_training', 'Akses dasbor pemantauan terbatas', 'Akun L1 belum punya akses baca dasbor pemantauan sehingga data insiden terlambat.', null],
    [sRina, rina, 'training', 'Perlu pendalaman ITIL Incident Management', 'Rina memahami alur dasar tetapi belum membedakan insiden dan problem.', 'approved'],
    [sRina, rina, 'training', 'Analisis tren insiden berulang belum dilakukan', 'Insiden berulang ditangani satu per satu tanpa melihat polanya.', 'edited'],
    [sRina, rina, 'non_training', 'Beban tiket malam terlalu tinggi', 'Tiket malam menumpuk pada dua orang; disetujui HR untuk dibahas bersama penjadwalan.', 'approved'],
  ];
  const findingIds = {}; const draftFindingIds = []; const reviewedFindingIds = [];
  for (const [i, [sessionId, userId, category, title, detail, decision]] of FINDINGS.entries()) {
    const seq = i + 1;
    let id = (await c.query('SELECT id FROM lna_findings WHERE tenant_id = $1 AND session_id = $2 AND finding_seq = $3', [t, sessionId, seq])).rows[0]?.id;
    if (!id) {
      // Satu INSERT (kunci idempoten finding_seq ikut tersimpan), judul/detail terenkripsi seperti stores.tna.insertFinding
      ({ rows: [{ id }] } = await c.query(
        `INSERT INTO lna_findings (tenant_id, project_id, user_id, competency_id, session_id, category, title, detail, gap_score, review_status,
                                   finding_seq, confidence, analysis_job_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 'draft', $9, 0.86, $10) RETURNING id`,
        [t, projectId, userId, comp['Analisis insiden'], sessionId, category, await enc(title), await enc(detail), seq, jobs[sessionId]]));
    }
    const { rows: [state] } = await c.query('SELECT review_status FROM lna_findings WHERE id = $1', [id]);
    // Putusan HR lewat store (diulang aman: hanya temuan yang masih draf, jadi run yang terputus dilanjutkan)
    if (decision && state.review_status === 'draft') {
      await stores.tna.reviewFinding(t, id, { decision, reviewerId: hrId, title: decision === 'edited' ? `${title} (disunting HR)` : null });
      await c.query('UPDATE lna_findings SET scoring_agreement = $3 WHERE tenant_id = $1 AND id = $2', [t, id, decision === 'approved']);
    }
    findingIds[title] = id;
    (decision ? reviewedFindingIds : draftFindingIds).push(id);
  }

  // ---------- Rencana belajar: dari temuan yang disetujui HR, dan satu untuk karyawan demo ----------
  await findOrInsert(c, 'lna_training_plan_items', { tenant_id: t, user_id: rina, finding_id: findingIds['Perlu pendalaman ITIL Incident Management'] },
    { origin: 'ai', program_tier: 'intermediate', status: 'in_progress', catalog_source: 'elitementor', catalog_item_ref: 'SD-I1', catalog_item_title: 'ITIL Foundation' });
  await findOrInsert(c, 'lna_training_plan_items', { tenant_id: t, user_id: learner.id, catalog_item_ref: 'SD-B1' },
    { origin: 'hr', program_tier: 'basic', status: 'new', catalog_source: 'elitementor', catalog_item_title: 'Root Cause Analysis untuk gap Analisis insiden' });

  // ---------- Improvement Needs: tindakan perbaikan + akses atasan ----------
  // Kunci idempoten = temuan asal (finding_id), bukan judul yang terenkripsi
  const inaActionIds = [];
  for (const [finding, title, detail, values] of [
    ['SOP eskalasi insiden P2 belum diperbarui', 'Perbarui SOP eskalasi insiden', 'Sesuaikan matriks eskalasi P1/P2 dengan struktur tim terbaru dan sosialisasikan ke L1.',
      { category: 'sop', owner_user_id: spvId, competency_id: comp['Analisis insiden'], due_date: isoDate(14), status: 'in_progress' }],
    ['Akses dasbor pemantauan terbatas', 'Buka akses baca dasbor pemantauan untuk L1', 'Ajukan akses baca dasbor pemantauan untuk seluruh akun L1.',
      { category: 'alat', owner_user_id: dimas, due_date: isoDate(7), status: 'new' }],
  ]) {
    const key = { tenant_id: t, finding_id: findingIds[finding] };
    const { rows: [found] } = await c.query('SELECT id FROM ina_actions WHERE tenant_id = $1 AND finding_id = $2', [t, key.finding_id]);
    inaActionIds.push(found ? found.id : await findOrInsert(c, 'ina_actions', key, { title: await enc(title), detail: await enc(detail), created_by: hrId, ...values }));
  }
  await findOrInsert(c, 'lna_non_training_grants', { tenant_id: t, supervisor_id: spvId, revoked_at: null }, { granted_by: hrId });
  // Kepala Divisi (pimpinan@, peran supervisor sejak PR #60) juga diberi akses tindakan perbaikan oleh HR, supaya menu
  // Improvement Needs di tampilan Atasan terbuka seperti untuk Atasan Demo
  if (headId) await findOrInsert(c, 'lna_non_training_grants', { tenant_id: t, supervisor_id: headId, revoked_at: null }, { granted_by: hrId });

  // ---------- Library, Program & Course, Permintaan, draf modul ----------
  const MODULES = [
    ['SD-B1', 'Root Cause Analysis', 'basic', 'Insiden', 'Peserta mampu menelusuri akar masalah insiden dengan 5 Whys dan diagram tulang ikan.'],
    ['SD-I1', 'ITIL Foundation', 'intermediate', 'Proses layanan', 'Peserta memahami siklus layanan ITIL 4 dan praktik Incident & Problem Management.'],
    ['SD-B2', 'Penulisan laporan pasca-insiden', 'basic', 'Insiden', 'Peserta mampu menulis laporan pasca-insiden yang lengkap dan dapat ditindaklanjuti.'],
    // Gap B6: course Advanced belum diminta. Rumpun "Specific Technical" = rekomendasi Kembangkan (settings li.devStreams),
    // rumpun lain = Minta ke vendor.
    ['SD-A1', 'Otomasi infrastruktur dengan IaC', 'advanced', 'Specific Technical', 'Peserta mampu mengotomasi pemulihan layanan dengan skrip infrastruktur sebagai kode.', 'Otomasi infrastruktur'],
    ['SD-A2', 'Manajemen problem dan analisis tren', 'advanced', 'Proses layanan', 'Peserta mampu menemukan pola insiden berulang dan menutupnya lewat manajemen problem.'],
  ];
  const mod = {};
  for (const [code, name, level, stream, objective, competency = 'Analisis insiden'] of MODULES) {
    mod[name] = await findOrInsert(c, 'li_modules', { tenant_id: t, code }, { name, level, stream, objective });
    await link(c, 'li_module_job_roles', { tenant_id: t, module_id: mod[name], job_role_id: jobRoleId });
    await link(c, 'li_module_competencies', { tenant_id: t, module_id: mod[name], competency_id: comp[competency] });
    for (const [pos, [kind, text]] of [['K', `Konsep dasar ${name}`], ['S', `Menerapkan ${name} pada kasus nyata`], ['A', 'Teliti dan terbuka pada umpan balik']].entries()) {
      await findOrInsert(c, 'li_module_items', { tenant_id: t, module_id: mod[name], kind, position: pos + 1 }, { text });
    }
  }
  await findOrInsert(c, 'li_module_requests', { tenant_id: t, module_id: mod['ITIL Foundation'] },
    { vendor_name: 'Mahaka Institute', status: 'requested', note: 'Untuk 4 peserta Service Delivery L1', requested_by: hrId });
  // Draf SD-B1 (gap B1): bentuk sama dengan POST /li/modules/:id/draft (generateDraft dari butir KSA), bukan daftar string.
  // Draf lama berbentuk string (seed sebelum 25 Nov) diganti di tempat agar layar draf tidak galat.
  const rcaItems = (await c.query('SELECT kind, text FROM li_module_items WHERE tenant_id = $1 AND module_id = $2 ORDER BY position', [t, mod['Root Cause Analysis']])).rows;
  const rcaDraft = Object.fromEntries(Object.entries(generateDraft({ name: 'Root Cause Analysis', items: rcaItems })).map(([k, v]) => [k, JSON.stringify(v)]));
  const draftId = await findOrInsert(c, 'li_module_drafts', { tenant_id: t, module_id: mod['Root Cause Analysis'] },
    { status: 'draft', generated_by: 'template', created_by: hrId, ...rcaDraft });
  await c.query(`UPDATE li_module_drafts SET objectives = $3::jsonb, sessions = $4::jsonb, assessments = $5::jsonb
                  WHERE tenant_id = $1 AND id = $2 AND jsonb_typeof(objectives -> 0) = 'string'`,
  [t, draftId, rcaDraft.objectives, rcaDraft.sessions, rcaDraft.assessments]);

  // ---------- Learning Delivery ----------
  const training = (title, values) => findOrInsert(c, 'ld_trainings', { tenant_id: t, title }, { created_by: hrId, ...values });
  const ldItil = await training('ITIL Foundation', { mode: 'online', source: 'elitementor', module_id: mod['ITIL Foundation'], program_tier: 'intermediate',
    starts_on: isoDate(-10), ends_on: isoDate(20), session_count: 6, sessions_done: 2, status: 'running', materials_ready: true, assessment_mode: 'elitementor' });
  const ldRca = await training('Root Cause Analysis', { mode: 'online', source: 'manual', module_id: mod['Root Cause Analysis'], program_tier: 'basic',
    starts_on: isoDate(10), ends_on: isoDate(12), session_count: 2, sessions_done: 0, status: 'scheduled', materials_ready: false, assessment_mode: 'none' });
  await training('Workshop eskalasi insiden', { mode: 'offline', source: 'manual', program_tier: 'basic', vendor_name: 'Mahaka Institute',
    venue: 'Ruang Rapat Lt. 5', starts_on: isoDate(5), ends_on: isoDate(5), session_count: 1, sessions_done: 0, status: 'scheduled', assessment_mode: 'vendor_manual' });
  for (const [i, userId] of team.entries()) {
    await findOrInsert(c, 'ld_participants', { tenant_id: t, training_id: ldItil, user_id: userId },
      { progress_pct: [40, 65, 20, 50][i], status: 'in_progress', last_activity_at: new Date(Date.now() - (i + 1) * DAY) });
    await findOrInsert(c, 'ld_participants', { tenant_id: t, training_id: ldRca, user_id: userId }, { progress_pct: 0, status: 'enrolled' });
  }
  // Gap B8 (aturan ld/domain.js buildInsights): Budi tidak aktif > 14 hari di ITIL -> saran "Kirim pengingat".
  await c.query(`UPDATE ld_participants SET last_activity_at = now() - interval '16 days'
                  WHERE tenant_id = $1 AND training_id = $2 AND user_id = $3 AND status = 'in_progress'`, [t, ldItil, budi]);
  // Online berjalan sesuai jadwal, tanpa peserta tidak aktif, Rina hampir selesai (>= 75%) -> "Kirim ajakan" (C6, thread aksi LD).
  const ldKom = await training('Komunikasi insiden ke pelanggan', { mode: 'online', source: 'elitementor', program_tier: 'basic',
    starts_on: isoDate(-6), ends_on: isoDate(24), session_count: 4, sessions_done: 1, status: 'running', materials_ready: true, assessment_mode: 'elitementor' });
  for (const [i, userId] of team.entries()) {
    const done = i === 0;
    await findOrInsert(c, 'ld_participants', { tenant_id: t, training_id: ldKom, user_id: userId }, {
      progress_pct: [100, 80, 30, 25][i], status: done ? 'completed' : 'in_progress', completed_at: done ? new Date(Date.now() - DAY) : null });
  }
  await c.query(`UPDATE ld_participants SET last_activity_at = now() - interval '1 day' WHERE tenant_id = $1 AND training_id = $2`, [t, ldKom]);
  // Offline akan datang (<= 14 hari) dengan peserta, kehadiran belum dicatat -> "Minta konfirmasi" (C6).
  const ldRca2 = await training('Root Cause Analysis (angkatan 2)', { mode: 'offline', source: 'manual', module_id: mod['Root Cause Analysis'],
    program_tier: 'basic', vendor_name: 'Mahaka Institute', venue: 'Ruang Rapat Lt. 5', starts_on: isoDate(12), ends_on: isoDate(13),
    session_count: 2, sessions_done: 0, status: 'scheduled', materials_ready: true, assessment_mode: 'vendor_manual' });
  for (const userId of team) {
    await findOrInsert(c, 'ld_participants', { tenant_id: t, training_id: ldRca2, user_id: userId }, { progress_pct: 0, status: 'enrolled' });
  }
  // Akan datang dari EliteMentor (bukan manual) dengan peserta -> "Lihat program" di tab Akan datang (C6).
  const ldItil2 = await training('ITIL Foundation (angkatan 2)', { mode: 'online', source: 'elitementor', module_id: mod['ITIL Foundation'],
    program_tier: 'intermediate', starts_on: isoDate(7), ends_on: isoDate(37), session_count: 6, sessions_done: 0, status: 'scheduled',
    materials_ready: true, assessment_mode: 'elitementor' });
  for (const userId of [dimas, budi]) {
    await findOrInsert(c, 'ld_participants', { tenant_id: t, training_id: ldItil2, user_id: userId }, { progress_pct: 0, status: 'enrolled' });
  }
  // Angkatan RCA yang sudah selesai di dalam periode rencana LIM (mulai 1 Nov): skor post dari LD membuat tim masuk
  // antrean tab Pengukuran AI, sehingga hasil wawancara ulang Dimas bisa dibuka dari "Lihat hasil" (gladi demo 25 Nov).
  const ldRcaDone = await training('Root Cause Analysis (angkatan 1)', { mode: 'offline', source: 'manual', module_id: mod['Root Cause Analysis'],
    program_tier: 'basic', vendor_name: 'Mahaka Institute', venue: 'Ruang Rapat Lt. 5', starts_on: '2026-11-03', ends_on: '2026-11-04',
    session_count: 2, sessions_done: 2, status: 'done', materials_ready: true, assessment_mode: 'vendor_manual' });
  for (const [i, userId] of team.entries()) {
    await findOrInsert(c, 'ld_participants', { tenant_id: t, training_id: ldRcaDone, user_id: userId }, {
      progress_pct: 100, status: 'completed', attendance: true, score: [60, 75, 50, 70][i], score_source: 'vendor_manual',
      completed_at: new Date('2026-11-04T09:00:00Z'),
    });
  }

  // ---------- Learning Impact Measurement ----------
  const planId = await findOrInsert(c, 'lim_plans', { tenant_id: t, title: 'Pilot L1: percepatan penyelesaian insiden' }, {
    job_role_id: jobRoleId, period_from: '2026-11-01', period_until: '2027-01-31', status: 'active', created_by: hrId, updated_by: hrId,
    business_problem: 'Insiden P2 rata-rata selesai 6 jam, melewati SLA 4 jam.', desired_behavior: 'L1 menelusuri akar masalah sebelum eskalasi.',
    priority_capabilities: 'Analisis insiden', evidence_plan: 'Bandingkan skor sebelum/sesudah dan waktu penyelesaian P2.',
    existing_metrics: 'Waktu penyelesaian insiden P2', baseline_label: 'Sebelum pelatihan', after_label: 'Sesudah pelatihan',
  });
  await link(c, 'lim_plan_modules', { tenant_id: t, plan_id: planId, module_id: mod['Root Cause Analysis'] });
  await findOrInsert(c, 'lim_indicators', { tenant_id: t, plan_id: planId, name: 'Waktu penyelesaian insiden P2 (jam)' },
    { level: 'business', source: 'ITSM', unit: 'jam', direction: 'lower_better', baseline: 6, current: 5, target: 4, strength: 'strong', position: 1 });
  await findOrInsert(c, 'lim_indicators', { tenant_id: t, plan_id: planId, name: 'Kepatuhan langkah eskalasi (%)' },
    { level: 'performance', source: 'Audit tiket', unit: '%', direction: 'higher_better', baseline: 70, current: 82, target: 90, strength: 'moderate', position: 2 });
  for (const [i, userId] of team.entries()) {
    await findOrInsert(c, 'lim_measurements', { tenant_id: t, plan_id: planId, user_id: userId, competency_id: comp['Analisis insiden'] },
      { pre_score: [25, 50, 25, 50][i], pre_source: 'dna', post_score: [60, 75, 50, 70][i], post_source: 'manual', performance_score: [65, 80, 55, 70][i],
        performance_source: 'manual', reinterview_status: 'none', updated_by: hrId });
  }

  // Wawancara ulang LIM (B15 tahap 3): Dimas sudah selesai (hasil stub, bukan LLM) untuk jalur HR "Lihat hasil";
  // karyawan demo punya jadwal terbuka untuk menu "Wawancara ulang".
  await c.query(`UPDATE lim_measurements SET reinterview_status = 'scheduled', reinterview_on = $4
                  WHERE tenant_id = $1 AND plan_id = $2 AND user_id = $3 AND reinterview_status = 'none'`, [t, planId, learner.id, isoDate(3)]);
  // Rina juga terjadwal dan belum mulai: HR bisa menekan "Mulai sekarang" (C6) tanpa memakai undangan Learner Demo
  await c.query(`UPDATE lim_measurements SET reinterview_status = 'scheduled', reinterview_on = $4
                  WHERE tenant_id = $1 AND plan_id = $2 AND user_id = $3 AND reinterview_status = 'none'`, [t, planId, rina, isoDate(5)]);
  if (!(await stores.lim.completedReinterviews(t, dimas, { planId })).length) {
    await c.query(`UPDATE lim_measurements SET reinterview_status = 'scheduled', reinterview_on = $4
                    WHERE tenant_id = $1 AND plan_id = $2 AND user_id = $3 AND reinterview_status <> 'done'`, [t, planId, dimas, isoDate(-2)]);
    const ri = (await stores.lim.startReinterview(t, { planId, userId: dimas, consentVersion: 'lim-consent-id-v1.0', competencyIds: [comp['Analisis insiden']] }))
      || (await stores.lim.currentReinterview(t, planId, dimas));
    const scores = [{ competencyId: comp['Analisis insiden'], score: 72 }];
    await stores.lim.completeReinterview(t, ri.id, { scores, summary: { provider: 'seed', competencies: scores.map((x) => ({ ...x,
      reason: 'Contoh hasil (seed): Dimas menelusuri akar masalah dengan 5 Whys dan menyebut tindakan pencegahan.' })) } });
  }

  // ---------- Core Competencies: visi, misi, nilai, persyaratan, penugasan wawancara ----------
  const source = (kind, title, text, position) => findOrInsert(c, 'cca_sources', { tenant_id: t, kind, title },
    { text, position, status: 'active', source_ref: 'Profil perusahaan 2026', created_by: hrId });
  const vision = await source('vision', 'Visi', 'Menjadi pemimpin layanan cloud.', 1);
  const mission = await source('mission', 'Misi', 'Memberikan layanan cloud yang andal, aman, dan cepat dipulihkan bagi pelanggan.', 2);
  const valCust = await source('value', 'Fokus pelanggan', 'Setiap keputusan dimulai dari dampaknya bagi pelanggan.', 3);
  const valIntegrity = await source('value', 'Integritas', 'Jujur melaporkan insiden dan akar masalahnya.', 4);
  const requirement = (sourceId, name, values) => findOrInsert(c, 'cca_requirements', { tenant_id: t, source_id: sourceId, name },
    { actual_source: 'manual', origin: 'hr', status: 'validated', validated_by: hrId, ...values });
  await requirement(vision, 'Keandalan layanan cloud', { definition: 'Memahami praktik yang menjaga ketersediaan layanan.', target_score: 80, actual_score: 64 });
  await requirement(valCust, 'Empati pelanggan saat insiden', { definition: 'Mengomunikasikan dampak dan perkiraan pemulihan kepada pelanggan.', target_score: 85, actual_score: 72 });
  // Gap B7: persyaratan Misi dan indikator nilai Integritas (layar CC tidak lagi kosong di dua kelompok ini)
  await requirement(mission, 'Keandalan pemulihan layanan', { definition: 'Memulihkan layanan sesuai SLA dan mencegah insiden berulang.', target_score: 80, actual_score: 70 });
  await requirement(valIntegrity, 'Melaporkan insiden apa adanya', { definition: 'Mencatat linimasa dan akar masalah insiden tanpa menutupi kesalahan.', target_score: 85, actual_score: 78 });

  // Penugasan wawancara berjenjang. Atasan Demo sudah selesai sebagai pimpinan; Kepala Divisi Demo (pimpinan) belum
  // ditugaskan HR (gap B4: Tugaskan / Tugaskan semua). Tim atasan: Dimas selesai, Rina belum mulai, Budi belum ditugaskan (gap B5).
  const leader = await findOrInsert(c, 'cca_assignments', { tenant_id: t, assignee_id: spvId, tier: 'leader' },
    { assigned_by: hrId, due_date: isoDate(7), duration_minutes: 15, status: 'completed', completed_at: '2026-11-20T04:00:00Z',
      summary: await enc('Atasan menekankan keandalan dan komunikasi saat insiden.') });
  for (const userId of team.filter((u) => u !== budi)) {
    await findOrInsert(c, 'cca_assignments', { tenant_id: t, assignee_id: userId, tier: 'employee' },
      { assigned_by: spvId, parent_id: leader, due_date: isoDate(7), duration_minutes: 15, status: userId === dimas ? 'completed' : 'assigned',
        completed_at: userId === dimas ? '2026-11-21T04:00:00Z' : null });
  }
  // Seed sebelum 25 Nov menugaskan Budi; penugasan seed yang belum dimulai itu dibatalkan (bukan dihapus) supaya tombol Tugaskan tampil
  await c.query(`UPDATE cca_assignments SET status = 'cancelled', updated_at = now()
                  WHERE tenant_id = $1 AND assignee_id = $2 AND tier = 'employee' AND status = 'assigned'
                    AND parent_id = $3 AND assigned_by = $4 AND session_id IS NULL AND created_at < '2026-11-25'`, [t, budi, leader, spvId]);

  // Program nilai korporasi (gap B7): hasil per karyawan, satu belum menyelesaikan semua kegiatan
  // ("Wawancarai karyawan yang belum selesai"). Bentuk config sama dengan validateProgramConfig.
  const PROGRAM_CONFIG = {
      values: [{ name: 'Fokus pelanggan' }, { name: 'Integritas' }],
      components: [{ name: 'Kuis', weight: 40 }, { name: 'Asesmen akhir', weight: 60 }],
      totalActivities: 6, passScore: 70,
      bands: [{ key: 'strong', label: 'Strong Culture Alignment', min: 85, description: 'Skor akhir 85 atau lebih' },
        { key: 'baseline', label: 'Baseline Implementation', min: 70, description: null }],
    };
  if (validateProgramConfig(PROGRAM_CONFIG).error) throw new Error(`seed-demo-data: config program nilai tidak valid: ${validateProgramConfig(PROGRAM_CONFIG).error}`);
  const programId = await findOrInsert(c, 'cca_programs', { tenant_id: t, key: 'nilai-2026' }, {
    name: 'Program Nilai Perusahaan 2026', provider: 'Tim Budaya Perusahaan', cutoff_date: '2026-11-15', updated_by: hrId,
    config: JSON.stringify(PROGRAM_CONFIG),
    insight: 'Skor Integritas tertahan pada kuis studi kasus pelaporan insiden.',
    recommendations: JSON.stringify([{ title: 'Selesaikan kegiatan yang tertinggal', detail: 'Ajak karyawan yang belum selesai menuntaskan kuis sebelum cut off berikutnya.' }]),
  });
  for (const [i, userId] of team.entries()) {
    const done = i !== 2; // Budi belum selesai
    await findOrInsert(c, 'cca_program_results', { tenant_id: t, program_id: programId, user_id: userId }, {
      division: 'Service Delivery', activities_done: done ? 6 : 3, final_score: done ? [88, 74, null, 80][i] : null,
      value_scores: JSON.stringify(done ? [[90, 86], [78, 70], null, [84, 76]][i] : [70, null]),
      component_scores: JSON.stringify(done ? [[85, 90], [70, 77], null, [78, 81]][i] : [60, null]),
    });
  }

  return { projectId, learnerId: learner.id, planId, competencyIds: comp, findingIds, draftFindingIds, reviewedFindingIds, inaActionIds };
}

module.exports = { seedDemoData, findOrInsert };
