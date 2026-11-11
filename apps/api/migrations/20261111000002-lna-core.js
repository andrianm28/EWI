'use strict';
// Skema inti Modul 01 Learning Needs Analysis (FSD §Model data, disesuaikan RG-1..RG-4).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      -- FR-PRJ: proyek analisis
      CREATE TABLE lna_projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        division varchar(255),
        period_start date,
        period_end date,
        status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed')),
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lna_projects_tenant_idx ON lna_projects (tenant_id);

      CREATE TABLE lna_job_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        division varchar(255),
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, name)
      );
      ALTER TABLE users ADD COLUMN job_role_id uuid REFERENCES lna_job_roles(id) ON DELETE SET NULL;

      -- RG-1: jenjang karier per job role (probation -> junior -> senior -> leader)
      CREATE TABLE lna_career_levels (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        job_role_id uuid NOT NULL REFERENCES lna_job_roles(id) ON DELETE CASCADE,
        name varchar(64) NOT NULL,
        level_order smallint NOT NULL,
        required_program_tier varchar(16) CHECK (required_program_tier IN ('basic','intermediate','advanced')),
        UNIQUE (job_role_id, level_order)
      );
      ALTER TABLE users ADD COLUMN career_level_id uuid REFERENCES lna_career_levels(id) ON DELETE SET NULL;

      -- Kompetensi jabatan per level (sumber: aturan HR klien, DACUM SME, atau keduanya; RG-1 masih terbuka)
      CREATE TABLE lna_competencies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        job_role_id uuid REFERENCES lna_job_roles(id) ON DELETE CASCADE,
        career_level_id uuid REFERENCES lna_career_levels(id) ON DELETE CASCADE,
        kind varchar(16) NOT NULL CHECK (kind IN ('core','job')),
        name varchar(255) NOT NULL,
        definition text,
        indicators jsonb NOT NULL DEFAULT '[]'::jsonb,
        source varchar(16) NOT NULL DEFAULT 'hr_rule' CHECK (source IN ('hr_rule','dacum','cca','both')),
        version integer NOT NULL DEFAULT 1,
        approved_at timestamptz,
        approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lna_competencies_role_idx ON lna_competencies (tenant_id, job_role_id, career_level_id);

      -- RG-2 / FR-PERF: data kinerja yang diunggah (OKR/KPI/SLA)
      CREATE TABLE lna_performance_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id uuid REFERENCES lna_projects(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        metric_type varchar(8) NOT NULL CHECK (metric_type IN ('okr','kpi','sla')),
        name varchar(255) NOT NULL,
        target numeric,
        actual numeric,
        is_met boolean,
        period varchar(32),
        source varchar(32) NOT NULL DEFAULT 'upload',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lna_perf_user_idx ON lna_performance_records (tenant_id, user_id, is_met);

      -- Sesi wawancara AI (CCA/DNA/TNA/INA), teks atau suara
      CREATE TABLE lna_interview_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id uuid NOT NULL REFERENCES lna_projects(id) ON DELETE CASCADE,
        submodule varchar(4) NOT NULL CHECK (submodule IN ('cca','dna','tna','ina')),
        interviewee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_role_id uuid REFERENCES lna_job_roles(id) ON DELETE SET NULL,
        status varchar(16) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','abandoned')),
        mode varchar(8) NOT NULL DEFAULT 'text' CHECK (mode IN ('text','voice')),
        language varchar(8) NOT NULL DEFAULT 'id',
        consent_at timestamptz,
        trigger_record_ids uuid[] NOT NULL DEFAULT '{}', -- RG-2: target meleset yang dibahas
        started_at timestamptz,
        ended_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lna_sessions_tenant_idx ON lna_interview_sessions (tenant_id, project_id, submodule);

      CREATE TABLE lna_interview_turns (
        id bigserial PRIMARY KEY,
        session_id uuid NOT NULL REFERENCES lna_interview_sessions(id) ON DELETE CASCADE,
        speaker varchar(8) NOT NULL CHECK (speaker IN ('ai','human')),
        text text NOT NULL,
        audio_key varchar(512),
        at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lna_turns_session_idx ON lna_interview_turns (session_id, at);

      -- Penilaian AI per karyawan x kompetensi (skor 0-4)
      CREATE TABLE lna_assessments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        competency_id uuid NOT NULL REFERENCES lna_competencies(id) ON DELETE CASCADE,
        session_id uuid REFERENCES lna_interview_sessions(id) ON DELETE SET NULL,
        score smallint NOT NULL CHECK (score BETWEEN 0 AND 4),
        confidence numeric(3,2),
        evidence text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      -- Gap dan masalah: training-related (TNA) vs non-training (INA) (RG-2)
      CREATE TABLE lna_findings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id uuid NOT NULL REFERENCES lna_projects(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        competency_id uuid REFERENCES lna_competencies(id) ON DELETE SET NULL,
        session_id uuid REFERENCES lna_interview_sessions(id) ON DELETE SET NULL,
        category varchar(16) NOT NULL CHECK (category IN ('training','non_training')),
        title varchar(255) NOT NULL,
        detail text,
        gap_score numeric(4,2),
        impact_score numeric(6,2),
        status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','planned','in_progress','resolved','dismissed')),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lna_findings_tenant_idx ON lna_findings (tenant_id, project_id, category, status);

      -- Training plan: tautan ke program/modul EliteMentor lewat kontrak (FR-EM), atau permintaan modul baru
      CREATE TABLE lna_training_plan_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        finding_id uuid REFERENCES lna_findings(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        origin varchar(16) NOT NULL DEFAULT 'ai' CHECK (origin IN ('ai','learner_request','hr')),
        elitementor_program_id integer,
        program_tier varchar(16) CHECK (program_tier IN ('basic','intermediate','advanced')),
        status varchar(16) NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','needs_module','assigned','in_progress','completed','cancelled')),
        score_before numeric(4,2),
        score_after numeric(4,2),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lna_tpi_user_idx ON lna_training_plan_items (tenant_id, user_id, status);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS lna_training_plan_items, lna_findings, lna_assessments, lna_interview_turns,
        lna_interview_sessions, lna_performance_records, lna_competencies CASCADE;
      ALTER TABLE users DROP COLUMN IF EXISTS career_level_id, DROP COLUMN IF EXISTS job_role_id;
      DROP TABLE IF EXISTS lna_career_levels, lna_job_roles, lna_projects CASCADE;
    `);
  },
};
