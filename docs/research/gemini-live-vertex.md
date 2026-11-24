# Gemini Live API di Vertex AI (BidiGenerateContent)

Fakta Gemini Live di Vertex AI untuk B19, diakses 2026-11-24.

Sumber hanya primer: dokumentasi Google Cloud (yang sekarang disajikan di bawah `docs.cloud.google.com/gemini-enterprise-agent-platform/...`, dan `cloud.google.com/vertex-ai/...` me-redirect ke sana), Google AI Studio / ai.google.dev, Google OAuth docs, serta source SDK resmi `googleapis/js-genai` dan `googleapis/python-genai` (branch `main`, diakses pada tanggal di atas).

Singkatan sumber yang dipakai di bawah:

| Kode | URL |
|---|---|
| [REF] | https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/live-api.md.txt (referensi pesan Live API Vertex; dulu `vertex-ai/generative-ai/docs/model-reference/multimodal-live`) |
| [OVERVIEW] | https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api |
| [SESSION] | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/start-manage-session.md.txt |
| [LANG] | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/configure-language-voice |
| [CAPS] | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/configure-gemini-capabilities |
| [M38] | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-live |
| [M25] | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash-live-api |
| [LOC] | https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations |
| [AIS-REF] | https://aistudio.google.com/api-reference/live (ai.google.dev/api/live redirect ke sini) |
| [AIS-CAPS] | https://aistudio.google.com/docs/live-api/capabilities (ai.google.dev/gemini-api/docs/live-api/capabilities) |
| [JS-LIVE] | https://github.com/googleapis/js-genai/blob/main/src/live.ts |
| [JS-CONV] | https://github.com/googleapis/js-genai/blob/main/src/converters/_live_converters.ts |
| [JS-TYPES] | https://github.com/googleapis/js-genai/blob/main/src/types.ts |
| [JS-API] | https://github.com/googleapis/js-genai/blob/main/src/_api_client.ts |
| [PY-LIVE] | https://github.com/googleapis/python-genai/blob/main/google/genai/live.py |
| [OAUTH-SA] | https://developers.google.com/identity/protocols/oauth2/service-account |

> Catatan casing: tabel referensi Vertex [REF] memakai nama proto snake_case (`generation_config`, `realtime_input_config`), sedangkan contoh JSON di [REF] memakai camelCase (`generationConfig`, `systemInstruction`, `realtimeInput`). SDK resmi mengirim **camelCase** di wire untuk Vertex ([JS-CONV], [PY-LIVE] memakai `setup.generationConfig.responseModalities`). Contoh Python di [SESSION] mengirim snake_case (`"generation_config"`) dan tetap jalan; proto3 JSON parser menerima keduanya. **Rekomendasi: kirim camelCase**, sama seperti SDK.

---

## 1. Endpoint & autentikasi

| Item | Nilai | Sumber |
|---|---|---|
| Path WebSocket | `/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent` | [SESSION] (`URI = f"wss://{HOST}/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent"`), [JS-LIVE] baris ~162, [PY-LIVE] baris ~1111 |
| Host regional | `{LOCATION}-aiplatform.googleapis.com` → `wss://{LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent` | [SESSION] (`HOST = f"{LOCATION}-aiplatform.googleapis.com"`) |
| Host global | `aiplatform.googleapis.com` (tanpa prefix region) → `wss://aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`, `location=global` di path model | [LOC] ("When using the global endpoint, use `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/...`"); SDK: `location === 'global'` → `baseUrl = 'https://aiplatform.googleapis.com/'` [JS-API]. **Tetapi lihat §6: tidak ada model Live yang ditandai tersedia di `global`.** |
| Host multi-region `us` / `eu` | `aiplatform.us.rep.googleapis.com` / `aiplatform.eu.rep.googleapis.com` | [LOC] (tabel "Multi-region endpoints"); SDK: `MULTI_REGIONAL_LOCATIONS = {'us','eu'}` → `https://aiplatform.${location}.rep.googleapis.com/` [JS-API]. Penerapan ke path `/ws/...` adalah perilaku SDK (ws base URL = base URL dengan skema `wss`) [JS-API `getWebsocketBaseUrl`]. Contoh WSS eksplisit untuk host `.rep.` di docs: [⚠️ BELUM TERVERIFIKASI] |
| Header auth | `Authorization: Bearer <OAuth2 access token>` | [SESSION] (`headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}`; "typically passed in the WebSocket headers (such as `Authorization: Bearer [TOKEN]`)"), [PY-LIVE] (`headers['Authorization'] = f'Bearer {bearer_token}'`) |
| Header opsional | `x-goog-user-project: <quota project>` bila kredensial punya quota project | [PY-LIVE] |
| Scope | `https://www.googleapis.com/auth/cloud-platform` | Scope ini adalah default ADC SDK; dokumen Live API sendiri hanya memakai `gcloud auth application-default print-access-token` [SESSION]. Pernyataan eksplisit "Live API butuh scope cloud-platform" di halaman Live: [⚠️ BELUM TERVERIFIKASI] (praktik standar Vertex AI) |
| Server-to-server | "Gemini Live API only provides server to server authentication and isn't recommended for direct client use." | [REF] §Client authentication |

