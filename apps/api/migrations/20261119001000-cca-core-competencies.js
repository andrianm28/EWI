'use strict';
// B10 Core Competencies (modul cca): sumber strategis (visi, misi, nilai), persyaratan kompetensi dan indikator
// perilaku, program nilai korporasi + hasil per karyawan dari laporan program, dan penugasan wawancara berjenjang.
// Spek: docs/designs/b10-core-competencies.md
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      CREATE TABLE cca_sources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        kind varchar(8) NOT NULL CHECK (kind IN ('vision','mission','value')),
        title varchar(255) NOT NULL,
        text text,
        source_ref varchar(512),
        position integer NOT NULL DEFAULT 0,
        status varchar(8) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX cca_sources_tenant_idx ON cca_sources (tenant_id, status, kind, position);

      CREATE TABLE cca_requirements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source_id uuid NOT NULL REFERENCES cca_sources(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        definition text,
        target_score numeric(5,2) NOT NULL CHECK (target_score BETWEEN 0 AND 100),
        actual_score numeric(5,2) CHECK (actual_score BETWEEN 0 AND 100),
        actual_source varchar(16) CHECK (actual_source IN ('manual','synthesis')),
        actual_updated_at timestamptz,
        origin varchar(8) NOT NULL DEFAULT 'hr' CHECK (origin IN ('hr','ai')),
        status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','rejected')),
        validated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        validated_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX cca_requirements_source_idx ON cca_requirements (tenant_id, source_id);

      CREATE TABLE cca_programs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        key varchar(32) NOT NULL,
        name varchar(255) NOT NULL,
        provider varchar(255),
        cutoff_date date,
        config jsonb NOT NULL,
        insight text,
        recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
        -- isian agregat dari laporan ringkasan, dipakai hanya bila belum ada hasil per karyawan
        manual_report jsonb,
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, key)
      );

      CREATE TABLE cca_program_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        program_id uuid NOT NULL REFERENCES cca_programs(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        division varchar(255),
        activities_done integer NOT NULL DEFAULT 0 CHECK (activities_done >= 0),
        final_score numeric(5,2) CHECK (final_score BETWEEN 0 AND 100),
        value_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
        component_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
        import_batch_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, program_id, user_id)
      );

      CREATE TABLE cca_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        assignee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
        tier varchar(8) NOT NULL CHECK (tier IN ('leader','employee')),
        parent_id uuid REFERENCES cca_assignments(id) ON DELETE SET NULL,
        due_date date NOT NULL,
        duration_minutes smallint NOT NULL DEFAULT 10 CHECK (duration_minutes BETWEEN 5 AND 60),
        status varchar(16) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','completed','cancelled')),
        session_id uuid,
        summary text,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      -- satu penugasan berjalan per orang per tier; putaran baru boleh dibuat setelah yang lama selesai atau batal
      CREATE UNIQUE INDEX cca_assignments_open_idx ON cca_assignments (tenant_id, assignee_id, tier) WHERE status IN ('assigned','in_progress');
      CREATE INDEX cca_assignments_assignee_idx ON cca_assignments (tenant_id, assignee_id, tier, created_at DESC);
      CREATE INDEX cca_assignments_parent_idx ON cca_assignments (tenant_id, parent_id);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS cca_assignments, cca_program_results, cca_programs, cca_requirements, cca_sources CASCADE;
    `);
  },
};
