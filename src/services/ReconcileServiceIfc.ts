
export type SingleReconcileQuery = { query: string; type?: string };
export type ReconcileInput = Record<string, SingleReconcileQuery>;
export type ReconcileOutput = Record<string, { result: any[] }>;

/**
 * A service for reconciling named entities labels and returnning proposals for corresponding IRIs.
 */
export interface ReconcileServiceIfc {
    

    reconcileQueries(
      queries: ReconcileInput,
      includeTypes: boolean
    ):any;

    buildManifest():any;

}