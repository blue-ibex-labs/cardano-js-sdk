import { Cardano, UtxoProvider } from '@cardano-sdk/core';
import { DbSyncProvider } from '../../DbSyncProvider';
import { Logger, dummyLogger } from 'ts-log';
import { Pool } from 'pg';
import { UtxoQueryBuilder } from './UtxoQueryBuilder';

export class DbSyncUtxoProvider extends DbSyncProvider implements UtxoProvider {
  #logger: Logger;
  #builder: UtxoQueryBuilder;
  constructor(db: Pool, logger = dummyLogger) {
    super(db);
    this.#logger = logger;
    this.#builder = new UtxoQueryBuilder(db, logger);
  }

  public async utxoByAddresses(addresses: Cardano.Address[]): Promise<Cardano.Utxo[]> {
    this.#logger.debug('About to call utxoByAddress of Utxo Query Builder');
    return this.#builder.utxoByAddresses(addresses);
  }
}
