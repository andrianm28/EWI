'use strict';
// B15 (19 Nov): Learning Impact Measurement. Rencana pengukuran (5 pertanyaan + kohort periode/jabatan), modul yang
// diukur, indikator tim, dan skor per karyawan per kompetensi (pre, post penimpa, kinerja, wawancara ulang).
// Spek: docs/designs/b15-impact-measurement.md. Bergantung pada li_modules (B13), lna_competencies, lna_job_roles.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE lim_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title varchar(255) NOT NULL,
        job_role_id uuid REFERENCES lna_job_roles(id) ON DELETE SET NULL,
        period_from date,
        period_until date,
        business_problem varchar(2000) NOT NULL DEFAULT '',
        desired_behavior varchar(2000) NOT NULL DEFAULT '',
        priority_capabilities varchar(2000) NOT NULL DEFAULT '',
        evidence_plan varchar(2000) NOT NULL DEFAULT '',
        existing_metrics varchar(2000) NOT NULL DEFAULT '',
        baseline_label varchar(64),
        after_label varchar(64),
        value_estimate jsonb,
        factors jsonb NOT NULL DEFAULT '[]'::jsonb,
        status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (period_until IS NULL OR period_from IS NULL OR period_until >= period_from)
      );
      CREATE INDEX lim_plans_tenant_idx ON lim_plans (tenant_id, status);

      CREATE TABLE lim_plan_modules (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES lim_plans(id) ON DELETE CASCADE,
        module_id uuid NOT NULL REFERENCES li_modules(id) ON DELETE CASCADE,
        PRIMARY KEY (plan_id, module_id)
      );

      CREATE TABLE lim_indicators (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES lim_plans(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        level varchar(16) NOT NULL CHECK (level IN ('performance','business')),
        source varchar(255),
        unit varchar(16),
        direction varchar(16) NOT NULL CHECK (direction IN ('lower_better','higher_better')),
        baseline numeric,
        current numeric,
        target numeric,
        strength varchar(16) CHECK (strength IN ('strong','moderate','weak')),
        position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 9999),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lim_indicators_plan_idx ON lim_indicators (tenant_id, plan_id);

      CREATE TABLE lim_measurements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES lim_plans(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        competency_id uuid NOT NULL REFERENCES lna_competencies(id) ON DELETE CASCADE,
        pre_score numeric(5,2) CHECK (pre_score BETWEEN 0 AND 100),
        pre_source varchar(8) CHECK (pre_source IN ('manual','import','dna')),
        post_score numeric(5,2) CHECK (post_score BETWEEN 0 AND 100),
        post_source varchar(8) CHECK (post_source IN ('manual','import')),
        performance_score numeric(5,2) CHECK (performance_score BETWEEN 0 AND 100),
        performance_source varchar(8) CHECK (performance_source IN ('manual','import')),
        performance_note varchar(500),
        reinterview_status varchar(16) NOT NULL DEFAULT 'none' CHECK (reinterview_status IN ('none','scheduled','done')),
        reinterview_on date,
        reinterview_score numeric(5,2) CHECK (reinterview_score BETWEEN 0 AND 100),
        reinterview_session_id uuid,
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (plan_id, user_id, competency_id)
      );
      CREATE INDEX lim_measurements_user_idx ON lim_measurements (tenant_id, user_id);
      -- FK CASCADE dari users/lna_competencies dan join pelatihan per modul (review diff egm)
      CREATE INDEX lim_measurements_user_fk_idx ON lim_measurements (user_id);
      CREATE INDEX lim_measurements_competency_idx ON lim_measurements (competency_id);
      CREATE INDEX ld_trainings_lim_module_idx ON ld_trainings (tenant_id, module_id);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP INDEX IF EXISTS ld_trainings_lim_module_idx;
      DROP TABLE IF EXISTS lim_measurements;
      DROP TABLE IF EXISTS lim_indicators;
      DROP TABLE IF EXISTS lim_plan_modules;
      DROP TABLE IF EXISTS lim_plans;
    `);
  },
};
