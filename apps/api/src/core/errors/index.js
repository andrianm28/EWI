'use strict';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const unauthorized = (msg = 'Perlu login') => new HttpError(401, 'UNAUTHORIZED', msg);
const forbidden = (code = 'FORBIDDEN', msg = 'Akses ditolak') => new HttpError(403, code, msg);
const notFound = (msg = 'Tidak ditemukan') => new HttpError(404, 'NOT_FOUND', msg);
const badRequest = (msg) => new HttpError(400, 'BAD_REQUEST', msg);

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  // HttpError adalah respons yang disengaja (mis. 501 DECISION_PENDING); selain itu sembunyikan detail 5xx.
  const expected = err instanceof HttpError;
  if (status >= 500 && !expected) console.error(err);
  const message = status >= 500 && !expected ? 'Terjadi kesalahan' : err.message;
  res.status(status).json({ error: { code: err.code || 'INTERNAL', message } });
}

module.exports = { HttpError, unauthorized, forbidden, notFound, badRequest, errorHandler };
