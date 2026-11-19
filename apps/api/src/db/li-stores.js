'use strict';
// Store Postgres untuk B13 Learning Intervention. Setiap query memfilter tenant_id. Isi modul bukan data pribadi,
// jadi tidak dienkripsi per tenant (spek §3).
const { QueryTypes } = require('sequelize');

const MODULE_COLS = `m.id, m.code, m.name, m.level, m.stream, m.objective, m.catalog_item_id AS "catalogItemId",
  m.created_at AS "createdAt", m.updated_at AS "updatedAt"`;
const REQUEST_COLS = `r.id, r.module_id AS "moduleId", r.vendor_name AS "vendorName", r.status, r.note,
  r.requested_by AS "requestedBy", r.requested_at AS "requestedAt", r.confirmed_at AS "confirmedAt",
  r.delivered_at AS "deliveredAt", r.installed_at AS "installedAt", r.cancelled_at AS "cancelledAt", r.updated_at AS "updatedAt"`;
const DRAFT_COLS = `d.id, d.module_id AS "moduleId", d.status, d.objectives, d.sessions, d.assessments,
  d.generated_by AS "generatedBy", d.created_by AS "createdBy", d.submitted_at AS "submittedAt", d.reviewed_by AS "reviewedBy",
  d.reviewer_name AS "reviewerName", d.review_recorded_by_hr AS "reviewRecordedByHr", d.review_note AS "reviewNote", d.reviewed_at AS "reviewedAt",
  d.created_at AS "createdAt", d.updated_at AS "updatedAt"`;
const STATUS_TIME = { confirmed: 'confirmed_at', delivered: 'delivered_at', installed: 'installed_at', cancelled: 'cancelled_at' };

