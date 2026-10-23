export * as SessionRequestBreakdown from "./request-breakdown.js"

import type { LLMRequest } from "@opencode/ai"
import type { TokenUsage } from "@opencode/schema/token-usage"
import { Token } from "../util/token.js"
import { SessionCompaction } from "./compaction.js"

/** Splits a request's estimated input tokens by origin, so cost can be traced to system, tools or history. */
export const make = (request: Pick<LLMRequest, "system" | "tools" | "messages">): TokenUsage.Breakdown => {
  const total = {
    system: request.system.reduce((sum, part) => sum + Token.estimate(part.text), 0),
    tools: request.tools.reduce((sum, tool) => sum + SessionCompaction.estimateTool(tool), 0),
    user: 0,
    assistant: 0,
    reasoning: 0,
    toolCalls: 0,
    toolResults: 0,
    media: 0,
    summary: 0,
  }
  for (const message of request.messages) {
    for (const part of message.content) {
      const size = SessionCompaction.estimatePart(part)
      if (part.type === "compaction") total.summary += size
      else if (part.type === "reasoning") total.reasoning += size
      else if (part.type === "media") total.media += size
      else if (part.type === "tool-call") total.toolCalls += size
      else if (part.type === "tool-result") total.toolResults += size
      else if (message.role === "system") total.system += size
      else if (message.role === "assistant") total.assistant += size
      else total.user += size
    }
  }
  return total
}

export const total = (breakdown: TokenUsage.Breakdown) =>
  breakdown.system +
  breakdown.tools +
  breakdown.user +
  breakdown.assistant +
  breakdown.reasoning +
  breakdown.toolCalls +
  breakdown.toolResults +
  breakdown.media +
  breakdown.summary
