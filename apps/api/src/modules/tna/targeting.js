'use strict';
// Siapa yang diwawancarai TNA. BT-29 masih terbuka, jadi kedua aturan disediakan dan dipilih eksplisit:
//  - 'all_members': semua anggota tim; target merah dibahas lebih dalam, yang hijau dinilai thd kamus kompetensi
//  - 'red_only'   : hanya karyawan dengan minimal satu target merah (contoh rapat 10 Nov)
const { INTERVIEW_SCOPES } = require('../../core/settings');

/**
 * members: [{ id }]; records: [{ id, userId, isMet }]
 * Return [{ userId, triggerRecordIds, focus: 'red' | 'competency' }]
 */
function selectInterviewees({ members, records, scope }) {
  if (!INTERVIEW_SCOPES.includes(scope)) throw new Error(`scope tidak dikenal: ${scope}`);
  const red = new Map();
  for (const r of records) {
    if (r.isMet === false) red.set(r.userId, [...(red.get(r.userId) || []), r.id]);
  }
  return members
    .map((m) => ({ userId: m.id, triggerRecordIds: red.get(m.id) || [], focus: red.has(m.id) ? 'red' : 'competency' }))
    .filter((x) => scope === 'all_members' || x.focus === 'red');
}

module.exports = { selectInterviewees };
