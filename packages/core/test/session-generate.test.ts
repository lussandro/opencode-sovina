import { expect } from "bun:test"
import {
  AIError,
  LLMClient,
  LLMEvent,
  LLMResponse,
  LanguageModel,
  Message,
  SystemPart,
  ToolDefinition,
  TransportError,
  type LLMRequest,
} from "@opencode/ai"
import { OpenAIChat } from "@opencode/ai/protocols"
import { TestLLM } from "@opencode/ai/testing"
import type { StreamOptions } from "@opencode/ai/route"
import { Agent } from "@opencode/core/agent"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Bus } from "@opencode/core/bus"
import { CodeModeCatalog } from "@opencode/core/codemode/catalog"
import { Config } from "@opencode/core/config"
import { Document } from "@opencode/schema/config"
import { Money } from "@opencode/schema/money"
import { EventTable } from "@opencode/core/event/sql"
import { InstructionDiscovery } from "@opencode/core/instruction-discovery"
import { Instance } from "@opencode/core/instance/service"
import { Instructions } from "@opencode/core/instructions/index"
import { InstructionBuiltIns } from "@opencode/core/instructions/builtins"
import { Location } from "@opencode/core/location"
import { McpInstructions } from "@opencode/core/mcp/instructions"
import { ID } from "@opencode/core/model"
import { Project } from "@opencode/core/project"
import { Provider } from "@opencode/core/provider"
import { ReferenceInstructions } from "@opencode/core/reference/instructions"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionEvent } from "@opencode/core/session/event"
import { SessionContext } from "@opencode/core/session/context"
import { SessionGenerate } from "@opencode/core/session/generate"
import { InstructionState } from "@opencode/core/session/instruction-state"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionPrune } from "@opencode/core/session/prune"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { SessionSchema } from "@opencode/core/session/schema"
import {
  InstructionBlobTable,
  InstructionStateTable,
  SessionMessageTable,
  SessionInboxTable,
  SessionTable,
} from "@opencode/core/session/sql"
import { SessionStore } from "@opencode/core/session/store"
import { SkillInstructions } from "@opencode/core/skill/instructions"
import { Plugin } from "@opencode/core/plugin"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { PluginSupervisor } from "@opencode/core/plugin/supervisor"
import { Tool } from "@opencode/core/tool"
import { asc, eq } from "drizzle-orm"
import { Effect, Fiber, Layer, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { testEffect } from "./lib/effect"

const requests: LLMRequest[] = []
const options: Array<StreamOptions | undefined> = []
let instruction: string | Instructions.Unavailable = "Initial context"
const sessionID = SessionSchema.ID.make("ses_generate_test")

const model = LanguageModel.make({ id: "generate-model", provider: "test", route: OpenAIChat.route })
const client = Layer.mock(LLMClient.Service)({
  stream: () => Stream.die(new Error("unused")),
  generate: (request, requestOptions) =>
    Effect.sync(() => {
      requests.push(request)
      options.push(requestOptions)
      const response = LLMResponse.fromEvents([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.textStart({ id: "generate" }),
        LLMEvent.textDelta({ id: "generate", text: "Transient answer" }),
        LLMEvent.textEnd({ id: "generate" }),
        LLMEvent.stepFinish({
          index: 0,
          reason: { normalized: "stop" },
          usage: { inputTokens: 100, nonCachedInputTokens: 100, outputTokens: 10, visibleOutputTokens: 10 },
        }),
        LLMEvent.finish({ reason: { normalized: "stop" } }),
      ])
      if (!response) throw new Error("Incomplete generate response")
      return response
    }),
})
const models = Layer.mock(SessionRunnerModel.Service)({
  resolve: () =>
    Effect.succeed(
      SessionRunnerModel.resolved(model, {
        capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
        cost: [],
        limit: { context: 200_000, output: 32_000 },
      }),
    ),
})
const builtins = Layer.mock(InstructionBuiltIns.Service, {
  load: () =>
    Effect.succeed(
      Instructions.make({
        key: Instructions.Key.make("test/context"),
        codec: Schema.toCodecJson(Schema.String),
        read: Effect.sync(() => instruction),
        render: {
          initial: String,
          changed: (_previous, current) => current,
        },
      }),
    ),
})
const discovery = Layer.mock(InstructionDiscovery.Service, {
  project: true,
  global: true,
  load: () => Effect.succeed(Instructions.empty),
})
const skills = Layer.mock(SkillInstructions.Service, { load: () => Effect.succeed(Instructions.empty) })
const references = Layer.mock(ReferenceInstructions.Service, { load: () => Effect.succeed(Instructions.empty) })
const mcp = Layer.mock(McpInstructions.Service, { load: () => Effect.succeed(Instructions.empty) })
const capturedCatalog: CodeModeCatalog.Inventory = {
  tools: [
    {
      type: "tool",
      name: "captured.lookup",
      description: "Captured Code Mode catalog",
      signature: "tools.captured.lookup(): Promise<string>",
    },
  ],
}
// What the registry reports as Code Mode inventory; a test may narrow it to OpenCode's own namespace.
let registryCatalog: CodeModeCatalog.Inventory = capturedCatalog
// The real registry always builds `execute`; most tests here do not care about it.
let registryExecute = false
const tools = Layer.mock(Tool.Service, {
  snapshot: () =>
    Effect.succeed({
      codeModeCatalog: registryCatalog,
      definitions: [
        ToolDefinition.make({ name: "lookup", description: "Lookup", inputSchema: { type: "object" } }),
        ...(registryExecute
          ? [ToolDefinition.make({ name: "execute", description: "Run code", inputSchema: { type: "object" } })]
          : []),
      ],
      execute: () => Effect.die(new Error("unused")),
    }),
  transform: () => Effect.die(new Error("unused")),
})

const configLayer = Config.testLayer()
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Bus.node,
      Project.node,
      SessionProjector.node,
      SessionStore.node,
      Agent.node,
      InstructionBuiltIns.node,
      SessionContext.node,
      SessionPrune.node,
      Config.node,
      PluginHooks.node,
      llmClient,
    ]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      Config.node.replace(configLayer),
      llmClient.replace(client),
      SessionRunnerModel.node.replace(models),
      InstructionBuiltIns.node.replace(builtins),
      InstructionDiscovery.node.replace(discovery),
      SkillInstructions.node.replace(skills),
      ReferenceInstructions.node.replace(references),
      McpInstructions.node.replace(mcp),
      PluginSupervisor.node.replace(Layer.empty),
      Tool.node.replace(tools),
      Location.node.replace(Location.boundNode({ directory: AbsolutePath.make("/project") })),
    ],
  ).pipe(Layer.provideMerge(configLayer)),
)

