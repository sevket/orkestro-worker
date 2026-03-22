import { Transform } from "node:stream";

export class JsonLogSimplifier extends Transform {
  private buffer = "";

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
          
          if (obj.type === "stream_event") {
            const ev = obj.event;
            if (ev?.type === "content_block_start" && ev.content_block?.type === "tool_use") {
              this.push(`\n  🛠 [Tool Use]: ${ev.content_block.name}\n`);
            } else if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              this.push(ev.delta.text);
            }
            continue;
          }
          
          if (obj.type === "user" && obj.message?.content) {
            const items = Array.isArray(obj.message.content) ? obj.message.content : [obj.message.content];
            for (const item of items) {
              if (item.type === "tool_result") {
                let resStr = typeof item.content === "string" ? item.content : JSON.stringify(item.content || "");
                if (resStr.length > 200) resStr = resStr.substring(0, 200) + "...";
                this.push(`\n  ✅ [Tool Result]: ${resStr.replace(/\\n/g, " ")}\n`);
              } else if (item.type === "text") {
                this.push(`\n  💬 [User]: ${String(item.text).substring(0, 200)}\n`);
              }
            }
            continue;
          }
          
          if (obj.type === "step") {
            this.push(`\n▶ [${obj.name || "Step"}]\n`);
            continue;
          }
          
          if (obj.tool_use_result) {
             this.push(`\n  ✅ [Action]: ${obj.tool_use_result.type} on ${obj.tool_use_result.filePath}\n`);
             continue;
          }
          
          if (obj.type === "error" || obj.error) {
            this.push(`\n  ❌ [API Error]: ${JSON.stringify(obj)}\n`);
            continue;
          }

          if (obj.type === "assistant" || obj.type === "model" || obj.type === "result" || obj.type === "system" || obj.type === "rate_limit_event") {
            continue;
          }

          this.push(`\n  ℹ️ [JSON Event]: ${obj.type || "unknown"}\n`);

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
