const postProps = {
  title: { type: 'string', description: 'Article headline' },
  content: { type: 'string', description: 'Full article body. Markdown by default; use ## headings, lists and links. Do not repeat the title as a heading.' },
  content_format: { type: 'string', enum: ['markdown', 'html'], default: 'markdown' },
  excerpt: { type: 'string', description: 'One or two sentence summary shown on blog cards' },
  category: { type: 'string', description: 'Category name, ideally one returned by listCategories' },
  tags: { type: 'array', items: { type: 'string' } },
  slug: { type: 'string', description: 'Optional lowercase URL ending, e.g. black-friday-sms-guide' },
  status: { type: 'string', enum: ['draft', 'published', 'scheduled'], description: 'draft = save for review; published = live now; scheduled = needs scheduled_at' },
  scheduled_at: { type: 'string', format: 'date-time', description: 'Future publish time with timezone offset' },
  featured: { type: 'boolean' },
  featured_image_url: { type: 'string', description: 'Public https link to a PNG/JPEG/WebP image to use as the cover' },
  featured_image_alt: { type: 'string', description: 'Short description of the cover image (required when an image is added and the article is published)' },
  openaiFileIdRefs: { type: 'array', items: { type: 'string' }, description: 'Attach the generated cover image here (ChatGPT file reference)' },
  seo_title: { type: 'string' }, meta_description: { type: 'string', description: 'Search snippet, max ~155 characters' },
  cta_label: { type: 'string' }, cta_url: { type: 'string' },
};
export function agentOpenApi(origin: string) {
  const post = { type: 'object', properties: postProps };
  const res = { '200': { description: 'Saved article with public_url and edit_url' } };
  return {
    openapi: '3.1.0',
    info: { title: 'Xellvio Blog Publishing', version: '1.0.0', description: 'Create, update and publish articles on the Xellvio blog.' },
    servers: [{ url: origin }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } }, schemas: {} },
    security: [{ bearer: [] }],
    paths: {
      '/api/public/blog/agent/categories': { get: { operationId: 'listCategories', summary: 'List blog categories', responses: res } },
      '/api/public/blog/agent/posts/': {
        get: { operationId: 'listRecentPosts', summary: 'List the 20 most recently edited articles', responses: res },
        post: { operationId: 'createPost', summary: 'Create a new article (draft, published or scheduled)', 'x-openai-isConsequential': true, requestBody: { required: true, content: { 'application/json': { schema: { ...post, required: ['title', 'content'] } } } }, responses: res },
      },
      '/api/public/blog/agent/posts/{id}': {
        get: { operationId: 'getPost', summary: 'Read one article', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: res },
        patch: { operationId: 'updatePost', summary: 'Edit an article or change its status (e.g. publish a draft). Send only fields to change.', 'x-openai-isConsequential': true, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: post } } }, responses: res },
      },
    },
  };
}
export const AGENT_INSTRUCTIONS = `You are the Xellvio Blog Writer. Xellvio is an SMS and email marketing platform for small businesses and online stores. You write helpful, practical, original articles and publish them to the Xellvio blog using the connected actions.

How to work:
1. Ask what the article should cover, who it is for, and the tone if I did not say. Call listCategories and pick the best category.
2. Write the full article in Markdown: a strong intro, clear ## sections, short paragraphs, practical examples, and a closing call to action. 900–1,800 words unless I ask otherwise. Never invent statistics, customer names or quotes; say "for example" for illustrations.
3. Also prepare: a short excerpt, an SEO title (under 60 characters), a meta description (under 155 characters), 3–6 tags and a URL slug.
4. If I ask for an image, generate it, show it to me, and once I approve attach it in openaiFileIdRefs with a featured_image_alt description. Videos: put a YouTube link on its own line in the content.
5. Show me the full draft and wait. Never publish without my clear approval.
6. When I say "save as draft", call createPost with status "draft". When I say "publish", use status "published" (or updatePost on an existing draft). When I give a future time, use status "scheduled" with scheduled_at.
7. After saving, reply with the public_url (if published) and the edit_url. If an action returns an error, explain it plainly and fix it.
To edit a published article, call listRecentPosts to find it, then updatePost with only the changed fields.`;
