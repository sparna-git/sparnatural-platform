import { z } from "zod";
import { SparnaturalQuery } from "../../zod/query";
import { injectable } from "tsyringe";

export interface Text2QueryServiceIfc {
  generateJson(
    naturalLanguageQuery: string,
    projectKey: string
  ): Promise<z.infer<typeof SparnaturalQuery>>;
}

@injectable({token: "NoOpText2QueryService"})
export class NoOpText2QueryService implements Text2QueryServiceIfc{

  generateJson(naturalLanguageQuery: string, projectKey: string): Promise<z.infer<typeof SparnaturalQuery>> {
    throw new Error("Method not implemented.");
  }

}
