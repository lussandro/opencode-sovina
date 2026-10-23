import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Info } from "@opencode/schema/config"

const decode = Schema.decodeUnknownSync(Info)

describe("config codemode", () => {
  test("is unset by default so the request path applies its own default", () => {
    expect(decode({}).codemode).toBeUndefined()
  })

  test("accepts the three modes", () => {
    for (const mode of ["auto", "on", "off"] as const) expect(decode({ codemode: mode }).codemode).toBe(mode)
  })

  test("rejects anything else, including booleans", () => {
    expect(() => decode({ codemode: true })).toThrow()
    expect(() => decode({ codemode: "sometimes" })).toThrow()
  })
})
