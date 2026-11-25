'use strict';
// B19 4.1: tiket WebSocket. JWT HS256 audience `ewi-voice` (bukan token API), umur 60 detik, jti sekali pakai.
// Dikirim di pesan pertama WS (bukan query string) supaya tidak tercatat di log akses.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const AUDIENCE = 'ewi-voice';
const TTL_S = 60;
const ticketError = () => Object.assign(new Error('Tiket suara tidak sah atau kedaluwarsa'), { code: 'VOICE_TICKET' });

function createTicketService({ secret, issuer, now = Date.now }) {
  const used = new Map(); // jti -> exp (ms)
  const sweep = () => { const t = now(); for (const [k, exp] of used) if (exp < t) used.delete(k); };
  return {
    ttl: TTL_S,
    /** user = req.user (claims token API), sessionId = sesi wawancara, epoch = voice_epoch yang baru dinaikkan. */
    issue(user, { sessionId, epoch }) {
      return jwt.sign({ tid: user.tenantId, role: user.role, email: user.email, sid: user.sid, rv: user.rv || 0, ses: sessionId, ep: epoch },
        secret, { subject: String(user.id), audience: AUDIENCE, issuer, algorithm: 'HS256', expiresIn: TTL_S, jwtid: crypto.randomUUID() });
    },
    /** Verifikasi dan pakai tiket (sekali). Return { claims, sessionId, epoch }; lempar VOICE_TICKET. */
    consume(token, sessionId) {
      let p;
      try { p = jwt.verify(String(token || ''), secret, { audience: AUDIENCE, issuer, algorithms: ['HS256'], clockTimestamp: Math.floor(now() / 1000) }); } catch { throw ticketError(); }
      if (p.ses !== sessionId || !p.jti) throw ticketError();
      sweep();
      if (used.has(p.jti)) throw ticketError();
      used.set(p.jti, p.exp * 1000);
      return { claims: { id: p.sub, tenantId: p.tid, role: p.role, email: p.email, sid: p.sid, rv: p.rv || 0 }, sessionId: p.ses, epoch: p.ep };
    },
  };
}

module.exports = { createTicketService, AUDIENCE };
