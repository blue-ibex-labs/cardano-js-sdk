/* eslint-disable prettier/prettier */
/* eslint-disable no-multi-spaces */
import {
  CLEAN_FN_STATS,
  ProviderFnStats,
  TrackedAssetProvider,
  TrackedNetworkInfoProvider,
  TrackedStakePoolSearchProvider,
  TrackedTxSubmitProvider,
  TrackedWalletProvider,
  createProviderStatusTracker
} from '../../../src';
import { createStubStakePoolSearchProvider, createTestScheduler  } from '@cardano-sdk/util-dev';
import { mockAssetProvider, mockNetworkInfoProvider, mockTxSubmitProvider, mockWalletProvider } from '../../mocks';

const providerFnStats = {
  a: [CLEAN_FN_STATS, CLEAN_FN_STATS], // Initial state
  b: [{ initialized: true, numCalls: 1, numFailures: 0, numResponses: 0 }, CLEAN_FN_STATS], // One provider fn called
  c: [
    // One provider fn resolved
    { initialized: true, numCalls: 1, numFailures: 0, numResponses: 1 },
    CLEAN_FN_STATS
  ],
  d: [
    // One provider fn called, one resolved
    { initialized: true, numCalls: 1, numFailures: 0, numResponses: 1 },
    { initialized: true, numCalls: 1, numFailures: 0, numResponses: 0 }
  ],
  e: [
    { initialized: true, numCalls: 1, numFailures: 0, numResponses: 1 }, // Both provider fns resolved
    { initialized: true, numCalls: 1, numFailures: 0, numResponses: 1 }
  ],
  f: [
    // Both provider fns called again
    { initialized: true, numCalls: 2, numFailures: 0, numResponses: 1 },
    { initialized: true, numCalls: 2, numFailures: 0, numResponses: 1 }
  ],
  g: [
    // One provider fn resolved, one failed
    { didLastRequestFail: true, initialized: true, numCalls: 2, numFailures: 1, numResponses: 1 },
    { initialized: true, numCalls: 2, numFailures: 0, numResponses: 2 }
  ],
  h: [
    // Failed request fn called again
    { didLastRequestFail: true, initialized: true, numCalls: 3, numFailures: 1, numResponses: 1 },
    { initialized: true, numCalls: 2, numFailures: 0, numResponses: 2 }
  ],
  i: [
    // Failed request fn resolved
    { didLastRequestFail: false, initialized: true, numCalls: 3, numFailures: 1, numResponses: 2 },
    { initialized: true, numCalls: 2, numFailures: 0, numResponses: 2 }
  ]
};

describe('createProviderStatusTracker', () => {
  let walletProvider: TrackedWalletProvider;
  let stakePoolSearchProvider: TrackedStakePoolSearchProvider;
  let networkInfoProvider: TrackedNetworkInfoProvider;
  let txSubmitProvider: TrackedTxSubmitProvider;
  let assetProvider: TrackedAssetProvider;

  const timeout = 5000;

  beforeEach(() => {
    walletProvider = new TrackedWalletProvider(mockWalletProvider());
    stakePoolSearchProvider = new TrackedStakePoolSearchProvider(createStubStakePoolSearchProvider());
    networkInfoProvider = new TrackedNetworkInfoProvider(mockNetworkInfoProvider());
    txSubmitProvider = new TrackedTxSubmitProvider(mockTxSubmitProvider());
    assetProvider = new TrackedAssetProvider(mockAssetProvider());
  });

  it('isAnyRequestPending$: true if there are any reqs in flight, false when all resolved', () => {
    createTestScheduler().run(({ cold, expectObservable }) => {
      const getProviderSyncRelevantStats = jest
        .fn()
        .mockReturnValueOnce(cold<ProviderFnStats[]>('ab-c-d-e-f-g-h-i', providerFnStats));
      const tracker = createProviderStatusTracker(
        { assetProvider, networkInfoProvider, stakePoolSearchProvider, txSubmitProvider, walletProvider },
        { consideredOutOfSyncAfter: timeout },
        { getProviderSyncRelevantStats }
      );
      // debounced by 1
      expectObservable(tracker.isAnyRequestPending$).toBe('--b-c-d-e-f-----i', {
        b: true,
        c: false,
        d: true,
        e: false,
        f: true,
        i: false
      });
    });
  });

  // eslint-disable-next-line max-len
  it('isSettled$: false on load, true when all requests are resolved, then reverse of isAnyRequestPending', async () => {
    createTestScheduler().run(({ cold, expectObservable }) => {
      const getProviderSyncRelevantStats = jest
        .fn()
        .mockReturnValueOnce(cold<ProviderFnStats[]>('-a-b-c-d-e-f-g-h-i', providerFnStats));
      const tracker = createProviderStatusTracker(
        { assetProvider, networkInfoProvider, stakePoolSearchProvider, txSubmitProvider, walletProvider },
        { consideredOutOfSyncAfter: timeout },
        { getProviderSyncRelevantStats }
      );
      // debounced by 1
      expectObservable(tracker.isSettled$).toBe('a---------e-f-----i', {
        a: false,
        e: true,
        f: false,
        i: true
      });
    });
  });

  it('isUpToDate$: false on load, true when all requests are resolved, then false on timeout', async () => {
    createTestScheduler().run(({ cold, expectObservable }) => {
      const getProviderSyncRelevantStats = jest
        .fn()
        .mockReturnValueOnce(cold<ProviderFnStats[]>(`-a-b-c-d-e-f ${timeout}ms g-h-i`, providerFnStats));
      const tracker = createProviderStatusTracker(
        { assetProvider, networkInfoProvider, stakePoolSearchProvider, txSubmitProvider, walletProvider },
        { consideredOutOfSyncAfter: timeout },
        { getProviderSyncRelevantStats }
      );
      // debounced by 1
      expectObservable(tracker.isUpToDate$, `^ ${timeout * 2}ms !`).toBe(`a---------e ${timeout - 1}ms f------g`, {
        a: false,
        e: true,
        f: false,
        g: true
      });
    });
  });
});