const usageType = Bus.versionedType(SessionEvent.UsageRecorded.type, 1)

// Usage accounting is the one durable write generate is allowed to make; history must stay untouched.
const usageEvents = (db: Database.Interface["db"], sessionID: SessionSchema.ID) =>
  db
    .select()
    .from(EventTable)
    .where(eq(EventTable.aggregate_id, sessionID))
    .orderBy(asc(EventTable.seq))
    .all()
    .pipe(
      Effect.orDie,
      Effect.map((rows) => rows.filter((row) => row.type === usageType)),
    )

const durableState = (db: Database.Interface["db"], sessionID: SessionSchema.ID) =>
  Effect.all({
    sequence: Bus.latestSequence(db, sessionID).pipe(
      Effect.flatMap((latest) =>
        usageEvents(db, sessionID).pipe(Effect.map((usage) => latest - usage.length)),
      ),
    ),
    bus: db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, sessionID))
      .orderBy(asc(EventTable.seq))
      .all()
      .pipe(
        Effect.orDie,
        Effect.map((rows) => rows.filter((row) => row.type !== usageType)),
      ),
    messages: db
      .select()
      .from(SessionMessageTable)
      .where(eq(SessionMessageTable.session_id, sessionID))
      .orderBy(asc(SessionMessageTable.seq))
      .all()
      .pipe(Effect.orDie),
    pending: db
      .select()
      .from(SessionInboxTable)
      .where(eq(SessionInboxTable.session_id, sessionID))
      .orderBy(asc(SessionInboxTable.enqueued_seq))
      .all()
      .pipe(Effect.orDie),
    instructions: db
      .select()
      .from(InstructionStateTable)
      .where(eq(InstructionStateTable.session_id, sessionID))
      .get()
      .pipe(Effect.orDie),
    blobs: db.select().from(InstructionBlobTable).orderBy(asc(InstructionBlobTable.hash)).all().pipe(Effect.orDie),
    // Usage counters are accounting, not history: they legitimately move when generate spends tokens.
    session: db
      .select()
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionID))
      .get()
      .pipe(
        Effect.orDie,
        Effect.map((row) =>
          row
            ? {
                ...row,
                cost: 0,
                tokens_input: 0,
                tokens_output: 0,
                tokens_reasoning: 0,
                tokens_cache_read: 0,
                tokens_cache_write: 0,
              }
            : row,
        ),
      ),
  })

