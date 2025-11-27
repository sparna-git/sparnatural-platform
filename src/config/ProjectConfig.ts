

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
        { implementation: 'DummyReconcileService' }
    ),
    text2query?: (
        { implementation: 'MistralText2QueryService' } & MistralText2QueryServiceConfig
    ) | (
        { implementation: 'RestText2QueryService' } & RestQuery2TextServiceConfig
    ),
    query2text?: (
        { implementation: 'MistralQuery2TextService' } & MistralQuery2TextServiceConfig
    ) | (
        { implementation: 'RestQuery2TextService' } & RestQuery2TextServiceConfig
    )
}

export interface SparqlReconcileServiceConfig {
    cacheSize?: number;
    maxResults?: number;
}

export interface MistralText2QueryServiceConfig {
    agentId: string
}

export interface RestText2QueryServiceConfig {
    agentId: string
}

export interface MistralQuery2TextServiceConfig {
    agentId: string
}

export interface RestQuery2TextServiceConfig {
    agentId: string
}