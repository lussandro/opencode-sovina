export * as ConfigPrune from "./prune.js"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "../schema.js"

export class Info extends Schema.Class<Info>("Config.Prune")({
  idle: Schema.DurationFromString.pipe(optional).annotate({
    description: 'Idle time after which the provider prompt cache is assumed to have expired (default: "5 minutes")',
  }),
  keep: NonNegativeInt.pipe(optional).annotate({
    description: "Most recent re-fetchable tool results that are never pruned (default: 6)",
  }),
  min: NonNegativeInt.pipe(optional).annotate({
    description: "Minimum estimated tokens a prune must remove to be worth doing (default: 10000)",
  }),
}) {}

export const Prune = Schema.Union([Schema.Boolean, Info])