const userTexts = (request: LLMRequest) =>
  request.messages.flatMap((message) =>
    message.role === "user"
      ? message.content.flatMap((content) => (content.type === "text" ? [content.text] : []))
      : [],
  )

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  const bus = yield* Bus.Service
  const agents = yield* Agent.Service
  const projects = yield* Project.Service
  const instructionBuiltIns = yield* InstructionBuiltIns.Service
  const context = yield* SessionContext.Service
  const prune = yield* SessionPrune.Service
  const store = yield* SessionStore.Service
  yield* agents.transform((editor) =>
    editor.update(Agent.ID.make("build"), (agent) => {
      agent.mode = "primary"
    }),
  )
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: (yield* projects.resolve(AbsolutePath.make("/project"))).id,
      slug: "generate-test",
      directory: "/project",
      title: "Generate test",
      version: "test",
      agent: Agent.ID.make("build"),
    })
    .run()
    .pipe(Effect.orDie)
  const session = yield* store.get(sessionID)
  if (!session) return yield* Effect.die("Session fixture missing")
  return {
    db,
    bus,
    session,
    instructions: yield* instructionBuiltIns.load(),
    instances: Instance.Service.of({
      // Generation only exercises the Location's model context.
      provide: () =>
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SessionContext.Service, context),
            Layer.succeed(SessionPrune.Service, prune),
            Layer.mock(Plugin.Service, { awaitActivation: Effect.void }),
          ) as Layer.Layer<Instance.Services>,
        ),
    }),
  }
})

