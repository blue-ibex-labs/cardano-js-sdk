/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BindRequestHandlerOptions,
  ConsumeRemoteApiOptions,
  EmitMessage,
  ExposeApiProps,
  Messenger,
  MessengerApiDependencies,
  MethodRequest,
  MethodRequestOptions,
  RemoteApiMethod,
  RemoteApiPropertyType,
  RequestMessage,
  ResponseMessage,
  SubscriptionMessage
} from './types';
import {
  EMPTY,
  Observable,
  filter,
  firstValueFrom,
  isObservable,
  map,
  merge,
  mergeMap,
  take,
  takeUntil,
  tap,
  timeout
} from 'rxjs';
import { NotImplementedError, util } from '@cardano-sdk/core';
import { Shutdown, TrackerSubject } from '@cardano-sdk/wallet';
import { isEmitMessage, isRequestMessage, isResponseMessage, isSubscriptionMessage, newMessageId } from './util';

const SUBSCRIPTION_TIMEOUT = 3000;
const throwIfObservableChannelDoesntExist = ({ postMessage, message$ }: Messenger) => {
  const subscriptionMessageId = newMessageId();
  return merge(
    postMessage({
      messageId: subscriptionMessageId,
      subscribe: true
    } as SubscriptionMessage),
    // timeout if the other end didn't acknowledge the subscription with a ResponseMessage
    message$.pipe(
      map(({ data }) => data),
      filter(isResponseMessage),
      filter(({ messageId }) => messageId === subscriptionMessageId),
      timeout({ first: SUBSCRIPTION_TIMEOUT }),
      take(1)
    )
  ).pipe(mergeMap(() => EMPTY));
};

const consumeMethod =
  (
    {
      propName,
      getErrorPrototype
    }: { propName: string; getErrorPrototype?: util.GetErrorPrototype; options?: MethodRequestOptions },
    { messenger: { message$, postMessage } }: MessengerApiDependencies
  ) =>
  async (...args: unknown[]) => {
    const requestMessage: RequestMessage = {
      messageId: newMessageId(),
      request: {
        args: args.map(util.toSerializableObject),
        method: propName
      }
    };

    const result = await firstValueFrom(
      merge(
        postMessage(requestMessage).pipe(mergeMap(() => EMPTY)),
        message$.pipe(
          map(({ data }) => data),
          filter(isResponseMessage),
          filter(({ messageId }) => messageId === requestMessage.messageId),
          map(({ response }) => util.fromSerializableObject(response, getErrorPrototype))
        )
      )
    );

    if (result instanceof Error) {
      throw result;
    }
    return result;
  };

/**
 * Creates a proxy to a remote api object
 *
 * @throws Observable subscriptions might error with rxjs TimeoutError if the remote observable doesnt exist
 */
export const consumeMessengerRemoteApi = <T extends object>(
  { properties, getErrorPrototype }: ConsumeRemoteApiOptions<T>,
  { logger, messenger }: MessengerApiDependencies
): T & Shutdown =>
  new Proxy<T & Shutdown>(
    {
      shutdown: messenger.destroy
    } as T & Shutdown,
    {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        const propMetadata = properties[prop as keyof T];
        const propName = prop.toString();
        if (typeof propMetadata === 'object') {
          if ('propType' in propMetadata) {
            if (propMetadata.propType === RemoteApiPropertyType.MethodReturningPromise) {
              return consumeMethod(
                { getErrorPrototype, options: propMetadata.requestOptions, propName },
                { logger, messenger }
              );
            }
            throw new NotImplementedError('Only MethodReturningPromise prop type can be specified as object');
          } else {
            return consumeMessengerRemoteApi(
              { getErrorPrototype, properties: propMetadata as any },
              { logger, messenger: messenger.deriveChannel(propName) }
            );
          }
        } else if (propMetadata === RemoteApiPropertyType.MethodReturningPromise) {
          return consumeMethod({ getErrorPrototype, propName }, { logger, messenger });
        } else if (propMetadata === RemoteApiPropertyType.Observable) {
          const observableMessenger = messenger.deriveChannel(propName);
          const messageData$ = observableMessenger.message$.pipe(map(({ data }) => data));
          const unsubscribe$ = messageData$.pipe(
            filter(isSubscriptionMessage),
            filter(({ subscribe }) => !subscribe),
            tap(({ error }) => {
              if (error) throw error;
            })
          );
          return merge(
            throwIfObservableChannelDoesntExist(observableMessenger),
            messageData$.pipe(
              filter(isEmitMessage),
              map(({ emit }) => emit)
            )
          ).pipe(takeUntil(unsubscribe$));
        }
      },
      has(_, p) {
        return p in properties;
      }
    }
  );

