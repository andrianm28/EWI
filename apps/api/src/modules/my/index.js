'use strict';
// B8 beranda karyawan (mockup Pak Eji: "Hasil saya" dan "Rencana belajar"). Spek: docs/designs/b8-karyawan.md
// Bukan submodul: satu beranda memuat bagian DNA dan TNA, jadi tiap bagian memeriksa sendiri apakah modulnya
// aktif (entitlement + flag) lewat submoduleActive. Semua data hanya milik req.user.id di req.tenantId (K2:
// HR dan atasan yang membuka /api/my melihat data dirinya sebagai karyawan), jadi visibleEmployeeScope tidak dipakai.
const express = require('express');
const { FLAGS, requireFlag } = require('../../core/flags');
const { submoduleActive } = require('../../core/entitlement/guard');
const { deliveryFor } = require('../../core/settings');
const { forbidden } = require('../../core/errors');
const { currentConsentVersion } = require('../../core/consent');
const { computeGap } = require('../dna/gap');
const { binderCookie } = require('../lti');
const { competencyView, safeLaunchUrl, inviteActions, PLAN_VISIBLE } = require('./view');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const OPEN = ['scheduled', 'in_progress'];

function myRouter({ stores, flags, entitlements, settings, audit, lti, appBaseUrl }) {
  const r = express.Router();
  r.use(requireFlag(flags, FLAGS.LEARNER_HOME, 'Beranda karyawan belum diaktifkan untuk organisasi Anda'));
  const active = (req, key) => submoduleActive({ entitlements, flags }, req.tenantId, key);
  const mine = (req) => ({ userIds: [req.user.id] });

  async function visiblePlan(req) {
    return (await stores.tna.listPlanItems(req.tenantId, mine(req))).filter((p) => PLAN_VISIBLE.includes(p.status));
  }

  r.get('/results', wrap(async (req, res) => {
    const me = req.user.id;
    const [person, dna, tna] = await Promise.all([stores.people.profile(req.tenantId, me), active(req, 'dna'), active(req, 'tna')]);
    let competencies = null;
    if (dna) {
      const [comps, assessments] = await Promise.all([
        person && person.jobRoleId ? stores.dna.competenciesForPosition(req.tenantId, person) : [],
        stores.dna.assessments(req.tenantId, me),
      ]);
      competencies = competencyView(computeGap({ competencies: comps, assessments }));
    }
    let invitations = null; let interviews = null; let plan = null;
    if (tna) {
      const sessions = await stores.interviews.list(req.tenantId, 'tna', mine(req));
      const now = new Date();
      invitations = sessions.filter((s) => OPEN.includes(s.status)).map((s) => ({
        sessionId: s.id, submodule: 'tna', status: s.status, inviteExpiresAt: s.inviteExpiresAt, ...inviteActions(s, now),
        consentVersionRequired: currentConsentVersion('tna'),
      }));
      interviews = sessions.filter((s) => s.status === 'completed' || (s.status === 'abandoned' && s.consentAt)).map((s) => ({
        sessionId: s.id, submodule: 'tna', status: s.status, endedAt: s.endedAt, consentVersion: s.consentVersion ?? null,
        consentWithdrawnAt: s.consentWithdrawnAt ?? null, transcriptPath: `/api/tna/sessions/${s.id}/transcript`,
      }));
      const items = await visiblePlan(req);
      plan = { total: items.length, byStatus: items.reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] || 0) + 1 }), {}) };
    }
    const openRequests = (await stores.dataRequests.listForUser(req.tenantId, me)).filter((x) => x.status === 'open')
      .map(({ id, type, createdAt, dueAt }) => ({ id, type, createdAt, dueAt }));
    await audit.readIndividual(req, 'my.results', { employeeIds: [me], objectType: 'my_results' });
    res.json({
      data: {
        person: person ? { id: person.id, name: person.name, jobRoleName: person.jobRoleName, careerLevelName: person.careerLevelName } : null,
        competencies, invitations, interviews, plan,
        privacy: { exportPath: `/api/employees/${me}/export`, requestsPath: '/api/employees/me/data-requests', openRequests },
      },
    });
  }));

  r.get('/learning-plan', wrap(async (req, res) => {
    if (!(await active(req, 'tna'))) throw forbidden('FEATURE_DISABLED', 'Rencana belajar belum diaktifkan untuk organisasi Anda');
    const [items, conf] = await Promise.all([visiblePlan(req), settings.get(req.tenantId)]);
    // EM-LTI §3.5: tombol EliteMentor (LTI) bila flag em.lti menyala dan tool aktif
    const ltiOn = Boolean(lti && (await lti.available(req.tenantId)));
    const links = ltiOn ? await stores.lti.linksForUser(req.tenantId, req.user.id) : { byPlanItem: new Map(), offline: [] };
    const ltiOf = (link, offline) => (link ? { linkId: link.id, label: offline ? 'Ujian di EliteMentor' : 'Belajar dengan EliteMentor' } : null);
    const data = items.map((p) => ({
      id: p.id,
      title: p.catalogItemTitle || p.findingTitle || 'Modul sedang disiapkan',
      description: null,
      level: p.programTier ?? null,
      mode: null,
      code: p.catalogItemRef ?? null,
      status: p.status,
      courseStatus: p.courseStatus ?? null,
      courseScore: p.courseScore ?? null,
      reason: p.findingTitle ?? null,
      needsModule: Boolean(p.needsModule),
      where: deliveryFor(conf, p.catalogSource),
      launchUrl: safeLaunchUrl(p.catalogItemUrl),
      lti: ltiOf(links.byPlanItem.get(p.id), false),
    }));
    for (const t of links.offline) {
      data.push({
        id: t.trainingId, title: t.title, description: null, level: t.programTier ?? null, mode: 'Offline', code: t.courseRef, status: 'new',
        courseStatus: null, courseScore: null, reason: null, needsModule: false,
        where: { target: 'elitementor', label: ['Workshop offline', t.startsOn, t.venue, t.vendorName].filter(Boolean).join(' · ') },
        launchUrl: null, lti: ltiOf(t, true),
      });
    }
    await audit.readIndividual(req, 'my.learning_plan', { employeeIds: data.length ? [req.user.id] : [], objectType: 'tna_plan_item', objectIds: data.map((p) => p.id) });
    res.json({ data, delivery: deliveryFor(conf, null) });
  }));

  // EM-LTI §3.1: mulai peluncuran EliteMentor untuk diri sendiri. Jawaban: URL login tool + cookie pengikat untuk authorize.
  r.post('/elitementor/launch', wrap(async (req, res) => {
    if (!lti) throw forbidden('FEATURE_DISABLED', 'EliteMentor lewat LTI belum diaktifkan untuk organisasi Anda');
    const { url, binder } = await lti.startLaunch({ tenantId: req.tenantId, userId: req.user.id, linkId: (req.body || {}).linkId });
    res.set('Cache-Control', 'no-store');
    res.append('Set-Cookie', binderCookie(binder, appBaseUrl || ''));
    res.json({ data: { url } });
  }));

  return r;
}

module.exports = { myRouter };
