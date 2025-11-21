import { ReconcileServiceIfc } from "../services/ReconcileServiceIfc";

export class Project {
    public projectId: string;
    public sparqlEndpoint: string;
    public reconcileService?: ReconcileServiceIfc;

    constructor(projectId: string, sparqlEndpoint: string) {
        this.projectId = projectId;
        this.sparqlEndpoint = sparqlEndpoint;
    }
}