it.effect(
  "generates from fresh settled Session context without durable mutation",
  () =>
    Effect.gen(function* () {
      requests.length = 0
      options.length = 0
      instruction = "Initial context"
      const { db, bus, instructions, session, instances } = yield* setup
      yield* InstructionState.prepare(db, bus, instructions, sessionID)
      const existing = SessionMessage.ID.create()
      yield* bus.publish(SessionEvent.InboxEnqueued, {
        sessionID,
        inboxID: existing,
        item: { type: "user", payload: { text: "Existing durable context" }, delivery: "steer" },
      })
      yield* bus.publish(SessionEvent.InboxDelivered, {
        sessionID,
        inboxID: existing,
      })
      const settledAssistant = SessionMessage.ID.create()
      yield* bus.publish(SessionEvent.Step.Started, {
        sessionID,
        assistantMessageID: settledAssistant,
        agent: Agent.ID.make("build"),
        model: { id: ID.make("generate-model"), providerID: Provider.ID.make("test") },
        started: 0,
      })
      yield* bus.publish(SessionEvent.Text.Started, {
        sessionID,
        assistantMessageID: settledAssistant,
        ordinal: 0,
      })
      yield* bus.publish(SessionEvent.Text.Ended, {
        sessionID,
        assistantMessageID: settledAssistant,
        ordinal: 0,
        text: "Settled partial answer",
      })
      const activeAssistant = SessionMessage.ID.create()
      yield* bus.publish(SessionEvent.Step.Started, {
        sessionID,
        assistantMessageID: activeAssistant,
        agent: Agent.ID.make("build"),
        model: { id: ID.make("generate-model"), providerID: Provider.ID.make("test") },
        started: 0,
      })
      yield* bus.publish(SessionEvent.Tool.Input.Started, {
        sessionID,
        assistantMessageID: activeAssistant,
        id: "active-call",
        name: "echo",
      })
      yield* bus.publish(SessionEvent.Tool.Input.Ended, {
        sessionID,
        assistantMessageID: activeAssistant,
        id: "active-call",
        text: "{}",
      })
      yield* bus.publish(SessionEvent.Tool.Called, {
        sessionID,
        assistantMessageID: activeAssistant,
        id: "active-call",
        input: {},
        executed: false,
      })
      yield* bus.publish(SessionEvent.InboxEnqueued, {
        sessionID,
        inboxID: SessionMessage.ID.create(),
        item: { type: "user", payload: { text: "Queued input must remain invisible" }, delivery: "queue" },
      })
      instruction = "Changed context"
      const before = yield* durableState(db, sessionID)

      const result = yield* SessionGenerate.generate({ session, prompt: "Summarize privately" }).pipe(
        Effect.provideService(Instance.Service, instances),
      )

      expect(result).toBe("Transient answer")
      expect(requests).toHaveLength(1)
      expect(requests[0]?.model).toBe(model)
      expect(requests[0]?.system.map((part) => part.text)).toContain("Initial context")
      expect(requests[0]?.http?.headers).toMatchObject({ "X-Session-Id": sessionID })
      expect(requests[0]?.promptCacheKey).toBe(sessionID)
      const instructionUpdates = requests[0]?.messages.flatMap((message) =>
        message.role === "system"
          ? message.content.flatMap((content) => (content.type === "text" ? [content.text] : []))
          : [],
      )
      expect(instructionUpdates).toHaveLength(1)
      expect(instructionUpdates?.[0]).toContain("Changed context")
      expect(instructionUpdates?.[0]).toContain("tools.captured.lookup(): Promise<string>")
      expect(userTexts(requests[0])).toEqual(["Existing durable context", "Summarize privately"])
      expect(
        requests[0]?.messages.flatMap((message) =>
          message.role === "assistant"
            ? message.content.flatMap((content) => (content.type === "text" ? [content.text] : []))
            : [],
        ),
      ).toEqual(["Settled partial answer"])
      expect(requests[0]?.tools).toMatchObject([{ name: "lookup", description: "Lookup" }])
      expect(requests[0]?.toolChoice).toBeUndefined()
      expect(options[0]?.webSocket).toBeUndefined()
      expect(yield* durableState(db, sessionID)).toEqual(before)
      const usage = yield* usageEvents(db, sessionID)
      expect(usage).toHaveLength(1)
      expect(usage[0]?.data).toMatchObject({ source: "generate", tokens: { input: 100, output: 10 } })
    }),
  { timeout: 15_000 },
)

it.effect(
  "runs generate hooks instead of context hooks",
  () =>
    Effect.gen(function* () {
      requests.length = 0
      instruction = "Initial context"
      const { db, bus, instructions, session, instances } = yield* setup
      yield* InstructionState.prepare(db, bus, instructions, sessionID)
      const hooks = yield* PluginHooks.Service
      let contexts = 0
      yield* hooks.register("session", "context", () => Effect.sync(() => contexts++))
      yield* hooks.register("session", "generate", (event) =>
        Effect.sync(() => {
          expect(event.sessionID).toBe(sessionID)
          expect(event.agent).toBe(Agent.ID.make("build"))
          expect(Object.keys(event.tools)).toEqual(["lookup"])
          event.system.push(SystemPart.make("Answer briefly."))
          event.messages = [Message.user("[redacted]")]
          event.options.maxTokens = 32
          event.options.reasoningEffort = "low"
        }),
      )

      yield* SessionGenerate.generate({ session, prompt: "Summarize privately" }).pipe(
        Effect.provideService(Instance.Service, instances),
      )

      expect(contexts).toBe(0)
      expect(requests).toHaveLength(1)
      expect(requests[0]?.system.map((part) => part.text)).toContain("Answer briefly.")
      expect(userTexts(requests[0])).toEqual(["[redacted]"])
      expect(requests[0]?.generation).toEqual(expect.objectContaining({ maxTokens: 32 }))
      expect(requests[0]?.providerOptions).toEqual({ reasoningEffort: "low" })
    }),
  { timeout: 15_000 },
)