### Mint access token dari service-account JSON (tanpa google-auth-library)

Semua dari [OAUTH-SA] (§"Preparing to make an authorized API call" → HTTP/REST):

| Langkah | Detail |
|---|---|
| JWT header | `{"alg":"RS256","typ":"JWT"}`; `kid` = `private_key_id` (opsional) |
| Claim set | `iss` = `client_email` SA; `scope` = `https://www.googleapis.com/auth/cloud-platform` (space-delimited bila >1; koma → `invalid_scope`); `aud` = `https://oauth2.googleapis.com/token`; `iat` = now (detik epoch); `exp` = maks. `iat + 3600` |
| Signature | RSASSA-PKCS1-v1_5 SHA-256 (RS256) dengan `private_key` dari JSON; `base64url(header) + "." + base64url(claims) + "." + base64url(sig)` |
| Request | `POST https://oauth2.googleapis.com/token`, `Content-Type: application/x-www-form-urlencoded`, body `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=<JWT>` |
| Response | `{"access_token": "...", "expires_in": 3600, "token_type": "Bearer", ...}` — cache dan refresh sebelum kedaluwarsa |
| Alternatif | Self-signed JWT langsung sebagai Bearer (tanpa tukar token), `aud = https://SERVICE.googleapis.com/` — hanya untuk API tertentu. Apakah endpoint WebSocket Live menerima self-signed JWT: [⚠️ BELUM TERVERIFIKASI] → pakai token OAuth. |

---

## 2. Pesan `setup` (BidiGenerateContentSetup)

"Message to be sent in the first and only first client message… Clients should wait for a `BidiGenerateContentSetupComplete` message before sending any additional messages." [REF]

