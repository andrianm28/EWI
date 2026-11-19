'use strict';
// PK-18 (17 Nov): katalog course statis (daftar course Moodle diimpor dari berkas), pemetaan course -> kompetensi,
// dan status lulus per course. Menutup bagian statis P1-8: rencana training menunjuk course nyata, bukan "perlu modul".
// Sinkron otomatis dengan Moodle (API) menyusul setelah pilot (PO-1 opsi B).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE lna_catalog_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source varchar(32) NOT NULL DEFAULT 'moodle',
        external_ref varchar(128) NOT NULL,
        title varchar(255) NOT NULL,
        url text,
        category varchar(128),
        program_tier varchar(16) CHECK (program_tier IN ('basic','intermediate','advanced')),
        active boolean NOT NULL DEFAULT true,
        import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, source, external_ref)
      );

      CREATE TABLE lna_catalog_item_competencies (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        catalog_item_id uuid NOT NULL REFERENCES lna_catalog_items(id) ON DELETE CASCADE,
        competency_id uuid NOT NULL REFERENCES lna_competencies(id) ON DELETE CASCADE,
        PRIMARY KEY (catalog_item_id, competency_id)
      );
      CREATE INDEX lna_catalog_item_competencies_comp_idx ON lna_catalog_item_competencies (tenant_id, competency_id);

      CREATE TABLE lna_catalog_completions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        catalog_item_id uuid NOT NULL REFERENCES lna_catalog_items(id) ON DELETE CASCADE,
        status varchar(16) NOT NULL CHECK (status IN ('passed','in_progress','failed')),
        completed_at timestamptz,
        score numeric,
        source varchar(16) NOT NULL DEFAULT 'manual',
        recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
        import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, user_id, catalog_item_id)
      );
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS lna_catalog_completions;
      DROP TABLE IF EXISTS lna_catalog_item_competencies;
      DROP TABLE IF EXISTS lna_catalog_items;
    `);
  },
};
