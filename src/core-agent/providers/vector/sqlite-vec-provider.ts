import { BaseInMemoryVectorProvider } from './base-in-memory-vector-provider';

export class SqliteVecProvider extends BaseInMemoryVectorProvider {
  readonly providerKind = 'sqlite_vec';
}
