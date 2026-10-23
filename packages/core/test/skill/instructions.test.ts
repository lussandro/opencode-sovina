import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Agent } from "@opencode/core/agent"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { AbsolutePath } from "@opencode/core/schema"
import { Skill } from "@opencode/core/skill"
import { SkillInstructions } from "@opencode/core/skill/instructions"
import { it } from "../lib/effect"
import { readInitial, readUpdate } from "../lib/instructions"

const build = Agent.ID.make("build")
const effect = Skill.Info.make({
  id: Skill.ID.make("effect"),
  name: Skill.Name.make("Effect"),
  description: "Build applications with Effect",
  path: AbsolutePath.make(path.resolve("/skills/effect/SKILL.md")),
  content: "Effect guidance",
})
const hidden = Skill.Info.make({
  id: Skill.ID.make("hidden"),
  name: Skill.Name.make("Hidden"),
  path: AbsolutePath.make(path.resolve("/skills/hidden/SKILL.md")),
  content: "Undescribed guidance",
})
const denied = Skill.Info.make({
  id: Skill.ID.make("denied"),
  name: Skill.Name.make("Denied"),
  description: "Must not be advertised",
  path: AbsolutePath.make(path.resolve("/skills/denied/SKILL.md")),
  content: "Denied guidance",
})
const manual = Skill.Info.make({
  id: Skill.ID.make("manual"),
  name: Skill.Name.make("Manual"),
  description: "Load only when explicitly selected",
  autoinvoke: false,
  path: AbsolutePath.make(path.resolve("/skills/manual/SKILL.md")),
  content: "Manual guidance",
})

const layer = (list: () => Skill.Info[]) =>
  AppNodeBuilder.build(SkillInstructions.node, [
    Skill.node.replace(Layer.mock(Skill.Service, { list: () => Effect.succeed(list()) })),
  ])

describe("SkillInstructions", () => {
  it.effect("renders described agent skills and updates the complete available list", () => {
    const agent = Agent.Info.make({
      ...Agent.Info.default(build),
      permissions: [{ action: "skill", resource: "denied", effect: "deny" }],
    })
    let skills = [hidden, denied, manual, effect]
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      const initialized = yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))

      expect(initialized.text).toBe(
        [
          "Skills are specialized instructions for specific tasks. Load one with the skill tool when the task matches its description.",
          "The user may also invoke a skill directly; its instructions then appear in the conversation as a <skill_content> block, the same shape the skill tool returns. A skill already present this way does not need to be loaded again.",
          "<available_skills>",
          "- effect (Effect): Build applications with Effect",
          "</available_skills>",
        ].join("\n"),
      )
      expect(initialized.text).not.toContain("manual")

      skills = []
      expect(
        yield* instructions
          .load(agent.permissions)
          .pipe(Effect.flatMap((context) => readUpdate(context, initialized))),
      ).toMatchObject({ text: "Skill guidance is no longer available. Do not use any previously listed skill." })
    }).pipe(Effect.provide(layer(() => skills)))
  })

  it.effect("announces added and removed skills as deltas without restating the list", () => {
    const agent = Agent.Info.make(Agent.Info.default(build))
    const debugging = Skill.Info.make({
      id: Skill.ID.make("debugging"),
      name: Skill.Name.make("Debugging"),
      description: "Diagnose hard bugs",
      path: AbsolutePath.make(path.resolve("/skills/debugging/SKILL.md")),
      content: "Debugging guidance",
    })
    let skills = [effect]
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      const initialized = yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))

      skills = [effect, debugging]
      const added = yield* instructions
        .load(agent.permissions)
        .pipe(Effect.flatMap((context) => readUpdate(context, initialized)))
      expect(added.text).toBe(
        [
          "New skills are available in addition to those previously listed:",
          "- debugging (Debugging): Diagnose hard bugs",
        ].join("\n"),
      )

      skills = [debugging]
      const removed = yield* instructions
        .load(agent.permissions)
        .pipe(Effect.flatMap((context) => readUpdate(context, added)))
      expect(removed.text).toBe("The following skill IDs are no longer available and must not be used: effect.")
    }).pipe(Effect.provide(layer(() => skills)))
  })

  it.effect("renders only the changed skill when a description changes", () => {
    const agent = Agent.Info.make(Agent.Info.default(build))
    let skills = [effect]
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      const initialized = yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))

      skills = [Skill.Info.make({ ...effect, description: "Build applications with Effect v4" })]
      const changed = yield* instructions
        .load(agent.permissions)
        .pipe(Effect.flatMap((context) => readUpdate(context, initialized)))
      expect(changed.text).toBe(
        [
          "The following skills have changed. Each entry replaces the previously listed skill with the same ID:",
          "- effect (Effect): Build applications with Effect v4",
        ].join("\n"),
      )
    }).pipe(Effect.provide(layer(() => skills)))
  })

  it.effect("omits instructions when the selected agent denies all skills", () => {
    const agent = Agent.Info.make({
      ...Agent.Info.default(build),
      permissions: [{ action: "skill", resource: "*", effect: "deny" }],
    })
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      expect((yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))).text).toBe("")
    }).pipe(Effect.provide(layer(() => [effect])))
  })

  it.effect("omits instructions when a resource-specific denial follows the global denial", () => {
    const agent = Agent.Info.make({
      ...Agent.Info.default(build),
      permissions: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "hidden", effect: "deny" },
      ],
    })
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      expect((yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))).text).toBe("")
    }).pipe(Effect.provide(layer(() => [effect])))
  })

  it.effect("retains specifically allowed skills after a global denial", () => {
    const agent = Agent.Info.make({
      ...Agent.Info.default(build),
      permissions: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "effect", effect: "allow" },
      ],
    })
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      expect(
        (yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))).text,
      ).toContain("- effect (Effect):")
    }).pipe(Effect.provide(layer(() => [effect])))
  })

  it.effect("omits instructions when a specifically allowed skill is denied again", () => {
    const agent = Agent.Info.make({
      ...Agent.Info.default(build),
      permissions: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "effect", effect: "allow" },
        { action: "skill", resource: "effect", effect: "deny" },
      ],
    })
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      expect((yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))).text).toBe("")
    }).pipe(Effect.provide(layer(() => [effect])))
  })
})

