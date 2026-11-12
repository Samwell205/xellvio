import { agentPostInput } from "@/lib/blog-agent.server";

/** Same validated fields as the ChatGPT publishing API, minus ChatGPT-only file references. */
const { openaiFileIdRefs: _omit, ...fields } = agentPostInput.shape;
export const blogPostFields = fields;
