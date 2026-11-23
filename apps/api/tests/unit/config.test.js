const { loadConfig } = require('../../src/config/env');

describe('loadConfig', () => {
  it('menolak boot tanpa EWI_JWT_SECRET (tidak ada fallback, B22)', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(/EWI_JWT_SECRET/);
  });
  it('menolak secret yang sama dengan SESSION_SECRET EliteMentor', () => {
    const s = 'x'.repeat(40);
    expect(() => loadConfig({ NODE_ENV: 'test', EWI_JWT_SECRET: s, SESSION_SECRET: s })).toThrow(/SESSION_SECRET/);
  });
  it('mewajibkan DATABASE_URL di luar test', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', EWI_JWT_SECRET: 'x'.repeat(40) })).toThrow(/DATABASE_URL/);
  });
  it('B14: batas unggah EWI_UPLOAD_MAX_MB 1 sampai 200 (default 25 MB)', () => {
    const base = { NODE_ENV: 'test', EWI_JWT_SECRET: 'x'.repeat(40) };
    expect(loadConfig(base).uploads).toMatchObject({ dir: '', maxBytes: 25 * 1024 * 1024 });
    expect(loadConfig({ ...base, EWI_UPLOAD_MAX_MB: '200', EWI_UPLOAD_DIR: '/data/unggahan' }).uploads).toMatchObject({ dir: '/data/unggahan', maxBytes: 200 * 1024 * 1024 });
    for (const v of ['0.5', '0', '201', 'abc']) expect(() => loadConfig({ ...base, EWI_UPLOAD_MAX_MB: v })).toThrow(/EWI_UPLOAD_MAX_MB/);
  });
  it('memakai audience ewi secara default', () => {
    expect(loadConfig({ NODE_ENV: 'test', EWI_JWT_SECRET: 'x'.repeat(40) }).jwt.audience).toBe('ewi');
  });
  it('R3-2: produksi wajib SES dengan MAIL_FROM; dev default log', () => {
    const base = { EWI_JWT_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x' };
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/MAIL_PROVIDER=ses/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', MAIL_PROVIDER: 'ses' })).toThrow(/MAIL_FROM/);
    expect(loadConfig({ ...base, NODE_ENV: 'production', MAIL_PROVIDER: 'ses', MAIL_FROM: 'ELGOS <no-reply@x.id>', ENCRYPTION_PROVIDER: 'kms', BEDROCK_MODEL_ID: 'anthropic.model-uji' }).mail.provider).toBe('ses');
    const dev = loadConfig({ ...base, NODE_ENV: 'development', CORS_ORIGIN: 'https://dev.x.id/,http://a', EWI_LOCAL_MASTER_KEY: 'ab'.repeat(32) });
    expect(dev.mail.provider).toBe('log');
    expect(dev.appBaseUrl).toBe('https://dev.x.id');
  });
  it('R2-3: produksi wajib KMS; local butuh kunci induk 32 byte (kecuali test)', () => {
    const base = { EWI_JWT_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x', MAIL_PROVIDER: 'ses', MAIL_FROM: 'a@b.c' };
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/ENCRYPTION_PROVIDER=kms/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'development' })).toThrow(/EWI_LOCAL_MASTER_KEY wajib/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', EWI_LOCAL_MASTER_KEY: 'pendek' })).toThrow(/32 byte/);
    expect(loadConfig({ ...base, NODE_ENV: 'development', EWI_LOCAL_MASTER_KEY: 'ab'.repeat(32) }).encryption.localMasterKey).toHaveLength(32);
    expect(loadConfig({ EWI_JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'test' }).encryption.localMasterKey).toHaveLength(32);
  });

  describe('PK-06: penyedia AI teks', () => {
    const base = { EWI_JWT_SECRET: 'x'.repeat(40) };
    const prod = { ...base, NODE_ENV: 'production', DATABASE_URL: 'postgres://x', MAIL_PROVIDER: 'ses', MAIL_FROM: 'a@b.c', ENCRYPTION_PROVIDER: 'kms' };
    it('tiruan menjadi bawaan di luar produksi', () => {
      expect(loadConfig({ ...base, NODE_ENV: 'test' }).ai.provider).toBe('stub');
      expect(loadConfig({ ...base, NODE_ENV: 'test' }).aiProvider).toBe('stub');
    });
    it('produksi memakai bedrock dan menolak stub', () => {
      expect(() => loadConfig({ ...prod, AI_PROVIDER: 'stub' })).toThrow(/AI_PROVIDER=stub tidak boleh di produksi/);
      expect(() => loadConfig(prod)).toThrow(/BEDROCK_MODEL_ID wajib/);
      const cfg = loadConfig({ ...prod, BEDROCK_MODEL_ID: 'anthropic.model-uji' });
      expect(cfg.ai).toMatchObject({ provider: 'bedrock', region: 'ap-southeast-1', modelId: 'anthropic.model-uji', maxQuestions: 8, processing: 'in-region:ap-southeast-1' });
    });
    it('PD-2b terjawab 23 Nov: tanpa BEDROCK_REGION, model terpilih diproses in-region Singapura', () => {
      const cfg = loadConfig({ ...prod, BEDROCK_MODEL_ID: 'anthropic.claude-sonnet-5' });
      expect(cfg.ai).toMatchObject({ region: 'ap-southeast-1', modelId: 'anthropic.claude-sonnet-5', processing: 'in-region:ap-southeast-1', allowCrossRegion: false });
    });
    it('PD-2b: Jakarta lalu Singapura in-region, atau profil apac.; profil di luar APAC ditolak kecuali diizinkan', () => {
      const t = { ...base, NODE_ENV: 'test', AI_PROVIDER: 'bedrock' };
      expect(loadConfig({ ...t, BEDROCK_MODEL_ID: 'm' }).ai.region).toBe('ap-southeast-1');
      // Jakarta tetap diterima bila diisi eksplisit (mis. kelak Claude tersedia in-region di sana)
      expect(loadConfig({ ...t, BEDROCK_MODEL_ID: 'm', BEDROCK_REGION: 'ap-southeast-3' }).ai.processing).toBe('in-region:ap-southeast-3');
      expect(loadConfig({ ...t, BEDROCK_MODEL_ID: 'm', BEDROCK_REGION: 'ap-southeast-1' }).ai.processing).toBe('in-region:ap-southeast-1');
      expect(loadConfig({ ...t, BEDROCK_MODEL_ID: 'apac.anthropic.x', BEDROCK_REGION: 'ap-southeast-1' }).ai.processing).toBe('cross-region:apac');
      expect(() => loadConfig({ ...t, BEDROCK_MODEL_ID: 'm', BEDROCK_REGION: 'us-east-1' })).toThrow(/ap-southeast-3, ap-southeast-1/);
      for (const id of ['global.anthropic.x', 'us.anthropic.x', 'arn:aws:bedrock:ap-southeast-1:1:inference-profile/eu.anthropic.x']) {
        expect(() => loadConfig({ ...t, BEDROCK_MODEL_ID: id })).toThrow(/profil lintas region/);
      }
      expect(loadConfig({ ...t, BEDROCK_MODEL_ID: 'global.anthropic.x', AI_ALLOW_CROSS_REGION: 'true' }).ai.modelId).toBe('global.anthropic.x');
      expect(loadConfig({ ...t, BEDROCK_MODEL_ID: 'm', BEDROCK_REGION: 'ap-southeast-1', AI_ALLOWED_REGIONS: 'ap-southeast-1' }).ai.allowedRegions).toEqual(['ap-southeast-1']);
    });
    it('menolak penyedia tak dikenal, angka dan JSON yang tidak valid', () => {
      const t = { ...base, NODE_ENV: 'test' };
      expect(() => loadConfig({ ...t, AI_PROVIDER: 'openai' })).toThrow(/AI_PROVIDER harus/);
      expect(() => loadConfig({ ...t, AI_MAX_QUESTIONS: 'nol' })).toThrow(/maxQuestions/);
      expect(() => loadConfig({ ...t, AI_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: 'm', BEDROCK_EXTRA_FIELDS: '{' })).toThrow(/BEDROCK_EXTRA_FIELDS/);
      expect(loadConfig({ ...t, AI_PRICE_INPUT_PER_MTOK: '3', AI_PRICE_OUTPUT_PER_MTOK: '15' }).ai).toMatchObject({ priceInputPerMTok: 3, priceOutputPerMTok: 15 });
    });
  });
});