describe("SkillInstructions.abbreviate", () => {
  const { abbreviate } = SkillInstructions

  test("leaves a description within the limit as it is, collapsing stray whitespace", () => {
    expect(abbreviate("Build   apps\n with Effect")).toBe("Build apps with Effect")
  })

  test("cuts at a sentence end when one falls near the limit", () => {
    const text = `${"Use this skill to build Effect programs".padEnd(80, " x")}. Then some trailing exclusions that run long ${"y ".repeat(200)}`
    const shown = abbreviate(text, 100)
    expect(shown.endsWith(".")).toBe(true)
    expect(shown).not.toContain("trailing")
    expect(shown.length).toBeLessThanOrEqual(100)
  })

  test("otherwise cuts at a word and marks the cut", () => {
    const shown = abbreviate("alpha beta gamma delta epsilon zeta eta theta iota kappa", 30)
    expect(shown).toBe("alpha beta gamma delta…")
    expect(shown.endsWith(" …")).toBe(false)
  })

  test("never cuts a word in half when there is a word boundary to use", () => {
    const shown = abbreviate("supercalifragilistic expialidocious word", 25)
    expect(shown.replace("…", "").trim().split(" ").every((word) => "supercalifragilistic expialidocious word".includes(word))).toBe(true)
  })

  test("falls back to a hard cut for one unbroken run", () => {
    const shown = abbreviate("x".repeat(500), 50)
    expect(shown).toBe(`${"x".repeat(50)}…`)
  })

  test("keeps the catalog entry in full in the stored data and shortens only what is rendered", () => {
    const long = `Use this skill for Effect. ${"Exclusions apply here. ".repeat(40)}`
    expect(abbreviate(long).length).toBeLessThanOrEqual(SkillInstructions.DESCRIPTION_LIMIT)
    expect(long.length).toBeGreaterThan(SkillInstructions.DESCRIPTION_LIMIT)
  })
})
