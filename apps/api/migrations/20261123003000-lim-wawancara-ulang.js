'use strict';
// B15 tahap 3: wawancara ulang AI oleh karyawan (sesi, giliran terenkripsi, ringkasan skor + alasan terenkripsi) dan
// operasi AI lim_question/summarize_lim. Spek: docs/designs/b15-impact-measurement.md bagian 12.2.
// Catatan reviewer: migrasi ini mengubah CHECK operation ai_usage_logs (kode bersama, aturan 7).
const S = process.env.DB_SCHEMA || 'ewi';
const OPS = "'next_question','assess_competencies','analyze_tna','assistant_reply','summarize_cca'";

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE lim_reinterviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES lim_plans(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(12) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
        consent_version varchar(64) NOT NULL,
        consent_at timestamptz NOT NULL DEFAULT now(),
        -- potret kompetensi saat persetujuan (MAX_COMPETENCIES = 4 di modules/lim/reinterview-rules.js)
        competency_ids uuid[] NOT NULL CHECK (cardinality(competency_ids) BETWEEN 1 AND 4),
        -- JSON { competencies: [{ competencyId, score, reason }] } terenkripsi per tenant
        summary text,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX lim_reinterviews_open_uq ON lim_reinterviews (plan_id, user_id) WHERE status = 'in_progress';
      CREATE INDEX lim_reinterviews_tenant_idx ON lim_reinterviews (tenant_id, plan_id, user_id);

      CREATE TABLE lim_reinterview_turns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        reinterview_id uuid NOT NULL REFERENCES lim_reinterviews(id) ON DELETE CASCADE,
        -- 9 pertanyaan + 9 jawaban untuk 4 kompetensi (MAX_TURNS)
        position smallint NOT NULL CHECK (position BETWEEN 1 AND 18),
        role varchar(12) NOT NULL CHECK (role IN ('ai','participant')),
        kind varchar(10) NOT NULL CHECK (kind IN ('scenario','verify','apply')),
        competency_id uuid REFERENCES lna_competencies(id) ON DELETE SET NULL,
        text text NOT NULL,
        options text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (reinterview_id, position)
      );
      CREATE INDEX lim_reinterview_turns_tenant_idx ON lim_reinterview_turns (tenant_id, reinterview_id);

      ALTER TABLE ai_usage_logs DROP CONSTRAINT ai_usage_logs_operation_check;
      ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_operation_check
        CHECK (operation IN (${OPS},'lim_question','summarize_lim'));
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DELETE FROM ai_usage_logs WHERE operation IN ('lim_question','summarize_lim');
      ALTER TABLE ai_usage_logs DROP CONSTRAINT ai_usage_logs_operation_check;
      ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_operation_check CHECK (operation IN (${OPS}));
      DROP TABLE IF EXISTS lim_reinterview_turns;
      DROP TABLE IF EXISTS lim_reinterviews;
    `);
  },
};
