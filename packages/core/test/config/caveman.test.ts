import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Info } from "@opencode/schema/config"

const decode = Schema.decodeUnknownSync(Info)

describe("config caveman", () => {
  test("is unset by default so the plugin applies its own default", () => {
    expect(decode({}).caveman).toBeUndefined()
  })

  test("accepts booleans and both levels", () => {
    expect(decode({ caveman: false }).caveman).toBe(false)
    expect(decode({ caveman: true }).caveman).toBe(true)
    expect(decode({ caveman: "lite" }).caveman).toBe("lite")
    expect(decode({ caveman: "full" }).caveman).toBe("full")
  })

  test("rejects unknown levels", () => {
    expect(() => decode({ caveman: "ultra" })).toThrow()
  })
})