| Field wire (camelCase) | Isi / catatan | Sumber |
|---|---|---|
| `setup.model` | **Wajib.** `projects/{project}/locations/{location}/publishers/google/models/{model}` ("Publisher model format: `projects/{project}/locations/{location}/publishers/*/models/*`") | [REF], contoh [SESSION] (`MODEL = f"projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/{MODEL_ID}"`) |
| `setup.generationConfig.responseModalities` | `["AUDIO"]` atau `["TEXT"]`. SDK Vertex otomatis isi `['AUDIO']` bila kosong | [REF] contoh JSON; [PY-LIVE] (`setv(request_dict, ['setup','generationConfig','responseModalities'], ['AUDIO'])`) |
| `setup.generationConfig.speechConfig` | **Di dalam `generationConfig`** (bukan top-level). `{ "languageCode": "id-ID", "voiceConfig": { "prebuiltVoiceConfig": { "voiceName": "Kore" } } }` | [REF] §Voices (JSON `voiceConfig.prebuiltVoiceConfig.voiceName`), [JS-CONV] (`['setup','generationConfig','speechConfig']`), [JS-TYPES] `SpeechConfig.languageCode` |
| `setup.generationConfig.temperature/topP/topK/maxOutputTokens/...` | Didukung; tidak didukung: `response_logprobs`, `response_mime_type`, `logprobs`, `response_schema`, `stop_sequence`, `routing_config`, `audio_timestamp` | [REF] |
| `setup.generationConfig.enableAffectiveDialog` | bool; hanya `gemini-live-2.5-flash-native-audio` | [JS-CONV], [CAPS] |
| `setup.systemInstruction` | `Content` (`{"parts":[{"text":"..."}]}`); "only text should be used in parts" | [REF] |
| `setup.tools[].functionDeclarations[]` | `{name, description, parameters:{type, properties, required}}` (subset OpenAPI). Semua fungsi dideklarasikan di setup; untuk `gemini-3.8-live` bisa diganti mid-session via `contextUpdate` | [REF] §Function calling, §System instructions |
| `setup.inputAudioTranscription` | `AudioTranscriptionConfig` — `{}` untuk aktif. Sub-field: `languageCodes[]` (BCP-47 hint; kosong = auto-detect), **`customVocabulary[]`** ("A list of custom vocabulary phrases to bias the speech recognition model toward recognizing specific terms"), `adaptationPhrases[]` (deprecated → `customVocabulary`), `mode` (`VERBATIM` default / `SMART`), `languageAuto`/`languageHints` (deprecated) | [REF] §AudioTranscriptionConfig, [JS-TYPES] |
| `setup.outputAudioTranscription` | `AudioTranscriptionConfig`, biasanya `{}` | [REF] |
| `setup.realtimeInputConfig.automaticActivityDetection` | `disabled` (bool), `startOfSpeechSensitivity` (`START_SENSITIVITY_HIGH`/`START_SENSITIVITY_LOW`), `endOfSpeechSensitivity` (`END_SENSITIVITY_HIGH`/`END_SENSITIVITY_LOW`), `prefixPaddingMs` (int), `silenceDurationMs` (int). Default Vertex: `*_LOW` ("The default is START_SENSITIVITY_LOW for Gemini Enterprise Agent Platform") | [JS-TYPES] (`AutomaticActivityDetection`, enum `StartSensitivity`/`EndSensitivity`), [REF] §VAD, [AIS-CAPS] |
| `setup.realtimeInputConfig.activityHandling` | `START_OF_ACTIVITY_INTERRUPTS` (default, barge-in) / `NO_INTERRUPTION` | [JS-TYPES] |
| `setup.realtimeInputConfig.turnCoverage` | `TURN_INCLUDES_ONLY_ACTIVITY` (default) / `TURN_INCLUDES_ALL_INPUT` / ... | [JS-TYPES] |
| `setup.sessionResumption` | `{}` untuk sesi baru (aktifkan update), `{"handle": "<newHandle sebelumnya>"}` untuk resume; opsional `transparent: true` | [REF], [AIS-REF] ("The handle of a previous session. If not present then a new session is created."), [JS-TYPES], [SESSION] |
| `setup.contextWindowCompression` | `{"triggerTokens": "<int64>", "slidingWindow": {"targetTokens": "<int64>"}}`; `targetTokens` default `trigger_tokens/2`. [SESSION]: trigger 5.000–128.000, target 0–128.000 | [AIS-REF], [JS-TYPES], [SESSION] |
| `setup.proactivity` | `{"proactiveAudio": true}` | [JS-CONV], [CAPS] |
| `setup.explicitVadSignal` | bool — server mengirim sinyal VAD bawaan | [REF] |
| Lain-lain | `avatarConfig`, `safetySettings[]`, `historyConfig`, `labels` | [REF] |

**Custom vocabulary / phrase hints untuk input transcription: ADA** — `inputAudioTranscription.customVocabulary[]` (dan `languageCodes[]` sebagai hint bahasa) di referensi Vertex [REF] dan SDK [JS-TYPES]. Halaman model [M25] juga menyebut "Enhanced audio-to-text transcription, with optional language hints". Apakah `customVocabulary` benar-benar dihormati oleh `gemini-3.8-live` / `gemini-live-2.5-flash-native-audio` (vs hanya model Transcribe): [⚠️ BELUM TERVERIFIKASI] — perlu uji.

---

## 3. Pesan dari client

"The JSON object must have *exactly one* of the fields": `setup`, `clientContent`, `realtimeInput`, `toolResponse`, `contextUpdate` [REF] §Send messages.

