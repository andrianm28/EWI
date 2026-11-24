'use strict';
// R2-3: enkripsi data lama (sebelum migrasi 20261113000008) dengan kunci tenant masing-masing. Idempoten:
// nilai yang sudah berawalan "enc:" dilewati. Jalankan setelah migrasi:  node scripts/encrypt-existing.js
const { QueryTypes } = require('sequelize');
const { loadConfig } = require('../src/config/env');
const { createDb } = require('../src/db');
const { createStores } = require('../src/db/stores');

// [tabel, kolom, ekspresi tenant] — turns tidak punya tenant_id, diambil dari sesi
const TARGETS = [
  ['lna_assessments', 'evidence', 'x.tenant_id', ''],
  ['lna_findings', 'title', 'x.tenant_id', ''],
  ['lna_findings', 'detail', 'x.tenant_id', ''],
  ['lna_training_plan_items', 'note', 'x.tenant_id', ''],
  ['lna_interview_turns', 'text', 's.tenant_id', 'JOIN lna_interview_sessions s ON s.id = x.session_id'],
  ['lna_interview_turns', 'corrected_text', 's.tenant_id', 'JOIN lna_interview_sessions s ON s.id = x.session_id'],
];

(async () => {
  const config = loadConfig();
  const db = createDb(config);
  const { cipher } = createStores(db, { encryption: config.encryption });
  let total = 0;
  for (const [table, col, tenantExpr, join] of TARGETS) {
    const rows = await db.query(
      `SELECT x.id, ${tenantExpr} AS "tenantId", x.${col} AS v FROM ${table} x ${join}
        WHERE x.${col} IS NOT NULL AND x.${col} NOT LIKE 'enc:%'`, { type: QueryTypes.SELECT });
    for (const r of rows) {
      await db.query(`UPDATE ${table} SET ${col} = :v WHERE id = :id AND ${col} NOT LIKE 'enc:%'`, { replacements: { id: r.id, v: await cipher.encrypt(r.tenantId, r.v) } });
    }
    console.log(`${table}.${col}: ${rows.length} dienkripsi`);
    total += rows.length;
  }
  const batches = await db.query(`SELECT id, tenant_id AS "tenantId", rows FROM import_batches WHERE jsonb_typeof(rows) = 'array' AND jsonb_array_length(rows) > 0`, { type: QueryTypes.SELECT });
  for (const b of batches) {
    await db.query('UPDATE import_batches SET rows = CAST(:v AS jsonb) WHERE id = :id', { replacements: { id: b.id, v: JSON.stringify(await cipher.encryptJson(b.tenantId, b.rows)) } });
  }
  console.log(`import_batches.rows: ${batches.length} dienkripsi`);
  console.log(`selesai: ${total + batches.length} nilai`);
  await db.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
