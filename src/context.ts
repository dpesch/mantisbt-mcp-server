import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  apiKey?: string;
  baseUrl?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
