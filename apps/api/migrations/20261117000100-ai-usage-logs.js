'use strict';
// PK-06 / R3-6 (★A, 13 Nov): log pemakaian AI per panggilan model sejak POC. Dasar HPP (F11) dan biaya per sesi.
// Tidak menyimpan isi prompt atau jawaban, hanya angka pemakaian.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE ai_usage_logs (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id uuid REFERENCES lna_projects(id) ON DELETE SET NULL,
        session_id uuid REFERENCES lna_interview_sessions(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        submodule varchar(8),
        operation varchar(32) NOT NULL CHECK (operation IN ('next_question','assess_competencies','analyze_tna')),
        provider varchar(32) NOT NULL,
        model varchar(200) NOT NULL,
        input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
        output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
        latency_ms integer,
        cost_usd numeric(12,6),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ai_usage_logs_session_idx ON ai_usage_logs (tenant_id, session_id);
      CREATE INDEX ai_usage_logs_tenant_time_idx ON ai_usage_logs (tenant_id, created_at DESC);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS ai_usage_logs;
    `);
  },
};
