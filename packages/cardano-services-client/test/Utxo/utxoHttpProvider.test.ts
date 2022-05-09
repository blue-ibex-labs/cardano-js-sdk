/* eslint-disable max-len */
import { Cardano } from '@cardano-sdk/core';
import { utxoHttpProvider } from '../../src';
import got from 'got';

const url = 'http://some-hostname:3000/utxo';

describe('utxoHttpProvider', () => {
  describe('healtCheck', () => {
    it('is not ok if cannot connect', async () => {
      const provider = utxoHttpProvider(url);
      await expect(provider.healthCheck()).resolves.toEqual({ ok: false });
    });
    describe('mocked', () => {
      beforeAll(() => {
        jest.mock('got');
      });

      afterAll(() => {
        jest.unmock('got');
      });

      it('is ok if 200 response body is { ok: true }', async () => {
        got.get = jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue({ ok: true }) });
        const provider = utxoHttpProvider(url);
        await expect(provider.healthCheck()).resolves.toEqual({ ok: true });
      });

      it('is not ok if 200 response body is { ok: false }', async () => {
        got.get = jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue({ ok: false }) });
        const provider = utxoHttpProvider(url);
        await expect(provider.healthCheck()).resolves.toEqual({ ok: false });
      });
    });
  });
  describe('utxoByAddresses', () => {
    test('utxoByAddresses doesnt throw', async () => {
      got.post = jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue([]) });
      const provider = utxoHttpProvider(url);
      await expect(
        provider.utxoByAddresses([
          Cardano.Address(
            'addr_test1qretqkqqvc4dax3482tpjdazrfl8exey274m3mzch3dv8lu476aeq3kd8q8splpsswcfmv4y370e8r76rc8lnnhte49qqyjmtc'
          )
        ])
      ).resolves.toEqual([]);
    });
  });
});
