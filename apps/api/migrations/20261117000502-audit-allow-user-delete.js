'use strict';
// PK-15 butir 1 (17 Nov): hapus user gagal karena FK audit_logs.user_id ON DELETE SET NULL menjalankan UPDATE
// yang ditolak trigger append-only (20261113000005). Trigger kini mengizinkan satu kasus saja: UPDATE yang hanya
// mengubah user_id dari terisi menjadi NULL dan tidak mengubah kolom lain. UPDATE/DELETE/TRUNCATE lain tetap ditolak
// kecuali mode pemeliharaan DBA (`SET LOCAL ewi.audit_maintenance = 'on'`), yang tidak pernah dinyalakan aplikasi.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
      BEGIN
        IF coalesce(current_setting('ewi.audit_maintenance', true), '') = 'on' THEN
          RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND NEW.user_id IS NULL
           AND (to_jsonb(NEW) - 'user_id') = (to_jsonb(OLD) - 'user_id') THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'audit_logs bersifat append-only (%)', TG_OP USING ERRCODE = 'insufficient_privilege';
      END;
      $$ LANGUAGE plpgsql;
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
      BEGIN
        IF coalesce(current_setting('ewi.audit_maintenance', true), '') = 'on' THEN
          RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        RAISE EXCEPTION 'audit_logs bersifat append-only (%)', TG_OP USING ERRCODE = 'insufficient_privilege';
      END;
      $$ LANGUAGE plpgsql;
    `);
  },
};
