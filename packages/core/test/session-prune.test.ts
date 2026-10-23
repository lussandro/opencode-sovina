import { describe, expect, test } from "bun:test"
import { Duration } from "effect"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { SessionMessage } from "@opencode/schema/session-message"
import { SessionPrune } from "@opencode/core/session/prune"
import { DateTime } from "effect"

const MIN = 60_000
const config: SessionPrune.Settings = { idleMillis: 5 * MIN, keep: 2, minTokens: 1_000 }

let counter = 0
// Each call gets its own output and input, so only the tests that mean to repeat a call ever see a repeat.
const result = (name: string, chars: number, options: { executed?: boolean; status?: "completed" | "error" } = {}) => {
  const unique = counter++
  return SessionMessage.AssistantTool.make({
    type: "tool",
    id: `call_${unique}`,
    name,
    executed: options.executed,
    state:
      options.status === "error"
        ? SessionMessage.ToolStateError.make({
            status: "error",
            input: { call: unique },
            error: { type: "tool", message: "failed" },
            content: [{ type: "text", text: "x".repeat(chars) }],
          })
        : SessionMessage.ToolStateCompleted.make({
            status: "completed",
            input: { path: "a.ts", call: unique },
            content: [{ type: "text", text: `${unique}:`.padEnd(chars, "x") }],
          }),
    time: { created: DateTime.makeUnsafe(0) },
  })
}

const step = (at: number, ...content: SessionMessage.AssistantContent[]) =>
  SessionMessage.Assistant.make({
    id: SessionMessage.ID.make(`msg_prune_${counter++}`),
    type: "assistant",
    agent: Agent.ID.make("build"),
    model: { id: Model.ID.make("sonnet"), providerID: Provider.ID.make("anthropic") },
    content,
    time: { created: DateTime.makeUnsafe(at), completed: DateTime.makeUnsafe(at + 2_000) },
  })

/** One tool result of about 1000 tokens. */
const big = (name = "read") => result(name, 4_000)

const outputs = (messages: ReadonlyArray<SessionMessage.Info>) =>
  messages.flatMap((message) =>
    message.type === "assistant"
      ? message.content.flatMap((part) =>
          part.type === "tool" && part.state.status === "completed"
            ? [part.state.content.map((item) => (item.type === "text" ? item.text : "")).join("")]
            : [],
        )
      : [],
  )
const removed = (text: string) => text.startsWith("[Output removed")