export const bindMessengerRequestHandler = <Response>(
  { handler }: BindRequestHandlerOptions<Response>,
  { logger, messenger: { message$ } }: MessengerApiDependencies
) =>
  message$.subscribe(async ({ data, port }) => {
    if (!isRequestMessage(data)) return;
    let response: Response | Error;
    try {
      const request = util.fromSerializableObject<MethodRequest>(data.request);
      response = await handler(request, port.sender);
    } catch (error) {
      logger.debug('[MessengerRequestHandler] Error processing message', data, error);
      response = error instanceof Error ? error : new Error('Unknown error');
    }

    const responseMessage: ResponseMessage = {
      messageId: data.messageId,
      response: util.toSerializableObject(response)
    };

    // TODO: can this throw if port is closed?
    port.postMessage(responseMessage);
  });

export const bindNestedObjChannels = <API extends object>(
  { api, properties }: ExposeApiProps<API>,
  { messenger, logger }: MessengerApiDependencies
) => {
  const subscriptions = Object.keys(api)
    .filter((prop) => typeof (api as any)[prop] === 'object' && !isObservable((api as any)[prop]))
    .map((prop) =>
      // eslint-disable-next-line no-use-before-define
      exposeMessengerApi(
        { api: (api as any)[prop], properties: (properties as any)[prop] },
        { logger, messenger: messenger.deriveChannel(prop) }
      )
    );
  return {
    unsubscribe: () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    }
  };
};

export const bindObservableChannels = <API extends object>(
  { api, properties }: ExposeApiProps<API>,
  { messenger }: MessengerApiDependencies
) => {
  const subscriptions = Object.keys(api)
    .filter(
      (method) =>
        properties[method as keyof API] === RemoteApiPropertyType.Observable && isObservable(api[method as keyof API])
    )
    .map((observableProperty) => {
      const observable$ = new TrackerSubject((api as any)[observableProperty] as Observable<unknown>);
      const observableMessenger = messenger.deriveChannel(observableProperty);
      const ackSubscription = observableMessenger.message$.subscribe(({ data, port }) => {
        if (isSubscriptionMessage(data) && data.subscribe) {
          port.postMessage({ messageId: data.messageId, response: true } as ResponseMessage);
          if (observable$.value !== null) {
            port.postMessage({ emit: observable$.value, messageId: newMessageId() } as EmitMessage);
          }
        }
      });
      const broadcastMessage = (message: Partial<SubscriptionMessage | EmitMessage>) =>
        observableMessenger
          .postMessage({
            messageId: newMessageId(),
            ...message
          })
          .subscribe();
      const observableSubscription = observable$.subscribe({
        complete: () => broadcastMessage({ subscribe: false }),
        error: (error: Error) => broadcastMessage({ error, subscribe: false }),
        next: (emit: unknown) => broadcastMessage({ emit })
      });
      return () => {
        ackSubscription.unsubscribe();
        observableSubscription.unsubscribe();
        observable$.complete();
      };
    });
  return {
    unsubscribe: () => {
      for (const unsubscribe of subscriptions) unsubscribe();
    }
  };
};

const isRemoteApiMethod = (prop: unknown): prop is RemoteApiMethod =>
  typeof prop === 'object' && prop !== null && 'propType' in prop;

/**
 * Bind an API object to handle messages from other parts of the extension.
 * This can only used once per channelName per process.
 *
 * NOTE: All Observables are subscribed when this function is called.
 * Caches and replays (1) last emission upon remote subscription (unless item === null).
 *
 * In addition to errors thrown by the underlying API, methods can throw TypeError
 */
export const exposeMessengerApi = <API extends object>(
  { api, properties }: ExposeApiProps<API>,
  dependencies: MessengerApiDependencies
) => {
  const observableChannelsSubscription = bindObservableChannels({ api, properties }, dependencies);
  const nestedObjChannelsSubscription = bindNestedObjChannels({ api, properties }, dependencies);
  const methodHandlerSubscription = bindMessengerRequestHandler(
    {
      handler: async (originalRequest, sender) => {
        const property = properties[originalRequest.method as keyof API];
        if (
          typeof property === 'undefined' ||
          (property !== RemoteApiPropertyType.MethodReturningPromise &&
            isRemoteApiMethod(property) &&
            property.propType !== RemoteApiPropertyType.MethodReturningPromise)
        ) {
          throw new Error(`Attempted to call a method that was not explicitly exposed: ${originalRequest.method}`);
        }
        const { validate = async () => void 0, transform = (req) => req } = isRemoteApiMethod(property)
          ? property.requestOptions
          : ({} as MethodRequestOptions);
        await validate(originalRequest, sender);
        const { args, method } = transform(originalRequest, sender);
        const apiTarget: unknown = method in api && (api as any)[method];
        if (typeof apiTarget !== 'function') {
          throw new TypeError(`No such API method: ${method}`);
        }
        return apiTarget.apply(api, args);
      }
    },
    dependencies
  );
  return {
    unsubscribe: () => {
      nestedObjChannelsSubscription.unsubscribe();
      observableChannelsSubscription.unsubscribe();
      methodHandlerSubscription.unsubscribe();
    }
  };
};
