import { describe, expect, test } from "bun:test"
import fs from "fs"
import path from "path"
import { SkillFile } from "@opencode/core/config/plugin/skill-file"
import { SkillInstructions } from "@opencode/core/skill/instructions"
import { Info } from "@opencode/schema/config"
import { Schema } from "effect"

// The skills this fork ships. They exist to keep the agent lean, so they are held to a size budget.
const root = path.resolve(import.meta.dir, "../../../skills")
const MAX_BYTES = 3_000

const directories = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())

describe("fork skills", () => {
  test("ships the expected set", () => {
    expect(directories.map((entry) => entry.name).sort()).toEqual([
      "dev-backend",
      "dev-debugging",
      "dev-frontend",
      "dev-infra",
      "dev-review",
      "dev-testing",
    ])
  })

  for (const entry of directories) {
    describe(entry.name, () => {
      const file = path.join(root, entry.name, "SKILL.md")
      const text = fs.readFileSync(file, "utf8")
      const parsed = SkillFile.parse(root, file, text)

      test("loads as a skill with the directory name as its id", () => {
        expect(parsed._tag).toBe("Parsed")
        if (parsed._tag !== "Parsed") return
        expect(String(parsed.skill.id)).toBe(entry.name)
        expect(String(parsed.skill.name)).toBe(entry.name)
        expect(parsed.skill.autoinvoke).toBeUndefined()
      })

      test("has a description that fits the catalog without being cut", () => {
        if (parsed._tag !== "Parsed") throw new Error("not parsed")
        const description = parsed.skill.description ?? ""
        expect(description.length).toBeGreaterThan(40)
        expect(SkillInstructions.abbreviate(description)).toBe(description)
        // The trigger comes first, so the catalog line tells the model when to load it.
        expect(description).toMatch(/^Use when/)
      })

      test(`stays under ${MAX_BYTES} bytes, since the whole file is re-sent on every step once loaded`, () => {
        expect(Buffer.byteLength(text)).toBeLessThan(MAX_BYTES)
      })
    })
  }
})

describe("coding profile", () => {
  const profile = JSON.parse(fs.readFileSync(path.join(root, "coding-profile.json"), "utf8"))

  test("is a valid config that only hides skills", () => {
    const decoded = Schema.decodeUnknownSync(Info)(profile)
    expect(Object.keys(profile)).toEqual(["policies"])
    expect(decoded.policies?.length).toBeGreaterThan(0)
    for (const policy of profile.policies) {
      expect(policy).toMatchObject({ action: "integration.use", effect: "deny" })
      expect(policy.resource).toMatch(/^skill:[a-z0-9-]+$/)
    }
  })

  test("never hides the skills this fork ships", () => {
    const hidden = profile.policies.map((policy: { resource: string }) => policy.resource.replace("skill:", ""))
    for (const entry of directories) expect(hidden).not.toContain(entry.name)
  })
})
