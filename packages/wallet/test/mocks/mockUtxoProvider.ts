import { UtxoProvider } from '@cardano-sdk/core';

/**
 * Provider stub for testing
 *
 * returns UtxoProvider-compatible object
 */
export const mockUtxoProvider = (): UtxoProvider => ({
  healthCheck: jest.fn().mockResolvedValue(true),
  utxoByAddresses: jest.fn().mockResolvedValue([])
});

export type UtxoProviderStub = ReturnType<typeof mockUtxoProvider>;
