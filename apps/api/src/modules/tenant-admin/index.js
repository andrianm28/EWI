'use strict';
// B11: layar Admin Tenant (mockup Pak Eji: Pengguna & peran, Jabatan & kamus kompetensi, Impor data & integrasi).
// Spek: docs/designs/b11-admin-tenant.md. Seluruh rute di balik flag admin.tenant dan requireTenantAdmin.
// Tidak mengubah flag/entitlement (hanya Admin ETA, R2-1) dan tidak pernah memberi peran eta_admin.
const express = require('express');
const { FLAGS, requireFlag } = require('../../core/flags');
const { ROLES } = require('../../core/rbac/roles');
const { badRequest, forbidden, notFound, HttpError } = require('../../core/errors');
const { RATE } = require('../../core/auth/email-link');
const { importRouter } = require('../imports');
const { requireSubmodule } = require('../../core/entitlement/guard');
const { isUniqueViolation } = require('../../db/tenant-admin-stores');
const { requireTenantAdmin, assignableRoles, roleLabel, assertCanGrant, assertCanManage } = require('./access');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIERS = ['basic', 'intermediate', 'advanced'];
const USER_STATUSES = ['invited', 'active', 'disabled'];
// Hanya dua kartu di mockup: model kompetensi (per jabatan) dan KPI/OKR (per periode). Jenis impor lain
// (karyawan, hasil DNA individu, status lulus) tetap di layar HR.
const IMPORT_KINDS = Object.freeze({ dna: ['dna_competencies'], tna: ['tna_performance'] });
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const conflict = (code, message) => new HttpError(409, code, message);
// "Belum pernah masuk": akun diundang, atau akun hasil impor (langsung active) yang belum pernah login.
const pendingLogin = (u) => u.status !== 'disabled' && !u.lastLoginAt;
const publicUser = (u) => ({ ...u, roleLabel: roleLabel(u.role), pendingLogin: pendingLogin(u) });
const duplicateUser = () => conflict('DUPLICATE', 'Email atau ID karyawan sudah dipakai akun lain di organisasi ini');

/** Teks opsional: undefined = tidak dikirim, null/'' = dikosongkan. Melempar 400 bila terlalu panjang. */
function optionalText(body, key, label, max) {
  if (!has(body, key)) return undefined;
  const raw = body[key];
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') throw badRequest(`${label} harus berupa teks`);
  const s = String(raw).trim();
  if (s.length > max) throw badRequest(`${label} maksimal ${max} karakter`);
  return s || null;
}

/** Id opsional yang merujuk baris lain: undefined = tidak dikirim, null = dikosongkan. */
function optionalId(body, key, label) {
  if (!has(body, key)) return undefined;
  if (body[key] === null || body[key] === '') return null;
  if (!isUuid(body[key])) throw badRequest(`${label} tidak dikenal`);
  return body[key].toLowerCase();
}

function checkRole(role) {
  if (role === ROLES.ETA_ADMIN) throw forbidden('ROLE_FORBIDDEN', 'Peran Super Admin tidak bisa diberikan dari layar Admin Tenant');
  if (!assignableRoles().includes(role)) throw badRequest(`Peran harus salah satu dari: ${assignableRoles().join(', ')}`);
}

