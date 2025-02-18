import {
  AccountAddressDerivationPath,
  AccountKeyDerivationPath,
  GroupedAddress,
  KeyAgent,
  KeyRole,
  SerializableKeyAgentData,
  SignBlobResult,
  SignTransactionOptions
} from './types';
import { CSL, Cardano, util } from '@cardano-sdk/core';
import { STAKE_KEY_DERIVATION_PATH } from './util';
import { TxInternals } from '../Transaction';

export abstract class KeyAgentBase implements KeyAgent {
  readonly #serializableData: SerializableKeyAgentData;

  get knownAddresses(): GroupedAddress[] {
    return this.#serializableData.knownAddresses;
  }
  get serializableData(): SerializableKeyAgentData {
    return this.#serializableData;
  }
  get extendedAccountPublicKey(): Cardano.Bip32PublicKey {
    return this.serializableData.extendedAccountPublicKey;
  }
  get networkId(): Cardano.NetworkId {
    return this.serializableData.networkId;
  }
  get accountIndex(): number {
    return this.serializableData.accountIndex;
  }
  abstract signBlob(derivationPath: AccountKeyDerivationPath, blob: Cardano.util.HexBlob): Promise<SignBlobResult>;
  abstract exportRootPrivateKey(): Promise<Cardano.Bip32PrivateKey>;
  abstract signTransaction(
    txInternals: TxInternals,
    signTransactionOptions: SignTransactionOptions
  ): Promise<Cardano.Signatures>;

  constructor(serializableData: SerializableKeyAgentData) {
    this.#serializableData = serializableData;
  }

  /**
   * See https://github.com/cardano-foundation/CIPs/tree/master/CIP-1852#specification
   */
  async deriveAddress({ index, type }: AccountAddressDerivationPath): Promise<GroupedAddress> {
    const derivedPublicPaymentKey = await this.deriveCslPublicKey({
      index,
      role: type as unknown as KeyRole
    });

    // Possible optimization: memoize/cache stakeKeyCredential, because it's always the same
    const publicStakeKey = await this.deriveCslPublicKey(STAKE_KEY_DERIVATION_PATH);
    const stakeKeyCredential = CSL.StakeCredential.from_keyhash(publicStakeKey.hash());

    const address = CSL.BaseAddress.new(
      this.networkId,
      CSL.StakeCredential.from_keyhash(derivedPublicPaymentKey.hash()),
      stakeKeyCredential
    ).to_address();

    const rewardAccount = CSL.RewardAddress.new(this.networkId, stakeKeyCredential).to_address();
    const groupedAddress = {
      accountIndex: this.accountIndex,
      address: Cardano.Address(address.to_bech32()),
      index,
      networkId: this.networkId,
      rewardAccount: Cardano.RewardAccount(rewardAccount.to_bech32()),
      type
    };
    this.knownAddresses.push(groupedAddress);
    return groupedAddress;
  }

  async derivePublicKey(derivationPath: AccountKeyDerivationPath): Promise<Cardano.Ed25519PublicKey> {
    const cslPublicKey = await this.deriveCslPublicKey(derivationPath);
    return Cardano.Ed25519PublicKey.fromHexBlob(util.bytesToHex(cslPublicKey.as_bytes()));
  }

  protected async deriveCslPublicKey({ index, role: type }: AccountKeyDerivationPath): Promise<CSL.PublicKey> {
    const accountPublicKeyBytes = Buffer.from(this.extendedAccountPublicKey, 'hex');
    const accountPublicKey = CSL.Bip32PublicKey.from_bytes(accountPublicKeyBytes);
    return accountPublicKey.derive(type).derive(index).to_raw_key();
  }
}
