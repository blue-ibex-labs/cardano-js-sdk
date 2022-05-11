import * as OpenApiValidator from 'express-openapi-validator';
import { ChainHistoryProvider, ProviderError, ProviderFailure } from '@cardano-sdk/core';
import { DbSyncChainHistoryProvider } from './DbSyncChainHistoryProvider/DbSyncChainHistory';
import { HttpServer, HttpService } from '../Http';
import { Logger, dummyLogger } from 'ts-log';
import { ProviderHandler, providerHandler } from '../util';
import { ServiceNames } from '../Program';
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

    const routeHandler: ProviderHandler = async (args, _r, res, _n, handler) => {
      try {
        return HttpServer.sendJSON(res, await handler(...args));
      } catch (error) {
        logger.error(error);
        return HttpServer.sendJSON(res, new ProviderError(ProviderFailure.Unhealthy, error), 500);
      }
    };

    router.post(
      '/blocks/hash',
      providerHandler(chainHistoryProvider.blocksByHashes.bind(chainHistoryProvider))(routeHandler, logger)
    );
    router.post(
      '/txs/hash',
      providerHandler(chainHistoryProvider.transactionsByHashes.bind(chainHistoryProvider))(routeHandler, logger)
    );
    router.post(
      '/txs/address',
      providerHandler(chainHistoryProvider.transactionsByAddresses.bind(chainHistoryProvider))(routeHandler, logger)
    );
    return new ChainHistoryHttpService({ chainHistoryProvider, logger }, router);
  }
}
