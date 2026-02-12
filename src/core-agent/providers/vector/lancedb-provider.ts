import { BaseInMemoryVectorProvider } from './base-in-memory-vector-provider';

export class LanceDbProvider extends BaseInMemoryVectorProvider {
  readonly providerKind = 'lancedb';
}