| Pesan | Bentuk wire | Sumber |
|---|---|---|
| Audio realtime (baru) | `{"realtimeInput": {"audio": {"data": "<base64 PCM16LE>", "mimeType": "audio/pcm;rate=16000"}}}` | [REF] (field `audio`: "These form the realtime audio input stream"), [JS-CONV] (`['audio']`), MIME: [AIS-CAPS] (`mimeType: 'audio/pcm;rate=16000'`) |
| Audio lama | `realtimeInput.mediaChunks[]` — masih ada di referensi Vertex (tidak ditandai deprecated di [REF]), tapi di Gemini API: "DEPRECATED: Use one of `audio`, `video`, or `text` instead." | [REF], [AIS-REF] |
| Akhir stream audio | `{"realtimeInput": {"audioStreamEnd": true}}` — hanya saat automatic VAD aktif; buka lagi dengan mengirim audio | [REF] |
| Manual VAD | `{"realtimeInput": {"activityStart": {}}}` / `{"realtimeInput": {"activityEnd": {}}}` — hanya bila `automaticActivityDetection.disabled = true` | [REF] |
| Video / teks realtime | `realtimeInput.video` (Blob, JPEG 1 FPS), `realtimeInput.text` | [REF], [OVERVIEW] |
| Client content | `{"clientContent": {"turns": [{"role": "user", "parts": [{"text": "..."}]}], "turnComplete": true}}` — selalu di-append ke history; "A message here will interrupt any current model generation." | [REF], [JS-LIVE] (`clientContent: {turns: contents, turnComplete: ...}`) |
| Tool response | `{"toolResponse": {"functionResponses": [{"id": "<dari toolCall>", "name": "fn", "response": {"result": ...}}]}}` — dicocokkan via `id` | [REF], [JS-LIVE] (`toolResponse: {'functionResponses': ...}`), [CAPS] |
| Context update (3.8 Live) | `{"contextUpdate": {"systemInstruction": {...}, "tools": {"tools": [...]}}}` — mengganti system instruction / tools mid-session | [REF] §BidiGenerateContentContextUpdate (bentuk wrapper `tools.tools[]` dari tabel `Tools`; casing JSON persis: [⚠️ BELUM TERVERIFIKASI]) |

---

## 4. Pesan dari server

Satu pesan berisi tepat satu dari: `setupComplete`, `serverContent`, `toolCall`, `toolCallCancellation`, `usageMetadata`, `goAway`, `sessionResumptionUpdate` (serta `inputTranscription`/`outputTranscription` disebut di daftar top-level [REF], namun di tabel proto keduanya adalah field di dalam `serverContent`). [REF] §Receive messages. Catatan: `usageMetadata` pada praktiknya bisa ikut bersama field lain [⚠️ BELUM TERVERIFIKASI].

| Pesan | Field wire | Sumber |
|---|---|---|
| `setupComplete` | `{}` atau `{"sessionId": "..."}` | [REF] (`session_id`) |
| `serverContent.modelTurn.parts[].inlineData` | `{"mimeType": "audio/pcm;rate=24000", "data": "<base64>"}` — PCM 16-bit 24 kHz LE | Output format: [OVERVIEW], [M38]; field `model_turn`: [REF]; string MIME persis `audio/pcm;rate=24000`: [⚠️ BELUM TERVERIFIKASI] (jangan bergantung pada string; anggap 24 kHz) |
| `serverContent.inputTranscription` | `{"text": "...", "finished": bool}` (SDK juga punya `languageCode`, `words`, dsb.) | [REF] §Transcription, [JS-TYPES] |
| `serverContent.interimInputTranscription` | transkrip interim latensi rendah | [REF] |
| `serverContent.outputTranscription` | `{"text": "...", "finished": bool}` | [REF] |
| `serverContent.interrupted` | true → hentikan & kosongkan antrian playback | [REF] |
| `serverContent.generationComplete` | model selesai generate (tidak muncul bila interrupted) | [REF] |
| `serverContent.turnComplete` | giliran selesai; plus `turnCompleteReason`, `interactionStatus`, `speechState`, `groundingMetadata` | [REF] |
| `toolCall` | `{"functionCalls": [{"id": "...", "name": "...", "args": {...}}]}` | [REF], [JS-TYPES], [CAPS] |
| `toolCallCancellation` | `{"ids": ["..."]}` | [REF], [JS-TYPES] |
| `sessionResumptionUpdate` | `{"newHandle": "...", "resumable": bool, "lastConsumedClientMessageIndex": "<int64>"}` — `newHandle` kosong bila `resumable=false` | [AIS-REF], [JS-TYPES], [SESSION] (`if update.resumable and update.new_handle`) |
| `goAway` | `{"timeLeft": "<Duration, mis. \"60s\">"}` — "The remaining time before the connection will be terminated as ABORTED"; dikirim 60 detik sebelum sesi berakhir | [AIS-REF], [JS-TYPES], [SESSION] |
| `usageMetadata` (wire Vertex) | `promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`, `promptTokensDetails[]`, `candidatesTokensDetails[]`, `cachedContentTokenCount`, `cacheTokensDetails[]`, `toolUsePromptTokenCount`, `toolUsePromptTokensDetails[]`, `thoughtsTokenCount`, `trafficType`. Item detail: `{"modality": "AUDIO"|"TEXT"|..., "tokenCount": n}`. **SDK me-rename** `candidatesTokenCount`→`responseTokenCount` dan `candidatesTokensDetails`→`responseTokensDetails` (nama yang dipakai Gemini API/AI Studio) | [JS-CONV] `usageMetadataFromVertex`, [JS-TYPES] `ModalityTokenCount`, [AIS-REF], [AIS-CAPS] |

