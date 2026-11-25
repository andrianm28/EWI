'use strict';
// B19 4.2: satu pemeriksaan kelayakan suara untuk endpoint tiket, gateway saat auth, dan pemeriksaan berkala.
const { ROLES } = require('../../core/rbac');
const { FLAGS } = require('../../core/flags');
const { submoduleActive } = require('../../core/entitlement/guard');

class VoiceError extends Error {
  constructor(code, message, status, closeCode) { super(message); Object.assign(this, { code, status, closeCode }); }
}
const forbidden = (m) => new VoiceError('VOICE_FORBIDDEN', m, 403, 4403);
const disabled = () => new VoiceError('FEATURE_DISABLED', 'Wawancara suara belum diaktifkan untuk organisasi Anda', 403, 4403);
const unavailable = () => new VoiceError('VOICE_UNAVAILABLE', 'Wawancara suara belum tersedia di server ini', 503, 4403);
const invalid = (m = 'Sesi wawancara tidak dalam keadaan untuk wawancara suara') => new VoiceError('INVALID_STATE', m, 409, 4409);

/** Batas waktu suara sesi (6.3) sudah lewat? */
const voiceTimeOver = (s, limitMs, now = Date.now()) => Boolean(s.voiceStartedAt) && now - new Date(s.voiceStartedAt).getTime() >= limitMs;

function createVoiceEligibility({ stores, flags, entitlements, sessions, policy, provider, timeLimitMs }) {
  /**
   * claims: klaim login ({ id, tenantId, role, sid, rv, ... }). epoch: hanya gateway (harus sama dengan voice_epoch).
   * checkLogin=false untuk endpoint HTTP (requireAuth sudah memeriksa). Return sesi; lempar VoiceError.
   */
  async function assertVoiceEligible({ claims, sessionId, epoch, checkLogin = true }) {
    const tenantId = claims.tenantId;
    if (checkLogin) {
      if (policy && !policy.allows(claims)) throw forbidden('Sesi login tidak berlaku');
      if (sessions && !(await sessions.check(claims, { activity: true })).ok) throw forbidden('Sesi login tidak berlaku');
    }
    if (claims.role === ROLES.ETA_ADMIN) throw forbidden('Isi wawancara tidak dibuka untuk Super Admin');
    if (!(await submoduleActive({ entitlements, flags }, tenantId, 'tna'))) throw forbidden('TNA belum aktif untuk organisasi Anda');
    if (!(await flags.isEnabled(tenantId, FLAGS.VOICE_REALTIME))) throw disabled();
    if (!provider || provider.name === 'none') throw unavailable();
    const s = await stores.interviews.get(tenantId, sessionId);
    if (!s || s.submodule !== 'tna' || s.intervieweeId !== claims.id) throw invalid('Sesi wawancara tidak ditemukan');
    if (s.status !== 'in_progress' || s.consentWithdrawnAt || s.summaryAt || s.aiDoneAt) throw invalid();
    if (!s.voiceConsentAt || s.mode !== 'voice') throw invalid('Persetujuan suara belum diberikan atau sesi di mode ketik');
    if (epoch !== undefined && s.voiceEpoch !== epoch) throw invalid('Wawancara suara dibuka di tab atau perangkat lain');
    if (voiceTimeOver(s, timeLimitMs(s))) throw invalid('Batas waktu wawancara suara sudah habis. Lanjutkan dengan mengetik.');
    return s;
  }
  return { assertVoiceEligible };
}

module.exports = { createVoiceEligibility, VoiceError, voiceTimeOver };
