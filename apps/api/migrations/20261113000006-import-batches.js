'use strict';
// R3-3 (13 Nov): riwayat impor file XLSX/CSV (unggah -> petakan -> pratinjau -> simpan).
// BT-26: tipe nilai KPI di data kinerja (angka, persen, rating, biner, tenggat).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE import_batches (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        submodule varchar(16) NOT NULL,
        kind varchar(32) NOT NULL,
        filename varchar(255),
        status varchar(16) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','committed')),
        row_count integer NOT NULL DEFAULT 0,
        headers jsonb NOT NULL DEFAULT '[]'::jsonb,
        rows jsonb NOT NULL DEFAULT '[]'::jsonb,
        mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
        options jsonb NOT NULL DEFAULT '{}'::jsonb,
        result jsonb,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        committed_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        committed_at timestamptz
      );
      CREATE INDEX import_batches_tenant_idx ON import_batches (tenant_id, submodule, created_at DESC);

      ALTER TABLE lna_performance_records
        ADD COLUMN value_type varchar(16) NOT NULL DEFAULT 'angka'
          CHECK (value_type IN ('angka','persen','rating','biner','tenggat'));
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_performance_records DROP COLUMN IF EXISTS value_type;
      DROP TABLE IF EXISTS import_batches;
    `);
  },
};
