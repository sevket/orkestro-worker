import { Transform } from "node:stream";

/**
 * AI Context:
 * LLM CLI araçlarından (ornegin; claude, opencode) gelen karmaşık/gürültülü JSON Stream loglarını yakalar,
 * gereksiz system event'lerini filtreleyerek sadece Orkestro Dashboard UI'sında gösterilecek profesyonel
 * "Tool Use", "Assistant", "Tool Result" vs. saf block çıktılarına string olarak formatlayıp dönüştürür.
 */
export class JsonLogSimplifier extends Transform {
  private buffer = "";

  private divider = "────────────────────────────────────────";

  private formatBlock(title: string, content?: string): string {
    let block = `\n${this.divider}\n${title}\n${this.divider}\n`;
    if (content !== undefined) block += `${content}\n`;
    return block;
  }

  private processStreamEvent(ev: any): string | null {
    if (ev?.type === "content_block_start") {
      if (ev.content_block?.type === "tool_use") {
        return this.formatBlock(`Tool Use: ${ev.content_block.name}`);
      } else if (ev.content_block?.type === "text") {
        return this.formatBlock("Assistant");
      }
    } else if (ev?.type === "content_block_delta") {
      if (ev.delta?.type === "text_delta") return ev.delta.text;
      if (ev.delta?.type === "input_json_delta") return ev.delta.partial_json;
    }
    return null;
  }

  private processUserMessage(message: any): string | null {
    if (!message?.content) return null;
    let output = "";
    const items = Array.isArray(message.content) ? message.content : [message.content];
    
    for (const item of items) {
      if (item.type === "tool_result") {
        let resStr = typeof item.content === "string" ? item.content : JSON.stringify(item.content || "");
        if (resStr.length > 500) resStr = resStr.substring(0, 500) + "...";
        output += this.formatBlock("Tool Result", resStr.replace(/\\n/g, "\n"));
      } else if (item.type === "text") {
        output += this.formatBlock("User", String(item.text));
      }
    }
    return output || null;
  }

  private processJsonEvent(obj: any): string | null {
    if (obj.type === "stream_event") return this.processStreamEvent(obj.event);
    if (obj.type === "user") return this.processUserMessage(obj.message);
    if (obj.type === "step") return this.formatBlock(`Step: ${obj.name || "Unknown Step"}`);
    if (obj.tool_use_result) return this.formatBlock(`Action: ${obj.tool_use_result.type}`, `Target: ${obj.tool_use_result.filePath}`);
    if (obj.type === "error" || obj.error) return this.formatBlock("API Error", JSON.stringify(obj, null, 2));

    if (["assistant", "model", "result", "system", "rate_limit_event"].includes(obj.type)) {
      return null;
    }

    return this.formatBlock(`Event: ${obj.type || "unknown"}`);
  }

  _transform(chunk: any, encoding: string, callback: () => void) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (line) this.push(line + "\n");
        continue;
      }

      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const obj = JSON.parse(trimmed);
          const formattedOutput = this.processJsonEvent(obj);
          if (formattedOutput !== null) {
            this.push(formattedOutput);
          }
        } catch {
          this.push(line + "\n");
        }
      } else {
        this.push(line + "\n");
      }
    }
    callback();
  }

  _flush(callback: () => void) {
    if (this.buffer) {
      this.push(this.buffer + "\n");
    }
    callback();
  }
}
