'use strict';
// EM-LTI: aturan murni ELGOS sebagai LTI 1.3 Platform untuk EliteMentor (tanpa DB, tanpa jaringan).
// Spek: docs/designs/em-lti-platform.md §3. ADR 0003.
const crypto = require('crypto');

const LTI = 'https://purl.imsglobal.org/spec/lti/claim';
const CLAIM = Object.freeze({
  messageType: `${LTI}/message_type`,
  version: `${LTI}/version`,
  deploymentId: `${LTI}/deployment_id`,
  targetLinkUri: `${LTI}/target_link_uri`,
  roles: `${LTI}/roles`,
  resourceLink: `${LTI}/resource_link`,
  context: `${LTI}/context`,
  custom: `${LTI}/custom`,
  launchPresentation: `${LTI}/launch_presentation`,
  agsEndpoint: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
});
const AGS_SCOPES = Object.freeze({
  lineitem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  lineitemRead: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
});
const LEARNER_ROLE = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const ID_TOKEN_TTL_SECONDS = 300;
// [⚠️ BELUM TERVERIFIKASI] EliteMentor menghitung passing_score per kuis, tidak dikirim lewat AGS.
const PASSING_SCORE = 70;
const ACTIVITY = ['Initialized', 'Started', 'InProgress', 'Submitted', 'Completed'];
const GRADING = ['FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady'];

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** id pengguna LTI baru (acak). Disimpan di lti_user_subs, jadi stabil dan tidak bergantung rotasi secret. */
function newSub() {
  return crypto.randomBytes(16).toString('hex');
}

/** Awalan context.id per tenant tanpa membuka UUID tenant. */
function contextKeyOf(secret, tenantId) {
  return crypto.createHmac('sha256', secret).update(`lti-context:${tenantId}`).digest('hex').slice(0, 16);
}

/** URL tool yang diawali "/" milik simulator di origin ELGOS yang sama. */
function resolveUrl(url, base) {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : new URL(url, base || 'http://localhost').toString();
}

/** URL login initiation tool (LTI 1.3 Core §5.1.1). */
function loginUrl({ tool, issuer, sub, ticket, base }) {
  const u = new URL(resolveUrl(tool.loginUrl, base));
  u.searchParams.set('iss', issuer);
  u.searchParams.set('login_hint', sub);
  u.searchParams.set('target_link_uri', resolveUrl(tool.launchUrl, base));
  u.searchParams.set('client_id', tool.clientId);
  u.searchParams.set('lti_deployment_id', tool.deploymentId);
  u.searchParams.set('lti_message_hint', ticket);
  return u.toString();
}

const REQUIRED = ['client_id', 'redirect_uri', 'login_hint', 'lti_message_hint', 'state', 'nonce'];
/** Validasi bentuk permintaan otentikasi OIDC dari tool. Return { value } atau { error }. */
function validateAuthRequest(p) {
  const q = p || {};
  if (q.scope !== 'openid') return { error: 'scope harus openid' };
  if (q.response_type !== 'id_token') return { error: 'response_type harus id_token' };
  if (q.response_mode !== 'form_post') return { error: 'response_mode harus form_post' };
  if (q.prompt !== undefined && q.prompt !== 'none') return { error: 'prompt harus none' };
  for (const k of REQUIRED) {
    if (typeof q[k] !== 'string' || !q[k] || q[k].length > 2048) return { error: `${k} wajib diisi` };
  }
  return { value: q };
}

/** Payload id_token untuk satu peluncuran resource link. now dalam detik epoch. */
function buildIdToken({ issuer, tool, link, user, sub, nonce, base, contextKey, now = Math.floor(Date.now() / 1000) }) {
  const offline = link.kind === 'offline_training';
  const root = (base || '').replace(/\/+$/, '');
  const ags = `${root}/api/lti/ags/links/${link.id}`;
  const custom = { course_code: link.courseRef, mode: offline ? 'offline' : 'online' };
  if (offline) { custom.session_code = link.courseRef; custom.training_title = link.title; }
  return {
    iss: issuer, aud: tool.clientId, sub, nonce, iat: now, exp: now + ID_TOKEN_TTL_SECONDS,
    name: user.name, email: user.email,
    [CLAIM.messageType]: 'LtiResourceLinkRequest',
    [CLAIM.version]: '1.3.0',
    [CLAIM.deploymentId]: tool.deploymentId,
    [CLAIM.targetLinkUri]: resolveUrl(tool.launchUrl, base),
    [CLAIM.roles]: [LEARNER_ROLE],
    [CLAIM.resourceLink]: { id: link.id, title: link.title },
    [CLAIM.context]: { id: `${contextKey}:${link.courseRef}`, label: link.courseRef, title: link.title },
    [CLAIM.custom]: custom,
    [CLAIM.launchPresentation]: { document_target: 'window', return_url: `${root}/li` },
    // hanya skor yang dilayani (spek §3.3): tidak mengiklankan lineitems/scope lineitem
    [CLAIM.agsEndpoint]: { scope: [AGS_SCOPES.score], lineitem: `${ags}/lineitem` },
  };
}

