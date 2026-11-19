'use strict';
// B16 Career & Promotion: keputusan promosi dua tahap (atasan merekomendasi, HR menyetujui).
// Spek: docs/designs/b16-career-promotion.md. Catatan (supervisor_note, hr_note) terenkripsi per tenant (R2-3).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      CREATE TABLE lna_promotion_decisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        from_level_id uuid NOT NULL REFERENCES lna_career_levels(id) ON DELETE CASCADE,
        to_level_id uuid NOT NULL REFERENCES lna_career_levels(id) ON DELETE CASCADE,
        okr_achievement numeric(5,2),
        supervisor_decision varchar(16) NOT NULL CHECK (supervisor_decision IN ('recommend','hold')),
        supervisor_by uuid REFERENCES users(id) ON DELETE SET NULL,
        supervisor_at timestamptz NOT NULL,
        supervisor_note text,
        hr_decision varchar(16) CHECK (hr_decision IN ('approved','hold')),
        hr_by uuid REFERENCES users(id) ON DELETE SET NULL,
        hr_at timestamptz,
        hr_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      -- paling banyak satu siklus terbuka per karyawan dan jenjang tujuan
      CREATE UNIQUE INDEX lna_promotion_open_uq ON lna_promotion_decisions (tenant_id, user_id, to_level_id) WHERE hr_decision IS NULL;
      CREATE INDEX lna_promotion_user_idx ON lna_promotion_decisions (tenant_id, user_id, created_at DESC);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS lna_promotion_decisions;
    `);
  },
};
