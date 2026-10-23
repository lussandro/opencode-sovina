export * as CodeModeAuto from "./auto.js"

import type { ConfigCodeMode } from "@opencode/schema/config/codemode"
import type { Tool } from "../tool.js"
import type { CodeModeCatalog } from "./catalog.js"

/** The namespace of the tools OpenCode registers itself; see `OpenCodeTools`. */
const BUILTIN_NAMESPACE = "opencode"
const EXECUTE = "execute"

/** True when something other than OpenCode's own built-in tools could be called through Code Mode. */
export const external = (inventory: CodeModeCatalog.Inventory) =>
  inventory.tools.some((item) => item.type !== "namespace" || item.name !== BUILTIN_NAMESPACE)

/**
 * Decides what the model is told about Code Mode. The registry always builds `execute`, which is right for the
 * registry, but advertising it and its catalog costs prompt tokens on every request. OpenCode's own namespace holds a
 * few rarely used tools, so in "auto" `execute` is only offered once an MCP server or another external tool exists.
 */
export const apply = (snapshot: Tool.Snapshot, mode: ConfigCodeMode.Mode): Tool.Snapshot => {
  if (mode === "on") return snapshot
  if (mode === "auto" && snapshot.codeModeCatalog && external(snapshot.codeModeCatalog)) return snapshot
  const { codeModeCatalog: _catalog, ...rest } = snapshot
  return { ...rest, definitions: snapshot.definitions.filter((definition) => definition.name !== EXECUTE) }
}