**Frame binary atau text?** Server mengirim JSON yang bisa datang sebagai **frame binary** (Blob/ArrayBuffer) maupun text. Contoh di [REF] memeriksa `if (evt.data instanceof Blob)`; SDK JS men-decode `Blob` → `text()`, `ArrayBuffer` → `TextDecoder`, lalu `JSON.parse` [JS-LIVE] `handleWebSocketMessage`; SDK Python `ws.recv(decode=False)` lalu `json.loads(raw_response)` [PY-LIVE] `_receive`. **Implementasi: terima kedua tipe frame, decode UTF-8, lalu JSON.parse.** Audio tetap base64 di dalam JSON (bukan PCM mentah di frame). Client mengirim JSON sebagai text frame (`ws.send(JSON.stringify(...))`) [JS-LIVE].

---

## 5. Batas & format

| Item | Nilai | Sumber |
|---|---|---|
| Sesi audio-only tanpa compression | 15 menit | [SESSION] ("Without context window compression, audio-only sessions are limited to 15 minutes") |
| Sesi audio+video tanpa compression | 2 menit | [SESSION] |
| Dengan `contextWindowCompression` | tanpa batas waktu sesi | [SESSION] |
| Umur koneksi WebSocket | ~10 menit ("limited to around 10 minutes due to WebSocket connection constraints"); "default maximum length of a conversation session is 10 minutes" | [SESSION], [REF], [M25] |
| `goAway` | dikirim 60 detik sebelum koneksi berakhir | [SESSION] |
| Perpanjangan | Reconnect dengan `setup.sessionResumption.handle` = `newHandle` terakhir; "There's no limit to the number of times you can do this." | [SESSION] |
| Masa berlaku handle | Kontradiktif di halaman yang sama: "resume a previous session within 24 hours" vs "resumption window is finite (typically around 10 minutes)". Anggap **~10 menit** untuk aman | [SESSION] |
| Input audio | Raw 16-bit PCM, 16 kHz, little-endian (`audio/pcm;rate=16000`); API me-resample rate lain | [OVERVIEW], [M38], [AIS-CAPS] |
| Output audio | Raw 16-bit PCM, 24 kHz, little-endian | [OVERVIEW], [M38] |
| Video | JPEG, 1 FPS | [OVERVIEW], [REF] |
| Context window | 128K input / 64K output | [M38], [M25] |
| Concurrent sessions | Kontradiktif: [REF] "5,000 concurrent sessions per project, 4M tokens per minute"; [SESSION]/[M25] "up to 1,000 concurrent sessions per project" untuk 2.5 flash native audio; 3.8 Live → lihat Quotas console | [REF], [SESSION], [M25], [M38] |
| Manual endpointing | "Manual endpointing isn't supported." (di luar mekanisme activityStart/End) | [REF] |
| Token count API | tidak didukung | [REF] |
| Zero data retention | Jangan aktifkan session resumption bila butuh ZDR | [SESSION] |

---

## 6. Model & region

### Model Live di Vertex AI

| Model ID | Status | Catatan | Sumber |
|---|---|---|---|
| `gemini-3.8-live` | **Generally available**, "Recommended. Low-latency voice agents." | 30 voice HD + replicated voice; proactive audio bawaan; affective dialog; function calling; Google Search; mendukung `contextUpdate` | [OVERVIEW], [M38], [CAPS], [REF] |
| `gemini-live-2.5-flash-native-audio` | **Generally available**, "Recommended" | affective dialog, proactive audio (Preview), function calling, transcription "with optional language hints"; maks. 1000 sesi concurrent | [OVERVIEW], [M25] |
| `gemini-3.5-transcribe-live-preview` | Preview | Speech-to-text only | [OVERVIEW] |
| Gemini 3.5 Live Translate | preview | terjemahan | [REF] §Supported models |

### Region (dari tabel ketersediaan [LOC], tanda "Supported" di HTML)

| Model | Lokasi yang ditandai Supported |
|---|---|
| `gemini-3.8-live` | multi-region `us`, `eu`; `us-central1`; `asia-south1` (Mumbai) |
| `gemini-live-2.5-flash-native-audio` | `us-west1`, `us-west4`, `us-central1`, `us-east1`, `us-east4`, `us-east5`, `us-south1`; `europe-west1`, `europe-west4`, `europe-north1`, `europe-central2`, `europe-west8`, `europe-southwest1` |
| Gemini 3.5 Transcribe (baris "transcribe") | `global`, `us`, `eu` |

