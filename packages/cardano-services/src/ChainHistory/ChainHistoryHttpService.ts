import * as OpenApiValidator from 'express-openapi-validator';
import { Awaited } from '../types';
import { ChainHistoryProvider, ProviderError, ProviderFailure } from '@cardano-sdk/core';
import { DbSyncChainHistoryProvider } from './DbSyncChainHistoryProvider/DbSyncChainHistory';
import { HttpServer, HttpService } from '../Http';
import { Logger, dummyLogger } from 'ts-log';
import { ServiceNames } from '../Program';
import { providerHandler } from '../util';
import express from 'express';
import path from 'path';

export interface ChainHistoryHttpServiceDependencies {
  logger?: Logger;
  chainHistoryProvider: DbSyncChainHistoryProvider;
}

export class ChainHistoryHttpService extends HttpService {
  #chainHistoryProvider: ChainHistoryProvider;
  private constructor(
    { logger = dummyLogger, chainHistoryProvider }: ChainHistoryHttpServiceDependencies,
    router: express.Router
  ) {
    super(ServiceNames.ChainHistory, router, logger);
    this.#chainHistoryProvider = chainHistoryProvider;
  }

  async healthCheck() {
    return this.#chainHistoryProvider.healthCheck();
  }

  static async create({ logger = dummyLogger, chainHistoryProvider }: ChainHistoryHttpServiceDependencies) {
    const router = express.Router();
    if (!(await chainHistoryProvider.healthCheck()).ok) {
      throw new ProviderError(ProviderFailure.Unhealthy);
    }
    const apiSpec = path.join(__dirname, 'openApi.json');
    router.use(
      OpenApiValidator.middleware({
        apiSpec,
        ignoreUndocumented: true, // otherwhise /metrics endpoint should be included in spec
        validateRequests: true,
        validateResponses: true
      })
    );
    // TODO: refactor providerHandler to get Args and Response types on its own?
    //       and use it as providerHandler<typeof chainHistoryProvider.blocksByHashes>
    router.post(
      '/blocks/hash',
      providerHandler<
        Parameters<typeof chainHistoryProvider.blocksByHashes>,
        Awaited<ReturnType<typeof chainHistoryProvider.blocksByHashes>>
      >(async ([hashes], _, res) => {
        try {
          return HttpServer.sendJSON(res, await chainHistoryProvider.blocksByHashes(hashes));
        } catch (error) {
          logger.error(error);
          return HttpServer.sendJSON(res, new ProviderError(ProviderFailure.Unhealthy, error), 500);
        }
      }, logger)
    );
    router.post(
      '/txs/hash',
      providerHandler<
        Parameters<typeof chainHistoryProvider.transactionsByHashes>,
        Awaited<ReturnType<typeof chainHistoryProvider.transactionsByHashes>>
      >(async ([hashes], _, res) => {
        try {
          return HttpServer.sendJSON(res, await chainHistoryProvider.transactionsByHashes(hashes));
        } catch (error) {
          logger.error(error);
          return HttpServer.sendJSON(res, new ProviderError(ProviderFailure.Unhealthy, error), 500);
        }
      }, logger)
    );
    router.post(
      '/txs/address',
      providerHandler<
        Parameters<typeof chainHistoryProvider.transactionsByAddresses>,
        Awaited<ReturnType<typeof chainHistoryProvider.transactionsByAddresses>>
      >(async ([addresses, sinceBlock], _, res) => {
        try {
          return HttpServer.sendJSON(res, await chainHistoryProvider.transactionsByAddresses(addresses, sinceBlock));
        } catch (error) {
          logger.error(error);
          return HttpServer.sendJSON(res, new ProviderError(ProviderFailure.Unhealthy, error), 500);
        }
      }, logger)
    );
    return new ChainHistoryHttpService({ chainHistoryProvider, logger }, router);
  }
}
