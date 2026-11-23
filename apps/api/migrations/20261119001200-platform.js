'use strict';
// B12: konfigurasi platform, log audit platform (append-only), dan hitungan percobaan masuk tanpa tenant.
// Spek: docs/designs/b12-super-admin.md (rencana implementasi, Migrasi).
const { QueryTypes } = require('sequelize');
const { applyAppRole, appRoleFromEnv } = require('../src/db/app-role');

const S = process.env.DB_SCHEMA || 'ewi';
const grants = (qi) => applyAppRole({
  query: (sql) => qi.sequelize.query(sql, { type: sql.trim().startsWith('SELECT') ? QueryTypes.SELECT : QueryTypes.RAW }),
  schema: S, role: appRoleFromEnv(), mode: 'grant', log: (m) => console.log(m),
});

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      CREATE TABLE platform_settings (
        key varchar(64) PRIMARY KEY,
        value jsonb NOT NULL,
        updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO platform_settings (key, value) VALUES ('sessionIdleMinutes', '30'), ('aiHrAgreementTarget', '85');

      CREATE TABLE platform_audit_logs (
        id bigserial PRIMARY KEY,
        actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        actor_tenant_id uuid NULL REFERENCES tenants(id) ON DELETE SET NULL,
        action varchar(16) NOT NULL CHECK (action IN ('create', 'update')),
        resource varchar(32) NOT NULL CHECK (resource IN ('tenant', 'tenant.invitation', 'tenant.module', 'platform.setting')),
        target_tenant_id uuid NULL REFERENCES tenants(id) ON DELETE SET NULL,
        meta jsonb NOT NULL DEFAULT '{}'::jsonb,
        at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX platform_audit_logs_at_idx ON platform_audit_logs (at DESC);

      -- Append-only. Satu-satunya UPDATE yang lolos: kolom FK menjadi NULL karena akun/tenant dihapus
      -- (ON DELETE SET NULL), tanpa mengubah kolom lain. Mode pemeliharaan DBA tetap bisa semuanya.
      CREATE FUNCTION platform_audit_logs_immutable() RETURNS trigger AS $$
      DECLARE
        fk text[] := ARRAY['actor_user_id', 'actor_tenant_id', 'target_tenant_id'];
        k text;
      BEGIN
        IF coalesce(current_setting('ewi.audit_maintenance', true), '') = 'on' THEN
          RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - fk) = (to_jsonb(OLD) - fk) THEN
          FOREACH k IN ARRAY fk LOOP
            IF (to_jsonb(NEW) ->> k) IS DISTINCT FROM (to_jsonb(OLD) ->> k) AND (to_jsonb(NEW) ->> k) IS NOT NULL THEN
              RAISE EXCEPTION 'platform_audit_logs bersifat append-only (%)', TG_OP USING ERRCODE = 'insufficient_privilege';
            END IF;
          END LOOP;
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'platform_audit_logs bersifat append-only (%)', TG_OP USING ERRCODE = 'insufficient_privilege';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER platform_audit_logs_append_only BEFORE UPDATE OR DELETE ON platform_audit_logs
        FOR EACH ROW EXECUTE FUNCTION platform_audit_logs_immutable();
      CREATE TRIGGER platform_audit_logs_no_truncate BEFORE TRUNCATE ON platform_audit_logs
        FOR EACH STATEMENT EXECUTE FUNCTION platform_audit_logs_immutable();

      CREATE TABLE platform_attempt_counters (
        hour timestamptz NOT NULL,
        outcome varchar(32) NOT NULL CHECK (outcome IN ('unknown_org', 'unknown_account', 'invalid_link')),
        count integer NOT NULL DEFAULT 0,
        PRIMARY KEY (hour, outcome)
      );
    `);
    await grants(qi);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS platform_attempt_counters;
      DROP TABLE IF EXISTS platform_audit_logs;
      DROP FUNCTION IF EXISTS platform_audit_logs_immutable();
      DROP TABLE IF EXISTS platform_settings;
    `);
  },
};
