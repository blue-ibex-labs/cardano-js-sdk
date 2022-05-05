import * as Queries from './queries';
import {
  BlockModel,
  BlockOutputModel,
  CertificateModel,
  DelegationCertModel,
  MirCertModel,
  MultiAssetModel,
  PoolRetireCertModel,
  PoolUpdateCertModel,
  ProtocolParamsModel,
  RedeemerModel,
  StakeCertModel,
  TipModel,
  TransactionDataMap,
  TxInOutModel,
  TxMetadataModel,
  TxModel,
  TxOutMultiAssetModel,
  TxOutTokenMap,
  TxOutput,
  TxTokenMap,
  WithCertIndex,
  WithCertType,
  WithdrawalModel
} from './types';
import {
  Cardano,
  ChainHistoryProvider,
  ProtocolParametersRequiredByWallet,
  ProviderError,
  ProviderFailure
} from '@cardano-sdk/core';
import { DbSyncProvider } from '../../DbSyncProvider';
import { Logger, dummyLogger } from 'ts-log';
import { Pool, QueryResult } from 'pg';
import { hexStringToBuffer } from '../../util';
import {
  mapBlock,
  mapCertificate,
  mapProtocolParams,
  mapRedeemer,
  mapTxAlonzo,
  mapTxIn,
  mapTxMetadata,
  mapTxOut,
  mapTxOutTokenMap,
  mapTxTokenMap,
  mapWithdrawal
} from './mappers';
import { omit, orderBy, uniq } from 'lodash-es';

export class DbSyncChainHistoryProvider extends DbSyncProvider implements ChainHistoryProvider {
  #logger: Logger;

  constructor(db: Pool, logger = dummyLogger) {
    super(db);
    this.#logger = logger;
  }

  private async queryTransactionInputsByHashes(
    hashes: Cardano.TransactionId[],
    collateral = false
  ): Promise<Cardano.TxIn[]> {
    const byteHashes = hashes.map((hash) => hexStringToBuffer(hash.toString()));
    this.#logger.debug(`About to find inputs (collateral: ${collateral}) for transactions:`, byteHashes);
    const result: QueryResult<TxInOutModel> = await this.db.query(
      collateral ? Queries.findTxCollateralsByHashes : Queries.findTxInputsByHashes,
      [byteHashes]
    );
    return result.rows.length > 0 ? result.rows.map(mapTxIn) : [];
  }

  private async queryMultiAssetsByTxOut(txOutIds: string[]): Promise<TxOutTokenMap> {
    this.#logger.debug('About to find multi assets for tx outs:', txOutIds);
    const result: QueryResult<TxOutMultiAssetModel> = await this.db.query(Queries.findMultiAssetByTxOut, [txOutIds]);
    return mapTxOutTokenMap(result.rows);
  }

  private async queryTransactionOutputsByHashes(hashes: Cardano.TransactionId[]): Promise<TxOutput[]> {
    const byteHashes = hashes.map((hash) => hexStringToBuffer(hash.toString()));
    this.#logger.debug('About to find outputs for transactions:', byteHashes);
    const result: QueryResult<TxInOutModel> = await this.db.query(Queries.findTxOutputsByHashes, [byteHashes]);
    if (result.rows.length === 0) return [];

    const txOutIds = result.rows.flatMap((txOut) => txOut.id);
    const multiAssets = await this.queryMultiAssetsByTxOut(txOutIds);
    return result.rows.map((txOut) => mapTxOut(txOut, multiAssets.get(txOut.id)));
  }

  private async queryTxMintByHashes(hashes: Cardano.TransactionId[]): Promise<TxTokenMap> {
    const byteHashes = hashes.map((hash) => hexStringToBuffer(hash.toString()));
    this.#logger.debug('About to find tx mint for txs:', byteHashes);
    const result: QueryResult<MultiAssetModel> = await this.db.query(Queries.findTxMint, [byteHashes]);
    return mapTxTokenMap(result.rows);
  }

  private async queryWithdrawalsByHashes(
    hashes: Cardano.TransactionId[]
  ): Promise<TransactionDataMap<Cardano.Withdrawal[]>> {
    const byteHashes = hashes.map((hash) => hexStringToBuffer(hash.toString()));
    this.#logger.debug('About to find withdrawals for txs:', byteHashes);
    const result: QueryResult<WithdrawalModel> = await this.db.query(Queries.findWithdrawal, [byteHashes]);
    const withdrawalMap: TransactionDataMap<Cardano.Withdrawal[]> = new Map();
    for (const withdrawal of result.rows) {
      const txId = Cardano.TransactionId(withdrawal.tx_id.toString('hex'));
      const currentWithdrawals = withdrawalMap.get(txId) ?? [];
      withdrawalMap.set(txId, [...currentWithdrawals, mapWithdrawal(withdrawal)]);
    }
    return withdrawalMap;
  }

