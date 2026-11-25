'use strict';
const v = require('../values');

/** Kolom identitas karyawan: salah satu wajib (ID karyawan atau email). */
const EMPLOYEE_FIELDS = [
  { key: 'employeeId', header: 'ID Karyawan', oneOf: 'employee', aliases: ['nik', 'nip', 'employee id', 'employeeid', 'id pegawai', 'no karyawan', 'nomor karyawan'], example: 'E-1001', help: 'ID karyawan di sistem HR. Isi ini atau Email.' },
  { key: 'email', header: 'Email', oneOf: 'employee', aliases: ['e-mail', 'email karyawan', 'alamat email', 'surel'], example: 'dimas@perusahaan.co.id', help: 'Email kerja karyawan. Isi ini atau ID Karyawan.' },
];

/** Cari karyawan yang disebut di file sekaligus; return fungsi row -> user | null. */
async function employeeFinder(stores, tenantId, rows) {
  const employeeIds = [...new Set(rows.map((r) => v.text(r.employeeId)).filter(Boolean))];
  const emails = [...new Set(rows.map((r) => v.email(r.email)).filter(Boolean))];
  const users = await stores.people.resolve(tenantId, { employeeIds, emails });
  return (row) => {
    const id = v.text(row.employeeId); const em = v.email(row.email);
    return users.find((u) => (id && u.employeeId === id) || (em && u.email === em)) || null;
  };
}

function employeeError(row) {
  if (v.blank(row.employeeId) && v.blank(row.email)) return 'ID Karyawan atau Email wajib diisi';
  return null;
}

const NOT_FOUND = 'Karyawan tidak ditemukan di organisasi ini (impor Data Karyawan dulu)';

const TIER_CHOICES = {
  basic: ['b', 'dasar', 'program dasar', 'learning program basic'],
  intermediate: ['i', 'menengah', 'program menengah', 'learning program intermediate'],
  advanced: ['a', 'advance', 'lanjutan', 'mahir', 'program lanjutan', 'learning program advanced'],
};

module.exports = { EMPLOYEE_FIELDS, employeeFinder, employeeError, NOT_FOUND, TIER_CHOICES };
