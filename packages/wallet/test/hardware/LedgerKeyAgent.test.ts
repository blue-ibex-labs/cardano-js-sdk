import * as mocks from '../mocks';
import { AssetId, createStubStakePoolSearchProvider } from '@cardano-sdk/util-dev';
import { Cardano } from '@cardano-sdk/core';
import { CommunicationType, TransportType } from '../../src/KeyManagement/types';
import { KeyManagement, SingleAddressWallet } from '../../src';
import DeviceConnection from '@cardano-foundation/ledgerjs-hw-app-cardano';

describe('LedgerKeyAgent', () => {
  let keyAgent: KeyManagement.LedgerKeyAgent;
  const address = mocks.utxo[0][0].address;
  let txSubmitProvider: mocks.TxSubmitProviderStub;
  let walletProvider: mocks.WalletProviderStub;
  let wallet: SingleAddressWallet;

  beforeAll(async () => {
    keyAgent = await KeyManagement.LedgerKeyAgent.createWithDevice({
      communicationType: CommunicationType.Node,
      networkId: Cardano.NetworkId.testnet
    });
    txSubmitProvider = mocks.mockTxSubmitProvider();
    walletProvider = mocks.mockWalletProvider();
    const assetProvider = mocks.mockAssetProvider();
    const stakePoolSearchProvider = createStubStakePoolSearchProvider();
    const networkInfoProvider = mocks.mockNetworkInfoProvider();
    const groupedAddress: KeyManagement.GroupedAddress = {
      accountIndex: 0,
      address,
      index: 0,
      networkId: Cardano.NetworkId.testnet,
      rewardAccount: mocks.rewardAccount,
      type: KeyManagement.AddressType.External
    };
    keyAgent.deriveAddress = jest.fn().mockResolvedValue(groupedAddress);
    wallet = new SingleAddressWallet(
      { name: 'HW Wallet' },
      { assetProvider, keyAgent, networkInfoProvider, stakePoolSearchProvider, txSubmitProvider, walletProvider }
    );
    keyAgent.knownAddresses.push(groupedAddress);
  });

  test('__typename', () => {
    expect(typeof keyAgent.serializableData.__typename).toBe('string');
  });

  test('networkId', () => {
    expect(typeof keyAgent.networkId).toBe('number');
  });

  test('accountIndex', () => {
    expect(typeof keyAgent.accountIndex).toBe('number');
  });

  test('knownAddresses', () => {
    expect(Array.isArray(keyAgent.knownAddresses)).toBe(true);
  });

  test('extendedAccountPublicKey', () => {
    expect(typeof keyAgent.extendedAccountPublicKey).toBe('string');
  });

  test('sign and submit tx', async () => {
    const outputs = [
      {
        address: Cardano.Address(
          'addr_test1qpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qum8x5w'
        ),
        value: { coins: 11_111_111n }
      },
      {
        address: Cardano.Address(
          'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp'
        ),
        value: {
          assets: new Map([[AssetId.TSLA, 6n]]),
          coins: 5n
        }
      }
    ];
    const props = {
      outputs: new Set<Cardano.TxOut>(outputs)
    };
    const txInternals = await wallet.initializeTx(props);
    const tx = await wallet.finalizeTx(txInternals);
    expect(tx.body).toBe(txInternals.body);
    expect(tx.id).toBe(txInternals.hash);
    expect(tx.witness.signatures.size).toBe(1);
    await expect(wallet.submitTx(tx)).resolves.not.toThrow();
  });

  describe('establish, check and re-establish device connection', () => {
    let deviceConnection: DeviceConnection;
    beforeAll(async () => {
      if (keyAgent.deviceConnection) {
        keyAgent.deviceConnection.transport.close();
      }
      deviceConnection = await KeyManagement.LedgerKeyAgent.establishDeviceConnection(CommunicationType.Node);
    });

    it('can check active device connection', async () => {
      const activeDeviceConnection = await KeyManagement.LedgerKeyAgent.checkDeviceConnection(
        CommunicationType.Node,
        deviceConnection
      );
      expect(activeDeviceConnection).toBeDefined();
      expect(typeof activeDeviceConnection).toBe('object');
      activeDeviceConnection.transport.close();
    });

    it('can re-establish closed device connection', async () => {
      if (deviceConnection) {
        deviceConnection.transport.close();
      }
      const activeDeviceConnection = await KeyManagement.LedgerKeyAgent.checkDeviceConnection(CommunicationType.Node);
      expect(activeDeviceConnection).toBeDefined();
      expect(typeof activeDeviceConnection).toBe('object');
      activeDeviceConnection.transport.close();
    });
  });

  describe('create device connection with transport', () => {
    let transport: TransportType;
    beforeAll(async () => {
      transport = await KeyManagement.LedgerKeyAgent.createTransport({
        communicationType: CommunicationType.Node
      });
    });

    it('can create device connection with activeTransport', async () => {
      const activeDeviceConnection = await KeyManagement.LedgerKeyAgent.createDeviceConnection(transport);
      expect(activeDeviceConnection).toBeDefined();
      expect(typeof activeDeviceConnection).toBe('object');
      activeDeviceConnection.transport.close();
    });
  });

  describe('serializableData', () => {
    let serializableData: KeyManagement.SerializableLedgerKeyAgentData;

    beforeEach(() => {
      serializableData = keyAgent.serializableData as KeyManagement.SerializableLedgerKeyAgentData;
    });

    it('all fields are of correct types', () => {
      expect(typeof serializableData.__typename).toBe('string');
      expect(typeof serializableData.accountIndex).toBe('number');
      expect(typeof serializableData.networkId).toBe('number');
      expect(Array.isArray(serializableData.knownAddresses)).toBe(true);
      expect(typeof serializableData.extendedAccountPublicKey).toBe('string');
      expect(typeof serializableData.communicationType).toBe('string');
    });

    it('is serializable', () => {
      expect(JSON.parse(JSON.stringify(serializableData))).toEqual(serializableData);
    });
  });
});
