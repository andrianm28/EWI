'use strict';
// B10 keputusan user 23 Nov (D1): jawaban karyawan masuk sintesis per batch 5 penyelesaian dari orang berbeda.
// Penanda batch disimpan supaya batas batch tidak bergeser saat karyawan dihapus atau dua konfirmasi berbalapan.
// Spek: docs/designs/b10-core-competencies.md bagian 11.2 D-7.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE cca_assignments ADD COLUMN synthesis_settled_at timestamptz;
      -- penyelesaian sebelum keputusan ini sudah tampil di sintesis; tetap dihitung
      UPDATE cca_assignments SET synthesis_settled_at = completed_at WHERE tier = 'employee' AND status = 'completed';
      CREATE INDEX cca_assignments_unsettled_idx ON cca_assignments (tenant_id)
        WHERE tier = 'employee' AND status = 'completed' AND synthesis_settled_at IS NULL;
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP INDEX IF EXISTS cca_assignments_unsettled_idx;
      ALTER TABLE cca_assignments DROP COLUMN IF EXISTS synthesis_settled_at;
    `);
  },
};
