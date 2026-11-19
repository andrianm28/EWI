'use strict';
// B9 Improvement Needs (19 Nov): tindakan perbaikan non-pelatihan (BI-1, BI-4) dan verifikasi AI ke pemiliknya.
// Teks bebas (judul, detail, ringkasan, giliran percakapan) disimpan terenkripsi per tenant (R2-3).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE ina_actions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        finding_id uuid REFERENCES lna_findings(id) ON DELETE SET NULL,
        title text NOT NULL,
        detail text,
        category varchar(16) NOT NULL CHECK (category IN ('sop','alat','sistem','budaya','lainnya')),
        sub_label varchar(64),
        owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        source_ref varchar(255),
        competency_id uuid REFERENCES lna_competencies(id) ON DELETE SET NULL,
        performance_record_id uuid REFERENCES lna_performance_records(id) ON DELETE SET NULL,
        due_date date,
        status varchar(16) NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done','rejected')),
        involves_individual boolean NOT NULL DEFAULT false,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        CONSTRAINT ina_actions_sub_label_chk CHECK (sub_label IS NULL OR category = 'lainnya')
      );
      CREATE INDEX ina_actions_tenant_idx ON ina_actions (tenant_id, status);
      CREATE INDEX ina_actions_owner_idx ON ina_actions (tenant_id, owner_user_id);
      -- satu tindakan per temuan, supaya "buat tindakan" dari tinjauan HR aman diulang
      CREATE UNIQUE INDEX ina_actions_finding_idx ON ina_actions (tenant_id, finding_id) WHERE finding_id IS NOT NULL;

      CREATE TABLE ina_verifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        action_id uuid NOT NULL REFERENCES ina_actions(id) ON DELETE CASCADE,
        owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(16) NOT NULL DEFAULT 'assigned'
          CHECK (status IN ('assigned','in_progress','completed','cancelled','withdrawn')),
        due_date date,
        consent_at timestamptz,
        consent_version varchar(32),
        started_at timestamptz,
        ended_at timestamptz,
        reported_status varchar(16) CHECK (reported_status IN ('in_progress','done','blocked')),
        summary text,
        ai_provider varchar(32),
        assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ina_verifications_tenant_idx ON ina_verifications (tenant_id, action_id);
      CREATE INDEX ina_verifications_owner_idx ON ina_verifications (tenant_id, owner_user_id, status);
      -- satu verifikasi terbuka per tindakan
      CREATE UNIQUE INDEX ina_verifications_open_idx ON ina_verifications (action_id) WHERE status IN ('assigned','in_progress');

      -- giliran percakapan; tenant diturunkan dari ina_verifications (selalu di-join dengan tenant_id)
      CREATE TABLE ina_verification_turns (
        id bigserial PRIMARY KEY,
        verification_id uuid NOT NULL REFERENCES ina_verifications(id) ON DELETE CASCADE,
        speaker varchar(8) NOT NULL CHECK (speaker IN ('ai','human')),
        text text NOT NULL,
        at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ina_verification_turns_idx ON ina_verification_turns (verification_id, id);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS ina_verification_turns, ina_verifications, ina_actions;
    `);
  },
};
