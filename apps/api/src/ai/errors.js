'use strict';
// Kegagalan penyedia AI dikembalikan sebagai HttpError dengan kode yang jelas, tanpa membocorkan isi transkrip.
const { HttpError } = require('../core/errors');

class AiError extends HttpError {
  constructor(code, message, { status = 503, cause } = {}) {
    super(status, code, message);
    if (cause) this.cause = cause;
  }
}

const AI_ERRORS = {
  credentials: () => new AiError('AI_CREDENTIALS_MISSING',
    'Kredensial AWS untuk Amazon Bedrock tidak ditemukan. Isi AWS_ACCESS_KEY_ID dan AWS_SECRET_ACCESS_KEY (atau AWS_PROFILE) di lingkungan API.'),
  accessDenied: (modelId) => new AiError('AI_ACCESS_DENIED',
    `Akses ke model ${modelId} ditolak. Periksa izin IAM bedrock:InvokeModel dan aktivasi akses model di konsol Bedrock region ap-southeast-1.`),
  modelInvalid: (modelId) => new AiError('AI_MODEL_INVALID',
    `Model ${modelId} tidak dikenali atau tidak tersedia di region ini. Periksa BEDROCK_MODEL_ID.`),
  throttled: () => new AiError('AI_THROTTLED', 'Penyedia AI sedang sibuk. Coba lagi beberapa saat lagi.'),
  timeout: () => new AiError('AI_TIMEOUT', 'Penyedia AI tidak menjawab tepat waktu. Coba lagi.'),
  badOutput: (what) => new AiError('AI_BAD_OUTPUT', `Jawaban AI untuk ${what} tidak sesuai format. Coba lagi.`, { status: 502 }),
  unavailable: () => new AiError('AI_UNAVAILABLE', 'Penyedia AI tidak dapat dihubungi. Coba lagi.'),
};

module.exports = { AiError, AI_ERRORS };
