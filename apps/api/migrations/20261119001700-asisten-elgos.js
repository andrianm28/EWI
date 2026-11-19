'use strict';
// B17 (19 Nov): Asisten ELGOS. Log pertanyaan/jawaban (terenkripsi per tenant, R2-3) dan pemakaian model asisten
// di ai_usage_logs (R3-6). Spek: docs/designs/b17-asisten-elgos.md
// Catatan reviewer: migrasi ini melebarkan ai_usage_logs.submodule ('assistant' = 9 karakter) dan CHECK operation
// milik PR #15.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE assistant_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        view varchar(16) NOT NULL,
        question text NOT NULL,
        answer text,
        page varchar(32),
        outcome varchar(16) NOT NULL CHECK (outcome IN ('pending','answered','refused','no_answer','error')),
        fact_keys text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX assistant_logs_user_idx ON assistant_logs (tenant_id, user_id, created_at DESC);
      CREATE INDEX assistant_logs_created_idx ON assistant_logs (created_at);
      ALTER TABLE ai_usage_logs ALTER COLUMN submodule TYPE varchar(16);
      ALTER TABLE ai_usage_logs DROP CONSTRAINT ai_usage_logs_operation_check;
      ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_operation_check
        CHECK (operation IN ('next_question','assess_competencies','analyze_tna','assistant_reply'));
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DELETE FROM ai_usage_logs WHERE operation = 'assistant_reply' OR length(submodule) > 8;
      ALTER TABLE ai_usage_logs DROP CONSTRAINT ai_usage_logs_operation_check;
      ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_operation_check
        CHECK (operation IN ('next_question','assess_competencies','analyze_tna'));
      ALTER TABLE ai_usage_logs ALTER COLUMN submodule TYPE varchar(8);
      DROP TABLE IF EXISTS assistant_logs;
    `);
  },
};
