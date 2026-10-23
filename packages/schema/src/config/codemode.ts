export * as ConfigCodeMode from "./codemode.js"

import { Schema } from "effect"

/**
 * "auto" offers Code Mode only when something beyond OpenCode's own built-in tools could be called through it, such as
 * an MCP server. "on" always offers it and "off" never does.
 */
export const Mode = Schema.Literals(["auto", "on", "off"])
export type Mode = typeof Mode.Type
