'use strict';
// Store Postgres untuk B14 Learning Delivery. Setiap query memfilter tenant_id; rujukan (karyawan, modul, jabatan)
// selalu dicek milik tenant yang sama di SQL-nya. Kehadiran dan skor adalah data individu: audit dilakukan di router.
const { QueryTypes } = require('sequelize');

const TRAINING_COLS = `t.id, t.title, t.mode, t.source, t.external_ref AS "externalRef", t.catalog_item_id AS "catalogItemId",
  t.module_id AS "moduleId", t.program_tier AS "programTier", t.vendor_name AS "vendorName", t.venue,
  to_char(t.starts_on, 'YYYY-MM-DD') AS "startsOn", to_char(t.ends_on, 'YYYY-MM-DD') AS "endsOn",
  t.session_count AS "sessionCount", t.sessions_done AS "sessionsDone", t.status, t.materials_ready AS "materialsReady",
  t.assessment_mode AS "assessmentMode", t.assessment_ref AS "assessmentRef", t.last_reminded_at AS "lastRemindedAt",
  t.created_at AS "createdAt", t.updated_at AS "updatedAt"`;
const PATCH_COLS = {
  title: 'title', vendorName: 'vendor_name', venue: 'venue', startsOn: 'starts_on', endsOn: 'ends_on', sessionCount: 'session_count',
  sessionsDone: 'sessions_done', status: 'status', materialsReady: 'materials_ready', moduleId: 'module_id', programTier: 'program_tier',
  assessmentMode: 'assessment_mode', assessmentRef: 'assessment_ref',
};