/** Scope AGS yang dikenal dari string scope OAuth2. */
function parseScope(scope) {
  const known = new Set(Object.values(AGS_SCOPES));
  return String(scope || '').split(/\s+/).filter((s) => known.has(s));
}

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

/**
 * Skor AGS (LTI AGS 2.0 §3.4) → efek ELGOS (spek §3.3). Return salah satu:
 *   { error } | { kind: 'ignored' } | { kind: 'attendance' }
 *   { kind: 'progress', event, planStatus, completion? }   // online: event learning.progress untuk applySyncEvent B14
 *   { kind: 'assessment', event }                          // offline: event assessment.result untuk applySyncEvent B14
 */
function toSyncEvent({ link, score, user, now = new Date() }) {
  const s = score || {};
  const at = typeof s.timestamp === 'string' ? new Date(s.timestamp) : new Date(NaN);
  // waktu jauh di depan akan membuat semua skor berikutnya dianggap usang (sama dengan B14)
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) return { error: 'timestamp tidak valid' };
  if (!ACTIVITY.includes(s.activityProgress)) return { error: 'activityProgress tidak dikenal' };
  if (s.gradingProgress !== undefined && !GRADING.includes(s.gradingProgress)) return { error: 'gradingProgress tidak dikenal' };
  const progressPct = num(s.progressPct);
  if (progressPct !== null && !(Number.isFinite(progressPct) && progressPct >= 0 && progressPct <= 100)) return { error: 'progressPct harus 0-100' };

  const graded = s.activityProgress === 'Completed' && s.gradingProgress === 'FullyGraded';
  let pct = null;
  if (graded) {
    const given = num(s.scoreGiven); const max = num(s.scoreMaximum);
    if (!(Number.isFinite(max) && max > 0) || !(Number.isFinite(given) && given >= 0 && given <= max)) return { error: 'scoreGiven harus 0..scoreMaximum' };
    pct = Math.round((given / max) * 100);
  }
  const base = {
    id: `lti:${link.id}:${s.userId}:${at.toISOString()}:${s.activityProgress}`,
    course: { ref: link.courseRef, title: link.title || link.courseRef, programTier: null, dueAt: null },
    user: { email: user.email ? String(user.email).toLowerCase() : null, elitementorUserId: null },
    occurredAt: at,
  };

  if (link.kind === 'offline_training') {
    if (graded) return { kind: 'assessment', event: { ...base, type: 'assessment.result', status: null, progressPct: null, score: pct } };
    if (['Started', 'InProgress'].includes(s.activityProgress)) return { kind: 'attendance', occurredAt: at };
    return { kind: 'ignored' };
  }
  if (s.activityProgress === 'Completed' || s.activityProgress === 'Submitted') {
    if (!graded) return { kind: 'ignored' };
    const passed = pct >= PASSING_SCORE;
    return {
      kind: 'progress', planStatus: passed ? 'completed' : 'in_progress', completion: passed ? 'passed' : 'failed',
      event: { ...base, type: 'learning.progress', status: passed ? 'completed' : 'failed', progressPct: 100, score: pct },
    };
  }
  return { kind: 'progress', planStatus: 'in_progress', event: { ...base, type: 'learning.progress', status: 'in_progress', progressPct, score: null } };
}

module.exports = {
  CLAIM, AGS_SCOPES, LEARNER_ROLE, PASSING_SCORE, ID_TOKEN_TTL_SECONDS, newSub, contextKeyOf, resolveUrl, loginUrl, validateAuthRequest, buildIdToken, parseScope, toSyncEvent,
};