  private async queryRedeemersByHashes(
    hashes: Cardano.TransactionId[]
  ): Promise<TransactionDataMap<Cardano.Redeemer[]>> {
    const byteHashes = hashes.map((hash) => hexStringToBuffer(hash.toString()));
    this.#logger.debug('About to find redeemers for txs:', byteHashes);
    const result: QueryResult<RedeemerModel> = await this.db.query(Queries.findRedeemer, [byteHashes]);
    const redeemerMap: TransactionDataMap<Cardano.Redeemer[]> = new Map();
    for (const redeemer of result.rows) {
      const txId = Cardano.TransactionId(redeemer.tx_id.toString('hex'));
      const currentRedeemers = redeemerMap.get(txId) ?? [];
      redeemerMap.set(txId, [...currentRedeemers, mapRedeemer(redeemer)]);
    }
    return redeemerMap;
  }

  private async queryTxMetadataByHashes(
    hashes: Cardano.TransactionId[]
  ): Promise<TransactionDataMap<Cardano.TxMetadata>> {
    const byteHashes = hashes.map((hash) => hexStringToBuffer(hash.toString()));
    this.#logger.debug('About to find metadata for txs:', hashes);
    const result: QueryResult<TxMetadataModel> = await this.db.query(Queries.findTxMetadata, [byteHashes]);
    if (result.rows.length === 0) return new Map();
    const metadataMap: TransactionDataMap<TxMetadataModel[]> = new Map();
    for (const metadata of result.rows) {
      const txId = Cardano.TransactionId(metadata.tx_id.toString('hex'));
      const currentMetadata: TxMetadataModel[] = metadataMap.get(txId) ?? [];
      metadataMap.set(txId, [...currentMetadata, metadata]);
    }
    return new Map([...metadataMap].map(([id, metadata]) => [id, mapTxMetadata(metadata)]));
  }

  private async queryCertificatesByHashes(
    hashes: Cardano.TransactionId[]
  ): Promise<TransactionDataMap<Cardano.Certificate[]>> {
    const byteHashes = hashes.map((hash) => hexStringToBuffer(hash.toString()));
    this.#logger.debug('About to find certificates for txs:', byteHashes);
    const poolRetireCerts: QueryResult<PoolRetireCertModel> = await this.db.query(Queries.findPoolRetireCerts, [
      byteHashes
    ]);

    const poolUpdateCerts: QueryResult<PoolUpdateCertModel> = await this.db.query(Queries.findPoolUpdateCerts, [
      byteHashes
    ]);
    const mirCerts: QueryResult<MirCertModel> = await this.db.query(Queries.findMirCerts, [byteHashes]);
    const stakeCerts: QueryResult<StakeCertModel> = await this.db.query(Queries.findStakeCerts, [byteHashes]);
    const delegationCerts: QueryResult<DelegationCertModel> = await this.db.query(Queries.findDelegationCerts, [
      byteHashes
    ]);

    const allCerts: WithCertType<CertificateModel>[] = [
      ...poolRetireCerts.rows.map((cert): WithCertType<PoolRetireCertModel> => ({ ...cert, type: 'retire' })),
      ...poolUpdateCerts.rows.map((cert): WithCertType<PoolUpdateCertModel> => ({ ...cert, type: 'update' })),
      ...mirCerts.rows.map((cert): WithCertType<MirCertModel> => ({ ...cert, type: 'mir' })),
      ...stakeCerts.rows.map((cert): WithCertType<StakeCertModel> => ({ ...cert, type: 'stake' })),
      ...delegationCerts.rows.map((cert): WithCertType<DelegationCertModel> => ({ ...cert, type: 'delegation' }))
    ];
    if (allCerts.length === 0) return new Map();

    const indexedCertsMap: TransactionDataMap<WithCertIndex<Cardano.Certificate>[]> = new Map();
    for (const cert of allCerts) {
      const txId = Cardano.TransactionId(cert.tx_id.toString('hex'));
      const currentCerts = indexedCertsMap.get(txId) ?? [];
      const newCert = mapCertificate(cert);
      if (newCert) indexedCertsMap.set(txId, [...currentCerts, newCert]);
    }

    const certsMap: TransactionDataMap<Cardano.Certificate[]> = new Map();
    for (const [txId] of indexedCertsMap) {
      const currentCerts = indexedCertsMap.get(txId) ?? [];
      const certs = orderBy(currentCerts, ['cert_index']).map(
        (cert) => omit(cert, 'cert_index') as Cardano.Certificate
      );
      certsMap.set(txId, certs);
    }
    return certsMap;
  }

