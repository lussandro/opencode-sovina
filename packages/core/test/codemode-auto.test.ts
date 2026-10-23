import { describe, expect, test } from "bun:test"
import { ToolDefinition } from "@opencode/ai"
import { Effect } from "effect"
import { CodeModeAuto } from "@opencode/core/codemode/auto"
import type { CodeModeCatalog } from "@opencode/core/codemode/catalog"
import type { Tool } from "@opencode/core/tool"

const definition = (name: string) => ToolDefinition.make({ name, description: name, inputSchema: { type: "object" } })
const tool = (name: string): CodeModeCatalog.Tool => ({ type: "tool", name, description: name, signature: `${name}()` })
const namespace = (name: string): CodeModeCatalog.Namespace => ({ type: "namespace", name, tools: [tool("a")] })

const run = Effect.fnUntraced(function* () {
  return { content: [], metadata: undefined } as never
})
const snapshot = (catalog?: CodeModeCatalog.Inventory): Tool.Snapshot => ({
  definitions: [definition("edit"), definition("read"), ...(catalog ? [definition("execute")] : [])],
  ...(catalog ? { codeModeCatalog: catalog } : {}),
  execute: run,
})
const names = (value: Tool.Snapshot) => value.definitions.map((item) => item.name)

describe("CodeModeAuto", () => {
  test("only OpenCode's own namespace is not external", () => {
    expect(CodeModeAuto.external({ tools: [namespace("opencode")] })).toBe(false)
    expect(CodeModeAuto.external({ tools: [] })).toBe(false)
  })

  test("another namespace, or a loose tool, is external", () => {
    expect(CodeModeAuto.external({ tools: [namespace("opencode"), namespace("github")] })).toBe(true)
    expect(CodeModeAuto.external({ tools: [tool("custom")] })).toBe(true)
  })

  test("auto drops execute and the catalog when only built-in tools exist", () => {
    const value = snapshot({ tools: [namespace("opencode")] })
    const shown = CodeModeAuto.apply(value, "auto")
    expect(names(shown)).toEqual(["edit", "read"])
    expect(shown.codeModeCatalog).toBeUndefined()
    // Direct tools still run through the same executor.
    expect(shown.execute).toBe(value.execute)
  })

  test("auto keeps execute once an MCP server or other external tool is present", () => {
    const value = snapshot({ tools: [namespace("opencode"), namespace("github")] })
    expect(CodeModeAuto.apply(value, "auto")).toBe(value)
  })

  test("on always keeps execute", () => {
    const value = snapshot({ tools: [namespace("opencode")] })
    expect(CodeModeAuto.apply(value, "on")).toBe(value)
  })

  test("off drops execute even when external tools exist", () => {
    const shown = CodeModeAuto.apply(snapshot({ tools: [namespace("github")] }), "off")
    expect(names(shown)).toEqual(["edit", "read"])
    expect(shown.codeModeCatalog).toBeUndefined()
  })

  test("a snapshot that never had Code Mode is left functionally unchanged", () => {
    expect(names(CodeModeAuto.apply(snapshot(), "auto"))).toEqual(["edit", "read"])
  })
})
