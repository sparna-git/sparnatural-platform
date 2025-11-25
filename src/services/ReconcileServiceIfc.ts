export type SingleReconcileQuery = { query: string; type?: string };
export type ReconcileInput = Record<string, SingleReconcileQuery>;
export type ReconcileResultBase = {
  id: string;
  name: string;
  type?: string[];
  score: number;
  match: boolean;
};

export type ReconcileResultWithTypes = ReconcileResultBase & {
  type: Array<{ id: string; name: string }>;
};

export type ReconcileResult = ReconcileResultBase | ReconcileResultWithTypes;

export type ReconcileOutput = Record<string, { result: ReconcileResult[] }>;

/**
 * A service for reconciling named entities labels and returnning proposals for corresponding IRIs.
 */
export type ManifestType = {
  versions: string[];
  name: string;
  identifierSpace: string;
  schemaSpace: string;
  view: { url: string };
  defaultTypes: any[];
  types: any[];
  features: {
    "property-search": boolean;
    "type-search": boolean;
    preview: boolean;
    suggest: boolean;
  };
};

/**
 * A service for reconciling named entities labels and returnning proposals for corresponding IRIs.
 */
export interface ReconcileServiceIfc {
  reconcileQueries(
    queries: ReconcileInput,
    includeTypes: boolean
  ): Promise<ReconcileOutput>;

  buildManifest(): Promise<ManifestType>;
}
