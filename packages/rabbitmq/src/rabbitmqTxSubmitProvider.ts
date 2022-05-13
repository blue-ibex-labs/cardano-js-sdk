import { Buffer } from 'buffer';
import { Cardano, HealthCheckResponse, ProviderError, ProviderFailure, TxSubmitProvider } from '@cardano-sdk/core';
import { Channel, Connection, connect } from 'amqplib';
import { Logger, dummyLogger } from 'ts-log';

const queue = 'tx-submission';

/**
 * Wraps the AMQP connaction handling exposing the methods required by the Provider
 */
class RabbitMqTxSubmitProvider implements TxSubmitProvider {
  #channel?: Channel;
  #connection?: Connection;
  #connectionURL: URL;
  #logger: Logger;
  #queueWasCreated = false;

  constructor(connectionURL: URL, logger: Logger) {
    this.#connectionURL = connectionURL;
    this.#logger = logger;
  }

  /**
   * Closes the connection to RabbitMQ and resets the states
   */
  async #clear() {
    try {
      await this.#connection?.close();
      // eslint-disable-next-line no-empty
    } catch {}

    this.#channel = undefined;
    this.#connection = undefined;
    this.#queueWasCreated = false;
  }

  /**
   * Connects to the RabbitMQ server and create the channel
   */
  async #connect() {
    if (this.#connection) return;

    try {
      this.#connection = await connect(this.#connectionURL.toString());
    } catch (error) {
      await this.#clear();
      throw new ProviderError(ProviderFailure.ConnectionFailure, error);
    }

    try {
      this.#channel = await this.#connection.createChannel();
    } catch (error) {
      await this.#clear();
      throw new ProviderError(ProviderFailure.ConnectionFailure, error);
    }
  }

  /**
   * Idempotently (hannel.assertQueue does the job for us) creates the queue
   *
   * @param {boolean} force Forces the creation of the queue just to have a response from the server
   */
  async #createQueue(force?: boolean) {
    if (this.#queueWasCreated && !force) return;

    await this.#connect();
    this.#queueWasCreated = true;

    try {
      await this.#channel!.assertQueue(queue);
    } catch (error) {
      await this.#clear();
      throw new ProviderError(ProviderFailure.ConnectionFailure, error);
    }
  }

  /**
   * Closes the connection to RabbitMQ
   */
  async close() {
    await this.#clear();
  }

  /**
   * Checks for healthy status
   *
   * @returns {HealthCheckResponse} The result of the check
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    let ok = false;

    try {
      await this.#createQueue(true);
      ok = true;
    } catch {
      this.#logger.error({ error: 'Connection error', module: 'rabbitmqTxSubmitProvider' });
    }

    return { ok };
  }

  /**
   * Submit a transaction to RabbitMQ
   *
   * @param {Uint8Array} signedTransaction The Uint8Array representation of a signedTransaction
   */
  async submitTx(signedTransaction: Uint8Array) {
    try {
      await this.#createQueue();
      this.#channel!.sendToQueue(queue, Buffer.from(signedTransaction));
    } catch (error) {
      throw Cardano.util.asTxSubmissionError(error) || new Cardano.UnknownTxSubmissionError(error);
    }
  }
}

/**
 * Connect to an [RabbitMQ](https://www.rabbitmq.com/) instance
 *
 * @param {URL} connectionURL RabbitMQ connection URL
 * @param {Logger} logger object implementing the Logger abstract class
 * @returns {TxSubmitProvider} TxSubmitProvider
 */
export const rabbitmqTxSubmitProvider = (connectionURL: URL, logger: Logger = dummyLogger): TxSubmitProvider =>
  new AMQPWrapper(connectionURL, logger);
