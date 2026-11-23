const { byKey, rowFor } = require('../../src/modules/platform/modules');

// Kill switch berlaku global untuk semua tenant, jadi tampilannya diuji di sini, bukan di test integrasi
// yang berjalan paralel dengan suite lain di database yang sama.
describe('panel modul Super Admin', () => {
  const dna = byKey('dna');
  const detail = (over) => [{ key: dna.flag, tenantEnabled: true, killSwitch: false, ...over }];

  it('kill switch aktif: flag tetap tampil menyala tetapi modul tidak efektif', () => {
    expect(rowFor(dna, detail({ killSwitch: true }), ['dna'])).toMatchObject({ flagOn: true, killSwitch: true, effective: false });
  });

  it('flag menyala, entitlement ada, tanpa kill switch: efektif', () => {
    expect(rowFor(dna, detail(), ['dna'])).toMatchObject({ flagOn: true, killSwitch: false, entitled: true, effective: true });
  });

  it('entitlement tidak ada: tidak efektif walau flag menyala', () => {
    expect(rowFor(dna, detail(), [])).toMatchObject({ entitled: false, effective: false });
  });

  it('modul tanpa entitlement (promotion): entitled null dan mengikuti flag', () => {
    const p = byKey('promotion');
    expect(rowFor(p, [{ key: p.flag, tenantEnabled: true, killSwitch: false }], [])).toMatchObject({ entitled: null, effective: true });
  });
});