it.effect("regenerates a failed partial answer without mutating Session history", () =>
  Effect.gen(function* () {
    instruction = "Initial context"
    const { db, bus, instructions, session, instances } = yield* setup
    yield* InstructionState.prepare(db, bus, instructions, sessionID)
    const before = yield* durableState(db, sessionID)
    const llm = yield* TestLLM.Test
    yield* llm.push(
      TestLLM.failAfter(
        new AIError({
          reason: new TransportError({ message: "Disconnected", transport: "http", operation: "read" }),
        }),
        LLMEvent.textStart({ id: "failed" }),
        LLMEvent.textDelta({ id: "failed", text: "Discard this" }),
      ),
      TestLLM.text("Fresh answer", "success"),
    )
    const result = yield* SessionGenerate.generate({ session, prompt: "Summarize privately" }).pipe(
      Effect.provideService(Instance.Service, instances),
      Effect.provideService(LLMClient.Service, llm),
      Effect.forkChild({ startImmediately: true }),
    )
    yield* llm.wait(1)
    yield* TestClock.adjust("3 seconds")
    expect(yield* Fiber.join(result)).toBe("Fresh answer")
    const requests = yield* llm.requests()
    expect(requests).toHaveLength(2)
    expect(requests[1]).toBe(requests[0])
    expect(userTexts(requests[1])).toContain("Summarize privately")
    expect(yield* durableState(db, sessionID)).toEqual(before)
  }).pipe(Effect.provide(TestLLM.testLayer())),
)

it.effect(
  "blocks unavailable initial instructions before generation",
  () =>
    Effect.gen(function* () {
      requests.length = 0
      instruction = Instructions.unavailable
      const { db, session, instances } = yield* setup
      const before = yield* durableState(db, sessionID)

      const error = yield* SessionGenerate.generate({ session, prompt: "Summarize privately" }).pipe(
        Effect.provideService(Instance.Service, instances),
        Effect.flip,
      )

      expect(error).toBeInstanceOf(Instructions.InitializationBlocked)
      expect(requests).toEqual([])
      expect(yield* durableState(db, sessionID)).toEqual(before)
    }),
  { timeout: 15_000 },
)

const MINUTE = 60_000

const readStep = (index: number, chars: number) =>
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const assistantMessageID = SessionMessage.ID.create()
    const id = `read-${index}`
    yield* TestClock.setTime(index * MINUTE)
    yield* bus.publish(SessionEvent.Step.Started, {
      sessionID,
      assistantMessageID,
      agent: Agent.ID.make("build"),
      model: { id: ID.make("generate-model"), providerID: Provider.ID.make("test") },
      started: index * MINUTE,
    })
    yield* bus.publish(SessionEvent.Tool.Input.Started, { sessionID, assistantMessageID, id, name: "read" })
    yield* bus.publish(SessionEvent.Tool.Input.Ended, { sessionID, assistantMessageID, id, text: "{}" })
    yield* bus.publish(SessionEvent.Tool.Called, { sessionID, assistantMessageID, id, input: {}, executed: false })
    yield* bus.publish(SessionEvent.Tool.Success, {
      sessionID,
      assistantMessageID,
      id,
      content: [{ type: "text", text: `${index}`.repeat(chars) }],
      executed: false,
    })
    yield* bus.publish(SessionEvent.Step.Ended, {
      sessionID,
      assistantMessageID,
      finish: "stop",
      cost: Money.USD.make(0),
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    })
  })

const toolOutputs = (request: LLMRequest | undefined): string[] =>
  (request?.messages ?? []).flatMap((message) =>
    message.content.flatMap((part) =>
      part.type === "tool-result" && part.result.type === "text" ? [String(part.result.value)] : [],
    ),
  )

const seedReads = (prune: boolean | undefined) =>
  Effect.gen(function* () {
    requests.length = 0
    instruction = "Initial context"
    const fixture = yield* setup
    const config = yield* Config.Test
    yield* config.setEntries(prune === undefined ? [] : [new Document({ type: "document", info: { prune } })])
    yield* InstructionState.prepare(fixture.db, fixture.bus, fixture.instructions, sessionID)
    // Ten reads of about 4k tokens each, one per minute.
    for (let index = 0; index < 10; index++) yield* readStep(index, 16_000)
    return fixture
  })

