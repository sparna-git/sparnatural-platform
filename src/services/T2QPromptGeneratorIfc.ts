import { injectable } from "tsyringe";

export interface T2QPromptGeneratorIfc {
  generatePromptT2Q(projectKey: string): Promise<string>;
}

@injectable({ token: "NoOpT2QPromptGenerator" })
export class NoOpT2QPromptGenerator implements T2QPromptGeneratorIfc {
  generatePromptT2Q(projectKey: string): Promise<string> {
    throw new Error("Method not implemented.");
  }
}
