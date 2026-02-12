import type { IVectorStore } from '../../contracts';

export type VectorProviderKind = 'sqlite_vec' | 'lancedb';

export interface VectorProviderOptions {
  kind: VectorProviderKind;
  path: string;
  namespace?: string;
}

export class VectorProviderFactory {
  static create(store: IVectorStore, options: VectorProviderOptions): IVectorStore {
    if (options.kind === 'sqlite_vec' || options.kind === 'lancedb') {
      return store;
    }

    throw new Error(`Unsupported vector provider: ${String(options.kind)}`);
  }
}
