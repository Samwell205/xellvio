type Operation = {
  id: string;
  kind: string;
  status: string;
  expires_at: string;
  arguments: unknown;
  outcome: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Only server-persisted tool outputs may identify actions for this conversation.
export function conversationOperationIds(messages: unknown[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    const m = record(message);
    if (m.role !== "assistant" || !Array.isArray(m.parts)) continue;
    for (const part of m.parts) {
      const p = record(part);
      if (typeof p.type !== "string" || !p.type.startsWith("tool-")) continue;
      const id = record(p.output).id;
      if (
        typeof id === "string" &&
        /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)
      )
        ids.add(id);
    }
  }
  return [...ids].slice(-50);
}

export function summarizeOperationContext(operations: Operation[], now = Date.now()) {
  return operations.map((op) => {
    const args = record(op.arguments);
    const outcome = record(op.outcome);
    return {
      id: op.id,
      kind: op.kind,
      name: typeof args.name === "string" ? args.name.slice(0, 200) : undefined,
      status: op.status === "pending" && Date.parse(op.expires_at) <= now ? "expired" : op.status,
      outcome: Object.fromEntries(
        ["formId", "campaignId", "listId"].flatMap((key) =>
          typeof outcome[key] === "string" ? [[key, outcome[key]]] : [],
        ),
      ),
    };
  });
}
