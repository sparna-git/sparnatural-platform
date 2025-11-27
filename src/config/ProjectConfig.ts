

export interface AppConfig {
    log?: {
        directory: string;
    }
    projects: Record<string, ProjectConfig>;
}

export interface ProjectConfig {
    sparqlEndpoint: string;
    reconciliation?: (
        { implementation: 'SparqlReconcileService' } & SparqlReconcileServiceConfig
    ) | (
        { implementation: 'DummyReconcileService' } & DummyReconcileServiceConfig
    )
}

export interface SparqlReconcileServiceConfig {
    cacheSize?: number;
    maxResults?: number;
}

export interface DummyReconcileServiceConfig {
    foo?: string;
}