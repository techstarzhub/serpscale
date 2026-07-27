import { Injectable, Logger } from "@nestjs/common";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// A data-access function the model may call to fetch specific, current facts
// about the project (rankings, broken pages, competitor gaps, etc.).
export interface CopilotTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  label: (args: any) => string; // human-friendly "what am I doing" line for the UI
  run: (args: any) => Promise<string>;
}

// Events streamed out of the agentic loop.
export type CopilotEvent =
  | { type: "tool"; name: string; label: string } // a data lookup started
  | { type: "reset" } // discard tokens streamed so far this round (rare)
  | { type: "token"; text: string } // a piece of the final answer
  | { type: "final"; content: string }; // the complete final answer

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_ROUNDS = 6;

/**
 * AI SEO Copilot powered by Groq (Llama 3.3 70B). It is *agentic*: instead of
 * being handed a fixed data dump, it decides which project data it needs and
 * calls tools to fetch it live, then streams a grounded, citational answer that
 * references the client's actual pages and keywords.
 */
@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

  get configured(): boolean {
    return Boolean(process.env.GROQ_API_KEY);
  }

  /** One-shot, non-streamed answer (used for the proactive brief). */
  async once(system: string, question: string, tools: CopilotTool[]): Promise<string> {
    let out = "";
    for await (const ev of this.run(system, [], question, tools)) {
      if (ev.type === "final") out = ev.content;
    }
    return out;
  }

  /** Stream a plain (no-tools) completion, yielding tokens as they arrive. */
  async *stream(system: string, question: string, opts?: { maxTokens?: number }): AsyncGenerator<CopilotEvent> {
    yield* this.run(system, [], question, [], opts?.maxTokens);
  }

  /**
   * Run the agentic loop, yielding tool-activity + answer tokens as they happen.
   */
  async *run(
    system: string,
    history: ChatTurn[],
    question: string,
    tools: CopilotTool[],
    maxTokens?: number,
  ): AsyncGenerator<CopilotEvent> {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      const msg = "The AI copilot isn't configured yet.";
      yield { type: "token", text: msg };
      yield { type: "final", content: msg };
      return;
    }

    const toolSchemas = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    const byName = new Map(tools.map((t) => [t.name, t]));

    const messages: any[] = [
      { role: "system", content: system },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: question },
    ];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const lastRound = round === MAX_ROUNDS - 1;
      let result: { content: string; toolCalls: any[]; streamed: boolean };
      try {
        result = yield* this.streamRound(key, messages, lastRound ? [] : toolSchemas, maxTokens);
      } catch (e) {
        this.logger.warn(`groq round failed: ${String(e).slice(0, 160)}`);
        const msg = "The AI couldn't respond right now. Please try again in a moment.";
        yield { type: "final", content: msg };
        return;
      }

      // No tool calls -> this was the final answer.
      if (!result.toolCalls.length) {
        yield { type: "final", content: result.content.trim() || "I couldn't generate a response for that." };
        return;
      }

      // The model streamed some prose but then decided to call tools: tell the
      // client to drop what it showed for this round.
      if (result.streamed) yield { type: "reset" };

      messages.push({ role: "assistant", content: result.content || null, tool_calls: result.toolCalls });
      for (const tc of result.toolCalls) {
        const tool = byName.get(tc.function?.name);
        let args: any = {};
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }
        yield { type: "tool", name: tc.function?.name ?? "lookup", label: tool ? tool.label(args) : "Looking up data" };
        let output = `Unknown tool: ${tc.function?.name}`;
        if (tool) {
          try {
            output = await tool.run(args);
          } catch (e) {
            output = `That lookup failed: ${String(e).slice(0, 120)}`;
          }
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: output.slice(0, 8000) });
      }
    }

    // Ran out of rounds without a plain answer — ask for a final summary.
    yield { type: "final", content: "I gathered the data but need another try to summarize it — please ask again." };
  }

  /**
   * Stream a single chat completion. Yields answer tokens live; accumulates any
   * tool calls (which arrive as fragmented deltas). Returns the round result.
   */
  private async *streamRound(
    key: string,
    messages: any[],
    toolSchemas: any[],
    maxTokens?: number,
  ): AsyncGenerator<CopilotEvent, { content: string; toolCalls: any[]; streamed: boolean }> {
    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    // Reasoning models (gpt-oss, deepseek-r1, qwen3) spend output tokens on a
    // hidden reasoning pass, so they need a much larger budget or the visible
    // answer gets truncated to empty. Keep their reasoning short for speed.
    const isReasoning = /gpt-oss|deepseek-r1|qwen3/i.test(model);
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        ...(toolSchemas.length ? { tools: toolSchemas, tool_choice: "auto" } : {}),
        temperature: 0.3,
        max_tokens: maxTokens ?? (isReasoning ? 8000 : 2500),
        ...(isReasoning ? { reasoning_effort: "low" } : {}),
        stream: true,
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "");
      throw new Error(`groq ${res.status}: ${errText.slice(0, 160)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let streamed = false;
    const toolCalls: any[] = []; // indexed accumulation

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        let json: any;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          streamed = true;
          yield { type: "token", text: delta.content };
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tcDelta of delta.tool_calls) {
            const i = tcDelta.index ?? 0;
            if (!toolCalls[i]) toolCalls[i] = { id: "", type: "function", function: { name: "", arguments: "" } };
            const slot = toolCalls[i];
            if (tcDelta.id) slot.id = tcDelta.id;
            if (tcDelta.function?.name) slot.function.name += tcDelta.function.name;
            if (tcDelta.function?.arguments) slot.function.arguments += tcDelta.function.arguments;
          }
        }
      }
    }

    return { content, toolCalls: toolCalls.filter(Boolean), streamed };
  }
}
