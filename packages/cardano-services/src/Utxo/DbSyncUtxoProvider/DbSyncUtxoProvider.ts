import { Cardano, HealthCheckResponse, UtxoProvider } from '@cardano-sdk/core';
import { Logger, dummyLogger } from 'ts-log';
import { Pool, QueryResult } from 'pg';
import { UtxoModel } from './types';
import { findUtxosByAddresses, healthCheckQuery } from './queries';
import { toUtxoByAddressesResponse } from './mappers';

export class DbSyncUtxoProvider implements UtxoProvider {
  #db: Pool;
  #logger: Logger;

  constructor(db: Pool, logger = dummyLogger) {
    this.#logger = logger;
    this.#db = db;
  }

  public async healthCheck(): Promise<HealthCheckResponse> {
    this.#logger.debug('About to run healthcheck query');
    const result = await this.#db.query(healthCheckQuery);
    return { ok: !!result.rowCount };
  }

  public async utxoByAddresses(addresses: Cardano.Address[]): Promise<Cardano.Utxo[]> {
    const mappedAddresses = addresses.map((a) => a.toString());
    this.#logger.debug('About to find utxos of addresses ', mappedAddresses);
    const result: QueryResult<UtxoModel> = await this.#db.query(findUtxosByAddresses, [mappedAddresses]);
    return result.rows.length > 0 ? toUtxoByAddressesResponse(result.rows) : [];
  }
}
