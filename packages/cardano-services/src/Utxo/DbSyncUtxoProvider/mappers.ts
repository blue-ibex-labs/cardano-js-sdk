import { Cardano } from '@cardano-sdk/core';
import { UtxoModel } from './types';

const generateAssetId = (policy: string, name: string) =>
  Cardano.AssetId(policy + (!name || name === '' ? '\\x' : name));

/**
 * Indexes the given utxos by its coin id in order to generate core utxo objects
 *
 * @param {UtxoModel[]} utxos  obtained utxos rows
 * @returns {Cardano.Utxo[]} an array of core utxo objects
 */
export const toUtxoByAddressesResponse = (utxos: UtxoModel[]): Cardano.Utxo[] => {
  const utxosByCoin = utxos.reduce((coins, current) => {
    const coinId = `${current.tx_id}:${current.index}`;
    const utxo = coins.get(coinId);
    if (utxo) {
      const txIn = utxo[0];
      const txOut = utxo[1];
      if (current.asset_name && current.asset_policy && current.asset_quantity) {
        const newAssets = txOut.value.assets || new Map<Cardano.AssetId, bigint>();
        newAssets.set(generateAssetId(current.asset_policy, current.asset_name), BigInt(current.asset_quantity));
        txOut.value.assets = newAssets;
      }
      coins.set(coinId, [txIn, txOut]);
    } else {
      const address = Cardano.Address(current.address);
      const txOut: Cardano.TxOut = {
        address,
        value: {
          coins: BigInt(current.value)
        }
      };
      if (current.data_hash) txOut.datum = Cardano.Hash32ByteBase16(current.data_hash);
      if (current.asset_name && current.asset_policy && current.asset_quantity) {
        txOut.value.assets = new Map<Cardano.AssetId, bigint>([
          [generateAssetId(current.asset_policy, current.asset_name), BigInt(current.asset_quantity)]
        ]);
      }
      coins.set(coinId, [
        {
          address,
          index: current.index,
          txId: Cardano.TransactionId(current.tx_id)
        },
        txOut
      ]);
    }
    return coins;
  }, new Map<string, Cardano.Utxo>());
  return [...utxosByCoin.values()];
};