module.exports = {
  key: 'tenant-admin',
  title: 'Admin Tenant',
  router({ stores, flags, audit, settings, entitlements, links, elitementor = {} }) {
    const r = express.Router();
    const db = stores.tenantAdmin;
    r.use(requireFlag(flags, FLAGS.TENANT_ADMIN, 'Layar Admin Tenant belum diaktifkan untuk organisasi Anda'));
    const adminOnly = requireTenantAdmin(db);
    r.use(adminOnly);

    /** Jabatan + jenjang + atasan dari body, semuanya dicari ulang di tenant ini. `current` = akun yang diubah (PATCH). */
    async function resolvePosition(req, body, current) {
      const out = {};
      const jobRoleId = optionalId(body, 'jobRoleId', 'Jabatan');
      const careerLevelId = optionalId(body, 'careerLevelId', 'Jenjang');
      const supervisorId = optionalId(body, 'supervisorId', 'Atasan');
      if (jobRoleId !== undefined) {
        if (jobRoleId && !(await db.getJobRole(req.tenantId, jobRoleId))) throw badRequest('Jabatan tidak ditemukan di organisasi ini');
        out.jobRoleId = jobRoleId;
        // jabatan berganti: jenjang lama tidak berlaku lagi
        if (current && jobRoleId !== current.jobRoleId && careerLevelId === undefined) out.careerLevelId = null;
      }
      if (careerLevelId !== undefined) {
        const roleId = out.jobRoleId !== undefined ? out.jobRoleId : (current ? current.jobRoleId : null);
        if (careerLevelId) {
          if (!roleId) throw badRequest('Jenjang butuh Jabatan');
          const levels = await stores.dna.listLevels(req.tenantId, roleId);
          if (!levels.some((l) => l.id === careerLevelId)) throw badRequest('Jenjang bukan bagian dari jabatan ini');
        }
        out.careerLevelId = careerLevelId;
      }
      if (supervisorId !== undefined) {
        if (supervisorId) {
          if (current && supervisorId === current.id) throw badRequest('Atasan tidak boleh dirinya sendiri');
          const sup = await db.getUser(req.tenantId, supervisorId);
          if (!sup) throw badRequest('Atasan tidak ditemukan di organisasi ini');
          if (current && sup.supervisorId === current.id) throw badRequest('Dua akun tidak boleh saling menjadi atasan');
        }
        out.supervisorId = supervisorId;
      }
      return out;
    }

    async function loadUser(req) {
      const user = isUuid(req.params.id) ? await db.getUser(req.tenantId, req.params.id) : null;
      if (!user) throw notFound('Pengguna tidak ditemukan');
      return user;
    }

    /** Kirim undangan (link 7 hari). Return false bila email gagal terkirim; akun tetap ada dan bisa dikirim ulang. */
    async function sendInvite(req, user) {
      const tenant = await db.tenantInfo(req.tenantId);
      try {
        await links.issue({ id: user.id, tenantId: req.tenantId, email: user.email, name: user.name }, 'invite', { createdBy: req.user.id, tenantName: tenant && tenant.name });
      } catch (e) {
        console.error('[tenant-admin] undangan gagal dikirim:', e.message);
        return false;
      }
      await audit.record(req, 'create', 'tenant_admin.invitation', { employeeIds: [user.id] });
      return true;
    }

    // ---------- Pengguna & peran ----------
    r.get('/roles', (_req, res) => res.json({ data: assignableRoles().map((key) => ({ key, label: roleLabel(key) })) }));

    r.get('/users', wrap(async (req, res) => {
      const status = req.query.status ? String(req.query.status) : null;
      if (status && !USER_STATUSES.includes(status)) throw badRequest('status harus invited, active, atau disabled');
      const q = req.query.q ? String(req.query.q).trim().slice(0, 100) : null;
      const [rows, total] = await Promise.all([db.listUsers(req.tenantId, { q, status }), db.countUsers(req.tenantId)]);
      // Chip "SSO aktif" = SSO perusahaan (flag auth.sso, paket B1), bukan SSO ke EliteMentor. Belum ada -> false.
      const sso = flags.isKnown('auth.sso') ? await flags.isEnabled(req.tenantId, 'auth.sso') : false;
      res.json({ data: rows.map(publicUser), meta: { total, sso } });
    }));

    r.post('/users', wrap(async (req, res) => {
      const body = req.body || {};
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!EMAIL_RE.test(email) || email.length > 320) throw badRequest('Email wajib diisi dengan format yang benar');
      const name = optionalText(body, 'name', 'Nama', 255);
      if (!name) throw badRequest('Nama wajib diisi');
      checkRole(body.role);
      assertCanGrant(req.user, body.role);
      const employeeId = optionalText(body, 'employeeId', 'ID karyawan', 64);
      const position = await resolvePosition(req, body, null);
      const user = await db.createUser(req.tenantId, { email, name, role: body.role, employeeId, ...position });
      if (!user) throw duplicateUser();
      await audit.record(req, 'create', 'tenant_admin.user', { employeeIds: [user.id], assignedRole: user.role });
      const invited = await sendInvite(req, user);
      res.status(201).json({
        data: publicUser(user), invited,
        ...(invited ? {} : { message: 'Akun dibuat, tetapi email undangan gagal dikirim. Gunakan "Kirim ulang undangan".' }),
      });
    }));

    r.patch('/users/:id', wrap(async (req, res) => {
      const current = await loadUser(req);
      if (current.role === ROLES.ETA_ADMIN) throw forbidden('ROLE_FORBIDDEN', 'Akun Super Admin tidak bisa diubah dari layar Admin Tenant');
      assertCanManage(req.user, current);
      const body = req.body || {};
      const patch = {};
      if (has(body, 'name')) {
        patch.name = optionalText(body, 'name', 'Nama', 255);
        if (!patch.name) throw badRequest('Nama tidak boleh kosong');
      }
      if (has(body, 'role')) { checkRole(body.role); assertCanGrant(req.user, body.role); patch.role = body.role; }
      if (has(body, 'employeeId')) patch.employeeId = optionalText(body, 'employeeId', 'ID karyawan', 64);
      if (has(body, 'status')) {
        if (!['active', 'disabled'].includes(body.status)) throw badRequest('status harus active atau disabled');
        if (body.status === 'active' && current.status === 'invited') throw badRequest('Akun yang belum menerima undangan menjadi aktif lewat link undangan');
        // akun yang dinonaktifkan sebelum pernah masuk kembali ke "diundang", agar undangan bisa dikirim ulang
        patch.status = body.status === 'active' && current.status === 'disabled' && !current.lastLoginAt ? 'invited' : body.status;
      }
      Object.assign(patch, await resolvePosition(req, body, current));
      if (!Object.keys(patch).length) throw badRequest('Tidak ada perubahan yang dikirim');

      const changes = {};
      for (const [k, to] of Object.entries(patch)) if (current[k] !== to) changes[k] = { from: current[k], to };
      if (current.id === req.user.id && (changes.role || changes.status)) {
        throw conflict('SELF_CHANGE', 'Anda tidak bisa mengubah peran atau status akun Anda sendiri');
      }
      if (!Object.keys(changes).length) return res.json({ data: publicUser(current) });
      const saved = await db.updateUser(req.tenantId, current.id, Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.to])));
      if (!saved) throw duplicateUser();
      await audit.record(req, 'update', 'tenant_admin.user', { employeeIds: [current.id], changes });
      // izin temuan di luar pelatihan hanya berarti untuk atasan; peran berganti → izin dicabut dan tidak kembali sendiri (CD-8)
      if (changes.role && current.role === ROLES.SUPERVISOR && await stores.tna.revokeNonTraining(req.tenantId, current.id, req.user.id)) {
        await audit.record(req, 'delete', 'tna.non_training_access', { supervisorId: current.id, employeeIds: [current.id], via: 'tenant-admin', reason: 'role_changed' });
      }
      return res.json({ data: publicUser(saved) });
    }));

    r.post('/users/:id/invite', wrap(async (req, res) => {
      const user = await loadUser(req);
      if (user.role === ROLES.ETA_ADMIN) throw forbidden('ROLE_FORBIDDEN', 'Akun Super Admin tidak dikelola dari layar Admin Tenant');
      if (!pendingLogin(user)) throw conflict('INVALID_STATE', 'Undangan hanya bisa dikirim ulang ke akun yang belum pernah masuk');
      if ((await links.recentCount({ id: user.id, tenantId: req.tenantId })) >= RATE.max) {
        throw new HttpError(429, 'RATE_LIMITED', 'Undangan untuk akun ini baru saja dikirim. Coba lagi 15 menit lagi.');
      }
      if (!(await sendInvite(req, user))) throw new HttpError(502, 'MAIL_FAILED', 'Email undangan gagal dikirim. Coba lagi.');
      res.status(201).json({ data: { sent: true } });
    }));

    // ---------- Jabatan & kamus kompetensi ----------
    async function loadJobRole(req) {
      const role = isUuid(req.params.id) ? await db.getJobRole(req.tenantId, req.params.id) : null;
      if (!role) throw notFound('Jabatan tidak ditemukan');
      return role;
    }
    const batchInfo = (b) => (b ? {
      batchId: b.id, filename: b.filename, source: (b.options && b.options.source) || null,
      uploadedAt: b.createdAt, uploadedByName: b.createdByName || null, imported: (b.result && b.result.imported) ?? null,
    } : null);
    const duplicateJobRole = () => conflict('DUPLICATE', 'Jabatan dengan nama ini sudah ada');

    async function jobRoleRows(tenantId) {
      const [stats, withLevels, batches] = await Promise.all([
        db.jobRoleStats(tenantId), stores.dna.listJobRoles(tenantId), stores.imports.listCommitted(tenantId, ['dna_competencies']),
      ]);
      return stats.map((s) => ({
        ...s,
        levels: (withLevels.find((x) => x.id === s.id) || { levels: [] }).levels,
        dictionary: s.competencyCount > 0 ? 'tersedia' : 'belum_tersedia',
        lastImport: batchInfo(batches.find((b) => b.options && b.options.jobRoleId === s.id)),
      }));
    }

    r.get('/job-roles', wrap(async (req, res) => {
      const rows = await jobRoleRows(req.tenantId);
      res.json({ data: rows.map((x) => ({ ...x, lastImport: x.lastImport && { filename: x.lastImport.filename, at: x.lastImport.uploadedAt } })) });
    }));

    r.post('/job-roles', wrap(async (req, res) => {
      const body = req.body || {};
      const name = optionalText(body, 'name', 'Nama jabatan', 255);
      if (!name) throw badRequest('Nama jabatan wajib diisi');
      const division = optionalText(body, 'division', 'Divisi', 255);
      const description = optionalText(body, 'description', 'Deskripsi', 2000);
      const levels = body.levels === undefined ? [] : body.levels;
      if (!Array.isArray(levels) || levels.length > 20 || levels.some((l) => !l || typeof l.name !== 'string' || !l.name.trim() || l.name.length > 64 || (l.programTier && !TIERS.includes(l.programTier)))) {
        throw badRequest('levels berisi { name, programTier? basic|intermediate|advanced }, urut dari jenjang terendah, maksimal 20');
      }
      if (await db.jobRoleNameTaken(req.tenantId, name)) throw duplicateJobRole();
      let created;
      try {
        created = await stores.dna.createJobRole(req.tenantId, { name, division, description, levels: levels.map((l) => ({ name: l.name.trim(), programTier: l.programTier || null })) });
      } catch (e) { if (isUniqueViolation(e)) throw duplicateJobRole(); throw e; }
      await audit.record(req, 'create', 'tenant_admin.job_role', { objectIds: [created.id], name });
      res.status(201).json({ data: created });
    }));

    r.patch('/job-roles/:id', wrap(async (req, res) => {
      const current = await loadJobRole(req);
      const body = req.body || {};
      const patch = {};
      if (has(body, 'name')) {
        patch.name = optionalText(body, 'name', 'Nama jabatan', 255);
        if (!patch.name) throw badRequest('Nama jabatan tidak boleh kosong');
      }
      if (has(body, 'division')) patch.division = optionalText(body, 'division', 'Divisi', 255);
      if (has(body, 'description')) patch.description = optionalText(body, 'description', 'Deskripsi', 2000);
      const changed = Object.keys(patch).filter((k) => patch[k] !== current[k]);
      if (!Object.keys(patch).length) throw badRequest('Tidak ada perubahan yang dikirim');
      if (!changed.length) return res.json({ data: current });
      if (changed.includes('name') && (await db.jobRoleNameTaken(req.tenantId, patch.name, current.id))) throw duplicateJobRole();
      const saved = await db.updateJobRole(req.tenantId, current.id, Object.fromEntries(changed.map((k) => [k, patch[k]])));
      if (!saved) throw duplicateJobRole();
      await audit.record(req, 'update', 'tenant_admin.job_role', { objectIds: [current.id], fields: changed });
      return res.json({ data: saved });
    }));

    r.get('/job-roles/:id/competencies', wrap(async (req, res) => {
      const role = await loadJobRole(req);
      res.json({ data: await stores.dna.listCompetencies(req.tenantId, { jobRoleId: role.id }) });
    }));

    // ---------- Impor data & integrasi ----------
    r.get('/imports/summary', wrap(async (req, res) => {
      const [roles, periods, perfBatches, tenant, conf, sso, webhookSync] = await Promise.all([
        jobRoleRows(req.tenantId), db.performanceByPeriod(req.tenantId), stores.imports.listCommitted(req.tenantId, ['tna_performance']),
        db.tenantInfo(req.tenantId), settings.get(req.tenantId),
        flags.isEnabled(req.tenantId, FLAGS.SSO_ELITEMENTOR), flags.isEnabled(req.tenantId, FLAGS.WEBHOOK_SYNC),
      ]);
      const organizationMapped = Boolean(tenant && tenant.organizationMapped);
      // hanya boolean: URL, client id, secret, dan id organisasi tidak pernah dikirim ke klien
      const serverConfigured = Boolean(elitementor.baseUrl && elitementor.tokenUrl && elitementor.clientId && elitementor.clientSecret);
      res.json({
        data: {
          competencyModel: roles.map((x) => ({
            jobRoleId: x.id, jobRoleName: x.name, competencyCount: x.competencyCount,
            status: x.competencyCount > 0 ? 'terimpor' : 'belum', lastImport: x.lastImport,
          })),
          performance: periods.map(({ batchId, ...p }) => {
            // berkas terakhir yang mengisi periode ini, lewat import_batch_id di data kinerja
            const info = batchInfo(perfBatches.find((b) => b.id === batchId));
            if (info) delete info.imported;
            return { ...p, lastImport: info };
          }),
          integrations: {
            elitementor: { status: serverConfigured && organizationMapped ? 'terkonfigurasi' : 'belum_dikonfigurasi', organizationMapped, sso, webhookSync },
            lms: { targets: conf.lms.targets, gapExport: true },
          },
        },
      });
    }));

    // Alur impor yang sama dengan /api/{dna,tna}/imports, dengan gerbang Admin Tenant. Yang disyaratkan entitlement
    // submodulnya dan saklar darurat global, bukan flag modul tenant (requireSubmodule tenantFlag:false).
    // gerbang Admin Tenant sudah dipasang untuk seluruh router ini (r.use di atas), jadi tidak diulang di importRouter
    const passThrough = (_req, _res, next) => next();
    for (const [sm, only] of Object.entries(IMPORT_KINDS)) {
      r.use(`/imports/${sm}`, requireSubmodule(sm, { entitlements, flags }, { tenantFlag: false }), importRouter({ submodule: sm, stores, audit, flags, guard: passThrough, only, ownDrafts: true }));
    }

    return r;
  },
};
