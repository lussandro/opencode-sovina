import { expect, test } from "bun:test"
import { SystemPart } from "@opencode/ai"
import { Agent } from "@opencode/core/agent"
import { Config } from "@opencode/core/config"
import { CavemanPlugin } from "@opencode/core/plugin/caveman"
import { Plugin } from "@opencode/core/plugin"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { PluginHost } from "@opencode/core/plugin/host"
import { PluginInternal } from "@opencode/core/plugin/internal"
import { OptimizePlugin } from "@opencode/core/plugin/optimize"
import { Provider } from "@opencode/core/provider"
import { SessionSystemPrompt } from "@opencode/core/session/system-prompt"
import { Session } from "@opencode/core/session"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Document } from "@opencode/schema/config"
import { Model } from "@opencode/schema/model"
import { Effect } from "effect"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"
import PROMPT_GPT from "../../src/plugin/system-prompt/gpt.txt"

const it = testEffect(PluginTestLayer)

const context = (id = "unknown-model"): SessionHooks["context"] => ({
  sessionID: Session.ID.make("ses_caveman"),
  agent: Agent.ID.make("build"),
  model: Model.Ref.make({ providerID: Provider.ID.make("test"), id: Model.ID.make(id) }),
  system: [SystemPart.make("Agent prompt"), SystemPart.make("Initial context")],
  messages: [],
  tools: {},
  options: {},
})

const configure = (caveman?: boolean | "lite" | "full") =>
  Effect.gen(function* () {
    const config = yield* Config.Test
    yield* config.setEntries(caveman === undefined ? [] : [new Document({ type: "document", info: { caveman } })])
  })

const run = (event: SessionHooks["context"]) =>
  Effect.gen(function* () {
    const hooks = yield* PluginHooks.Service
    const plugins = yield* Plugin.Service
    const host = yield* PluginHost.make(plugins)
    yield* CavemanPlugin.Plugin.effect(host)
    yield* hooks.trigger("session", "context", event)
    return event
  })

test("maps each setting to a prompt", () => {
  expect(CavemanPlugin.prompt(undefined)).toContain("caveman")
  expect(CavemanPlugin.prompt(true)).toContain("caveman")
  expect(CavemanPlugin.prompt("full")).toContain("caveman")
  expect(CavemanPlugin.prompt("lite")).toContain("concise")
  expect(CavemanPlugin.prompt(false)).toBeUndefined()
})

it.effect("is on by default and only extends the agent prompt", () =>
  Effect.gen(function* () {
    yield* configure()
    const event = yield* run(context())
    expect(event.system).toHaveLength(2)
    expect(event.system[0]?.text).toStartWith("Agent prompt\n\n# Output style: caveman")
    expect(event.system[1]?.text).toBe("Initial context")
  }),
)

it.effect("keeps code and safety carve-outs in the shipped prompt", () =>
  Effect.gen(function* () {
    yield* configure()
    const text = (yield* run(context())).system[0]?.text ?? ""
    expect(text).toContain("error messages")
    expect(text).toContain("destructive-action")
    expect(text).toContain("commit messages")
    expect(text).toContain("user's language")
  }),
)

it.effect("honors lite and off", () =>
  Effect.gen(function* () {
    yield* configure("lite")
    expect((yield* run(context())).system[0]?.text).toContain("# Output style: concise")

    yield* configure(false)
    expect((yield* run(context())).system[0]?.text).toBe("Agent prompt")
  }),
)

it.effect("does not touch compaction requests", () =>
  Effect.gen(function* () {
    yield* configure()
    const event = context()
    const hooks = yield* PluginHooks.Service
    const plugins = yield* Plugin.Service
    yield* CavemanPlugin.Plugin.effect(yield* PluginHost.make(plugins))
    yield* hooks.trigger("session", "compaction", event)
    expect(event.system[0]?.text).toBe("Agent prompt")
  }),
)

it.effect("survives a model prompt override when registered after it", () =>
  Effect.gen(function* () {
    yield* configure()
    const hooks = yield* PluginHooks.Service
    const plugins = yield* Plugin.Service
    const agents = yield* Agent.Service
    yield* agents.transform((editor) => editor.update(Agent.ID.make("build"), () => {}))
    const host = yield* PluginHost.make(plugins)
    yield* OptimizePlugin.OpenAIPlugin.effect(host)
    yield* CavemanPlugin.Plugin.effect(host)
    const event = context("gpt-5")
    yield* hooks.trigger("session", "context", event)
    // The override really replaced the base prompt, and the style block still ended up after it.
    expect(event.system[0]?.text).toBe(`${SessionSystemPrompt.render(PROMPT_GPT, [])}\n\n${CavemanPlugin.prompt(undefined)}`)
  }),
)

test("is registered after every model prompt plugin", () => {
  const caveman = PluginInternal.preIds.indexOf("opencode.prompt.caveman")
  expect(caveman).toBeGreaterThan(-1)
  const models = PluginInternal.preIds.filter((id) => /^opencode\.prompt\.(openai|anthropic|kimi|arcee|meta)$/.test(id))
  expect(models).toHaveLength(5)
  for (const id of models) expect(caveman).toBeGreaterThan(PluginInternal.preIds.indexOf(id))
})
