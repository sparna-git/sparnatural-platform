import { Query2TextServiceIfc } from "./interfaces/query2TextServiceIfc";
import { Text2QueryServiceIfc } from "./interfaces/text2QueryServiceIfc";

import { OldQuery2TextService } from "./impl/oldQuery2TextService";
import { OldText2QueryService } from "./impl/oldText2QueryService";

import { MistralText2QueryService } from "./impl/mistralText2QueryService";
import { MistralQuery2TextService } from "./impl/mistralQuery2TextService";

// SWITCH GLOBAL ICI
// fabrique de services
const USE_MISTRAL = false;

export function getQuery2TextService(): Query2TextServiceIfc {
  if (USE_MISTRAL) {
    return new MistralQuery2TextService();
  }
  return new OldQuery2TextService();
}

export function getText2QueryService(): Text2QueryServiceIfc {
  if (USE_MISTRAL) {
    return new MistralText2QueryService();
  }
  return new OldText2QueryService();
}
