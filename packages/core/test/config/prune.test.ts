import { describe, expect, test } from "bun:test"
import { Duration, Schema } from "effect"
import { Info } from "@opencode/schema/config"

const decode = Schema.decodeUnknownSync(Info)

describe("config prune", () => {
  test("is unset by default so the service applies its own defaults", () => {
    expect(decode({}).prune).toBeUndefined()
  })

  test("accepts boolean enablement", () => {
    expect(decode({ prune: false }).prune).toBe(false)
    expect(decode({ prune: true }).prune).toBe(true)
  })

  test("decodes custom thresholds", () => {
    const prune = decode({ prune: { idle: "1 hour", keep: 3, min: 5000 } }).prune
    expect(typeof prune).toBe("object")
    if (typeof prune !== "object") return
    expect(prune.idle).toEqual(Duration.hours(1))
    expect(prune.keep).toBe(3)
    expect(prune.min).toBe(5000)
  })

  test("rejects negative thresholds", () => {
    expect(() => decode({ prune: { keep: -1 } })).toThrow()
  })
})
