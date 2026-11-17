-- Role aplikasi ELGOS (PD-8 opsi A, menutup P1-7). Dijalankan deploy.sh sebagai pemilik skema (elgos)
-- setelah setiap migrasi, jadi tabel baru otomatis ikut. Idempoten.
-- Variabel psql: :app_user, :app_password, :db_name.
--   - Aplikasi: hanya DML pada schema ewi; tanpa DDL (CREATE/ALTER/DROP), tanpa TRUNCATE.
--   - audit_logs: hanya INSERT + SELECT. UPDATE/DELETE/TRUNCATE ditolak oleh hak akses, sehingga
--     trigger append-only tidak bisa dilewati lewat SET ewi.audit_maintenance dari aplikasi.
--   - sequelize_meta: hanya SELECT (dipakai /api/ready untuk mengecek migrasi tertunda).
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE %I LOGIN', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec

ALTER ROLE :"app_user" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'app_password' CONNECTION LIMIT 50;
ALTER ROLE :"app_user" SET search_path = ewi;
ALTER ROLE :"app_user" SET statement_timeout = '60s';

REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db_name" TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS ewi;
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
ALTER DEFAULT PRIVILEGES IN SCHEMA ewi GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA ewi GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";

-- Bukti untuk log deploy: hak berbahaya harus false.
SELECT
  has_schema_privilege(:'app_user', 'ewi', 'CREATE') AS bisa_ddl,
  coalesce(has_table_privilege(:'app_user', to_regclass('ewi.audit_logs'), 'UPDATE'), false) AS bisa_ubah_audit,
  coalesce(has_table_privilege(:'app_user', to_regclass('ewi.audit_logs'), 'DELETE'), false) AS bisa_hapus_audit;
