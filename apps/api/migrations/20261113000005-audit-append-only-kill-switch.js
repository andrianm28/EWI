'use strict';
// R2-2 (13 Nov): audit log tidak bisa diubah dari aplikasi -> UPDATE/DELETE/TRUNCATE ditolak trigger.
// Pemeliharaan (retensi, hapus tenant) hanya oleh DBA dengan `SET LOCAL ewi.audit_maintenance = 'on'`.
// R2-1 (13 Nov): saklar darurat global per fitur (kill switch), mengalahkan flag per tenant.
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
        RAISE EXCEPTION 'audit_logs bersifat append-only (%)', TG_OP USING ERRCODE = 'insufficient_privilege';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
      CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
        FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();
      CREATE INDEX audit_logs_tenant_resource_idx ON audit_logs (tenant_id, resource, at DESC);

      CREATE TABLE feature_kill_switches (
        key varchar(64) PRIMARY KEY,
        active boolean NOT NULL DEFAULT false,
        reason text,
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS feature_kill_switches;
      DROP INDEX IF EXISTS audit_logs_tenant_resource_idx;
      DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
      DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
      DROP FUNCTION IF EXISTS audit_logs_immutable();
    `);
  },
};
