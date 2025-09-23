import { z } from "zod";

// ---------------- ENUMS ----------------

export const Order = z.enum(["asc", "desc", "noord"]);
export type Order = z.infer<typeof Order>;

export const AggregateFunction = z.enum([
  "count",
  "max",
  "min",
  "sum",
  "group_concat",
  "sample",
  "avg",
]);
export type AggregateFunction = z.infer<typeof AggregateFunction>;

// ---------------- CORE TYPES ----------------

export const RDFTerm = z.object({
  type: z.enum(["literal", "uri", "bnode"]),
  value: z.string(),
  "xml:lang": z.string().optional(),
  datatype: z.string().optional(),
});
export type RDFTerm = z.infer<typeof RDFTerm>;

export const LatLng = z.object({
  lat: z.number(),
  lng: z.number(),
  alt: z.number().optional(),
});
export type LatLng = z.infer<typeof LatLng>;

// ---------------- CRITERIA ----------------

export const RdfTermCriteria = z.object({
  rdfTerm: RDFTerm,
});

export const DateCriteria = z.object({
  start: z.string().optional(),
  stop: z.string().optional(),
});

export const BooleanCriteria = z.object({
  boolean: z.boolean(),
});

export const MapCriteria = z.object({
  coordType: z.enum(["Polygon", "Rectangle"]),
  coordinates: z.array(z.array(LatLng)),
});

export const NumberCriteria = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});

export const SearchCriteria = z.object({
  search: z.string(),
});

export const Criteria = z.union([
  RdfTermCriteria,
  DateCriteria,
  BooleanCriteria,
  MapCriteria,
  NumberCriteria,
  SearchCriteria,
]);

export const LabelledCriteria = z.object({
  label: z.string(),
  criteria: Criteria,
});

// ---------------- VARIABLES ----------------

export const VariableTerm = z.object({
  termType: z.literal("Variable"),
  value: z.string(),
});

export const VariableExpression = z.object({
  expression: z.object({
    type: z.literal("aggregate"),
    aggregation: z.string(),
    distinct: z.boolean(),
    expression: VariableTerm,
  }),
  variable: VariableTerm,
});

// ---------------- BRANCHES ----------------

export const CriteriaLine = z.object({
  s: z.string(),
  p: z.string(),
  o: z.string(),
  sType: z.string(),
  oType: z.string(),
  criterias: z.array(LabelledCriteria).optional(),
});

export const Branch: z.ZodType<any> = z.lazy(() =>
  z.object({
    line: CriteriaLine,
    children: z.array(Branch).optional(),
    optional: z.boolean().optional(),
    notExists: z.boolean().optional(),
  })
);

// ---------------- METADATA ----------------

export const Metadata = z
  .object({
    id: z.string().optional(),
    lang: z.string().optional(),
    label: z.record(z.string()).optional(),
    description: z.record(z.string()).optional(),
  })
  .catchall(z.any());

// ---------------- ROOT ----------------

export const SparnaturalQuery = z.object({
  distinct: z.boolean().optional(),
  variables: z.array(z.union([VariableTerm, VariableExpression])),
  order: Order.optional(),
  branches: z.array(Branch),
  limit: z.number().optional(),
  metadata: Metadata.optional(),
});

export type SparnaturalQuery = z.infer<typeof SparnaturalQuery>;
