export * as SkillInstructions from "./instructions.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer, Schema } from "effect"
import { Permission } from "../permission.js"
import { Skill } from "../skill.js"
import { Instructions } from "../instructions/index.js"

const Summary = Schema.Struct({
  id: Skill.ID,
  name: Skill.Name,
  description: Schema.String,
})
type Summary = typeof Summary.Type

/** Longest description the catalog shows. The skill's own text is untouched and loads in full on use. */
export const DESCRIPTION_LIMIT = 300

/**
 * Shortens a description to the limit at a sentence end when one falls near it, else at a word. What decides whether a
 * skill applies is stated up front, while exclusions tend to trail, so the head is what is kept.
 */
export const abbreviate = (description: string, limit = DESCRIPTION_LIMIT) => {
  const text = description.replace(/\s+/g, " ").trim()
  if (text.length <= limit) return text
  const head = text.slice(0, limit)
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "))
  if (sentence >= limit * 0.6) return head.slice(0, sentence + 1)
  const word = head.lastIndexOf(" ")
  return `${(word >= limit * 0.6 ? head.slice(0, word) : head).replace(/[\s,;:(–-]+$/, "")}…`
}

// One line per skill. The ID is what the skill tool takes; the name only appears when it differs.
const entries = (skills: ReadonlyArray<Summary>) =>
  skills.map(
    (skill) =>
      `- ${skill.id}${String(skill.name) === String(skill.id) ? "" : ` (${skill.name})`}: ${abbreviate(skill.description)}`,
  )

const render = (skills: ReadonlyArray<Summary>) =>
  [
    "Skills are specialized instructions for specific tasks. Load one with the skill tool when the task matches its description.",
    "The user may also invoke a skill directly; its instructions then appear in the conversation as a <skill_content> block, the same shape the skill tool returns. A skill already present this way does not need to be loaded again.",
    ...(skills.length === 0
      ? ["No skills are currently available."]
      : ["<available_skills>", ...entries(skills), "</available_skills>"]),
  ].join("\n")

const update = (previous: ReadonlyArray<Summary>, current: ReadonlyArray<Summary>) => {
  const diff = Instructions.diffByKey(
    previous,
    current,
    (skill) => skill.id,
    (before, after) => before.name !== after.name || before.description !== after.description,
  )
  // Added, changed, and removed skills render as deltas; the full list is restated only when no entry differs.
  if (diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0)
    return [
      "The available skills have changed. This list supersedes the previous available skills list.",
      render(current),
    ].join("\n")
  return [
    ...(diff.added.length === 0
      ? []
      : ["New skills are available in addition to those previously listed:", ...entries(diff.added)]),
    ...(diff.changed.length === 0
      ? []
      : [
          "The following skills have changed. Each entry replaces the previously listed skill with the same ID:",
          ...entries(diff.changed.map((change) => change.current)),
        ]),
    ...(diff.removed.length === 0
      ? []
      : [
          `The following skill IDs are no longer available and must not be used: ${diff.removed.map((skill) => skill.id).join(", ")}.`,
        ]),
  ].join("\n")
}

export interface Interface {
  /** Lists skills the given ruleset does not deny; callers pass the merged agent and Session permissions. */
  readonly load: (permissions: Permission.Ruleset) => Effect.Effect<Instructions.List>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SkillInstructions") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skills = yield* Skill.Service

    return Service.of({
      load: Effect.fn("SkillInstructions.load")(function* (permissions) {
        const available = Skill.available(yield* skills.list(), permissions)
          .flatMap((skill) =>
            skill.description === undefined || skill.autoinvoke === false
              ? []
              : [{ id: skill.id, name: skill.name, description: skill.description }],
          )
          .toSorted((a, b) => a.id.localeCompare(b.id))
        return Instructions.make<ReadonlyArray<Summary>>({
          key: Instructions.Key.make("core/skill-guidance"),
          codec: Schema.toCodecJson(Schema.Array(Summary)),
          read: Effect.succeed(available.length === 0 ? Instructions.removed : available),
          render: {
            initial: render,
            changed: update,
            removed: () => "Skill guidance is no longer available. Do not use any previously listed skill.",
          },
        })
      }),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Skill.node] })
