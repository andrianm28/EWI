'use strict';
// Penyedia AI teks Amazon Bedrock (Claude) lewat Converse API (PK-06; PD-1 ★A, PD-2 ★A: hanya ap-southeast-1).
// Kredensial memakai rantai bawaan AWS SDK (kunci IAM yang sama dengan KMS dan SES di etavm2).
// Setiap panggilan model mengembalikan catatan pemakaian token (R3-6) untuk disimpan pemanggil.
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { AiError, AI_ERRORS } = require('./errors');
const P = require('./prompts');

const MAX_TOKENS = { next_question: 400, assess_competencies: 2000, analyze_tna: 3000 };

/** Ubah galat SDK menjadi AiError dengan pesan yang jelas. */
function mapError(err, modelId) {
  if (err instanceof AiError) return err;
  const name = (err && (err.name || err.code)) || '';
  const msg = String((err && err.message) || '');
  if (name === 'CredentialsProviderError' || /could not load credentials|credential/i.test(msg)) return AI_ERRORS.credentials();
  if (name === 'AccessDeniedException' || name === 'UnrecognizedClientException') return AI_ERRORS.accessDenied(modelId);
  if (name === 'ResourceNotFoundException' || (name === 'ValidationException' && /model/i.test(msg))) return AI_ERRORS.modelInvalid(modelId);
  if (name === 'ThrottlingException' || name === 'ServiceQuotaExceededException' || name === 'ServiceUnavailableException') return AI_ERRORS.throttled();
  if (name === 'AbortError' || name === 'TimeoutError' || /timed? ?out/i.test(msg)) return AI_ERRORS.timeout();
  const out = AI_ERRORS.unavailable();
  out.cause = err;
  return out;
}

function textOf(response) {
  const blocks = (response && response.output && response.output.message && response.output.message.content) || [];
  // Hanya blok teks; blok penalaran (reasoningContent) diabaikan.
  return blocks.filter((b) => typeof b.text === 'string').map((b) => b.text).join('').trim();
}

/**
 * config: { region, modelId, extraFields, timeoutMs }
 * client: opsional, untuk test (objek dengan send(command)).
 */
function createBedrockProvider(config, { client } = {}) {
  const { modelId, region } = config;
  const bedrock = client || new BedrockRuntimeClient({ region, maxAttempts: 3 });

  async function converse(operation, { system, messages }) {
    const started = Date.now();
    const input = {
      modelId,
      system: [{ text: system }],
      messages: messages.map((m) => ({ role: m.role, content: [{ text: m.text }] })),
      inferenceConfig: { maxTokens: MAX_TOKENS[operation] },
    };
    if (config.extraFields) input.additionalModelRequestFields = config.extraFields;
    let response;
    try {
      response = await bedrock.send(new ConverseCommand(input), { abortSignal: AbortSignal.timeout(config.timeoutMs || 30000) });
    } catch (e) {
      throw mapError(e, modelId);
    }
    const u = response.usage || {};
    return {
      text: textOf(response),
      stopReason: response.stopReason,
      usage: {
        operation,
        provider: 'bedrock',
        model: modelId,
        inputTokens: Number(u.inputTokens) || 0,
        outputTokens: Number(u.outputTokens) || 0,
        latencyMs: Number(response.metrics && response.metrics.latencyMs) || Date.now() - started,
      },
    };
  }

  /** Panggil model lalu parse; bila format salah, coba sekali lagi dengan teguran. Semua panggilan dicatat. */
  async function converseParsed(operation, prompt, parse, what) {
    const usage = [];
    const messages = [...prompt.messages];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const r = await converse(operation, { system: prompt.system, messages });
      usage.push(r.usage);
      try {
        return { value: parse(r.text), usage };
      } catch {
        messages.push({ role: 'assistant', text: r.text || '(kosong)' });
        messages.push({ role: 'user', text: 'Format jawaban tidak sesuai. Ulangi dan ikuti format yang diminta persis, tanpa teks lain.' });
      }
    }
    const err = AI_ERRORS.badOutput(what);
    err.usage = usage;
    throw err;
  }

  return {
    name: 'bedrock',
    model: modelId,

    /** Pastikan kredensial tersedia saat boot (tanpa memanggil model). */
    async verify() {
      try {
        const creds = typeof bedrock.config?.credentials === 'function' ? await bedrock.config.credentials() : true;
        if (!creds) throw AI_ERRORS.credentials();
        return true;
      } catch (e) {
        throw mapError(e, modelId);
      }
    },

    async nextQuestion({ submodule, transcript, askedCount, context, maxQuestions }) {
      const system = P.interviewSystemPrompt({ submodule, context, askedCount, maxQuestions });
      const { value, usage } = await converseParsed('next_question', { system, messages: P.interviewMessages(transcript) }, P.parseQuestion, 'pertanyaan');
      return { question: value, usage };
    },

    async assessCompetencies({ transcript, competencies }) {
      if (!competencies.length) return { results: [], usage: [] };
      const p = P.assessCompetenciesPrompt({ transcript, competencies });
      const { value, usage } = await converseParsed('assess_competencies', { system: p.system, messages: [{ role: 'user', text: p.user }] },
        (raw) => P.parseAssessments(raw, p.codes), 'penilaian kompetensi');
      return { results: value, usage };
    },

    async analyzeTna({ transcript, triggers, competencies }) {
      const p = P.analyzeTnaPrompt({ transcript, triggers, competencies });
      const { value, usage } = await converseParsed('analyze_tna', { system: p.system, messages: [{ role: 'user', text: p.user }] },
        (raw) => P.parseTnaFindings(raw, p.codes), 'analisis TNA');
      return { findings: value, usage };
    },
  };
}

module.exports = { createBedrockProvider, mapError };
