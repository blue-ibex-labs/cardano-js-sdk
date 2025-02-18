// only tested in ../e2e tests
/* eslint-disable no-use-before-define */
import { BehaviorSubject, Observable, Subject, debounceTime, filter, first, map, takeWhile, tap } from 'rxjs';
import { Messenger, MessengerDependencies, MessengerPort, PortMessage, ReconnectConfig } from './types';
import { deriveChannelName } from './util';
import { util } from '@cardano-sdk/core';

export interface NonBackgroundMessengerOptions {
  baseChannel: string;
  reconnectConfig?: ReconnectConfig;
}

/**
 * Creates and maintains a long-running connection to background process.
 * Attempts to reconnect the port on disconnects.
 */
export const createNonBackgroundMessenger = (
  {
    baseChannel: channel,
    reconnectConfig: { initialDelay, maxDelay } = { initialDelay: 10, maxDelay: 1000 }
  }: NonBackgroundMessengerOptions,
  { logger, runtime }: MessengerDependencies
): Messenger => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reconnectTimeout: any;
  let delay = initialDelay;
  let isDestroyed = false;
  const port$ = new BehaviorSubject<MessengerPort | null | 'destroyed'>(null);
  const message$ = new Subject<PortMessage>();
  const connect = () => {
    if (typeof port$.value === 'string' || port$.value) return;
    // assuming this doesn't throw
    const port = runtime.connect({ name: channel });
    port$.next(port);
    port.onDisconnect.addListener(onDisconnect);
    // TODO: reset 'delay' if onDisconnect not called somewhat immediatelly?
    port.onMessage.addListener(onMessage);
  };
  const reconnect = () => {
    clearTimeout(reconnectTimeout);
    delay = Math.min(Math.pow(delay, 2), maxDelay);
    reconnectTimeout = setTimeout(connect, delay);
  };
  const onMessage = (data: unknown, port: MessengerPort) => {
    logger.debug(`[NonBackgroundMessenger(${channel})] receive message`, data, port);
    delay = initialDelay;
    message$.next({ data, port });
  };
  const onDisconnect = (port: MessengerPort) => {
    logger.debug(`[NonBackgroundMessenger(${channel})] disconnected`, port);
    port!.onMessage.removeListener(onMessage);
    port!.onDisconnect.removeListener(onDisconnect);
    port$.next(isDestroyed ? 'destroyed' : null);
    if (!isDestroyed) reconnect();
  };
  connect();
  const portReady = () =>
    port$.pipe(
      debounceTime(10), // TODO: how long until onDisconnect() is called when the other end doesn't exist?
      filter(util.isNotNil),
      takeWhile((port): port is MessengerPort => typeof port !== 'string')
    );
  const derivedMessengers = new Set<Messenger>();
  return {
    channel,
    deriveChannel(path) {
      const messenger = createNonBackgroundMessenger(
        {
          baseChannel: deriveChannelName(channel, path),
          reconnectConfig: { initialDelay, maxDelay }
        },
        { logger, runtime }
      );
      derivedMessengers.add(messenger);
      return messenger;
    },
    destroy() {
      isDestroyed = true;
      const port = port$.value;
      if (typeof port !== 'string') {
        port?.disconnect();
      }
      clearTimeout(reconnectTimeout);
      for (const messenger of derivedMessengers.values()) {
        messenger.destroy();
        derivedMessengers.delete(messenger);
      }
      logger.warn(`[NonBackgroundMessenger(${channel})] destroyed`);
    },
    message$,
    /**
     * @throws RxJS EmptyError if client is destroyed
     */
    postMessage(message: unknown): Observable<void> {
      return portReady().pipe(
        first(),
        // TODO: find if this can throw
        tap((port) => port.postMessage(message)),
        map(() => void 0)
      );
    }
  };
};

export type NonBackgroundMessenger = ReturnType<typeof createNonBackgroundMessenger>;
