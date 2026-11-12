import { createFileRoute } from '@tanstack/react-router';
import { agentJson } from '@/lib/blog-agent.server';
import { agentOpenApi } from '@/lib/blog-agent-spec';

export const Route = createFileRoute('/api/public/blog/agent/openapi.json')({
  server: { handlers: { GET: async ({ request }) => agentJson(agentOpenApi(new URL(request.url).origin)) } },
});