function createLdStores(sequelize) {
  const select = (sql, replacements = {}, transaction) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
  const one = async (sql, replacements, transaction) => (await select(sql, replacements, transaction))[0] || null;
  const write = async (sql, replacements, transaction) => {
    const [rows] = await sequelize.query(sql, { replacements, transaction });
    return rows;
  };
  const tx = async (fn) => {
    const t = await sequelize.transaction();
    try { const out = await fn(t); await t.commit(); return out; } catch (e) { await t.rollback(); throw e; }
  };

  const ld = {
    /**
     * Course LMS hasil impor katalog (PK-18) dijadikan pelatihan online yang dipantau: satu ld_trainings per course
     * aktif yang punya status peserta, dan ld_participants disalin dari lna_catalog_completions. Idempoten; dipanggil
     * sebelum membaca daftar. Course dari sumber 'elitementor' dilewati (datang lewat webhook).
     */
    async syncFromCatalog(tenantId) {
      await write(
        `INSERT INTO ld_trainings (tenant_id, title, mode, source, external_ref, catalog_item_id, module_id, program_tier, status)
         SELECT ci.tenant_id, ci.title, 'online', 'lms', ci.external_ref, ci.id,
                (SELECT m.id FROM li_modules m WHERE m.tenant_id = ci.tenant_id AND m.catalog_item_id = ci.id ORDER BY m.code LIMIT 1),
                ci.program_tier, 'running'
           FROM lna_catalog_items ci
          WHERE ci.tenant_id = :tenantId AND ci.active AND ci.source <> 'elitementor'
            AND EXISTS (SELECT 1 FROM lna_catalog_completions cc WHERE cc.catalog_item_id = ci.id AND cc.tenant_id = ci.tenant_id)
         ON CONFLICT (tenant_id, source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING`, { tenantId });
      await write(
        `INSERT INTO ld_participants (tenant_id, training_id, user_id, progress_pct, status, score, score_source, completed_at)
         SELECT cc.tenant_id, t.id, cc.user_id, CASE WHEN cc.status = 'passed' THEN 100 END,
                CASE cc.status WHEN 'passed' THEN 'completed' WHEN 'failed' THEN 'failed' ELSE 'in_progress' END,
                CASE WHEN cc.score BETWEEN 0 AND 100 THEN cc.score END, CASE WHEN cc.score BETWEEN 0 AND 100 THEN 'lms' END, cc.completed_at
           FROM lna_catalog_completions cc
           JOIN ld_trainings t ON t.tenant_id = cc.tenant_id AND t.catalog_item_id = cc.catalog_item_id AND t.source = 'lms'
          WHERE cc.tenant_id = :tenantId
         ON CONFLICT (training_id, user_id) DO UPDATE
           SET progress_pct = EXCLUDED.progress_pct, status = EXCLUDED.status, score = EXCLUDED.score, score_source = EXCLUDED.score_source,
               completed_at = EXCLUDED.completed_at, updated_at = now()
         WHERE (ld_participants.status, ld_participants.score, ld_participants.completed_at)
               IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.score, EXCLUDED.completed_at)`, { tenantId });
    },

    /** Pelatihan + hitungan peserta (bahan domain.decorate). inactiveBefore: batas "tidak aktif". */
    async listTrainings(tenantId, { id, inactiveBefore } = {}) {
      const rep = { tenantId, inactiveBefore: inactiveBefore || new Date(0) };
      let sql = `SELECT ${TRAINING_COLS}, m.code AS "moduleCode", m.name AS "moduleName",
          COALESCE(p.participants, 0)::int AS participants, COALESCE(p.completed, 0)::int AS completed,
          COALESCE(p.avg_progress, 0)::float AS "avgProgress", COALESCE(p.attendance_recorded, 0)::int AS "attendanceRecorded",
          COALESCE(p.present, 0)::int AS present, COALESCE(p.scored, 0)::int AS scored, COALESCE(p.scored_present, 0)::int AS "scoredPresent", COALESCE(p.inactive, 0)::int AS inactive,
          (SELECT count(*)::int FROM ld_documents d WHERE d.training_id = t.id AND d.tenant_id = t.tenant_id AND d.kind IN ('photo','video')) AS "photoDocs",
          (SELECT count(*)::int FROM ld_documents d WHERE d.training_id = t.id AND d.tenant_id = t.tenant_id AND d.kind = 'material') AS "materialDocs"
        FROM ld_trainings t
        LEFT JOIN li_modules m ON m.id = t.module_id AND m.tenant_id = t.tenant_id
        LEFT JOIN LATERAL (
          SELECT count(*) AS participants,
                 count(*) FILTER (WHERE lp.status = 'completed') AS completed,
                 avg(COALESCE(lp.progress_pct, CASE WHEN lp.status = 'completed' THEN 100 ELSE 0 END)) AS avg_progress,
                 count(*) FILTER (WHERE lp.attendance IS NOT NULL) AS attendance_recorded,
                 count(*) FILTER (WHERE lp.attendance) AS present,
                 count(*) FILTER (WHERE lp.score IS NOT NULL AND (lp.attendance IS NOT FALSE)) AS scored,
                 count(*) FILTER (WHERE lp.score IS NOT NULL AND lp.attendance) AS scored_present,
                 count(*) FILTER (WHERE lp.status IN ('enrolled','in_progress') AND lp.last_activity_at IS NOT NULL AND lp.last_activity_at < :inactiveBefore) AS inactive
            FROM ld_participants lp WHERE lp.training_id = t.id AND lp.tenant_id = t.tenant_id
        ) p ON true
        WHERE t.tenant_id = :tenantId`;
      if (id) { sql += ' AND t.id = :id'; rep.id = id; }
      return select(`${sql} ORDER BY t.starts_on NULLS LAST, t.title`, rep);
    },
    async getTraining(tenantId, id, opts = {}) {
      return (await ld.listTrainings(tenantId, { ...opts, id }))[0] || null;
    },
    /** Karyawan unik yang belum selesai di pelatihan yang masih terbuka. */
    async countActiveLearners(tenantId, trainingIds) {
      if (!trainingIds.length) return 0;
      const row = await one(`SELECT count(DISTINCT user_id)::int AS n FROM ld_participants
                              WHERE tenant_id = :tenantId AND training_id IN (:trainingIds) AND status IN ('enrolled','in_progress')`, { tenantId, trainingIds });
      return row.n;
    },
    async createTraining(tenantId, v) {
      const [row] = await write(
        `INSERT INTO ld_trainings (tenant_id, title, mode, source, vendor_name, venue, starts_on, ends_on, session_count, module_id, created_by)
         VALUES (:tenantId, :title, 'offline', 'manual', :vendorName, :venue, :startsOn, :endsOn, :sessionCount,
                 (SELECT m.id FROM li_modules m WHERE m.tenant_id = :tenantId AND m.id = :moduleId), :userId) RETURNING id`,
        { tenantId, title: v.title, vendorName: v.vendorName || null, venue: v.venue || null, startsOn: v.startsOn, endsOn: v.endsOn || v.startsOn,
          sessionCount: v.sessionCount || 1, moduleId: v.moduleId || null, userId: v.userId || null },
      );
      return ld.getTraining(tenantId, row.id);
    },
    async moduleExists(tenantId, id) {
      return !!(await one('SELECT 1 AS x FROM li_modules WHERE tenant_id = :tenantId AND id = :id', { tenantId, id }));
    },
    /** patch: kunci camelCase dari PATCH_COLS yang sudah divalidasi router. */
    async updateTraining(tenantId, id, patch) {
      const sets = []; const rep = { tenantId, id };
      for (const [k, col] of Object.entries(PATCH_COLS)) {
        if (patch[k] === undefined) continue;
        sets.push(`${col} = :${k}`); rep[k] = patch[k];
      }
      if (!sets.length) return ld.getTraining(tenantId, id);
      const rows = await write(`UPDATE ld_trainings SET ${sets.join(', ')}, updated_at = now() WHERE tenant_id = :tenantId AND id = :id RETURNING id`, rep);
      return rows.length ? ld.getTraining(tenantId, id) : null;
    },

    /** Pilihan untuk form peserta: jabatan (dengan jumlah karyawan) dan karyawan tenant yang tidak dinonaktifkan. */
    async participantOptions(tenantId) {
      const [jobRoles, employees] = await Promise.all([
        select(`SELECT jr.id, jr.name, count(u.id)::int AS people FROM lna_job_roles jr
                  LEFT JOIN users u ON u.job_role_id = jr.id AND u.tenant_id = jr.tenant_id AND u.status <> 'disabled'
                 WHERE jr.tenant_id = :tenantId GROUP BY jr.id, jr.name ORDER BY jr.name`, { tenantId }),
        select(`SELECT u.id, u.name, u.email, jr.name AS "jobRoleName" FROM users u
                  LEFT JOIN lna_job_roles jr ON jr.id = u.job_role_id AND jr.tenant_id = u.tenant_id
                 WHERE u.tenant_id = :tenantId AND u.status <> 'disabled' AND u.role <> 'eta_admin' ORDER BY u.name NULLS LAST, u.email`, { tenantId }),
      ]);
      return { jobRoles, employees };
    },

    // --- Peserta, kehadiran, skor ---
    async listParticipants(tenantId, trainingId) {
      return select(`SELECT lp.user_id AS "userId", u.name, u.email, u.employee_id AS "employeeId", jr.name AS "jobRoleName",
                            lp.progress_pct::float AS "progressPct", lp.status, lp.attendance, lp.attendance_at AS "attendanceAt",
                            lp.score::float AS score, lp.score_source AS "scoreSource", lp.last_activity_at AS "lastActivityAt", lp.completed_at AS "completedAt"
                       FROM ld_participants lp JOIN users u ON u.id = lp.user_id AND u.tenant_id = lp.tenant_id
                       LEFT JOIN lna_job_roles jr ON jr.id = u.job_role_id AND jr.tenant_id = u.tenant_id
                      WHERE lp.tenant_id = :tenantId AND lp.training_id = :trainingId ORDER BY u.name NULLS LAST, u.email`, { tenantId, trainingId });
    },
    /** Tambah peserta dari daftar id dan/atau satu jabatan; hanya karyawan tenant ini yang tidak dinonaktifkan. Return jumlah baru. */
    async addParticipants(tenantId, trainingId, { userIds = [], jobRoleId = null }) {
      const rows = await write(
        `INSERT INTO ld_participants (tenant_id, training_id, user_id)
         SELECT :tenantId, t.id, u.id FROM ld_trainings t JOIN users u ON u.tenant_id = t.tenant_id
          WHERE t.tenant_id = :tenantId AND t.id = :trainingId AND u.status <> 'disabled'
            AND (u.id IN (:userIds) OR (CAST(:jobRoleId AS uuid) IS NOT NULL AND u.job_role_id = :jobRoleId))
         ON CONFLICT (training_id, user_id) DO NOTHING RETURNING user_id`,
        { tenantId, trainingId, jobRoleId, userIds: userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'] },
      );
      return rows.length;
    },
    async removeParticipant(tenantId, trainingId, userId) {
      const rows = await write('DELETE FROM ld_participants WHERE tenant_id = :tenantId AND training_id = :trainingId AND user_id = :userId RETURNING id', { tenantId, trainingId, userId });
      return rows.length > 0;
    },
    /** entries: [{ userId, present: true|false|null }] atau all = true (semua hadir). Return jumlah baris berubah. */
    async setAttendance(tenantId, trainingId, { entries = [], all = false, byUserId }) {
      return tx(async (t) => {
        let changed = 0;
        if (all) {
          changed += (await write(`UPDATE ld_participants SET attendance = true, attendance_by = :by, attendance_at = now(), updated_at = now()
                                    WHERE tenant_id = :tenantId AND training_id = :trainingId AND attendance IS DISTINCT FROM true RETURNING id`,
          { tenantId, trainingId, by: byUserId || null }, t)).length;
        }
        for (const e of entries) {
          changed += (await write(`UPDATE ld_participants SET attendance = :present, attendance_by = :by, attendance_at = CASE WHEN CAST(:present AS boolean) IS NULL THEN NULL ELSE now() END, updated_at = now()
                                    WHERE tenant_id = :tenantId AND training_id = :trainingId AND user_id = :userId RETURNING id`,
          { tenantId, trainingId, userId: e.userId, present: e.present, by: byUserId || null }, t)).length;
        }
        return changed;
      });
    },
    /** entries: [{ userId, score|null }]; skor dari laporan vendor. */
    async setScores(tenantId, trainingId, entries) {
      return tx(async (t) => {
        let changed = 0;
        for (const e of entries) {
          changed += (await write(`UPDATE ld_participants SET score = :score, score_source = CASE WHEN CAST(:score AS numeric) IS NULL THEN NULL ELSE 'vendor_manual' END, updated_at = now()
                                    WHERE tenant_id = :tenantId AND training_id = :trainingId AND user_id = :userId RETURNING id`,
          { tenantId, trainingId, userId: e.userId, score: e.score }, t)).length;
        }
        return changed;
      });
    },

    // --- Dokumen ---
    async listDocuments(tenantId, trainingId) {
      return select(`SELECT d.id, d.kind, d.filename, d.mime, d.size_bytes AS "sizeBytes", d.created_at AS "createdAt", u.name AS "uploadedByName"
                       FROM ld_documents d LEFT JOIN users u ON u.id = d.uploaded_by AND u.tenant_id = d.tenant_id
                      WHERE d.tenant_id = :tenantId AND d.training_id = :trainingId ORDER BY d.created_at, d.id`, { tenantId, trainingId });
    },
    async getDocument(tenantId, id) {
      return one(`SELECT id, training_id AS "trainingId", kind, filename, mime, size_bytes AS "sizeBytes", storage_key AS "storageKey"
                    FROM ld_documents WHERE tenant_id = :tenantId AND id = :id`, { tenantId, id });
    },
    /**
     * Sisipkan dokumen. Baris pelatihan dikunci (FOR UPDATE) lalu jumlah dokumen dihitung, sehingga unggahan bersamaan
     * tidak melewati maxDocs. Return baris dokumen, { limitReached: true }, atau null (pelatihan tidak ada).
     */
    async insertDocument(tenantId, trainingId, d, { maxDocs = Infinity } = {}) {
      return tx(async (t) => {
        const training = await one('SELECT id FROM ld_trainings WHERE tenant_id = :tenantId AND id = :trainingId FOR UPDATE', { tenantId, trainingId }, t);
        if (!training) return null;
        const { n } = await one('SELECT count(*)::int AS n FROM ld_documents WHERE tenant_id = :tenantId AND training_id = :trainingId', { tenantId, trainingId }, t);
        if (n >= maxDocs) return { limitReached: true };
        const [row] = await write(
          `INSERT INTO ld_documents (tenant_id, training_id, kind, filename, mime, size_bytes, storage_key, uploaded_by)
           VALUES (:tenantId, :trainingId, :kind, :filename, :mime, :sizeBytes, :storageKey, :userId)
           RETURNING id, kind, filename, mime, size_bytes AS "sizeBytes", created_at AS "createdAt"`,
          { tenantId, trainingId, ...d, userId: d.userId || null }, t,
        );
        return row;
      });
    },
    async deleteDocument(tenantId, id) {
      const rows = await write('DELETE FROM ld_documents WHERE tenant_id = :tenantId AND id = :id RETURNING storage_key', { tenantId, id });
      return rows[0] ? rows[0].storage_key : null;
    },

    // --- Pengingat ---
    /** Klaim jatah pengingat (sekali per 24 jam) secara atomik. Return true bila boleh mengirim. */
    async claimReminder(tenantId, trainingId, since) {
      const rows = await write(`UPDATE ld_trainings SET last_reminded_at = now() WHERE tenant_id = :tenantId AND id = :trainingId
                                   AND (last_reminded_at IS NULL OR last_reminded_at < :since) RETURNING id`, { tenantId, trainingId, since });
      return rows.length > 0;
    },
    /** Lepas jatah pengingat bila tidak ada satu pun email yang terkirim, supaya HR bisa mencoba lagi. */
    async releaseReminder(tenantId, trainingId) {
      await write('UPDATE ld_trainings SET last_reminded_at = NULL WHERE tenant_id = :tenantId AND id = :trainingId', { tenantId, trainingId });
    },
    /** Kode asesmen dipakai pelatihan manual lain yang masih aktif (skor tidak akan bisa dicocokkan). */
    async assessmentRefTaken(tenantId, trainingId, ref) {
      return !!(await one(`SELECT 1 AS x FROM ld_trainings WHERE tenant_id = :tenantId AND id <> :trainingId AND source = 'manual'
                              AND assessment_mode = 'elitementor' AND assessment_ref = :ref AND status <> 'cancelled'`, { tenantId, trainingId, ref }));
    },
    /** Penerima pengingat: online = yang belum selesai; offline = semua peserta. Akun dinonaktifkan dilewati. */
    async reminderRecipients(tenantId, trainingId, { pendingOnly }) {
      return select(`SELECT u.id, u.email, u.name FROM ld_participants lp JOIN users u ON u.id = lp.user_id AND u.tenant_id = lp.tenant_id
                      WHERE lp.tenant_id = :tenantId AND lp.training_id = :trainingId AND u.status <> 'disabled'
                        ${pendingOnly ? "AND lp.status IN ('enrolled','in_progress')" : ''} ORDER BY u.email`, { tenantId, trainingId });
    },

    // --- Sinkron webhook EliteMentor ---
    /** Tenant aktif untuk satu organisasi EliteMentor (lebih dari satu = pemetaan ambigu, event ditolak). */
    async tenantsByElitementorOrg(organizationId) {
      return select(`SELECT id FROM tenants WHERE elitementor_organization_id = :organizationId AND status = 'active'`, { organizationId });
    },
    /**
     * Terapkan satu event dalam satu transaksi. Baris ld_sync_events disisipkan lebih dulu (ON CONFLICT DO NOTHING):
     * event ganda atau bersamaan hanya diproses sekali, dan bila penerapan gagal seluruhnya dibatalkan agar bisa diulang.
     * Return { duplicate: true } atau hasil ({ applied, reason? }).
     */
    async applySyncEvent(tenantId, ev) {
      return tx(async (t) => {
        const [mark] = await write(
          `INSERT INTO ld_sync_events (tenant_id, source, event_id, type) VALUES (:tenantId, 'elitementor', :id, :type)
           ON CONFLICT (tenant_id, source, event_id) DO NOTHING RETURNING id`, { tenantId, id: ev.id, type: ev.type }, t);
        if (!mark) return { duplicate: true };
        const result = await (ev.type === 'assessment.result' ? applyAssessment(tenantId, ev, t) : applyProgress(tenantId, ev, t));
        await write('UPDATE ld_sync_events SET result = CAST(:result AS jsonb) WHERE tenant_id = :tenantId AND id = :id', { tenantId, id: mark.id, result: JSON.stringify(result) }, t);
        return result;
      });
    },
  };

  /** Karyawan tenant ini untuk event: id EliteMentor dulu, lalu email (tanpa beda huruf). Ambigu atau nonaktif = tidak ketemu. */
  async function findUser(tenantId, user, t) {
    if (user.elitementorUserId !== null) {
      const rows = await select(`SELECT id FROM users WHERE tenant_id = :tenantId AND elitementor_user_id = :emId AND status <> 'disabled'`, { tenantId, emId: user.elitementorUserId }, t);
      if (rows.length === 1) return rows[0].id;
      if (rows.length > 1) return null;
    }
    if (!user.email) return null;
    const rows = await select(`SELECT id FROM users WHERE tenant_id = :tenantId AND lower(email) = :email AND status <> 'disabled'`, { tenantId, email: user.email }, t);
    return rows.length === 1 ? rows[0].id : null;
  }

  async function applyProgress(tenantId, ev, t) {
    const userId = await findUser(tenantId, ev.user, t);
    if (!userId) return { applied: false, reason: 'user_not_found' };
    // Judul/batas dari EliteMentor hanya mengisi yang kosong atau memperbarui judul bila event lebih baru; batas yang diisi HR menang.
    const [tr] = await write(
      `INSERT INTO ld_trainings (tenant_id, title, mode, source, external_ref, program_tier, ends_on, status, module_id, last_event_at)
       VALUES (:tenantId, :title, 'online', 'elitementor', :ref, :tier, :dueAt, 'running',
               (SELECT m.id FROM li_modules m WHERE m.tenant_id = :tenantId AND upper(m.code) = upper(:ref) ORDER BY m.code LIMIT 1), :at)
       ON CONFLICT (tenant_id, source, external_ref) WHERE external_ref IS NOT NULL DO UPDATE
         SET title = CASE WHEN ld_trainings.last_event_at IS NULL OR ld_trainings.last_event_at <= EXCLUDED.last_event_at THEN EXCLUDED.title ELSE ld_trainings.title END,
             ends_on = COALESCE(ld_trainings.ends_on, CASE WHEN ld_trainings.starts_on IS NULL OR EXCLUDED.ends_on >= ld_trainings.starts_on THEN EXCLUDED.ends_on END),
             program_tier = COALESCE(ld_trainings.program_tier, EXCLUDED.program_tier),
             last_event_at = GREATEST(ld_trainings.last_event_at, EXCLUDED.last_event_at), updated_at = now()
       RETURNING id`,
      { tenantId, title: ev.course.title, ref: ev.course.ref, tier: ev.course.programTier, dueAt: ev.course.dueAt, at: ev.occurredAt }, t,
    );
    const pct = ev.progressPct ?? (ev.status === 'completed' ? 100 : null);
    const rows = await write(
      `INSERT INTO ld_participants (tenant_id, training_id, user_id, progress_pct, status, score, score_source, last_activity_at, last_event_at, completed_at)
       VALUES (:tenantId, :trainingId, :userId, :pct, :status, :score, CASE WHEN CAST(:score AS numeric) IS NULL THEN NULL ELSE 'elitementor' END, :at, :at,
               CASE WHEN :status = 'completed' THEN CAST(:at AS timestamptz) END)
       ON CONFLICT (training_id, user_id) DO UPDATE
         SET progress_pct = COALESCE(EXCLUDED.progress_pct, ld_participants.progress_pct), status = EXCLUDED.status,
             score = COALESCE(EXCLUDED.score, ld_participants.score), score_source = COALESCE(EXCLUDED.score_source, ld_participants.score_source),
             last_activity_at = EXCLUDED.last_activity_at, last_event_at = EXCLUDED.last_event_at,
             completed_at = COALESCE(EXCLUDED.completed_at, ld_participants.completed_at), updated_at = now()
       WHERE ld_participants.last_event_at IS NULL OR ld_participants.last_event_at <= EXCLUDED.last_event_at
       RETURNING id`,
      { tenantId, trainingId: tr.id, userId, pct, status: ev.status, score: ev.score, at: ev.occurredAt }, t,
    );
    return rows.length ? { applied: true, trainingId: tr.id } : { applied: false, reason: 'stale', trainingId: tr.id };
  }

  /** Skor asesmen pelatihan offline yang dijalankan lewat EliteMentor; dicocokkan dengan kode asesmen isian HR. */
  async function applyAssessment(tenantId, ev, t) {
    const trainings = await select(`SELECT id FROM ld_trainings WHERE tenant_id = :tenantId AND source = 'manual' AND assessment_mode = 'elitementor'
                                       AND assessment_ref = :ref AND status <> 'cancelled'`, { tenantId, ref: ev.course.ref }, t);
    if (trainings.length !== 1) return { applied: false, reason: trainings.length ? 'training_ambiguous' : 'training_not_found' };
    const userId = await findUser(tenantId, ev.user, t);
    if (!userId) return { applied: false, reason: 'user_not_found' };
    const rows = await write(
      `UPDATE ld_participants SET score = :score, score_source = 'elitementor', last_event_at = :at, updated_at = now()
        WHERE tenant_id = :tenantId AND training_id = :trainingId AND user_id = :userId
          AND (last_event_at IS NULL OR last_event_at <= :at) RETURNING id`,
      { tenantId, trainingId: trainings[0].id, userId, score: ev.score, at: ev.occurredAt }, t,
    );
    return rows.length ? { applied: true, trainingId: trainings[0].id } : { applied: false, reason: 'not_participant_or_stale', trainingId: trainings[0].id };
  }

  return { ld };
}

module.exports = { createLdStores };
