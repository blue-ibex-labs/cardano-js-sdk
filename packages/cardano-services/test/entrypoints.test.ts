/* eslint-disable sonarjs/no-identical-functions */
/* eslint-disable sonarjs/no-duplicate-string */
import { ChildProcess, fork } from 'child_process';
import { Connection, ConnectionConfig, createConnectionObject } from '@cardano-ogmios/client';
import { ServiceNames } from '../src';
import { createHealthyMockOgmiosServer, createUnhealthyMockOgmiosServer, ogmiosServerReady, serverReady } from './util';
import { getRandomPort } from 'get-port-please';
import { listenPromise, serverClosePromise } from '../src/util';
import got from 'got';
import http from 'http';
import path from 'path';

const exePath = (name: 'cli' | 'run') => path.join(__dirname, '..', 'dist', `${name}.js`);

const assertServiceHealthy = async (apiUrl: string, serviceName: ServiceNames) => {
  await serverReady(apiUrl);
  const headers = { 'Content-Type': 'application/json' };
  const res = await got.post(`${apiUrl}/${serviceName}/health`, { headers });
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body)).toEqual({ ok: true });
};

describe('entrypoints', () => {
  let apiPort: number;
  let apiUrl: string;
  let proc: ChildProcess;

  beforeEach(async () => {
    apiPort = await getRandomPort();
    apiUrl = `http://localhost:${apiPort}`;
  });
  afterEach(() => {
    if (proc !== undefined) proc.kill();
  });

  it('CLI version', (done) => {
    proc = fork(exePath('cli'), ['--version'], {
      stdio: 'pipe'
    });
    proc.stdout!.on('data', (data) => {
      expect(data.toString()).toBeDefined();
    });
    proc.stdout?.on('end', () => {
      done();
    });
  });

  describe('start-server', () => {
    let dbConnectionString: string;
    let ogmiosServer: http.Server;
    let ogmiosPort: ConnectionConfig['port'];
    let ogmiosConnection: Connection;

    beforeAll(async () => {
      dbConnectionString = 'postgresql://dbuser:secretpassword@database.server.com:3211/mydb';
      ogmiosPort = await getRandomPort();
      ogmiosConnection = createConnectionObject({ port: ogmiosPort });
    });

    describe('with healthy internal providers', () => {
      describe('valid configuration', () => {
        beforeEach(async () => {
          ogmiosServer = createHealthyMockOgmiosServer();
          await listenPromise(ogmiosServer, { port: ogmiosConnection.port });
          await ogmiosServerReady(ogmiosConnection);
        });

        afterEach(async () => {
          await serverClosePromise(ogmiosServer);
        });

        it('cli:start-server exposes a HTTP server at the configured URL', async () => {
          proc = fork(exePath('cli'), [
            'start-server',
            '--api-url',
            apiUrl,
            '--db-connection-string',
            dbConnectionString,
            '--logger-min-severity',
            'error',
            '--ogmios-url',
            ogmiosConnection.address.webSocket,
            ServiceNames.StakePoolSearch,
            ServiceNames.TxSubmit
          ]);
          await assertServiceHealthy(apiUrl, ServiceNames.StakePoolSearch);
          await assertServiceHealthy(apiUrl, ServiceNames.TxSubmit);
        });

        it('run', async () => {
          proc = fork(exePath('run'), {
            env: {
              API_URL: apiUrl,
              DB_CONNECTION_STRING: dbConnectionString,
              LOGGER_MIN_SEVERITY: 'error',
              OGMIOS_URL: ogmiosConnection.address.webSocket,
              SERVICE_NAMES: `${ServiceNames.StakePoolSearch},${ServiceNames.TxSubmit}`
            }
          });
          await assertServiceHealthy(apiUrl, ServiceNames.StakePoolSearch);
          await assertServiceHealthy(apiUrl, ServiceNames.TxSubmit);
        });
      });

      describe('specifying a PostgreSQL-dependent service without providing the connection string', () => {
        let spy: jest.Mock;
        beforeEach(async () => {
          spy = jest.fn();
        });

        it('cli:start-server exits with code 0', (done) => {
          proc = fork(
            exePath('cli'),
            ['start-server', '--api-url', apiUrl, '--logger-min-severity', 'error', ServiceNames.StakePoolSearch],
            {
              stdio: 'pipe'
            }
          );
          proc.stderr!.on('data', spy);
          proc.on('exit', (code) => {
            expect(code).toBe(0);
            expect(spy).toHaveBeenCalled();
            done();
          });
        });

        it('run exits with code 0', (done) => {
          proc = fork(exePath('run'), {
            env: {
              API_URL: apiUrl,
              LOGGER_MIN_SEVERITY: 'error',
              SERVICE_NAMES: ServiceNames.StakePoolSearch
            },
            stdio: 'pipe'
          });
          proc.stderr!.on('data', spy);
          proc.on('exit', (code) => {
            expect(code).toBe(0);
            expect(spy).toHaveBeenCalled();
            done();
          });
        });
      });
      describe('specifying an Ogmios-dependent service without providing the Ogmios URL', () => {
        beforeEach(async () => {
          ogmiosServer = createHealthyMockOgmiosServer();
          // ws://localhost:1337
          ogmiosConnection = createConnectionObject();
          await listenPromise(ogmiosServer, { port: ogmiosConnection.port });
          await ogmiosServerReady(ogmiosConnection);
        });

        afterEach(async () => {
          await serverClosePromise(ogmiosServer);
        });

        it('cli:start-server uses the default Ogmios configuration if not specified', async () => {
          proc = fork(
            exePath('cli'),
            ['start-server', '--api-url', apiUrl, '--logger-min-severity', 'error', ServiceNames.TxSubmit],
            {
              stdio: 'pipe'
            }
          );
          await assertServiceHealthy(apiUrl, ServiceNames.TxSubmit);
        });

        it('run uses the default Ogmios configuration if not specified', async () => {
          proc = fork(exePath('run'), {
            env: {
              API_URL: apiUrl,
              LOGGER_MIN_SEVERITY: 'error',
              SERVICE_NAMES: ServiceNames.TxSubmit
            },
            stdio: 'pipe'
          });
          await assertServiceHealthy(apiUrl, ServiceNames.TxSubmit);
        });
      });
    });
    describe('with unhealthy internal providers', () => {
      let spy: jest.Mock;
      beforeEach(async () => {
        ogmiosServer = createUnhealthyMockOgmiosServer();
        spy = jest.fn();
      });

      afterEach(async () => {
        await serverClosePromise(ogmiosServer);
      });

      it('cli:start-server exits with code 0', (done) => {
        ogmiosServer.listen(ogmiosConnection.port, () => {
          proc = fork(
            exePath('cli'),
            [
              'start-server',
              '--api-url',
              apiUrl,
              '--db-connection-string',
              dbConnectionString,
              '--logger-min-severity',
              'error',
              '--ogmios-url',
              ogmiosConnection.address.webSocket,
              ServiceNames.StakePoolSearch,
              ServiceNames.TxSubmit
            ],
            {
              stdio: 'pipe'
            }
          );
          proc.stderr!.on('data', spy);
          proc.on('exit', (code) => {
            expect(code).toBe(0);
            expect(spy).toHaveBeenCalled();
            done();
          });
        });
      });

      it('run exits with code 0', (done) => {
        ogmiosServer.listen(ogmiosConnection.port, () => {
          proc = fork(exePath('run'), {
            env: {
              API_URL: apiUrl,
              DB_CONNECTION_STRING: dbConnectionString,
              LOGGER_MIN_SEVERITY: 'error',
              OGMIOS_URL: ogmiosConnection.address.webSocket,
              SERVICE_NAMES: `${ServiceNames.StakePoolSearch},${ServiceNames.TxSubmit}`
            },
            stdio: 'pipe'
          });
          proc.stderr!.on('data', spy);
          proc.on('exit', (code) => {
            expect(code).toBe(0);
            expect(spy).toHaveBeenCalled();
            done();
          });
        });
      });
    });

    describe('specifying an unknown service', () => {
      let spy: jest.Mock;
      beforeEach(async () => {
        ogmiosServer = createHealthyMockOgmiosServer();
        spy = jest.fn();
      });

      afterEach(async () => {
        await serverClosePromise(ogmiosServer);
      });

      it('cli:start-server exits with code 0', (done) => {
        ogmiosServer.listen(ogmiosConnection.port, () => {
          proc = fork(
            exePath('cli'),
            [
              'start-server',
              '--api-url',
              apiUrl,
              '--ogmios-url',
              ogmiosConnection.address.webSocket,
              '--logger-min-severity',
              'error',
              'some-unknown-service',
              ServiceNames.TxSubmit
            ],
            {
              stdio: 'pipe'
            }
          );
          proc.stderr!.on('data', spy);
          proc.on('exit', (code) => {
            expect(code).toBe(0);
            expect(spy).toHaveBeenCalled();
            done();
          });
        });
      });

      it('run exits with code 0', (done) => {
        ogmiosServer.listen(ogmiosConnection.port, () => {
          proc = fork(exePath('run'), {
            env: {
              API_URL: apiUrl,
              LOGGER_MIN_SEVERITY: 'error',
              OGMIOS_URL: ogmiosConnection.address.webSocket,
              SERVICE_NAMES: `some-unknown-service,${ServiceNames.TxSubmit}`
            },
            stdio: 'pipe'
          });
          proc.stderr!.on('data', spy);
          proc.on('exit', (code) => {
            expect(code).toBe(0);
            expect(spy).toHaveBeenCalled();
            done();
          });
        });
      });
    });
  });
});
