// tested in packages/wallet/test/integration/cip30mapping.test.ts
import {
  ApiError,
  DataSignError,
  DataSignErrorCode,
  TxSendError,
  TxSendErrorCode,
  TxSignError,
  TxSignErrorCode
} from '../errors';
import { Bytes, Cbor, Paginate, WalletApi } from './types';
import { CSL, Cardano, coreToCsl, cslToCore } from '@cardano-sdk/core';
import { InputSelectionError } from '@cardano-sdk/cip2';
import { KeyManagement, ObservableWallet } from '@cardano-sdk/wallet';
import { Logger, dummyLogger } from 'ts-log';
import { firstValueFrom } from 'rxjs';

export type Cip30WalletDependencies = {
  logger?: Logger;
};

export enum Cip30ConfirmationCallbackType {
  SignData = 'sign_data',
  SignTx = 'sign_tx',
  SubmitTx = 'submit_tx'
}

export type SignDataCallbackParams = {
  type: Cip30ConfirmationCallbackType.SignData;
  data: {
    addr: Cardano.Address;
    payload: Cardano.util.HexBlob;
  };
};

export type SignTxCallbackParams = {
  type: Cip30ConfirmationCallbackType.SignTx;
  data: Cardano.NewTxBodyAlonzo;
};

export type SubmitTxCallbackParams = {
  type: Cip30ConfirmationCallbackType.SubmitTx;
  data: Cardano.NewTxAlonzo;
};

export type CallbackConfirmation = (
  args: SignDataCallbackParams | SignTxCallbackParams | SubmitTxCallbackParams
) => Promise<boolean>;

const mapCallbackFailure = (err: unknown, logger?: Logger) => {
  logger?.error(err);
  return false;
};

