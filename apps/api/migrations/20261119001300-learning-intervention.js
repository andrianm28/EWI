'use strict';
// B13 (19 Nov): Learning Intervention. Library modul KSA dari DACUM Tool 2, permintaan ke vendor (K4), dan draf
// pengembangan modul bersama ELGOS. Spek: docs/designs/b13-learning-intervention.md.
// Bergantung pada lna_catalog_items (PK-18, migrasi 20261117000700).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE li_modules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        code varchar(32) NOT NULL,
        name varchar(255) NOT NULL,
        level varchar(16) NOT NULL CHECK (level IN ('basic','intermediate','advanced')),
        stream varchar(128),
        objective text,
        catalog_item_id uuid REFERENCES lna_catalog_items(id) ON DELETE SET NULL,
        import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, code)
      );

      CREATE TABLE li_module_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        module_id uuid NOT NULL REFERENCES li_modules(id) ON DELETE CASCADE,
        kind char(1) NOT NULL CHECK (kind IN ('K','S','A')),
        text text NOT NULL,
        position integer NOT NULL DEFAULT 0
      );
      CREATE INDEX li_module_items_module_idx ON li_module_items (tenant_id, module_id, position);

      CREATE TABLE li_module_job_roles (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        module_id uuid NOT NULL REFERENCES li_modules(id) ON DELETE CASCADE,
        job_role_id uuid NOT NULL REFERENCES lna_job_roles(id) ON DELETE CASCADE,
        PRIMARY KEY (module_id, job_role_id)
      );
      CREATE INDEX li_module_job_roles_role_idx ON li_module_job_roles (tenant_id, job_role_id);

      CREATE TABLE li_module_competencies (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        module_id uuid NOT NULL REFERENCES li_modules(id) ON DELETE CASCADE,
        competency_id uuid NOT NULL REFERENCES lna_competencies(id) ON DELETE CASCADE,
        PRIMARY KEY (module_id, competency_id)
      );
      CREATE INDEX li_module_competencies_comp_idx ON li_module_competencies (tenant_id, competency_id);

      CREATE TABLE li_module_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        module_id uuid NOT NULL REFERENCES li_modules(id) ON DELETE CASCADE,
        vendor_name varchar(255) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'requested'
          CHECK (status IN ('requested','confirmed','delivered','installed','cancelled')),
        note text,
        requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
        requested_at timestamptz NOT NULL DEFAULT now(),
        confirmed_at timestamptz,
        delivered_at timestamptz,
        installed_at timestamptz,
        cancelled_at timestamptz,
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      -- satu permintaan aktif per modul; yang batal boleh banyak (riwayat)
      CREATE UNIQUE INDEX li_module_requests_active_idx ON li_module_requests (tenant_id, module_id) WHERE status <> 'cancelled';

      CREATE TABLE li_module_drafts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        module_id uuid NOT NULL REFERENCES li_modules(id) ON DELETE CASCADE,
        status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sme_review','approved','returned')),
        objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
        sessions jsonb NOT NULL DEFAULT '[]'::jsonb,
        assessments jsonb NOT NULL DEFAULT '[]'::jsonb,
        generated_by varchar(16) NOT NULL DEFAULT 'template',
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
        submitted_at timestamptz,
        reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
        reviewer_name varchar(255),
        review_recorded_by_hr boolean NOT NULL DEFAULT false,
        review_note text,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, module_id)
      );
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS li_module_drafts;
      DROP TABLE IF EXISTS li_module_requests;
      DROP TABLE IF EXISTS li_module_competencies;
      DROP TABLE IF EXISTS li_module_job_roles;
      DROP TABLE IF EXISTS li_module_items;
      DROP TABLE IF EXISTS li_modules;
    `);
  },
};