  private async queryProtocolParams(): Promise<ProtocolParametersRequiredByWallet> {
    this.#logger.debug('About to find protocol parameters');
    const results: QueryResult<ProtocolParamsModel> = await this.db.query(Queries.findProtocolParameters);
    if (results.rows.length === 0) {
      throw new ProviderError(ProviderFailure.Unknown, null, "Couldn't fetch protocol parameters");
    }
    return mapProtocolParams(results.rows[0]);
  }

  public async transactionsByAddresses(
    addresses: Cardano.Address[],
    sinceBlock?: Cardano.BlockNo
  ): Promise<Cardano.TxAlonzo[]> {
    this.#logger.debug(`About to find transactions of addresses ${addresses} since block ${sinceBlock ?? 0}`);
    const inputsResults: QueryResult<TxInOutModel> = await this.db.query(Queries.findTxInputsByAddresses, [
      addresses,
      sinceBlock ?? 0
    ]);
    const outputsResults: QueryResult<TxInOutModel> = await this.db.query(Queries.findTxOutputsByAddresses, [
      addresses,
      sinceBlock ?? 0
    ]);

    if (inputsResults.rows.length === 0 && outputsResults.rows.length === 0) return [];

    const hashes = uniq([
      ...inputsResults.rows.map(mapTxIn).flatMap((input) => input.txId),
      ...outputsResults.rows.map((output) => mapTxOut(output)).flatMap((output) => output.txId)
    ]);
    return this.transactionsByHashes(hashes);
  }

  public async transactionsByHashes(hashes: Cardano.TransactionId[]): Promise<Cardano.TxAlonzo[]> {
    const byteHashes = hashes.map((hash) => hexStringToBuffer(hash.toString()));
    this.#logger.debug('About to find transactions with hashes:', byteHashes);
    const txResults: QueryResult<TxModel> = await this.db.query(Queries.findTransactionsByHashes, [byteHashes]);
    if (txResults.rows.length === 0) return [];
    const [inputs, outputs, mints, withdrawals, redeemers, metadata, collaterals, certificates, protocolParams] =
      await Promise.all([
        this.queryTransactionInputsByHashes(hashes),
        this.queryTransactionOutputsByHashes(hashes),
        this.queryTxMintByHashes(hashes),
        this.queryWithdrawalsByHashes(hashes),
        this.queryRedeemersByHashes(hashes),
        this.queryTxMetadataByHashes(hashes),
        this.queryTransactionInputsByHashes(hashes, true),
        this.queryCertificatesByHashes(hashes),
        this.queryProtocolParams()
      ]);
    return txResults.rows.map((tx) => {
      const txId = Cardano.TransactionId(tx.id.toString('hex'));
      const txInputs = orderBy(
        inputs.filter((input) => input.txId === txId),
        ['index']
      );
      const txOutputs = orderBy(
        outputs.filter((output) => output.txId === txId),
        ['index']
      );
      const txCollaterals = orderBy(
        collaterals.filter((col) => col.txId === txId),
        ['index']
      );
      return mapTxAlonzo(tx, {
        certificates: certificates.get(txId),
        collaterals: txCollaterals,
        inputs: txInputs,
        metadata: metadata.get(txId),
        mint: mints.get(txId),
        outputs: txOutputs,
        protocolParams,
        redeemers: redeemers.get(txId),
        withdrawals: withdrawals.get(txId)
      });
    });
  }

  public async blocksByHashes(hashes: Cardano.BlockId[]): Promise<Cardano.Block[]> {
    this.#logger.debug('About to find network tip');
    const tipResult: QueryResult<TipModel> = await this.db.query(Queries.findTip);
    const tip: TipModel = tipResult.rows[0];
    if (!tip) return [];

    const byteHashes = hashes.map((hash) => hexStringToBuffer(hash.toString()));
    this.#logger.debug('About to find blocks with hashes:', byteHashes);
    const blocksResult: QueryResult<BlockModel> = await this.db.query(Queries.findBlocksByHashes, [byteHashes]);
    if (blocksResult.rows.length === 0) return [];

    this.#logger.debug('About to find blocks outputs and fees for blocks:', byteHashes);
    const outputResult: QueryResult<BlockOutputModel> = await this.db.query(Queries.findBlocksOutputByHashes, [
      byteHashes
    ]);
    return blocksResult.rows.map((block) => {
      const blockOutput = outputResult.rows.find((output) => output.hash === block.hash) ?? {
        fees: '0',
        hash: block.hash,
        output: '0'
      };
      return mapBlock(block, blockOutput, tip);
    });
  }
}
