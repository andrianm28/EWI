'use strict';
// Fondasi: tenant, user non-LTI, entitlement (B14), feature flag (Q1), audit log.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar(64) NOT NULL UNIQUE,
        name varchar(255) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
        -- pemetaan ke Organization EliteMentor (sistem terpisah, dipakai saat memanggil API-nya)
        elitementor_organization_id integer,
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email varchar(320) NOT NULL,
        name varchar(255),
        employee_id varchar(64),
        role varchar(32) NOT NULL CHECK (role IN ('eta_admin','hr_admin','pimpinan','supervisor','role_leader','sme','learner')),
        supervisor_id uuid REFERENCES users(id) ON DELETE SET NULL,
        password_hash varchar(255),
        status varchar(16) NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','disabled')),
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, email),
        UNIQUE (tenant_id, employee_id)
      );
      CREATE INDEX users_supervisor_idx ON users (tenant_id, supervisor_id);

      CREATE TABLE entitlements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product varchar(32) NOT NULL CHECK (product IN ('full_suite','cca','dna','tna','ina')),
        starts_at timestamptz NOT NULL DEFAULT now(),
        ends_at timestamptz,
        source varchar(32) NOT NULL DEFAULT 'manual',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX entitlements_tenant_idx ON entitlements (tenant_id, product);

      CREATE TABLE feature_flags (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        key varchar(64) NOT NULL,
        enabled boolean NOT NULL DEFAULT false,
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, key)
      );

      CREATE TABLE audit_logs (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action varchar(16) NOT NULL CHECK (action IN ('read','create','update','delete','export','login')),
        resource varchar(128) NOT NULL,
        meta jsonb NOT NULL DEFAULT '{}'::jsonb,
        at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX audit_logs_tenant_at_idx ON audit_logs (tenant_id, at DESC);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS audit_logs, feature_flags, entitlements, users, tenants CASCADE;
    `);
  },
};
