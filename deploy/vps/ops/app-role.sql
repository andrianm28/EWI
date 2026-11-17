-- Role database ELGOS (PD-8 opsi A, menutup P1-7; selaras docs/ewi/database-role-dan-migrasi.md).
-- Dijalankan deploy.sh / restore.sh sebagai superuser bawaan container (elgos) sebelum dan sesudah
-- migrasi, dan setelah restore. Idempoten.
-- Variabel psql: :owner_user, :owner_password, :app_user, :app_password, :db_name.
--   - Pemilik (elgos_owner): bukan superuser; pemilik database, schema ewi, dan semua objeknya.
--     Menjalankan migrasi (DB_MIGRATION_USER).
--   - Aplikasi (elgos_app): hanya DML pada schema ewi; tanpa DDL, tanpa TRUNCATE.
--     audit_logs hanya INSERT + SELECT; sequelize_meta hanya SELECT.
--   - Superuser bawaan hanya untuk bootstrap, backup, dan restore; tidak dipakai aplikasi/migrasi.
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE %I LOGIN', r)
FROM unnest(ARRAY[:'owner_user', :'app_user']) AS r
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec

ALTER ROLE :"owner_user" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'owner_password' CONNECTION LIMIT 10;
ALTER ROLE :"app_user" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'app_password' CONNECTION LIMIT 50;
ALTER ROLE :"app_user" SET search_path = ewi;
ALTER ROLE :"app_user" SET statement_timeout = '60s';

ALTER DATABASE :"db_name" OWNER TO :"owner_user";
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db_name" TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS ewi;
ALTER SCHEMA ewi OWNER TO :"owner_user";

-- Objek lama/hasil restore milik superuser dipindah ke pemilik. REASSIGN OWNED tidak dipakai karena
-- superuser bawaan juga memiliki objek sistem.
SELECT format('ALTER TABLE ewi.%I OWNER TO %I', tablename, :'owner_user')
  FROM pg_tables WHERE schemaname = 'ewi' AND tableowner <> :'owner_user'
UNION ALL
SELECT format('ALTER SEQUENCE ewi.%I OWNER TO %I', sequencename, :'owner_user')
  FROM pg_sequences WHERE schemaname = 'ewi' AND sequenceowner <> :'owner_user'
UNION ALL
SELECT format('ALTER VIEW ewi.%I OWNER TO %I', viewname, :'owner_user')
  FROM pg_views WHERE schemaname = 'ewi' AND viewowner <> :'owner_user'
UNION ALL
SELECT format('ALTER %s ewi.%I(%s) OWNER TO %I', CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
              p.proname, pg_get_function_identity_arguments(p.oid), :'owner_user')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'ewi' AND pg_get_userbyid(p.proowner) <> :'owner_user'
UNION ALL
SELECT format('ALTER TYPE ewi.%I OWNER TO %I', t.typname, :'owner_user')
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
 WHERE n.nspname = 'ewi' AND t.typtype IN ('e', 'd') AND pg_get_userbyid(t.typowner) <> :'owner_user' \gexec

REVOKE ALL ON SCHEMA ewi FROM PUBLIC;
GRANT USAGE ON SCHEMA ewi TO :"app_user";

REVOKE ALL ON ALL TABLES IN SCHEMA ewi FROM :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ewi TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ewi TO :"app_user";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ewi TO :"app_user";

SELECT format('REVOKE UPDATE, DELETE, TRUNCATE ON ewi.audit_logs FROM %I', :'app_user')
WHERE to_regclass('ewi.audit_logs') IS NOT NULL \gexec
SELECT format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ewi.sequelize_meta FROM %I', :'app_user')
WHERE to_regclass('ewi.sequelize_meta') IS NOT NULL \gexec

-- Objek yang dibuat migrasi berikutnya (oleh pemilik) langsung bisa dipakai aplikasi.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA ewi GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA ewi GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";

-- Bukti untuk log deploy: semuanya harus false.
SELECT
  has_schema_privilege(:'app_user', 'ewi', 'CREATE') AS bisa_ddl,
  coalesce(has_table_privilege(:'app_user', to_regclass('ewi.audit_logs'), 'UPDATE'), false) AS bisa_ubah_audit,
  coalesce(has_table_privilege(:'app_user', to_regclass('ewi.audit_logs'), 'DELETE'), false) AS bisa_hapus_audit,
  (SELECT bool_or(rolsuper) FROM pg_roles WHERE rolname IN (:'owner_user', :'app_user')) AS ada_superuser,
  EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ewi' AND tableowner <> :'owner_user') AS tabel_bukan_milik_owner;
