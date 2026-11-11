'use strict';
// Persona EWI (BRD 3 persona + B2 + RG-3 = 7 persona).
const ROLES = Object.freeze({
  ETA_ADMIN: 'eta_admin',       // Admin ETA: kalibrasi skor AI, golden set (B2/B20)
  HR_ADMIN: 'hr_admin',         // HR klien: melihat seluruh karyawan (RG-3)
  PIMPINAN: 'pimpinan',         // narasumber CCA, penerima laporan INA (B2)
  SUPERVISOR: 'supervisor',     // atasan langsung: melihat timnya sendiri (RG-3)
  ROLE_LEADER: 'role_leader',   // validator SME untuk DNA (B2)
  SME: 'sme',                   // narasumber DACUM
  LEARNER: 'learner',           // karyawan: melihat hasilnya sendiri (Q45)
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

module.exports = { ROLES, ALL_ROLES };
