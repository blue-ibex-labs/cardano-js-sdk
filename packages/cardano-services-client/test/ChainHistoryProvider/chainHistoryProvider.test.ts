/* eslint-disable sonarjs/no-duplicate-string */
import { ProviderError, ProviderFailure, util } from '@cardano-sdk/core';
import { chainHistoryHttpProvider } from '../../src';
import got, { HTTPError, Response } from 'got';

const url = 'http://some-hostname:3000/history';

const httpError = (bodyError = new Error('error')) => {
  const response = {
    body: util.toSerializableObject(new ProviderError(ProviderFailure.BadRequest, bodyError))
  } as Response;
  const error = new HTTPError(response);
  Object.defineProperty(error, 'response', { value: response });
  return error;
};

describe('chainHistoryProvider', () => {
  describe('healthCheck', () => {
    it('is not ok if cannot connect', async () => {
      const provider = chainHistoryHttpProvider(url);
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
        got.post = jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue({ ok: true }) });
        const provider = chainHistoryHttpProvider(url);
        await expect(provider.healthCheck()).resolves.toEqual({ ok: true });
      });

      it('is not ok if 200 response body is { ok: false }', async () => {
        got.post = jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue({ ok: false }) });
        const provider = chainHistoryHttpProvider(url);
        await expect(provider.healthCheck()).resolves.toEqual({ ok: false });
      });
    });
  });

  describe('blocks', () => {
    it('resolves if successful', async () => {
      got.post = jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue([]) });
      const provider = chainHistoryHttpProvider(url);
      await expect(provider.blocksByHashes([])).resolves.not.toThrow();
    });

    describe('errors', () => {
      it('maps unknown errors to ProviderFailure', async () => {
        got.post = jest.fn().mockReturnValue({ json: jest.fn().mockRejectedValue(httpError()) });
        const provider = chainHistoryHttpProvider(url);
        await expect(provider.blocksByHashes([])).rejects.toThrow(ProviderFailure.Unknown);
      });
    });
  });

  describe('transactionsByHashes', () => {
    it('resolves if successful', async () => {
      got.post = jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue([]) });
      const provider = chainHistoryHttpProvider(url);
      await expect(provider.transactionsByHashes([])).resolves.not.toThrow();
    });

    describe('errors', () => {
      it('maps unknown errors to ProviderFailure', async () => {
        got.post = jest.fn().mockReturnValue({ json: jest.fn().mockRejectedValue(httpError()) });
        const provider = chainHistoryHttpProvider(url);
        await expect(provider.transactionsByHashes([])).rejects.toThrow(ProviderFailure.Unknown);
      });
    });
  });

  describe('transactionsByAddresses', () => {
    it('resolves if successful', async () => {
      got.post = jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue([]) });
      const provider = chainHistoryHttpProvider(url);
      await expect(provider.transactionsByAddresses([])).resolves.not.toThrow();
    });

    describe('errors', () => {
      it('maps unknown errors to ProviderFailure', async () => {
        got.post = jest.fn().mockReturnValue({ json: jest.fn().mockRejectedValue(httpError()) });
        const provider = chainHistoryHttpProvider(url);
        await expect(provider.transactionsByAddresses([])).rejects.toThrow(ProviderFailure.Unknown);
      });
    });
  });
});
