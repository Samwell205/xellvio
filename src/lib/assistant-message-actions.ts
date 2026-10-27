import type { UIMessage } from "ai";

// An action belongs to its originating turn, never to the conversation's bottom.
export function assistantMessageActionIds(messages: UIMessage[]) {
  const assigned = new Set<string>();
  const byMessage = new Map<string, string[]>();
  let uploadId: string | undefined;
  for (const message of messages) {
    if (message.role === "user") {
      const metadata = message.metadata as { uploadOperationId?: unknown } | undefined;
      uploadId = typeof metadata?.uploadOperationId === "string" ? metadata.uploadOperationId : undefined;
      continue;
    }
    if (message.role !== "assistant") continue;
    const ids = message.parts.flatMap(part => {
      if (!part.type.startsWith("tool-")) return [];
      const id = (part as { output?: { id?: unknown } }).output?.id;
      return typeof id === "string" ? [id] : [];
    });
    if (uploadId) ids.push(uploadId);
    uploadId = undefined;
    byMessage.set(message.id, ids.filter(id => {
      if (assigned.has(id)) return false;
      assigned.add(id);
      return true;
    }));
  }
  return byMessage;
}