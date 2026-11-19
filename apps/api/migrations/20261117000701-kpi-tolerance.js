'use strict';
// PK-20 (17 Nov): PM-1 opsi B (★, belum dijawab) = arah + toleransi per KPI. Aturan per KPI disimpan di
// lna_kpi_rules; tiap baris kinerja menyimpan toleransi yang dipakai saat statusnya dihitung, sehingga
// perubahan aturan bisa menghitung ulang is_met (C-8, R2-11). Toleransi kosong = 0 (sama dengan opsi A).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE lna_kpi_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        metric_type varchar(8) NOT NULL,
        metric_key varchar(255) NOT NULL,
        name varchar(255) NOT NULL,
        direction varchar(8) NOT NULL DEFAULT 'higher' CHECK (direction IN ('higher','lower')),
        tolerance numeric NOT NULL DEFAULT 0 CHECK (tolerance >= 0),
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, metric_type, metric_key)
      );

      ALTER TABLE lna_performance_records
        ADD COLUMN tolerance numeric NOT NULL DEFAULT 0 CHECK (tolerance >= 0);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_performance_records DROP COLUMN IF EXISTS tolerance;
      DROP TABLE IF EXISTS lna_kpi_rules;
    `);
  },
};
