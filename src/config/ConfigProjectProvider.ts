import "reflect-metadata";
import {container, DependencyContainer} from "tsyringe";
import { Project } from "./Project";
import { ReconcileServiceIfc } from "../services/ReconcileServiceIfc";
import { ProjectConfig, SparqlReconcileServiceConfig } from "./ProjectConfig";
import { SparqlReconcileService } from "../services/SparqlReconcileService";
import { ConfigProvider } from "./ConfigProvider";


const DEFAULT_RECONCILIATION_CONFIG: SparqlReconcileServiceConfig = {
    cacheSize: SparqlReconcileService.DEFAULT_CACHE_SIZE,
    maxResults: SparqlReconcileService.DEFAULT_MAX_RESULTS
};

export class ConfigProjectProvider {

    private config: any;
    private cache: Record<string, Project> = {};

    public constructor() {
        this.config = ConfigProvider.getInstance().getConfig();
    }

    listProjects(): string[] {
        return Object.keys(this.config.projects);
    }

    hasProject(projectKey: string): boolean {
        return this.config.projects.hasOwnProperty(projectKey);
    }

    getProject(projectKey: string): Project {        

        if(this.cache[projectKey]) {
            return this.cache[projectKey];
        } else {
            if(!this.hasProject(projectKey)) {
                throw new Error(`Unknown project: ${projectKey}`);
            }

            let p:Project = new Project(
                projectKey,
                this.config.projects[projectKey].sparqlEndpoint
            );

            let projectContainer = this.buildProjectContainer(projectKey);

            // always resolve the token "reconciliation" to get the proper implementation
            p.reconcileService = projectContainer.resolve<ReconcileServiceIfc>("reconciliation");

            this.cache[projectKey] = p;

            console.dir(p);
            return p;
        }

    }

    buildProjectContainer(projectKey: string): DependencyContainer {
        let projectContainer = container.createChildContainer();
    
        let projectConfig = this.config.projects[projectKey];
        // 1. register the project ID
        projectContainer.register<string>("project.id", {useValue: projectKey});
        // 2. register the complete project config
        projectContainer.register<ProjectConfig>("project.config", {useValue: projectConfig});
        projectContainer.register<string>("project.sparqlEndpoint", {useValue: projectConfig.sparqlEndpoint});
        // 3. register the token "reconciliation" to be the name of the implementation in the config, or the default implementation
        projectContainer.register("reconciliation", { useToken: projectConfig.reconciliation?.implementation ?? "default:reconciliation"  });
        // 4. register the reconciliation config to whatever is in the reconciliation section, or the default values
        projectContainer.register("reconciliation.config", { useValue: projectConfig.reconciliation ?? DEFAULT_RECONCILIATION_CONFIG  });

        return projectContainer;
    }

}