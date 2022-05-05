export type ModuleState = null | 'initializing' | 'initialized';
export type Awaited<T> = T extends PromiseLike<infer U> ? U : T;
