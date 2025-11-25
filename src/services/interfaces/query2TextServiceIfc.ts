export interface Query2TextServiceIfc {
  generateSummary(
    jsonQuery: object,
    lang: string,
    projectKey: string
  ): Promise<string>;
}
