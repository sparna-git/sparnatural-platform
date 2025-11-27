import { inject, injectable } from "tsyringe";
import { NoOpQuery2TextService, Query2TextServiceIfc } from "../services/interfaces/Query2TextServiceIfc";
import { NoOpText2QueryService, Text2QueryServiceIfc } from "../services/interfaces/Text2QueryServiceIfc";
import { NoOpReconcileService, ReconcileServiceIfc } from "../services/ReconcileServiceIfc";

@injectable({token: "Project"})
export class Project {
    public projectId: string;
    public sparqlEndpoint: string;
    public reconcileService: ReconcileServiceIfc;
    public text2queryService: Text2QueryServiceIfc;
    public query2textService: Query2TextServiceIfc;

    constructor(
        @inject("project.id") projectId: string,
        @inject("project.sparqlEndpoint") sparqlEndpoint: string,
        @inject("reconciliation") reconcileService?: ReconcileServiceIfc,
        @inject("text2query") text2queryService?: Text2QueryServiceIfc,
        @inject("query2text") query2textService?: Query2TextServiceIfc
    ) {
        if(!reconcileService) {
            console.warn(`No reconciliation service was passed in constructor or ${projectId}`);
        }
        this.projectId = projectId;
        this.sparqlEndpoint = sparqlEndpoint;
        this.reconcileService = reconcileService || new NoOpReconcileService();
        this.text2queryService = text2queryService || new NoOpText2QueryService();
        this.query2textService = query2textService || new NoOpQuery2TextService();
    }
}