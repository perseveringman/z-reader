import type { IVectorStore } from '../../contracts';
import { LanceDbProvider } from './lancedb-provider';
import { SqliteVecProvider } from './sqlite-vec-provider';

export type VectorProviderKind = 'sqlite_vec' | 'lancedb';

export interface VectorProviderOptions {
  kind: VectorProviderKind;
  path: string;
  namespace?: string;
}

export class VectorProviderFactory {
  static create(options: VectorProviderOptions): IVectorStore;
  static create(store: IVectorStore, options: VectorProviderOptions): IVectorStore;
  static create(
    storeOrOptions: IVectorStore | VectorProviderOptions,
    maybeOptions?: VectorProviderOptions,
  ): IVectorStore {
    if (maybeOptions) {
      return storeOrOptions as IVectorStore;
    }

    const options = storeOrOptions as VectorProviderOptions;

    if (options.kind === 'sqlite_vec') {
      return new SqliteVecProvider(options.path, options.namespace);
    }

    if (options.kind === 'lancedb') {
      return new LanceDbProvider(options.path, options.namespace);
    }

    throw new Error(`Unsupported vector provider: ${String(options.kind)}`);
  }
}