describe("SessionPrune.apply", () => {
  test("leaves everything alone while the cache is warm", () => {
    const history = [step(0, big()), step(1 * MIN, big()), step(2 * MIN, big()), step(3 * MIN, big())]
    expect(SessionPrune.apply(history, config, 4 * MIN)).toBe(history)
  })

  test("prunes old results after an idle gap, keeping the most recent ones", () => {
    const history = [step(0, big()), step(MIN, big()), step(2 * MIN, big()), step(3 * MIN, big())]
    // The user comes back 10 minutes later: the cache is cold at the next request.
    const pruned = SessionPrune.apply(history, config, 13 * MIN)
    expect(outputs(pruned).map(removed)).toEqual([true, true, false, false])
    expect(outputs(pruned)[0]).toContain("Call read again")
  })

  test("a gap recorded in history cuts the same way as the pending request would", () => {
    const history = [step(0, big()), step(MIN, big()), step(2 * MIN, big()), step(3 * MIN, big())]
    const decided = SessionPrune.apply(history, config, 13 * MIN)
    const recorded = SessionPrune.apply([...history, step(13 * MIN, big())], config)
    // The next request no longer passes `now`, and still agrees with the cut that was already sent.
    expect(outputs(recorded).slice(0, 4)).toEqual(outputs(decided))
  })

  test("is stable: appending warm steps never changes what was already cut", () => {
    const base = [step(0, big()), step(MIN, big()), step(2 * MIN, big()), step(13 * MIN, big())]
    const first = SessionPrune.apply(base, config)
    const later = SessionPrune.apply([...base, step(14 * MIN, big()), step(15 * MIN, big())], config)
    expect(outputs(later).slice(0, outputs(first).length)).toEqual(outputs(first))
    expect(SessionPrune.apply(base, config)).toEqual(first)
  })

  test("does not prune when too little would be saved", () => {
    const history = [step(0, big()), step(MIN, big()), step(2 * MIN, big())]
    // Only one result is eligible (about 1000 tokens), below a 2000 token minimum.
    const strict = { ...config, minTokens: 2_000 }
    expect(SessionPrune.apply(history, strict, 30 * MIN)).toBe(history)
  })

  test("never touches output that cannot be fetched again", () => {
    const history = [
      step(0, big("subagent"), big("skill"), big("edit"), big("question")),
      step(MIN, big("read")),
      step(2 * MIN, big("read")),
      step(3 * MIN, big("read")),
    ]
    const texts = outputs(SessionPrune.apply(history, config, 30 * MIN))
    expect(texts.slice(0, 4).some(removed)).toBe(false)
  })

  test("never touches provider-executed output, errors, or small results", () => {
    const history = [
      step(0, result("read", 4_000, { executed: true }), result("read", 4_000, { status: "error" }), result("read", 200)),
      step(MIN, big()),
      step(2 * MIN, big()),
      step(3 * MIN, big()),
    ]
    const texts = outputs(SessionPrune.apply(history, config, 30 * MIN))
    expect(removed(texts[0] ?? "")).toBe(false)
    expect(texts[1]).toHaveLength(200)
  })

  test("leaves file content and the call itself in place", () => {
    const file = SessionMessage.AssistantTool.make({
      type: "tool",
      id: "call_file",
      name: "read",
      state: SessionMessage.ToolStateCompleted.make({
        status: "completed",
        input: {},
        content: [{ type: "file", uri: "file:///a.png", mime: "image/png" }],
      }),
      time: { created: DateTime.makeUnsafe(0) },
    })
    const history = [step(0, file), step(MIN, big()), step(2 * MIN, big()), step(3 * MIN, big())]
    const pruned = SessionPrune.apply(history, config, 30 * MIN)
    const part = (pruned[0] as SessionMessage.Assistant).content[0]
    expect(part?.type === "tool" && part.state.status === "completed" && part.state.content[0]?.type).toBe("file")
    const cut = (pruned[1] as SessionMessage.Assistant).content[0]
    expect(cut?.type === "tool" && cut.state.input).toMatchObject({ path: "a.ts" })
  })

  test("a compaction resets what counts as recent", () => {
    const compaction = SessionMessage.CompactionCompleted.make({
      id: SessionMessage.ID.make("msg_prune_compaction"),
      type: "compaction",
      status: "completed",
      reason: "auto",
      summary: "Earlier work",
      time: { created: DateTime.makeUnsafe(3 * MIN) },
    })
    const history = [step(0, big()), step(MIN, big()), compaction, step(4 * MIN, big())]
    expect(SessionPrune.apply(history, config, 30 * MIN)).toBe(history)
  })

  test("does not mutate its input", () => {
    const history = [step(0, big()), step(MIN, big()), step(2 * MIN, big()), step(3 * MIN, big())]
    const before = JSON.stringify(history)
    SessionPrune.apply(history, config, 30 * MIN)
    expect(JSON.stringify(history)).toBe(before)
  })

  test("an idle of zero prunes eagerly, for providers with no prompt cache to protect", () => {
    const history = Array.from({ length: 8 }, (_, index) => step(index * MIN, big()))
    const eager = { ...config, idleMillis: 0 }
    // Warm by the clock, but with nothing cached there is nothing to lose by pruning at once. The last step's own
    // result is only sent with the next request, so before it 7 results are in play and the 2 newest are kept.
    expect(outputs(SessionPrune.apply(history, eager)).map(removed)).toEqual([
      true, true, true, true, true, false, false, false,
    ])
    expect(SessionPrune.apply(history, config)).toBe(history)
  })

  test("a single gap in the middle prunes only what came before it", () => {
    const history = [
      step(0, big()),
      step(MIN, big()),
      step(2 * MIN, big()),
      step(20 * MIN, big()),
      step(21 * MIN, big()),
    ]
    expect(outputs(SessionPrune.apply(history, config)).map(removed)).toEqual([true, false, false, false, false])
  })
})

/** The same call each time it is made: identical input and output, as when a file is read twice unchanged. */
const sameRead = (path: string, chars = 4_000, text = `${path}:`.padEnd(chars, "x")) =>
  SessionMessage.AssistantTool.make({
    type: "tool",
    id: `call_${counter++}`,
    name: "read",
    state: SessionMessage.ToolStateCompleted.make({
      status: "completed",
      input: { path },
      content: [{ type: "text", text }],
    }),
    time: { created: DateTime.makeUnsafe(0) },
  })
const repeatedStub = (text: string) => text.startsWith("[Identical to the earlier")

