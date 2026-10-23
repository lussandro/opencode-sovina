export * as TokenUsage from "./token-usage.js"

import { Schema } from "effect"

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  reasoning: Schema.Finite,
  cache: Schema.Struct({
    read: Schema.Finite,
    write: Schema.Finite,
  }),
}).annotate({ identifier: "TokenUsage.Info" })

export function total(tokens: Info) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

/**
 * Estimated input tokens of one request, split by what produced them.
 * Estimates use the same 4 chars/token heuristic as compaction, so they are comparable but not billed amounts.
 */
export interface Breakdown extends Schema.Schema.Type<typeof Breakdown> {}
export const Breakdown = Schema.Struct({
  /** System parts, including instructions, skills, AGENTS.md and mid-session system messages. */
  system: Schema.Finite,
  /** Tool definitions: names, descriptions and input schemas. */
  tools: Schema.Finite,
  user: Schema.Finite,
  assistant: Schema.Finite,
  reasoning: Schema.Finite,
  toolCalls: Schema.Finite,
  toolResults: Schema.Finite,
  media: Schema.Finite,
  /** Compaction checkpoints standing in for older history. */
  summary: Schema.Finite,
}).annotate({ identifier: "TokenUsage.Breakdown" })
