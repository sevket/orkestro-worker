/**
 * Turns a failed agent run's stdout/stderr buffer into a Kanban-readable
 * error comment, so a human sees "out of credit" instead of "exit 1".
 */

/**
 * Returns the first balanced JSON object starting at or after `from`.
 * A brace counter is used (string-aware) because agent error payloads are
 * nested, which a non-greedy regex cannot handle.
 */
export function findJsonObject(text: string, from = 0): string | null {
  const start = text.indexOf("{", from);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

export function describeAgentFailure(outputBuffer: string, exitCode: number | null): string {
  const code = exitCode ?? 1;

  const apiErrorIndex = outputBuffer.indexOf("API Error");
  if (apiErrorIndex !== -1) {
    const payload = findJsonObject(outputBuffer, apiErrorIndex);
    if (payload) {
      try {
        const errObj = JSON.parse(payload);
        const msg = errObj.message?.content?.[0]?.text || errObj.error?.message || errObj.error;
        if (msg) return `🚨 **Ajan API Hatası (Exit ${code})**:\n${typeof msg === "string" ? msg : JSON.stringify(msg)}`;
      } catch {
        // malformed payload: fall through to the generic messages below
      }
    }
  }

  if (outputBuffer.includes("Credit balance is too low") || outputBuffer.includes("rate_limit")) {
    return `🚨 **Ajan API Hatası (Exit ${code})**:\nKredi bakiyesi yetersiz veya Rate-Limit engeli (You've hit your limit).`;
  }

  return `🚨 **Ajan Başarısız (Exit ${code})**:\nAjan beklenmedik bir şekilde çöktü. Lütfen Terminal loglarını inceleyiniz.`;
}
