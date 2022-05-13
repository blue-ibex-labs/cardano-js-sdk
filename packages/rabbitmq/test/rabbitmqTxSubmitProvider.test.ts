import { TxSubmitProvider } from '@cardano-sdk/core';
import { rabbitmqTxSubmitProvider } from '../src';

const BAD_CONNECTION_URL = new URL('amqp://localhost:1234');
const GOOD_CONNECTION_URL = new URL('amqp://localhost');

describe('rabbitmqTxSubmitProvider', () => {
  let provider: TxSubmitProvider;

  afterEach(() => provider?.close!());

  describe('healthCheck', () => {
    it('is not ok if cannot connect', async () => {
      provider = rabbitmqTxSubmitProvider(BAD_CONNECTION_URL);
      const res = await provider.healthCheck();
      expect(res).toEqual({ ok: false });
    });

    it('is ok if cannot connect', async () => {
      provider = rabbitmqTxSubmitProvider(GOOD_CONNECTION_URL);
      // Called twice to cover AMQPWrapper.#connect() first line as well
      const resA = await provider.healthCheck();
      const resB = await provider.healthCheck();
      expect(resA).toEqual({ ok: true });
      expect(resB).toEqual({ ok: true });
    });
  });

  describe('submitTx', () => {
    it('resolves if successful', async () => {
      const success = jest.fn();
      const failure = jest.fn();

      try {
        provider = rabbitmqTxSubmitProvider(GOOD_CONNECTION_URL);
        // Called twice to cover AMQPWrapper.#createQueue() first line as well
        const resA = await provider.submitTx(new Uint8Array());
        const resB = await provider.submitTx(new Uint8Array());
        expect(resA).toBeUndefined();
        expect(resB).toBeUndefined();
        success();
      } catch {
        failure();
      }

      expect(success).toBeCalled();
      expect(failure).toBeCalledTimes(0);
    });

    it('rejects with errors thrown by the service', async () => {
      const success = jest.fn();
      const failure = jest.fn();

      try {
        provider = rabbitmqTxSubmitProvider(BAD_CONNECTION_URL);
        await provider.submitTx(new Uint8Array());
        success();
      } catch {
        failure();
      }

      expect(success).toBeCalledTimes(0);
      expect(failure).toBeCalled();
    });
  });
});
