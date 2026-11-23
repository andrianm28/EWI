'use strict';
// B4: job function hasil DACUM Tool 1 per jabatan (JF1, JF2, ...). Pemetaan ke kompetensi diisi lewat
// kolom Job Function di impor Kamus kompetensi.
const v = require('../values');

const lower = (s) => s.trim().toLowerCase();

module.exports = {
  key: 'dna_job_functions',
  label: 'Job function',
  description: 'Fungsi kerja per jabatan (DACUM Tool 1), bernomor urut. Impor ini sebelum Kamus kompetensi.',
  submodules: ['dna'],
  flag: 'dna.development', // B4: jenis ini hanya ada bila flag menyala
  fields: [
    { key: 'jobRole', header: 'Job Role', required: true, aliases: ['jabatan', 'posisi'], example: 'Engineer Service Delivery', help: 'Jabatan harus sudah ada (impor Jenjang & program dulu).' },
    { key: 'order', header: 'No', aliases: ['nomor', 'no jf', 'jf', 'urutan'], example: 1, help: 'Nomor job function mulai 1. Kosong = lanjut dari nomor terakhir.' },
    { key: 'name', header: 'Job Function', required: true, aliases: ['fungsi kerja', 'nama job function', 'duty'], example: 'Penanganan insiden sesuai SLA' },
  ],
  async context({ stores, tenantId }) {
    const roles = await stores.dna.listJobRoles(tenantId);
    const state = new Map(); // jobRoleId -> { orders, names, next }
    for (const r of roles) {
      const fns = await stores.dna.listJobFunctions(tenantId, r.id);
      state.set(r.id, { orders: new Set(fns.map((f) => f.order)), names: new Set(fns.map((f) => lower(f.name))), next: Math.max(0, ...fns.map((f) => f.order)) + 1 });
    }
    return { roles, state };
  },
  validate(row, ctx) {
    const name = v.text(row.name);
    if (v.blank(row.jobRole) || !name) return { error: 'Job Role dan Job Function wajib diisi' };
    if (name.length > 255) return { error: 'Job Function maksimal 255 karakter' };
    const jr = ctx.roles.find((r) => lower(r.name) === lower(v.text(row.jobRole)));
    if (!jr) return { error: `Job role "${v.text(row.jobRole)}" belum ada` };
    const st = ctx.state.get(jr.id);
    let order = v.blank(row.order) ? null : v.integer(row.order);
    if (order !== null && !(order >= 1 && order <= 999)) return { error: 'No harus bilangan bulat 1-999' };
    if (st.names.has(lower(name))) return { error: 'Job function ini sudah ada di jabatan tersebut' };
    if (order === null) { while (st.orders.has(st.next)) st.next += 1; order = st.next; }
    if (order > 999) return { error: 'No job function maksimal 999' };
    if (st.orders.has(order)) return { error: `No ${order} sudah dipakai di jabatan tersebut` };
    st.orders.add(order); st.names.add(lower(name));
    return { value: { jobRoleId: jr.id, order, name } };
  },
  async commit({ stores, tenantId, values }) {
    for (const f of values) await stores.dna.createJobFunction(tenantId, f);
    return { jobFunctions: values.length };
  },
};
