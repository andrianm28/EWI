'use strict';
// PK-23 (aturan bisnis wajib saat live, PM-8 ★ B+C+D+E):
// - K-3: status rencana training satu set: Diminta (requested), Baru (new), Berjalan (in_progress),
//   Selesai (completed), Ditolak (rejected). "Perlu modul baru" bukan status lagi: diturunkan dari
//   catalog_item_ref yang kosong.
// - Q38: undangan wawancara berlaku 7 hari, bisa diperpanjang HR (invite_expires_at).
// - PRJ-6/T4: pengingat email H-3 dan H-1 dicatat per sesi agar tidak terkirim dua kali.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      ALTER TABLE lna_training_plan_items DROP CONSTRAINT lna_training_plan_items_status_check;
      UPDATE lna_training_plan_items SET status = CASE
          WHEN status = 'proposed' AND origin = 'learner_request' THEN 'requested'
          WHEN status IN ('proposed','needs_module','assigned') THEN 'new'
          WHEN status = 'cancelled' THEN 'rejected'
          ELSE status END;
      ALTER TABLE lna_training_plan_items
        ALTER COLUMN status SET DEFAULT 'new',
        ADD CONSTRAINT lna_training_plan_items_status_check
          CHECK (status IN ('requested','new','in_progress','completed','rejected'));

      -- Sesi lama ikut mendapat masa berlaku 7 hari sejak dibuat
      ALTER TABLE lna_interview_sessions
        ADD COLUMN invite_expires_at timestamptz,
        ADD COLUMN invite_extended_count smallint NOT NULL DEFAULT 0,
        ADD COLUMN reminder_h3_at timestamptz,
        ADD COLUMN reminder_h1_at timestamptz;
      UPDATE lna_interview_sessions SET invite_expires_at = created_at + interval '7 days';
      ALTER TABLE lna_interview_sessions
        ALTER COLUMN invite_expires_at SET NOT NULL,
        ALTER COLUMN invite_expires_at SET DEFAULT now() + interval '7 days';
      CREATE INDEX lna_sessions_invite_idx ON lna_interview_sessions (status, invite_expires_at);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP INDEX IF EXISTS lna_sessions_invite_idx;
      ALTER TABLE lna_interview_sessions
        DROP COLUMN IF EXISTS reminder_h1_at, DROP COLUMN IF EXISTS reminder_h3_at,
        DROP COLUMN IF EXISTS invite_extended_count, DROP COLUMN IF EXISTS invite_expires_at;

      ALTER TABLE lna_training_plan_items DROP CONSTRAINT lna_training_plan_items_status_check;
      UPDATE lna_training_plan_items SET status = CASE
          WHEN status = 'requested' THEN 'proposed'
          WHEN status = 'new' AND catalog_item_ref IS NULL AND origin <> 'learner_request' THEN 'needs_module'
          WHEN status = 'new' THEN 'proposed'
          WHEN status = 'rejected' THEN 'cancelled'
          ELSE status END;
      ALTER TABLE lna_training_plan_items
        ALTER COLUMN status SET DEFAULT 'proposed',
        ADD CONSTRAINT lna_training_plan_items_status_check
          CHECK (status IN ('proposed','needs_module','assigned','in_progress','completed','cancelled'));
    `);
  },
};
