'use strict';
// Data karyawan & posisi: membuat/memperbarui akun karyawan (tanpa kata sandi; masuk lewat link email, R3-2),
// atasan langsung (RG-3), dan posisi job role + jenjang (DNA). Akun HR/Admin tidak bisa diubah lewat impor.
const v = require('../values');

const ROLE_CHOICES = {
  learner: ['karyawan', 'staf', 'staff', 'peserta'],
  supervisor: ['atasan', 'atasan langsung', 'spv', 'team leader', 'tl'],
  role_leader: ['role leader', 'pimpinan peran'],
  sme: ['narasumber', 'ahli'],
  pimpinan: ['manajer', 'manager', 'kepala', 'direktur'],
};

module.exports = {
  key: 'employees',
  label: 'Data karyawan & posisi',
  description: 'Daftar karyawan peserta, atasan langsung, job role, dan jenjang. Impor ini lebih dulu.',
  submodules: ['dna', 'tna'],
  fields: [
    { key: 'employeeId', header: 'ID Karyawan', required: true, aliases: ['nik', 'nip', 'employee id', 'id pegawai', 'no karyawan'], example: 'E-1001' },
    { key: 'name', header: 'Nama', required: true, aliases: ['nama karyawan', 'nama lengkap', 'name', 'full name'], example: 'Dimas Pratama' },
    { key: 'email', header: 'Email', required: true, aliases: ['e-mail', 'email kerja', 'alamat email', 'surel'], example: 'dimas@perusahaan.co.id', help: 'Dipakai untuk mengirim link masuk.' },
    { key: 'role', header: 'Peran', aliases: ['role', 'peran di elgos'], example: 'karyawan', help: 'karyawan (default), atasan, role leader, narasumber, atau pimpinan.' },
    { key: 'supervisorEmployeeId', header: 'ID Atasan', aliases: ['id atasan langsung', 'nik atasan', 'supervisor id'], example: 'E-0900', help: 'ID Karyawan atasan langsung (boleh ada di file yang sama).' },
    { key: 'jobRole', header: 'Job Role', aliases: ['jabatan', 'posisi', 'job role', 'role pekerjaan'], example: 'Service Delivery L1', help: 'Nama job role persis seperti di template Jenjang & program.' },
    { key: 'careerLevel', header: 'Jenjang', aliases: ['level', 'grade', 'jenjang karier'], example: 'Junior' },
  ],
  async context({ stores, tenantId, rows }) {
    const ids = rows.map((r) => v.text(r.employeeId)).filter(Boolean);
    const supIds = rows.map((r) => v.text(r.supervisorEmployeeId)).filter(Boolean);
    const emails = rows.map((r) => v.email(r.email)).filter(Boolean);
    const existing = await stores.people.resolve(tenantId, { employeeIds: [...new Set([...ids, ...supIds])], emails: [...new Set(emails)] });
    const roles = await stores.dna.listJobRoles(tenantId);
    return { existing, roles, fileIds: new Set(ids), seenIds: new Set(), seenEmails: new Set() };
  },
  validate(row, ctx) {
    const employeeId = v.text(row.employeeId); const name = v.text(row.name); const email = v.email(row.email);
    if (!employeeId || !name || !email) return { error: 'ID Karyawan, Nama, dan Email wajib diisi' };
    if (!v.isEmail(email)) return { error: 'Format email tidak valid' };
    if (ctx.seenIds.has(employeeId)) return { error: 'ID Karyawan muncul lebih dari sekali di file' };
    if (ctx.seenEmails.has(email)) return { error: 'Email muncul lebih dari sekali di file' };
    const role = v.blank(row.role) ? 'learner' : v.choice(row.role, ROLE_CHOICES);
    if (!role) return { error: 'Peran harus karyawan, atasan, role leader, narasumber, atau pimpinan' };
    const byId = ctx.existing.find((u) => u.employeeId === employeeId);
    const byEmail = ctx.existing.find((u) => u.email === email);
    if (byId && byEmail && byId.id !== byEmail.id) return { error: 'ID Karyawan dan Email milik dua akun berbeda' };
    const current = byId || byEmail;
    if (current && ['hr_admin', 'eta_admin'].includes(current.role)) return { error: 'Akun HR/Admin tidak bisa diubah lewat impor' };
    const sup = v.text(row.supervisorEmployeeId);
    if (sup && sup === employeeId) return { error: 'Atasan tidak boleh dirinya sendiri' };
    if (sup && !ctx.fileIds.has(sup) && !ctx.existing.some((u) => u.employeeId === sup)) return { error: `ID Atasan ${sup} tidak ditemukan di file maupun organisasi` };
    let jobRoleId = null; let careerLevelId = null;
    if (!v.blank(row.jobRole)) {
      const jr = ctx.roles.find((r) => r.name.trim().toLowerCase() === v.text(row.jobRole).toLowerCase());
      if (!jr) return { error: `Job role "${v.text(row.jobRole)}" belum ada (impor Jenjang & program dulu)` };
      jobRoleId = jr.id;
      if (!v.blank(row.careerLevel)) {
        const lvl = jr.levels.find((l) => l.name.trim().toLowerCase() === v.text(row.careerLevel).toLowerCase());
        if (!lvl) return { error: `Jenjang "${v.text(row.careerLevel)}" tidak ada di job role ${jr.name}` };
        careerLevelId = lvl.id;
      }
    } else if (!v.blank(row.careerLevel)) return { error: 'Jenjang butuh Job Role' };
    ctx.seenIds.add(employeeId); ctx.seenEmails.add(email);
    return { value: { id: current ? current.id : null, employeeId, name, email, role, supervisorEmployeeId: sup || null, jobRoleId, careerLevelId } };
  },
  async commit({ stores, tenantId, values }) {
    return stores.people.importEmployees(tenantId, values);
  },
};
