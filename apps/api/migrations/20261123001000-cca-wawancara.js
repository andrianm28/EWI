'use strict';
// B10 tahap 2: percakapan wawancara Core Competencies (giliran terenkripsi), sikap per persyaratan untuk sintesis,
// dan operasi AI summarize_cca. Spek: docs/designs/b10-core-competencies.md bagian 11.3.
// Catatan reviewer: migrasi ini mengubah CHECK operation ai_usage_logs (kode bersama, aturan 7).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE cca_assignments
        ADD COLUMN consent_version varchar(64),
        ADD COLUMN consent_at timestamptz,
        ADD COLUMN started_at timestamptz,
        ADD COLUMN summary_at timestamptz,
        ADD COLUMN restart_count smallint NOT NULL DEFAULT 0,
        ADD COLUMN context_requirement_ids uuid[];

      CREATE TABLE cca_interview_turns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        assignment_id uuid NOT NULL REFERENCES cca_assignments(id) ON DELETE CASCADE,
        position smallint NOT NULL CHECK (position BETWEEN 1 AND 8),
        role varchar(12) NOT NULL CHECK (role IN ('ai','participant')),
        theme varchar(16) NOT NULL,
        text text NOT NULL,
        options jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (assignment_id, position)
      );
      CREATE INDEX cca_interview_turns_tenant_idx ON cca_interview_turns (tenant_id, assignment_id);

      CREATE TABLE cca_interview_stances (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        assignment_id uuid NOT NULL REFERENCES cca_assignments(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES cca_requirements(id) ON DELETE CASCADE,
        tier varchar(8) NOT NULL CHECK (tier IN ('leader','employee')),
        stance varchar(12) NOT NULL CHECK (stance IN ('agree','partial','disagree','aligned','not_aligned')),
        PRIMARY KEY (assignment_id, requirement_id)
      );
      CREATE INDEX cca_interview_stances_req_idx ON cca_interview_stances (tenant_id, requirement_id);

      ALTER TABLE ai_usage_logs DROP CONSTRAINT ai_usage_logs_operation_check;
      ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_operation_check
        CHECK (operation IN ('next_question','assess_competencies','analyze_tna','assistant_reply','summarize_cca'));
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DELETE FROM ai_usage_logs WHERE operation = 'summarize_cca';
      ALTER TABLE ai_usage_logs DROP CONSTRAINT ai_usage_logs_operation_check;
      ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_operation_check
        CHECK (operation IN ('next_question','assess_competencies','analyze_tna','assistant_reply'));
      DROP TABLE IF EXISTS cca_interview_stances;
      DROP TABLE IF EXISTS cca_interview_turns;
      ALTER TABLE cca_assignments
        DROP COLUMN IF EXISTS consent_version,
        DROP COLUMN IF EXISTS consent_at,
        DROP COLUMN IF EXISTS started_at,
        DROP COLUMN IF EXISTS summary_at,
        DROP COLUMN IF EXISTS restart_count,
        DROP COLUMN IF EXISTS context_requirement_ids;
    `);
  },
};
