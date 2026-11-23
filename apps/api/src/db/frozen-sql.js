'use strict';
/**
 * Keputusan user 19 Nov (UU PDP): temuan dari sesi wawancara yang persetujuannya ditarik dibekukan, datanya tetap
 * disimpan. Predikat SQL bersama untuk semua tindak lanjut (spek: docs/designs/b8-karyawan.md, "Aturan baca").
 * `alias` adalah alias tabel lna_findings (atau lna_training_plan_items untuk planFrozen) di query pemanggil.
 */
const isFrozen = (alias) => `EXISTS (SELECT 1 FROM lna_interview_sessions cws WHERE cws.id = ${alias}.session_id
                                      AND cws.tenant_id = ${alias}.tenant_id AND cws.consent_withdrawn_at IS NOT NULL)`;
const notFrozen = (alias) => `NOT ${isFrozen(alias)}`;
/** Rencana yang temuannya dibekukan (rencana tanpa temuan tidak pernah beku). */
const planFrozen = (alias) => `EXISTS (SELECT 1 FROM lna_findings pf WHERE pf.id = ${alias}.finding_id
                                        AND pf.tenant_id = ${alias}.tenant_id AND ${isFrozen('pf')})`;

module.exports = { isFrozen, notFrozen, planFrozen };
