'use strict';
// B7 (19 Nov): tinjauan HR atas temuan AI mengikuti mockup Pak Eji. Spek: docs/designs/b7-tinjauan-hr.md
// 1. Temuan bisa ditahan ("Perlu ditinjau HR") tanpa keluar dari status draf, dan temuan Improvement Needs yang
//    sudah disetujui bisa diteruskan ke Improvement Needs (dibaca modul INA, B9).
// 2. Rencana training mencatat penugasan ke EliteMentor; 'sending' = klaim sebelum panggilan keluar supaya
//    dua permintaan bersamaan tidak mengirim dua kali.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_findings
        ADD COLUMN review_hold_at timestamptz,
        ADD COLUMN review_hold_by uuid REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN review_hold_note text,
        ADD COLUMN improvement_handoff_at timestamptz,
        ADD COLUMN improvement_handoff_by uuid REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX lna_findings_handoff_idx ON lna_findings (tenant_id, improvement_handoff_at) WHERE improvement_handoff_at IS NOT NULL;

      ALTER TABLE lna_training_plan_items
        ADD COLUMN assignment_target varchar(16) CHECK (assignment_target IN ('elitementor')),
        ADD COLUMN assignment_status varchar(16) CHECK (assignment_status IN ('sending','sent','failed')),
        ADD COLUMN assignment_ref varchar(128),
        ADD COLUMN assignment_claimed_at timestamptz,
        ADD COLUMN assigned_at timestamptz,
        ADD COLUMN assigned_by uuid REFERENCES users(id) ON DELETE SET NULL;
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_training_plan_items
        DROP COLUMN IF EXISTS assigned_by,
        DROP COLUMN IF EXISTS assigned_at,
        DROP COLUMN IF EXISTS assignment_claimed_at,
        DROP COLUMN IF EXISTS assignment_ref,
        DROP COLUMN IF EXISTS assignment_status,
        DROP COLUMN IF EXISTS assignment_target;
      DROP INDEX IF EXISTS lna_findings_handoff_idx;
      ALTER TABLE lna_findings
        DROP COLUMN IF EXISTS improvement_handoff_by,
        DROP COLUMN IF EXISTS improvement_handoff_at,
        DROP COLUMN IF EXISTS review_hold_note,
        DROP COLUMN IF EXISTS review_hold_by,
        DROP COLUMN IF EXISTS review_hold_at;
    `);
  },
};
