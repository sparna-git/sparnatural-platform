import { z } from "zod";

export const AggregateFunction = z.enum([
  "count",
  "max",
  "min",
  "sum",
  "group_concat",
  "sample",
  "avg",
]);

export const Order = z.enum(["asc", "desc", "noord"]).nullable().optional();

export const RdfTerm = z.object({
  type: z.string(),
  value: z.string(),
});

export const ValueItem = z.object({
  label: z.string(),
  rdfTerm: RdfTerm.optional(),
});

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

export const CriteriaLine = z.object({
  s: z.string(),
  p: z.string(),
  o: z.string(),
  sType: z.string(),
  oType: z.string(),
  values: z.array(ValueItem),
});

export const Branch: z.ZodType<any> = z.lazy(() =>
  z.object({
    line: CriteriaLine,
    children: z.array(Branch),
    optional: z.boolean().optional(),
    notExists: z.boolean().optional(),
  })
);

export const SparnaturalQuery = z.object({
  distinct: z.boolean().optional(),
  variables: z.array(z.union([VariableTerm, VariableExpression])),
  order: Order.optional(),
  branches: z.array(Branch),
  limit: z.number().optional(),
});