function createLiStores(sequelize) {
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
  /** Kunci baris modul agar "satu jalur aktif per modul" tidak dilanggar dua request bersamaan. */
  const lockModule = (tenantId, moduleId, t) => one('SELECT id FROM li_modules WHERE tenant_id = :tenantId AND id = :moduleId FOR UPDATE', { tenantId, moduleId }, t);

  const li = {
    /** Semua modul tenant beserta butir, jabatan, kompetensi, permintaan aktif, dan ringkasan draf. */
    async listModules(tenantId, { id } = {}) {
      const rep = { tenantId };
      let sql = `SELECT ${MODULE_COLS},
          COALESCE((SELECT json_agg(json_build_object('id', i.id, 'kind', i.kind, 'text', i.text) ORDER BY i.position, i.id)
                      FROM li_module_items i WHERE i.module_id = m.id AND i.tenant_id = m.tenant_id), '[]'::json) AS items,
          COALESCE((SELECT json_agg(json_build_object('id', jr.id, 'name', jr.name) ORDER BY jr.name)
                      FROM li_module_job_roles mj JOIN lna_job_roles jr ON jr.id = mj.job_role_id AND jr.tenant_id = m.tenant_id
                     WHERE mj.module_id = m.id), '[]'::json) AS "jobRoles",
          COALESCE((SELECT json_agg(DISTINCT lower(regexp_replace(btrim(c.name), '\\s+', ' ', 'g')))
                      FROM li_module_competencies mc JOIN lna_competencies c ON c.id = mc.competency_id AND c.tenant_id = m.tenant_id
                     WHERE mc.module_id = m.id AND mc.tenant_id = m.tenant_id), '[]'::json) AS "competencyKeys",
          (SELECT json_build_object('id', r.id, 'status', r.status, 'vendorName', r.vendor_name, 'requestedAt', r.requested_at)
             FROM li_module_requests r WHERE r.module_id = m.id AND r.tenant_id = m.tenant_id AND r.status <> 'cancelled') AS request,
          (SELECT json_build_object('id', d.id, 'status', d.status, 'updatedAt', d.updated_at)
             FROM li_module_drafts d WHERE d.module_id = m.id AND d.tenant_id = m.tenant_id) AS draft
        FROM li_modules m WHERE m.tenant_id = :tenantId`;
      if (id) { sql += ' AND m.id = :id'; rep.id = id; }
      return select(`${sql} ORDER BY m.code`, rep);
    },
    async getModule(tenantId, id) {
      return (await li.listModules(tenantId, { id }))[0] || null;
    },
    async moduleByCode(tenantId, code) {
      return one('SELECT id, code FROM li_modules WHERE tenant_id = :tenantId AND code = :code', { tenantId, code });
    },
    /** Jabatan tenant + jumlah modulnya (untuk filter dan pemilih program). */
    async listJobRoles(tenantId) {
      return select(`SELECT jr.id, jr.name, jr.division,
                            (SELECT count(*)::int FROM li_module_job_roles mj WHERE mj.job_role_id = jr.id AND mj.tenant_id = jr.tenant_id) AS "moduleCount"
                       FROM lna_job_roles jr WHERE jr.tenant_id = :tenantId ORDER BY jr.name`, { tenantId });
    },
    /**
     * Impor: upsert modul berdasarkan kode; butir, jabatan, dan kompetensi diganti dengan isi file.
     * Permintaan dan draf yang sudah ada tidak disentuh.
     * values: [{ code, name, level, stream, objective, jobRoleIds, competencyIds, items: [{ kind, text }] }]
     */
    async upsertModules(tenantId, values, { batchId = null } = {}) {
      return tx(async (t) => {
        let created = 0; let updated = 0; let items = 0;
        for (const v of values) {
          const [row] = await write(
            `INSERT INTO li_modules (tenant_id, code, name, level, stream, objective, import_batch_id)
             VALUES (:tenantId, :code, :name, :level, :stream, :objective, :batchId)
             ON CONFLICT (tenant_id, code) DO UPDATE
               SET name = EXCLUDED.name, level = EXCLUDED.level, stream = EXCLUDED.stream, objective = EXCLUDED.objective,
                   import_batch_id = EXCLUDED.import_batch_id, updated_at = now()
             RETURNING id, (xmax = 0) AS inserted`,
            { tenantId, batchId, code: v.code, name: v.name, level: v.level, stream: v.stream || null, objective: v.objective || null }, t,
          );
          if (row.inserted) created += 1; else updated += 1;
          const rep = { tenantId, id: row.id };
          await write('DELETE FROM li_module_items WHERE tenant_id = :tenantId AND module_id = :id', rep, t);
          await write('DELETE FROM li_module_job_roles WHERE tenant_id = :tenantId AND module_id = :id', rep, t);
          await write('DELETE FROM li_module_competencies WHERE tenant_id = :tenantId AND module_id = :id', rep, t);
          for (const [position, it] of (v.items || []).entries()) {
            await write('INSERT INTO li_module_items (tenant_id, module_id, kind, text, position) VALUES (:tenantId, :id, :kind, :text, :position)',
              { ...rep, kind: it.kind, text: it.text, position }, t);
            items += 1;
          }
          for (const jobRoleId of v.jobRoleIds || []) {
            await write(`INSERT INTO li_module_job_roles (tenant_id, module_id, job_role_id)
                         SELECT :tenantId, :id, jr.id FROM lna_job_roles jr WHERE jr.tenant_id = :tenantId AND jr.id = :jobRoleId
                         ON CONFLICT DO NOTHING`, { ...rep, jobRoleId }, t);
          }
          for (const competencyId of v.competencyIds || []) {
            await write(`INSERT INTO li_module_competencies (tenant_id, module_id, competency_id)
                         SELECT :tenantId, :id, c.id FROM lna_competencies c WHERE c.tenant_id = :tenantId AND c.id = :competencyId
                         ON CONFLICT DO NOTHING`, { ...rep, competencyId }, t);
          }
        }
        return { created, updated, items };
      });
    },

    // --- Permintaan ke vendor ---
    /** Return permintaan baru, atau { conflict: 'request'|'draft' } / null (modul tidak ada). */
    async createRequest(tenantId, moduleId, { vendorName, userId }) {
      return tx(async (t) => {
        if (!(await lockModule(tenantId, moduleId, t))) return null;
        if (await one(`SELECT 1 AS x FROM li_module_requests WHERE tenant_id = :tenantId AND module_id = :moduleId AND status <> 'cancelled'`, { tenantId, moduleId }, t)) return { conflict: 'request' };
        if (await one('SELECT 1 AS x FROM li_module_drafts WHERE tenant_id = :tenantId AND module_id = :moduleId', { tenantId, moduleId }, t)) return { conflict: 'draft' };
        const [row] = await write(
          `INSERT INTO li_module_requests (tenant_id, module_id, vendor_name, requested_by, updated_by)
           VALUES (:tenantId, :moduleId, :vendorName, :userId, :userId) RETURNING id`,
          { tenantId, moduleId, vendorName, userId: userId || null }, t,
        );
        return li.getRequest(tenantId, row.id, t);
      });
    },
    async listRequests(tenantId) {
      return select(`SELECT ${REQUEST_COLS}, m.code AS "moduleCode", m.name AS "moduleName"
                       FROM li_module_requests r JOIN li_modules m ON m.id = r.module_id AND m.tenant_id = r.tenant_id
                      WHERE r.tenant_id = :tenantId AND r.status <> 'cancelled' ORDER BY r.requested_at DESC, m.code`, { tenantId });
    },
    async getRequest(tenantId, id, transaction) {
      return one(`SELECT ${REQUEST_COLS}, m.code AS "moduleCode", m.name AS "moduleName"
                    FROM li_module_requests r JOIN li_modules m ON m.id = r.module_id AND m.tenant_id = r.tenant_id
                   WHERE r.tenant_id = :tenantId AND r.id = :id`, { tenantId, id }, transaction);
    },
    /** Pindah status secara atomik (hanya bila status masih `from`). Return permintaan terbaru atau null. */
    async moveRequest(tenantId, id, from, to, { userId, note, catalogItemId } = {}) {
      return tx(async (t) => {
        const rows = await write(
          `UPDATE li_module_requests SET status = :to, ${STATUS_TIME[to]} = now(), note = COALESCE(:note, note), updated_by = :userId, updated_at = now()
            WHERE tenant_id = :tenantId AND id = :id AND status = :from RETURNING module_id`,
          { tenantId, id, from, to, note: note ?? null, userId: userId || null }, t,
        );
        if (!rows.length) return null;
        if (to === 'installed' && catalogItemId) {
          await write(`UPDATE li_modules SET catalog_item_id = :catalogItemId, updated_at = now()
                        WHERE tenant_id = :tenantId AND id = :moduleId
                          AND EXISTS (SELECT 1 FROM lna_catalog_items ci WHERE ci.tenant_id = :tenantId AND ci.id = :catalogItemId)`,
          { tenantId, moduleId: rows[0].module_id, catalogItemId }, t);
        }
        return li.getRequest(tenantId, id, t);
      });
    },
    /**
     * Gap training per karyawan x kompetensi untuk Pareto LI. Tanpa judul/detail temuan (data individu terenkripsi):
     * hanya kunci kompetensi (nama dinormalkan), bobot, dan target/realisasi. Sama dengan /api/tna/pareto, hanya temuan
     * yang sudah ditinjau HR (approved/edited) yang dihitung. Temuan tanpa kompetensi dihitung terpisah.
     */
    async listTrainingGaps(tenantId, { jobRoleId } = {}) {
      const rep = { tenantId };
      let sql = `SELECT f.user_id AS "userId", lower(regexp_replace(btrim(c.name), '\\s+', ' ', 'g')) AS "competencyKey", c.name AS "competencyName",
                        c.importance, pr.target::float AS target, pr.actual::float AS actual, pr.direction, pr.tolerance::float AS tolerance
                   FROM lna_findings f
                   LEFT JOIN lna_competencies c ON c.id = f.competency_id AND c.tenant_id = f.tenant_id
                   LEFT JOIN lna_performance_records pr ON pr.id = f.performance_record_id AND pr.tenant_id = f.tenant_id
                  WHERE f.tenant_id = :tenantId AND f.category = 'training' AND f.review_status IN ('approved','edited')`;
      if (jobRoleId) { sql += ' AND f.user_id IN (SELECT u.id FROM users u WHERE u.tenant_id = :tenantId AND u.job_role_id = :jobRoleId)'; rep.jobRoleId = jobRoleId; }
      return select(sql, rep);
    },
    /** Tautkan modul ke course katalog (atau lepas dengan null). Return false bila modul/course bukan milik tenant. */
    async setCatalogItem(tenantId, moduleId, catalogItemId) {
      const rows = await write(
        `UPDATE li_modules SET catalog_item_id = :catalogItemId, updated_at = now()
          WHERE tenant_id = :tenantId AND id = :moduleId
            AND (CAST(:catalogItemId AS uuid) IS NULL OR EXISTS (SELECT 1 FROM lna_catalog_items ci WHERE ci.tenant_id = :tenantId AND ci.id = :catalogItemId))
          RETURNING id`, { tenantId, moduleId, catalogItemId: catalogItemId || null });
      return rows.length > 0;
    },
    async catalogItemExists(tenantId, id) {
      return !!(await one('SELECT 1 AS x FROM lna_catalog_items WHERE tenant_id = :tenantId AND id = :id', { tenantId, id }));
    },

    // --- Draf pengembangan ---
    /** Return { draft, created } | { conflict: 'request' } | null (modul tidak ada). */
    async createDraft(tenantId, moduleId, content, userId) {
      return tx(async (t) => {
        if (!(await lockModule(tenantId, moduleId, t))) return null;
        const existing = await one('SELECT id FROM li_module_drafts WHERE tenant_id = :tenantId AND module_id = :moduleId', { tenantId, moduleId }, t);
        if (existing) return { draft: await li.getDraft(tenantId, existing.id, t), created: false };
        if (await one(`SELECT 1 AS x FROM li_module_requests WHERE tenant_id = :tenantId AND module_id = :moduleId AND status <> 'cancelled'`, { tenantId, moduleId }, t)) return { conflict: 'request' };
        const [row] = await write(
          `INSERT INTO li_module_drafts (tenant_id, module_id, objectives, sessions, assessments, generated_by, created_by)
           VALUES (:tenantId, :moduleId, CAST(:objectives AS jsonb), CAST(:sessions AS jsonb), CAST(:assessments AS jsonb), :generatedBy, :userId) RETURNING id`,
          { tenantId, moduleId, userId: userId || null, generatedBy: content.generatedBy || 'template',
            objectives: JSON.stringify(content.objectives), sessions: JSON.stringify(content.sessions), assessments: JSON.stringify(content.assessments) }, t,
        );
        return { draft: await li.getDraft(tenantId, row.id, t), created: true };
      });
    },
    async listDrafts(tenantId, { status } = {}) {
      return select(`SELECT d.id, d.module_id AS "moduleId", d.status, d.updated_at AS "updatedAt", d.submitted_at AS "submittedAt",
                            d.reviewer_name AS "reviewerName", d.review_note AS "reviewNote", m.code AS "moduleCode", m.name AS "moduleName"
                       FROM li_module_drafts d JOIN li_modules m ON m.id = d.module_id AND m.tenant_id = d.tenant_id
                      WHERE d.tenant_id = :tenantId AND (CAST(:status AS varchar) IS NULL OR d.status = :status)
                      ORDER BY d.updated_at DESC, m.code`, { tenantId, status: status || null });
    },
    async getDraft(tenantId, id, transaction) {
      return one(`SELECT ${DRAFT_COLS}, m.code AS "moduleCode", m.name AS "moduleName", m.level AS "moduleLevel", m.stream AS "moduleStream", m.objective AS "moduleObjective"
                    FROM li_module_drafts d JOIN li_modules m ON m.id = d.module_id AND m.tenant_id = d.tenant_id
                   WHERE d.tenant_id = :tenantId AND d.id = :id`, { tenantId, id }, transaction);
    },
    /** Sunting isi; hanya saat status draft/returned. Return draf atau null. */
    async updateDraft(tenantId, id, patch) {
      const sets = []; const rep = { tenantId, id };
      for (const k of ['objectives', 'sessions', 'assessments']) {
        if (patch[k] !== undefined) { sets.push(`${k} = CAST(:${k} AS jsonb)`); rep[k] = JSON.stringify(patch[k]); }
      }
      const rows = await write(`UPDATE li_module_drafts SET ${sets.join(', ')}, updated_at = now()
                                 WHERE tenant_id = :tenantId AND id = :id AND status IN ('draft','returned') RETURNING id`, rep);
      return rows.length ? li.getDraft(tenantId, id) : null;
    },
    async submitDraft(tenantId, id, userId) {
      const rows = await write(`UPDATE li_module_drafts SET status = 'sme_review', submitted_by = :userId, submitted_at = now(), updated_at = now()
                                 WHERE tenant_id = :tenantId AND id = :id AND status IN ('draft','returned') RETURNING id`, { tenantId, id, userId: userId || null });
      return rows.length ? li.getDraft(tenantId, id) : null;
    },
    async reviewDraft(tenantId, id, { decision, note, reviewerName, recordedByHr, userId }) {
      const rows = await write(
        `UPDATE li_module_drafts SET status = :decision, reviewed_by = :userId, reviewer_name = :reviewerName, review_recorded_by_hr = :recordedByHr, review_note = :note,
                reviewed_at = now(), updated_at = now()
          WHERE tenant_id = :tenantId AND id = :id AND status = 'sme_review' RETURNING id`,
        { tenantId, id, decision, note: note || null, reviewerName: reviewerName || null, recordedByHr: !!recordedByHr, userId: userId || null },
      );
      return rows.length ? li.getDraft(tenantId, id) : null;
    },
    async deleteDraft(tenantId, id) {
      const rows = await write(`DELETE FROM li_module_drafts WHERE tenant_id = :tenantId AND id = :id AND status IN ('draft','returned') RETURNING id`, { tenantId, id });
      return rows.length > 0;
    },
  };

  return { li };
}

module.exports = { createLiStores };
