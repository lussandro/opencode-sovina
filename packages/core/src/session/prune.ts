export * as SessionPrune from "./prune.js"

import { Clock, Context, DateTime, Duration, Effect, Layer } from "effect"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import type { ConfigPrune } from "@opencode/schema/config/prune"
import type { SessionMessage } from "./message.js"
import { Config } from "../config.js"
import { Token } from "../util/token.js"

/**
 * Trims what the model re-reads from history, in two ways that both leave the stored transcript untouched.
 *
 * 1. Repeated output: a tool call whose input and output are identical to an earlier one still in view becomes a
 *    pointer to it. The copy is a stub from the first request it appears in, so the prefix never changes afterwards.
 * 2. Old output: dropped only at moments when the provider's prompt cache is already cold.
 *
 * Pruning mid-conversation edits the middle of the prefix, so the provider re-reads everything after it at the
 * cache-write price. Once the conversation has sat idle past the cache lifetime that rewrite is owed anyway, so
 * shrinking the prefix then costs nothing and every later request carries less. The cut points are derived from the
 * recorded message times, so replaying the same history always yields the same result and the prefix stays stable
 * between cuts.
 */
export interface Settings {
  readonly idleMillis: number
  readonly keep: number
  readonly minTokens: number
}

const DEFAULTS = { idle: Duration.minutes(5), keep: 6, min: 10_000 }

/** Output that calling the same tool with the same input produces again, so dropping it loses nothing for good. */
const REFETCHABLE = new Set(["read", "grep", "glob", "shell", "webfetch"])
/** Below this the stub is no smaller than the output. */
const MIN_RESULT_TOKENS = 200

export const settings = (value: boolean | ConfigPrune.Info | undefined): Settings | undefined => {
  if (value === false) return undefined
  const info = typeof value === "object" ? value : undefined
  return {
    idleMillis: Duration.toMillis(info?.idle ?? DEFAULTS.idle),
    keep: info?.keep ?? DEFAULTS.keep,
    minTokens: info?.min ?? DEFAULTS.min,
  }
}

export const stub = (name: string, tokens: number) =>
  `[Output removed to save context (~${tokens} tokens). Call ${name} again if you still need it.]`

export const repeated = (name: string, tokens: number) =>
  `[Identical to the earlier ${name} call above with the same input (~${tokens} tokens); the output is unchanged, see it there.]`

const millis = (time: DateTime.DateTime) => DateTime.toEpochMillis(time)

/** The moment the provider last refreshed its cache for this session: the end of the response body. */
const refreshed = (message: SessionMessage.Assistant) =>
  millis(message.time.streamed ?? message.time.completed ?? message.time.created)

const textOf = (part: SessionMessage.AssistantTool) =>
  part.state.status === "completed" ? part.state.content.map((item) => (item.type === "text" ? item.text : "")).join("") : ""

const tokensOf = (part: SessionMessage.AssistantContent) => {
  if (part.type !== "tool" || part.executed || !REFETCHABLE.has(part.name)) return
  if (part.state.status !== "completed") return
  if (!part.state.content.every((item) => item.type === "text")) return
  const tokens = Token.estimate(textOf(part))
  return tokens >= MIN_RESULT_TOKENS ? tokens : undefined
}

/** Same tool, same input, same output: the model has already been told this. */
const sameCall = (part: SessionMessage.AssistantTool) => JSON.stringify([part.name, part.state.input, textOf(part)])

/**
 * `now` stands for the request about to be sent, which has no message yet. Pass it only for the request that decides
 * a new cut; once that request is recorded its own message carries the same boundary, so later requests agree.
 */
export function apply(messages: ReadonlyArray<SessionMessage.Info>, config: Settings, now?: number) {
  const pruned = new Map<string, number>()
  let pending: Array<{ readonly key: string; readonly tokens: number }> = []
  let last: number | undefined

  const prune = () => {
    const eligible = pending.slice(0, Math.max(0, pending.length - config.keep))
    if (eligible.reduce((sum, item) => sum + item.tokens, 0) < config.minTokens) return
    eligible.forEach((item) => pruned.set(item.key, item.tokens))
    pending = pending.slice(eligible.length)
  }

  messages.forEach((message, index) => {
    // A compaction ends what earlier requests carried, so older results no longer count as recent.
    if (message.type === "compaction") pending = []
    if (message.type !== "assistant") return
    if (last !== undefined && millis(message.time.created) - last >= config.idleMillis) prune()
    last = refreshed(message)
    message.content.forEach((part, partIndex) => {
      const tokens = tokensOf(part)
      if (tokens !== undefined) pending.push({ key: `${index}:${partIndex}`, tokens })
    })
  })
  if (now !== undefined && last !== undefined && now - last >= config.idleMillis) prune()

  // Only output that survives pruning can be pointed to. When the original was pruned, its copy is the one the model
  // sees in full, and that change lands on the same cold-cache request that did the pruning.
  const repeats = new Map<string, number>()
  const seen = new Set<string>()
  messages.forEach((message, index) => {
    if (message.type === "compaction") seen.clear()
    if (message.type !== "assistant") return
    message.content.forEach((part, partIndex) => {
      const key = `${index}:${partIndex}`
      const tokens = tokensOf(part)
      if (tokens === undefined || part.type !== "tool" || pruned.has(key)) return
      const call = sameCall(part)
      if (seen.has(call)) repeats.set(key, tokens)
      else seen.add(call)
    })
  })
  if (pruned.size === 0 && repeats.size === 0) return messages

  const replace = (part: SessionMessage.AssistantTool, text: string): SessionMessage.AssistantTool =>
    part.state.status !== "completed"
      ? part
      : { ...part, state: { ...part.state, content: [{ type: "text", text }] } }

  return messages.map((message, index): SessionMessage.Info => {
    if (message.type !== "assistant") return message
    return {
      ...message,
      content: message.content.map((part, partIndex) => {
        if (part.type !== "tool") return part
        const key = `${index}:${partIndex}`
        const removed = pruned.get(key)
        if (removed !== undefined) return replace(part, stub(part.name, removed))
        const copy = repeats.get(key)
        return copy === undefined ? part : replace(part, repeated(part.name, copy))
      }),
    }
  })
}

export interface Interface {
  /** Applies the configured pruning to a session's history, deciding a new cut if the cache is cold right now. */
  readonly apply: (
    messages: ReadonlyArray<SessionMessage.Info>,
  ) => Effect.Effect<ReadonlyArray<SessionMessage.Info>>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionPrune") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    return Service.of({
      apply: Effect.fn("SessionPrune.apply")(function* (messages) {
        const resolved = settings(Config.latest(yield* config.entries(), "prune"))
        if (!resolved) return messages
        return apply(messages, resolved, yield* Clock.currentTimeMillis)
      }),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Config.node] })
