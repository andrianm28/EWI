'use strict';
// B4 Developmental Needs: kode, rumpun, dan tingkat program (BIA) per kompetensi; job function DACUM Tool 1
// dan pemetaannya ke kompetensi. Spek: docs/designs/b4-developmental-needs.md.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      ALTER TABLE lna_competencies
        ADD COLUMN code varchar(32),
        ADD COLUMN stream varchar(64),
        ADD COLUMN program_tier varchar(16) CHECK (program_tier IN ('basic','intermediate','advanced'));
      -- kode hanya untuk kompetensi yang punya job role; unik per jabatan tanpa beda huruf besar/kecil
      ALTER TABLE lna_competencies ADD CONSTRAINT lna_competencies_code_role_ck CHECK (code IS NULL OR job_role_id IS NOT NULL);
      CREATE UNIQUE INDEX lna_competencies_code_uq ON lna_competencies (tenant_id, job_role_id, lower(code)) WHERE code IS NOT NULL;

      CREATE TABLE lna_job_functions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        job_role_id uuid NOT NULL REFERENCES lna_job_roles(id) ON DELETE CASCADE,
        fn_order smallint NOT NULL CHECK (fn_order >= 1),
        name varchar(255) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (job_role_id, fn_order)
      );
      CREATE UNIQUE INDEX lna_job_functions_name_uq ON lna_job_functions (job_role_id, lower(name));
      CREATE INDEX lna_job_functions_tenant_idx ON lna_job_functions (tenant_id, job_role_id);

      -- tenant_id dijaga aplikasi: job function dan kompetensi divalidasi satu tenant + satu job role sebelum disisipkan
      CREATE TABLE lna_job_function_competencies (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        job_function_id uuid NOT NULL REFERENCES lna_job_functions(id) ON DELETE CASCADE,
        competency_id uuid NOT NULL REFERENCES lna_competencies(id) ON DELETE CASCADE,
        PRIMARY KEY (job_function_id, competency_id)
      );
      CREATE INDEX lna_jf_competencies_comp_idx ON lna_job_function_competencies (tenant_id, competency_id);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS lna_job_function_competencies;
      DROP TABLE IF EXISTS lna_job_functions;
      DROP INDEX IF EXISTS lna_competencies_code_uq;
      ALTER TABLE lna_competencies DROP CONSTRAINT IF EXISTS lna_competencies_code_role_ck;
      ALTER TABLE lna_competencies DROP COLUMN IF EXISTS program_tier, DROP COLUMN IF EXISTS stream, DROP COLUMN IF EXISTS code;
    `);
  },
};
