import { z } from "zod";
import { SparnaturalQuery } from "../../zod/query";

export interface Text2QueryServiceIfc {
  generateJson(
    naturalLanguageQuery: string,
    projectKey: string
  ): Promise<z.infer<typeof SparnaturalQuery>>;
}