Sumber: [LOC] (di-parse dari atribut `aria-label="Supported"` sel tabel). Halaman model [M38] konsisten: ML processing "Multi-region: `us`, `eu`"; Provisioned Throughput & Standard PayGo `us`, `eu`, `us-central1` (asia-south1 tidak disebut di [M38]).

**Kesimpulan region untuk B19:**
- `asia-southeast1` (Singapore): **tidak** ditandai untuk kedua model Live. [LOC]
- `asia-northeast1` (Tokyo): **tidak** ditandai. [LOC]
- `global`: **tidak** ditandai untuk `gemini-3.8-live` maupun `gemini-live-2.5-flash-native-audio` (hanya model Transcribe). [LOC]
- Pilihan terdekat ke Indonesia: `gemini-3.8-live` di `asia-south1`; atau `us-central1` (keduanya model tersedia di sana).
- Laporan forum (bukan sumber primer) menyebut `gemini-3.8-live` bisa ditolak dengan close reason "Publisher model … was not found or your project does not have access to it" sehingga mungkin perlu allowlist: [⚠️ BELUM TERVERIFIKASI] — https://discuss.ai.google.dev/t/allowlist-request-gemini-3-8-live-live-api-bidigeneratecontent-on-vertex-ai-project-avacallix/184587

### Bahasa Indonesia

- **Indonesian (Indonesia) `id-ID` ada** di tabel 24 bahasa Gemini Live API. [LANG]
- Model native audio berganti bahasa otomatis: "Live audio models like `gemini-3.8-live` can switch between languages naturally during conversation"; bahasa bisa dibatasi lewat system instruction. [LANG]; 2.5 flash: "switches between languages in multilingual speech without pre-configuration". [M25]
- Untuk transkrip input, beri hint `inputAudioTranscription.languageCodes: ["id-ID"]`. [REF]
- Voice (30): Zephyr, Kore, Orus, Autonoe, Umbriel, Erinome, Laomedeia, Schedar, Achird, Sadachbia, Puck, Fenrir, Aoede, Enceladus, Algieba, Algenib, Achernar, Gacrux, Zubenelgenubi, Sadaltager, Charon, Leda, Callirrhoe, Iapetus, Despina, Rasalgethi, Alnilam, Pulcherrima, Vindemiatrix, Sulafat. [LANG]
- Apakah `speechConfig.languageCode` dihormati/diabaikan model native audio: [⚠️ BELUM TERVERIFIKASI].

---

## Contoh pesan

URL: `wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent` dengan header `Authorization: Bearer <access_token>`.

Setup minimal (pesan pertama, text frame):

```json
{
  "setup": {
    "model": "projects/MY_PROJECT/locations/us-central1/publishers/google/models/gemini-3.8-live",
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "languageCode": "id-ID",
        "voiceConfig": { "prebuiltVoiceConfig": { "voiceName": "Kore" } }
      }
    },
    "systemInstruction": { "parts": [{ "text": "Anda asisten suara. Jawab dalam Bahasa Indonesia." }] },
    "inputAudioTranscription": { "languageCodes": ["id-ID"] },
    "outputAudioTranscription": {},
    "realtimeInputConfig": {
      "automaticActivityDetection": {
        "disabled": false,
        "startOfSpeechSensitivity": "START_SENSITIVITY_LOW",
        "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
        "prefixPaddingMs": 20,
        "silenceDurationMs": 500
      }
    },
    "sessionResumption": {},
    "contextWindowCompression": { "slidingWindow": {} }
  }
}
```

Tunggu `{"setupComplete": {...}}`, lalu kirim chunk audio (~100 ms PCM16LE mono 16 kHz, base64):

```json
{
  "realtimeInput": {
    "audio": { "data": "AAABAAIA...", "mimeType": "audio/pcm;rate=16000" }
  }
}
```

Sumber struktur: [REF], [JS-CONV], [JS-TYPES], [AIS-CAPS]. Nilai VAD di atas hanya ilustrasi (field valid; angka bukan rekomendasi resmi). `contextWindowCompression: {"slidingWindow": {}}` mengandalkan default server untuk `triggerTokens`/`targetTokens` ([AIS-REF] menyebut default `targetTokens = trigger_tokens/2`; default `triggerTokens` di Vertex: [⚠️ BELUM TERVERIFIKASI]).
