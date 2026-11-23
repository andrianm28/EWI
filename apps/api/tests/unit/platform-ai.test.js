// B12: aturan kesepakatan AI–HR (spek §Kesepakatan AI–HR) lewat service dengan store tiruan.
const { createPlatformService } = require('../../src/modules/platform/service');

const service = (rows, target = 85) => createPlatformService({
  store: { aiQuality: async () => rows },
  platformSettings: { get: async () => target },
});
const day = (tenantId, reviewed, approved, d = '2026-11-20') => ({ tenantId, name: tenantId, day: d, reviewed, approved });

describe('kesepakatan AI–HR', () => {
  it('34/40 = 85% memenuhi target 85 (batas inklusif)', async () => {
    const [r] = await service([day('a', 40, 34)]).aiQuality({ days: 30 });
    expect(r).toMatchObject({ agreement: 85, meetsTarget: true, enoughData: true });
  });

  it('rasio mentah, bukan persen yang dibulatkan: 1699/2000 (84,95%) tidak memenuhi 85', async () => {
    const [r] = await service([day('a', 2000, 1699)]).aiQuality({ days: 30 });
    expect(r.agreement).toBe(85);
    expect(r.meetsTarget).toBe(false);
  });

  it('n < 10 tanpa tanda lulus/gagal; titik harian dijumlah per tenant', async () => {
    const [r] = await service([day('a', 4, 4, '2026-11-19'), day('a', 5, 1, '2026-11-20')]).aiQuality({ days: 30 });
    expect(r).toMatchObject({ reviewed: 9, approved: 5, meetsTarget: null, enoughData: false });
    expect(r.daily.map((d) => d.enoughData)).toEqual([false, false]);
  });
});
