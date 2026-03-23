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
          
          const divider = "────────────────────────────────────────";
          
          if (obj.type === "stream_event") {
            const ev = obj.event;
            if (ev?.type === "content_block_start") {
              if (ev.content_block?.type === "tool_use") {
                this.push(`\n${divider}\nTool Use: ${ev.content_block.name}\n${divider}\n`);
              } else if (ev.content_block?.type === "text") {
                this.push(`\n${divider}\nAssistant\n${divider}\n`);
              }
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
                if (resStr.length > 500) resStr = resStr.substring(0, 500) + "...";
                this.push(`\n${divider}\nTool Result\n${divider}\n${resStr.replace(/\\n/g, "\n")}\n`);
              } else if (item.type === "text") {
                this.push(`\n${divider}\nUser\n${divider}\n${String(item.text)}\n`);
              }
            }
            continue;
          }
          
          if (obj.type === "step") {
            this.push(`\n${divider}\nStep: ${obj.name || "Unknown Step"}\n${divider}\n`);
            continue;
          }
          
          if (obj.tool_use_result) {
             this.push(`\n${divider}\nAction: ${obj.tool_use_result.type}\n${divider}\nTarget: ${obj.tool_use_result.filePath}\n`);
             continue;
          }
          
          if (obj.type === "error" || obj.error) {
            this.push(`\n${divider}\nAPI Error\n${divider}\n${JSON.stringify(obj, null, 2)}\n`);
            continue;
          }

          if (obj.type === "assistant" || obj.type === "model" || obj.type === "result" || obj.type === "system" || obj.type === "rate_limit_event") {
            continue;
          }

          this.push(`\n${divider}\nEvent: ${obj.type || "unknown"}\n${divider}\n`);

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
