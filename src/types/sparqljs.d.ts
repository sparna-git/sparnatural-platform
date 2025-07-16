declare module "sparqljs" {
  export class Generator {
    constructor();
    stringify(query: any): string;
  }

  export class Parser {
    constructor();
    parse(query: string): any;
  }
}