const generateAfterIdle = (idleMinutes: number, prune: boolean | undefined) =>
  Effect.gen(function* () {
    const { bus, session, instances } = yield* seedReads(prune)
    yield* TestClock.setTime((10 + idleMinutes) * MINUTE)
    yield* SessionGenerate.generate({ session, prompt: "Continue" }).pipe(
      Effect.provideService(Instance.Service, instances),
      Effect.provideService(Bus.Service, bus),
    )
    return toolOutputs(requests[0])
  })

it.effect("sends pruned tool output once the cache has gone cold", () =>
  Effect.gen(function* () {
    const outputs = yield* generateAfterIdle(30, undefined)
    expect(outputs).toHaveLength(10)
    // Six most recent results survive; the four older ones are stubs.
    expect(outputs.slice(0, 4).every((text) => text.startsWith("[Output removed"))).toBe(true)
    expect(outputs.slice(4).every((text) => !text.startsWith("[Output removed"))).toBe(true)
    expect(outputs[9]).toBe("9".repeat(16_000))
  }),
)

it.effect("keeps every tool output while the cache is still warm", () =>
  Effect.gen(function* () {
    const outputs = yield* generateAfterIdle(2, undefined)
    expect(outputs).toHaveLength(10)
    expect(outputs.some((text) => text.startsWith("[Output removed"))).toBe(false)
  }),
)

it.effect("keeps every tool output when pruning is switched off", () =>
  Effect.gen(function* () {
    const outputs = yield* generateAfterIdle(30, false)
    expect(outputs).toHaveLength(10)
    expect(outputs.some((text) => text.startsWith("[Output removed"))).toBe(false)
  }),
)

it.effect("loads the primary request history already pruned", () =>
  Effect.gen(function* () {
    yield* seedReads(undefined)
    yield* TestClock.setTime((10 + 30) * MINUTE)
    const context = yield* SessionContext.Service
    const loaded = yield* context.load(yield* context.select(sessionID))
    const outputs = loaded.messages.flatMap((message) =>
      message.type === "assistant"
        ? message.content.flatMap((part) =>
            part.type === "tool" && part.state.status === "completed"
              ? part.state.content.map((item) => (item.type === "text" ? item.text : ""))
              : [],
          )
        : [],
    )
    expect(outputs).toHaveLength(10)
    expect(outputs.slice(0, 4).every((text) => text.startsWith("[Output removed"))).toBe(true)
    expect(outputs.slice(4).some((text) => text.startsWith("[Output removed"))).toBe(false)
  }),
)

const selectTools = (codemode: "auto" | "on" | "off" | undefined, catalog: CodeModeCatalog.Inventory) =>
  Effect.gen(function* () {
    registryCatalog = catalog
    registryExecute = true
    yield* setup
    const config = yield* Config.Test
    yield* config.setEntries(codemode === undefined ? [] : [new Document({ type: "document", info: { codemode } })])
    const context = yield* SessionContext.Service
    return (yield* context.select(sessionID)).tools
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        registryCatalog = capturedCatalog
        registryExecute = false
      }),
    ),
  )

const ownNamespace: CodeModeCatalog.Inventory = {
  tools: [{ type: "namespace", name: "opencode", tools: [{ type: "tool", name: "worktree_list", description: "d", signature: "s" }] }],
}

it.effect("does not advertise execute when only OpenCode's own Code Mode tools exist", () =>
  Effect.gen(function* () {
    const snapshot = yield* selectTools(undefined, ownNamespace)
    expect(snapshot.definitions.map((item) => item.name)).toEqual(["lookup"])
    expect(snapshot.codeModeCatalog).toBeUndefined()
  }),
)

it.effect("advertises execute once an external tool is present", () =>
  Effect.gen(function* () {
    const snapshot = yield* selectTools(undefined, capturedCatalog)
    expect(snapshot.definitions.map((item) => item.name)).toEqual(["lookup", "execute"])
    expect(snapshot.codeModeCatalog).toBeDefined()
  }),
)

it.effect("keeps execute with codemode on even when only OpenCode's own tools exist", () =>
  Effect.gen(function* () {
    expect((yield* selectTools("on", ownNamespace)).definitions.map((item) => item.name)).toEqual(["lookup", "execute"])
  }),
)

it.effect("drops execute with codemode off even when external tools exist", () =>
  Effect.gen(function* () {
    expect((yield* selectTools("off", capturedCatalog)).definitions.map((item) => item.name)).toEqual(["lookup"])
  }),
)