export const observableWalletApi = (
  wallet: ObservableWallet,
  confirmationCallback: CallbackConfirmation,
  { logger = dummyLogger }: Cip30WalletDependencies = {}
): WalletApi => ({
  getBalance: async (): Promise<Cbor> => {
    logger.debug('getting balance');
    try {
      const value = await firstValueFrom(wallet.balance.available$);
      return Buffer.from(coreToCsl.value(value).to_bytes()).toString('hex');
    } catch (error) {
      logger.error(error);
      throw error;
    }
  },
  getChangeAddress: async (): Promise<Cbor> => {
    logger.debug('getting changeAddress');
    try {
      const [{ address }] = await firstValueFrom(wallet.addresses$);

      if (!address) {
        logger.error('could not get change address');
        throw new ApiError(500, 'could not get change address');
      } else {
        return address.toString();
      }
    } catch (error) {
      logger.error(error);
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Nope');
    }
  },
  getCollateral: async () => {
    logger.warn('getCollateral is not implemented');
    return null;
  },
  getNetworkId: async (): Promise<number> => {
    logger.debug('getting networkId');
    return wallet.getNetworkId();
  },
  getRewardAddresses: async (): Promise<Cbor[]> => {
    logger.debug('getting reward addresses');
    try {
      const [{ rewardAccount }] = await firstValueFrom(wallet.addresses$);

      if (!rewardAccount) {
        throw new ApiError(500, 'could not get reward address');
      } else {
        return [rewardAccount.toString()];
      }
    } catch (error) {
      logger.error(error);
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Nope');
    }
  },
  getUnusedAddresses: async (): Promise<Cbor[]> => {
    logger.debug('getting unused addresses');
    return Promise.resolve([]);
  },
  getUsedAddresses: async (_paginate?: Paginate): Promise<Cbor[]> => {
    logger.debug('getting changeAddress');

    const [{ address }] = await firstValueFrom(wallet.addresses$);

    if (!address) {
      throw new ApiError(500, 'could not get used addresses');
    } else {
      return [address.toString()];
    }
  },
  getUtxos: async (amount?: Cbor, paginate?: Paginate): Promise<Cbor[] | undefined> => {
    let utxos = await firstValueFrom(wallet.utxo.available$);

    if (amount) {
      try {
        const filterAmount = CSL.Value.from_bytes(Buffer.from(amount, 'hex'));
        /**
         * Getting UTxOs to meet a required amount is a complex operation,
         * which is handled by input selection capabilities. By initializing
         * a transaction we're able to utilise the internal configuration and
         * algorithm to make this selection, using a wallet address to
         * satisfy the interface only.
         */
        const { inputSelection } = await wallet.initializeTx({
          outputs: new Set([{ address: wallet.addresses$.value![0].address, value: cslToCore.value(filterAmount) }])
        });

        utxos = [...inputSelection.inputs];
      } catch (error) {
        logger.debug(error);
        const message = error instanceof InputSelectionError ? error.message : 'Nope';
        throw new ApiError(400, message);
      }
    } else if (paginate) {
      utxos = utxos.slice(paginate.page * paginate.limit, paginate.page * paginate.limit + paginate.limit);
    }

    return Promise.resolve(coreToCsl.utxo(utxos).map((utxo) => Buffer.from(utxo.to_bytes()).toString('hex')));
  },
  signData: async (addr: Cardano.Address, payload: Bytes): Promise<KeyManagement.cip8.Cip30DataSignature> => {
    logger.debug('signData');
    const hexBlobPayload = Cardano.util.HexBlob(payload);

    const shouldProceed = await confirmationCallback({
      data: {
        addr,
        payload: hexBlobPayload
      },
      type: Cip30ConfirmationCallbackType.SignData
    }).catch((error) => mapCallbackFailure(error, logger));

    if (shouldProceed) {
      return wallet.signData({
        payload: hexBlobPayload,
        signWith: addr
      });
    }
    logger.debug('sign data declined');
    throw new DataSignError(DataSignErrorCode.UserDeclined, 'user declined signing');
  },
  signTx: async (tx: Cbor, _partialSign?: Boolean): Promise<Cbor> => {
    logger.debug('signTx');

    const txDecoded = CSL.TransactionBody.from_bytes(Buffer.from(tx, 'hex'));
    const hash = Cardano.TransactionId(Buffer.from(CSL.hash_transaction(txDecoded).to_bytes()).toString('hex'));
    const coreTx = cslToCore.txBody(txDecoded);
    const shouldProceed = await confirmationCallback({
      data: coreTx,
      type: Cip30ConfirmationCallbackType.SignTx
    }).catch((error) => mapCallbackFailure(error, logger));
    if (shouldProceed) {
      try {
        const {
          witness: { signatures }
        } = await wallet.finalizeTx({
          body: coreTx,
          hash
        });

        const cslWitnessSet = coreToCsl.witnessSet(signatures);

        return Promise.resolve(Buffer.from(cslWitnessSet.to_bytes()).toString('hex'));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        logger.error(error);
        // TODO: handle ProofGeneration errors?
        const message = (typeof error === 'object' && error.message) || 'Nope';
        throw new TxSignError(TxSignErrorCode.UserDeclined, message);
      }
    } else {
      throw new TxSignError(TxSignErrorCode.UserDeclined, 'user declined signing tx');
    }
  },
  submitTx: async (tx: Cbor): Promise<string> => {
    logger.debug('submitting tx');
    const txDecoded = CSL.Transaction.from_bytes(Buffer.from(tx, 'hex'));
    const txData: Cardano.NewTxAlonzo = cslToCore.newTx(txDecoded);
    const shouldProceed = await confirmationCallback({
      data: txData,
      type: Cip30ConfirmationCallbackType.SubmitTx
    }).catch((error) => mapCallbackFailure(error, logger));

    if (shouldProceed) {
      try {
        await wallet.submitTx(txData);
        return txData.id.toString();
      } catch (error) {
        logger.error(error);
        throw error;
      }
    } else {
      logger.debug('transaction refused');
      throw new TxSendError(TxSendErrorCode.Refused, 'transaction refused');
    }
  }
});
