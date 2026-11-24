'use strict';
// EM-LTI (docs/designs/em-lti-platform.md §3): aturan murni platform LTI 1.3.
const {
  CLAIM, AGS_SCOPES, PASSING_SCORE, newSub, contextKeyOf, resolveUrl, validateAuthRequest, buildIdToken, loginUrl, toSyncEvent, parseScope,
} = require('../../src/modules/lti/domain');

const tool = {
  id: 'tool-1', clientId: 'em-client', deploymentId: 'dep-1', loginUrl: '/em-sim/lti/login', launchUrl: '/em-sim/lti/launch',
  redirectUris: ['/em-sim/lti/launch'],
};
const base = 'https://elgos.test';

describe('newSub dan contextKeyOf', () => {
  test('sub acak 32 hex; kunci konteks stabil per tenant, 16 hex', () => {
    expect(newSub()).toMatch(/^[0-9a-f]{32}$/);
    expect(newSub()).not.toBe(newSub());
    expect(contextKeyOf('rahasia', 't1')).toMatch(/^[0-9a-f]{16}$/);
    expect(contextKeyOf('rahasia', 't1')).toBe(contextKeyOf('rahasia', 't1'));
    expect(contextKeyOf('rahasia', 't2')).not.toBe(contextKeyOf('rahasia', 't1'));
  });
});

describe('resolveUrl', () => {
  test('URL relatif diselesaikan terhadap APP_BASE_URL, absolut dibiarkan', () => {
    expect(resolveUrl('/em-sim/lti/login', base)).toBe('https://elgos.test/em-sim/lti/login');
    expect(resolveUrl('https://em.example/lti/login', base)).toBe('https://em.example/lti/login');
  });
});

describe('loginUrl', () => {
  test('memuat parameter login OIDC pihak ketiga', () => {
    const u = new URL(loginUrl({ tool, issuer: 'https://iss.test', sub: 'abc', ticket: 'tkt', base }));
    expect(u.origin + u.pathname).toBe('https://elgos.test/em-sim/lti/login');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      iss: 'https://iss.test', login_hint: 'abc', target_link_uri: 'https://elgos.test/em-sim/lti/launch', client_id: 'em-client',
      lti_deployment_id: 'dep-1', lti_message_hint: 'tkt',
    });
  });
});

describe('validateAuthRequest', () => {
  const ok = {
    scope: 'openid', response_type: 'id_token', response_mode: 'form_post', prompt: 'none', client_id: 'em-client',
    redirect_uri: 'https://elgos.test/em-sim/lti/launch', login_hint: 'abc', lti_message_hint: 'tkt', state: 's1', nonce: 'n1',
  };
  test('permintaan lengkap lolos', () => {
    expect(validateAuthRequest(ok)).toEqual({ value: ok });
  });
  test.each([
    ['scope', 'profile'], ['response_type', 'code'], ['response_mode', 'query'], ['nonce', ''], ['lti_message_hint', undefined], ['client_id', ''],
  ])('%s salah ditolak', (key, v) => {
    expect(validateAuthRequest({ ...ok, [key]: v }).error).toBeTruthy();
  });
  test('prompt boleh kosong, tapi bukan selain none', () => {
    expect(validateAuthRequest({ ...ok, prompt: undefined }).value).toBeTruthy();
    expect(validateAuthRequest({ ...ok, prompt: 'login' }).error).toBeTruthy();
  });
});

describe('buildIdToken', () => {
  const now = 1_800_000_000;
  const link = { id: 'link-1', kind: 'plan_item', courseRef: 'SD-B1', title: 'Root Cause Analysis', tenantId: 't1' };
  const user = { name: 'Learner Demo', email: 'learner@demo.test' };
  test('klaim LTI 1.3 + AGS sesuai spek §3.2', () => {
    const p = buildIdToken({ issuer: 'https://iss.test', tool, link, user, sub: 'abc', nonce: 'n1', base, now, contextKey: 'k16' });
    expect(p).toMatchObject({ iss: 'https://iss.test', aud: 'em-client', sub: 'abc', nonce: 'n1', iat: now, exp: now + 300, name: 'Learner Demo', email: 'learner@demo.test' });
    expect(p[CLAIM.messageType]).toBe('LtiResourceLinkRequest');
    expect(p[CLAIM.version]).toBe('1.3.0');
    expect(p[CLAIM.deploymentId]).toBe('dep-1');
    expect(p[CLAIM.targetLinkUri]).toBe('https://elgos.test/em-sim/lti/launch');
    expect(p[CLAIM.roles]).toEqual(['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner']);
    expect(p[CLAIM.resourceLink]).toEqual({ id: 'link-1', title: 'Root Cause Analysis' });
    expect(p[CLAIM.context]).toEqual({ id: 'k16:SD-B1', label: 'SD-B1', title: 'Root Cause Analysis' });
    expect(JSON.stringify(p)).not.toContain('t1');
    expect(p[CLAIM.custom]).toEqual({ course_code: 'SD-B1', mode: 'online' });
    expect(p[CLAIM.launchPresentation]).toEqual({ document_target: 'window', return_url: 'https://elgos.test/li' });
    expect(p[CLAIM.agsEndpoint]).toEqual({
      scope: [AGS_SCOPES.score],
      lineitem: 'https://elgos.test/api/lti/ags/links/link-1/lineitem',
    });
  });
  test('offline membawa kode sesi', () => {
    const p = buildIdToken({ issuer: 'i', tool, link: { ...link, kind: 'offline_training', courseRef: 'IAC-1512' }, user, sub: 'abc', nonce: 'n', base, now });
    expect(p[CLAIM.custom]).toEqual({ course_code: 'IAC-1512', mode: 'offline', session_code: 'IAC-1512', training_title: 'Root Cause Analysis' });
  });
});

