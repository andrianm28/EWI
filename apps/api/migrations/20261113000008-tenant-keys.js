'use strict';
// R2-3 (13 Nov): envelope encryption per tenant. tenant_keys menyimpan data key (DEK) yang dibungkus kunci induk
// tenant (KMS key per tenant di AWS, atau kunci lokal di dev). Kolom terenkripsi berisi "enc:v1:..." sehingga
// judul temuan perlu tipe text. Data lama tetap terbaca (tanpa awalan enc:) sampai scripts/encrypt-existing.js dijalankan.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE tenant_keys (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        version integer NOT NULL,
        key_ref varchar(255) NOT NULL,
        wrapped_key text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, version)
      );
      ALTER TABLE lna_findings ALTER COLUMN title TYPE text;
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_findings ALTER COLUMN title TYPE varchar(255) USING left(title, 255);
      DROP TABLE IF EXISTS tenant_keys;
    `);
  },
};
