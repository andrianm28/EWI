'use strict';
// EM-LTI (25 Nov): ELGOS sebagai LTI 1.3 Platform untuk EliteMentor (ADR 0003). Spek: docs/designs/em-lti-platform.md §4.
// Kunci privat platform TIDAK disimpan di DB (env ELGOS_LTI_PRIVATE_KEY).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE lti_tools (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name varchar(120) NOT NULL,
        client_id varchar(255) NOT NULL UNIQUE,
        deployment_id varchar(255) NOT NULL,
        login_url varchar(1024) NOT NULL,
        launch_url varchar(1024) NOT NULL,
        redirect_uris text[] NOT NULL DEFAULT '{}',
        jwks_url varchar(1024) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, name)
      );

      CREATE TABLE lti_resource_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tool_id uuid NOT NULL REFERENCES lti_tools(id) ON DELETE CASCADE,
        kind varchar(24) NOT NULL CHECK (kind IN ('plan_item','offline_training')),
        plan_item_id uuid REFERENCES lna_training_plan_items(id) ON DELETE CASCADE,
        training_id uuid REFERENCES ld_trainings(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        course_ref varchar(128) NOT NULL,
        title varchar(255) NOT NULL,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK ((kind = 'plan_item' AND plan_item_id IS NOT NULL AND user_id IS NOT NULL AND training_id IS NULL)
            OR (kind = 'offline_training' AND training_id IS NOT NULL AND plan_item_id IS NULL AND user_id IS NULL))
      );
      CREATE UNIQUE INDEX lti_links_plan_idx ON lti_resource_links (tenant_id, plan_item_id) WHERE plan_item_id IS NOT NULL;
      CREATE UNIQUE INDEX lti_links_training_idx ON lti_resource_links (tenant_id, training_id) WHERE training_id IS NOT NULL;

      CREATE TABLE lti_user_subs (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sub varchar(64) NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, user_id)
      );

      CREATE TABLE lti_launch_tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        link_id uuid NOT NULL REFERENCES lti_resource_links(id) ON DELETE CASCADE,
        tool_id uuid NOT NULL REFERENCES lti_tools(id) ON DELETE CASCADE,
        ticket_hash char(64) NOT NULL UNIQUE,
        binder_hash char(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lti_tickets_expiry_idx ON lti_launch_tickets (expires_at);

      CREATE TABLE lti_used_jti (
        tool_id uuid NOT NULL REFERENCES lti_tools(id) ON DELETE CASCADE,
        jti varchar(255) NOT NULL,
        expires_at timestamptz NOT NULL,
        PRIMARY KEY (tool_id, jti)
      );
    `);
  },

  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS lti_used_jti;
      DROP TABLE IF EXISTS lti_launch_tickets;
      DROP TABLE IF EXISTS lti_user_subs;
      DROP TABLE IF EXISTS lti_resource_links;
      DROP TABLE IF EXISTS lti_tools;
    `);
  },
};
