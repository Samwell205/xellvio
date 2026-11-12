import { createFileRoute } from '@tanstack/react-router';
import { agentJson, agentOptions, verifyAgent } from '@/lib/blog-agent.server';

export const Route = createFileRoute('/api/public/blog/agent/categories')({
  server: { handlers: {
    OPTIONS: async () => agentOptions(),
    GET: async ({ request }) => {
      const agent = await verifyAgent(request);
      if (!agent) return agentJson({ error: 'Invalid or revoked publishing key' }, 401);
      const { data } = await agent.db.from('blog_categories').select('name,slug').eq('archived', false).order('name');
      return agentJson({ categories: data ?? [] });
    },
  } },
});
