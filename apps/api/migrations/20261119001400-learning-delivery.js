'use strict';
// B14 (19 Nov): Learning Delivery. Pelatihan berjalan/akan datang (online dari EliteMentor lewat webhook atau dari
// status course LMS hasil impor PK-18; offline diinput HR), peserta, kehadiran, skor, dan dokumentasi.
// Spek: docs/designs/b14-learning-delivery.md. Bergantung pada li_modules (B13) dan lna_catalog_items (PK-18).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE ld_trainings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title varchar(255) NOT NULL,
        mode varchar(8) NOT NULL CHECK (mode IN ('online','offline')),
        -- manual = diinput HR di ELGOS; elitementor = webhook; lms = status course hasil impor katalog
        source varchar(16) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','elitementor','lms')),
        external_ref varchar(128),
        catalog_item_id uuid REFERENCES lna_catalog_items(id) ON DELETE SET NULL,
        module_id uuid REFERENCES li_modules(id) ON DELETE SET NULL,
        program_tier varchar(16) CHECK (program_tier IN ('basic','intermediate','advanced')),
        vendor_name varchar(255),
        venue varchar(255),
        starts_on date,
        ends_on date,
        session_count integer NOT NULL DEFAULT 1 CHECK (session_count >= 1),
        sessions_done integer NOT NULL DEFAULT 0 CHECK (sessions_done >= 0),
        status varchar(16) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','running','done','cancelled')),
        materials_ready boolean NOT NULL DEFAULT false,
        assessment_mode varchar(16) NOT NULL DEFAULT 'none' CHECK (assessment_mode IN ('none','elitementor','vendor_manual')),
        assessment_ref varchar(128),
        last_reminded_at timestamptz,
        last_event_at timestamptz,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (sessions_done <= session_count),
        CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
      );
      CREATE UNIQUE INDEX ld_trainings_external_idx ON ld_trainings (tenant_id, source, external_ref) WHERE external_ref IS NOT NULL;
      CREATE INDEX ld_trainings_tenant_idx ON ld_trainings (tenant_id, status, starts_on);

      CREATE TABLE ld_participants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        training_id uuid NOT NULL REFERENCES ld_trainings(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        progress_pct numeric(5,2) CHECK (progress_pct BETWEEN 0 AND 100),
        status varchar(16) NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','in_progress','completed','failed')),
        attendance boolean,
        attendance_by uuid REFERENCES users(id) ON DELETE SET NULL,
        attendance_at timestamptz,
        score numeric(5,2) CHECK (score BETWEEN 0 AND 100),
        score_source varchar(16) CHECK (score_source IN ('elitementor','lms','vendor_manual')),
        last_activity_at timestamptz,
        last_event_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (training_id, user_id)
      );
      CREATE INDEX ld_participants_user_idx ON ld_participants (tenant_id, user_id);

      CREATE TABLE ld_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        training_id uuid NOT NULL REFERENCES ld_trainings(id) ON DELETE CASCADE,
        kind varchar(16) NOT NULL CHECK (kind IN ('material','photo','video')),
        filename varchar(255) NOT NULL,
        mime varchar(64) NOT NULL,
        size_bytes integer NOT NULL,
        storage_key varchar(128) NOT NULL,
        uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ld_documents_training_idx ON ld_documents (tenant_id, training_id);

      -- idempotensi webhook: satu baris per event yang diterima untuk tenant yang dikenali
      CREATE TABLE ld_sync_events (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source varchar(16) NOT NULL,
        event_id varchar(128) NOT NULL,
        type varchar(64) NOT NULL,
        result jsonb NOT NULL DEFAULT '{}'::jsonb,
        received_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, source, event_id)
      );
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS ld_sync_events;
      DROP TABLE IF EXISTS ld_documents;
      DROP TABLE IF EXISTS ld_participants;
      DROP TABLE IF EXISTS ld_trainings;
    `);
  },
};