describe('parseScope', () => {
  test('hanya scope AGS yang dikenal', () => {
    expect(parseScope(`${AGS_SCOPES.score} openid ${AGS_SCOPES.lineitemRead}`)).toEqual([AGS_SCOPES.score, AGS_SCOPES.lineitemRead]);
    expect(parseScope('')).toEqual([]);
  });
});

describe('toSyncEvent', () => {
  const online = { id: 'link-1', kind: 'plan_item', courseRef: 'SD-B1', title: 'RCA' };
  const offline = { id: 'link-2', kind: 'offline_training', courseRef: 'IAC-1512', title: 'IaC' };
  const user = { email: 'learner@demo.test' };
  const ts = '2026-11-24T03:00:00.000Z';
  const score = (extra) => ({ userId: 'abc', timestamp: ts, activityProgress: 'InProgress', gradingProgress: 'NotReady', ...extra });

  test('online mulai belajar = progres in_progress', () => {
    const out = toSyncEvent({ link: online, score: score({ progressPct: 40 }), user });
    expect(out.kind).toBe('progress');
    expect(out.planStatus).toBe('in_progress');
    expect(out.event).toMatchObject({ type: 'learning.progress', status: 'in_progress', progressPct: 40, score: null, course: { ref: 'SD-B1', title: 'RCA' }, user: { email: 'learner@demo.test', elitementorUserId: null } });
    expect(out.event.id).toBe(`lti:link-1:abc:${ts}:InProgress`);
    expect(out.event.occurredAt).toEqual(new Date(ts));
  });
  test('online selesai lulus', () => {
    const out = toSyncEvent({ link: online, score: score({ activityProgress: 'Completed', gradingProgress: 'FullyGraded', scoreGiven: 4, scoreMaximum: 5 }), user });
    expect(out).toMatchObject({ kind: 'progress', planStatus: 'completed', completion: 'passed', event: { status: 'completed', score: 80, progressPct: 100 } });
  });
  test(`online selesai di bawah ${PASSING_SCORE} = gagal, rencana tetap berjalan`, () => {
    const out = toSyncEvent({ link: online, score: score({ activityProgress: 'Completed', gradingProgress: 'FullyGraded', scoreGiven: 1, scoreMaximum: 3 }), user });
    expect(out).toMatchObject({ kind: 'progress', planStatus: 'in_progress', completion: 'failed', event: { status: 'failed', score: 33 } });
  });
  test('offline check-in = kehadiran', () => {
    expect(toSyncEvent({ link: offline, score: score({ activityProgress: 'Started' }), user })).toMatchObject({ kind: 'attendance' });
  });
  test('offline selesai = asesmen + kehadiran', () => {
    const out = toSyncEvent({ link: offline, score: score({ activityProgress: 'Completed', gradingProgress: 'FullyGraded', scoreGiven: 3, scoreMaximum: 3 }), user });
    expect(out).toMatchObject({ kind: 'assessment', event: { type: 'assessment.result', score: 100, course: { ref: 'IAC-1512' } } });
  });
  test.each([
    [{ timestamp: 'bukan tanggal' }],
    [{ activityProgress: 'Completed', gradingProgress: 'FullyGraded', scoreGiven: 6, scoreMaximum: 5 }],
    [{ activityProgress: 'Completed', gradingProgress: 'FullyGraded', scoreMaximum: 0, scoreGiven: 0 }],
    [{ progressPct: 140 }],
    [{ activityProgress: 'Terbang' }],
  ])('skor tidak valid ditolak %#', (extra) => {
    expect(toSyncEvent({ link: online, score: score(extra), user }).error).toBeTruthy();
  });
  test('timestamp jauh di depan ditolak; id event memakai ISO ternormalisasi', () => {
    const now = new Date('2026-11-25T03:00:00Z');
    expect(toSyncEvent({ link: online, score: score({ timestamp: '2026-11-25T04:00:00Z' }), user, now }).error).toMatch(/timestamp/);
    const out = toSyncEvent({ link: online, score: score({ timestamp: '2026-11-25T10:00:00+07:00' }), user, now });
    expect(out.event.id).toBe('lti:link-1:abc:2026-11-25T03:00:00.000Z:InProgress');
  });
  test('selesai tapi belum dinilai diabaikan', () => {
    expect(toSyncEvent({ link: online, score: score({ activityProgress: 'Completed', gradingProgress: 'Pending' }), user }).kind).toBe('ignored');
  });
});
