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
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { code: err.code || 'INTERNAL', message: status >= 500 ? 'Terjadi kesalahan' : err.message } });
}

module.exports = { HttpError, unauthorized, forbidden, notFound, badRequest, errorHandler };
