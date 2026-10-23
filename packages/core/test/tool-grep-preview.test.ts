import { describe, expect, test } from "bun:test"
import { GrepTool } from "@opencode/core/tool/plugin/grep"

const match = (text: string, start?: number, length = 6) => ({
  entry: { path: "src/a.ts", type: "file" as const },
  line: 7,
  offset: 0,
  text,
  submatches: start === undefined ? [] : [{ text: text.slice(start, start + length), start, end: start + length }],
})

describe("GrepTool.preview", () => {
  test("returns short lines whole, without the trailing newline", () => {
    expect(GrepTool.preview("const x = 1\n", [])).toBe("const x = 1")
    expect(GrepTool.preview("const x = 1\r\n", [])).toBe("const x = 1")
  })

  test("centers the window on the first match so the match stays visible", () => {
    const line = `${"a".repeat(3_000)}NEEDLE${"b".repeat(3_000)}\n`
    const shown = GrepTool.preview(line, [{ start: 3_000 }], 400)
    expect(shown).toContain("NEEDLE")
    expect(shown.startsWith("…")).toBe(true)
    expect(shown.endsWith("…")).toBe(true)
    expect(shown.length).toBeLessThanOrEqual(402)
  })

  test("keeps the start of the line when the match is near it", () => {
    const shown = GrepTool.preview(`NEEDLE${"b".repeat(3_000)}\n`, [{ start: 0 }], 400)
    expect(shown.startsWith("NEEDLE")).toBe(true)
    expect(shown.startsWith("…")).toBe(false)
    expect(shown.endsWith("…")).toBe(true)
  })

  test("keeps the end of the line when the match is near it, without a trailing marker", () => {
    const line = `${"b".repeat(3_000)}NEEDLE`
    const shown = GrepTool.preview(line, [{ start: 3_000 }], 400)
    expect(shown.endsWith("NEEDLE")).toBe(true)
    expect(shown.startsWith("…")).toBe(true)
    expect(shown.length).toBe(401)
  })

  test("reads ripgrep offsets as UTF-8 bytes, not characters", () => {
    // Each "é" is 2 bytes, so the byte offset of NEEDLE is twice its character index.
    const line = `${"é".repeat(2_000)}NEEDLE${"é".repeat(2_000)}`
    expect(GrepTool.preview(line, [{ start: 4_000 }], 400)).toContain("NEEDLE")
  })

  test("falls back to the start of the line when there is no submatch", () => {
    expect(GrepTool.preview("x".repeat(2_000), [], 400).startsWith("x")).toBe(true)
  })
})

describe("GrepTool.toModelContent", () => {
  test("has no blank line after each match, only between files", () => {
    const content = GrepTool.toModelContent([
      match("one\n"),
      { ...match("two\n"), line: 9 },
      { ...match("three\n"), entry: { path: "src/b.ts", type: "file" as const } },
    ])
    expect(content).toBe(
      ["Found 3 matches", "src/a.ts:", "  Line 7: one", "  Line 9: two", "", "src/b.ts:", "  Line 7: three"].join("\n"),
    )
  })

  test("bounds each match line", () => {
    const line = `${"a".repeat(5_000)}NEEDLE${"b".repeat(5_000)}\n`
    const content = GrepTool.toModelContent([match(line, 5_000)])
    expect(content).toContain("NEEDLE")
    expect(content.length).toBeLessThan(600)
  })
})