describe("SessionPrune.apply repeated output", () => {
  test("points a repeated call at the earlier one, even while the cache is warm", () => {
    const history = [step(0, sameRead("a.ts")), step(MIN, big()), step(2 * MIN, sameRead("a.ts"))]
    const texts = outputs(SessionPrune.apply(history, config, 3 * MIN))
    expect(texts.map(repeatedStub)).toEqual([false, false, true])
    expect(texts[0]).toStartWith("a.ts:")
    expect(texts[2]).toContain("earlier read call")
  })

  test("every later copy points at the first", () => {
    const history = [step(0, sameRead("a.ts")), step(MIN, sameRead("a.ts")), step(2 * MIN, sameRead("a.ts"))]
    expect(outputs(SessionPrune.apply(history, config)).map(repeatedStub)).toEqual([false, true, true])
  })

  test("does not treat a different input as a repeat, even with the same output", () => {
    const same = "x".repeat(4_000)
    const history = [step(0, sameRead("a.ts", 4_000, same)), step(MIN, sameRead("b.ts", 4_000, same))]
    expect(SessionPrune.apply(history, config)).toBe(history)
  })

  test("does not treat changed output as a repeat", () => {
    const history = [step(0, sameRead("a.ts", 4_000, "v1".repeat(2_000))), step(MIN, sameRead("a.ts", 4_000, "v2".repeat(2_000)))]
    expect(SessionPrune.apply(history, config)).toBe(history)
  })

  test("leaves small repeated output alone", () => {
    const history = [step(0, sameRead("a.ts", 200)), step(MIN, sameRead("a.ts", 200))]
    expect(SessionPrune.apply(history, config)).toBe(history)
  })

  test("when the original is pruned, the copy is shown in full so the content is not lost", () => {
    const history = [
      step(0, sameRead("a.ts")),
      step(MIN, big()),
      step(2 * MIN, big()),
      step(3 * MIN, big()),
      step(4 * MIN, sameRead("a.ts")),
      step(5 * MIN, big()),
    ]
    // Cold at the next request: the original read is pruned, so it cannot be what the copy points to.
    const texts = outputs(SessionPrune.apply(history, { ...config, keep: 2 }, 60 * MIN))
    expect(removed(texts[0] ?? "")).toBe(true)
    expect(repeatedStub(texts[4] ?? "")).toBe(false)
    expect(texts[4]).toStartWith("a.ts:")
  })

  test("a compaction between them means the earlier output is gone, so the later one stays whole", () => {
    const compaction = SessionMessage.CompactionCompleted.make({
      id: SessionMessage.ID.make("msg_prune_repeat_compaction"),
      type: "compaction",
      status: "completed",
      reason: "auto",
      summary: "Earlier work",
      time: { created: DateTime.makeUnsafe(MIN) },
    })
    const history = [step(0, sameRead("a.ts")), compaction, step(2 * MIN, sameRead("a.ts"))]
    expect(SessionPrune.apply(history, config)).toBe(history)
  })

  test("is stable: appending steps never changes which earlier results were pointers", () => {
    const base = [step(0, sameRead("a.ts")), step(MIN, big()), step(2 * MIN, sameRead("a.ts"))]
    const first = outputs(SessionPrune.apply(base, config))
    const later = outputs(SessionPrune.apply([...base, step(3 * MIN, big()), step(4 * MIN, sameRead("a.ts"))], config))
    expect(later.slice(0, first.length)).toEqual(first)
    expect(repeatedStub(later[4] ?? "")).toBe(true)
  })

  test("does not mutate its input", () => {
    const history = [step(0, sameRead("a.ts")), step(MIN, sameRead("a.ts"))]
    const before = JSON.stringify(history)
    SessionPrune.apply(history, config)
    expect(JSON.stringify(history)).toBe(before)
  })
})

describe("SessionPrune.settings", () => {
  test("is off only when explicitly disabled", () => {
    expect(SessionPrune.settings(false)).toBeUndefined()
    expect(SessionPrune.settings(undefined)).toEqual({ idleMillis: 5 * MIN, keep: 6, minTokens: 10_000 })
    expect(SessionPrune.settings(true)).toEqual({ idleMillis: 5 * MIN, keep: 6, minTokens: 10_000 })
  })

  test("takes overrides from the config object", () => {
    expect(SessionPrune.settings({ idle: Duration.minutes(60), keep: 2, min: 500 })).toEqual({
      idleMillis: 60 * MIN,
      keep: 2,
      minTokens: 500,
    })
  })
})
