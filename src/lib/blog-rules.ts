import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';

export const BLOG_CATEGORIES = ['SMS Marketing','Email Marketing','Marketing Automation','Customer Engagement','Ecommerce Marketing','Lead Generation','Tutorials & Guides','Industry Insights','Product Updates'];
export const slugify = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120);
export const safeBlogUrl = (value: string) => /^https:\/\/[^\s]+$/i.test(value) || /^\/(?!\/)[^\s]*$/.test(value);
const link = z.string().max(2000).refine(v => !v || safeBlogUrl(v), 'Use an HTTPS URL or a local page path');
export const blogPostSchema = z.object({
  id: z.string().uuid().optional(), version: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(250), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  excerpt: z.string().max(1000).default(''), body: z.string().max(500000).default(''),
  status: z.enum(['draft','in_review','published','scheduled','archived']).default('draft'),
  topic: z.string().max(120).default('sms-marketing'), tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  author_id: z.string().uuid().nullable().default(null), featured: z.boolean().default(false),
  featured_image: link.nullable().default(null), image_alt: z.string().max(500).nullable().default(null),
  seo_title: z.string().max(250).nullable().default(null), meta_description: z.string().max(1000).nullable().default(null),
  canonical_url: link.nullable().default(null), og_image: link.nullable().default(null),
  og_title: z.string().max(250).nullable().default(null), og_description: z.string().max(1000).nullable().default(null),
  indexable: z.boolean().default(true), visibility: z.enum(['public','private']).default('public'),
  scheduled_at: z.string().datetime().nullable().default(null), cta_label: z.string().max(150).nullable().default(null), cta_url: link.nullable().default(null),
});
export type BlogPostInput = z.infer<typeof blogPostSchema>;
export function cleanBlogHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ['p','br','h1','h2','h3','h4','strong','b','em','i','u','s','ul','ol','li','blockquote','a','img','table','thead','tbody','tr','th','td','hr','pre','code','iframe','div'],
    allowedAttributes: { '*': ['id'], a:['href','target','rel','data-cta'], img:['src','alt','width','height','loading'], iframe:['src','width','height','allowfullscreen','frameborder'], th:['colspan','rowspan'],td:['colspan','rowspan'],p:['style'],h1:['style'],h2:['style'],h3:['style'],h4:['style'] },
    allowedSchemes: ['https'], allowProtocolRelative: false,
    allowedIframeHostnames: ['www.youtube.com','www.youtube-nocookie.com'],
    allowedStyles: { '*': {'text-align': [/^(left|center|right|justify)$/]} },
    transformTags: {
      a: (tag, attrs) => ({tagName:tag,attribs:{...attrs,href: safeBlogUrl(attrs.href || '') ? attrs.href : '',rel:'noopener noreferrer'}}),
      img: (tag, attrs) => ({tagName:tag,attribs:{...attrs,src:safeBlogUrl(attrs.src || '') ? attrs.src : '',loading:'lazy'}}),
    },
  });
}
export function articleDocument(html: string) {
  const toc: {id:string;title:string;level:number}[]=[];
  const clean = cleanBlogHtml(html).replace(/<h([1-4])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi, (_,level,inside) => {
    const title=sanitizeHtml(inside,{allowedTags:[],allowedAttributes:{}});
    const id=`${slugify(title) || 'section'}-${toc.length+1}`;
    toc.push({id,title,level:Number(level)});
    return `<h${level} id="${id}">${inside}</h${level}>`;
  });
  const words=sanitizeHtml(clean,{allowedTags:[],allowedAttributes:{}}).split(/\s+/).filter(Boolean).length;
  return {html:clean,toc,words,minutes:Math.max(1,Math.ceil(words/200))};
}
export function validatePublishing(post: BlogPostInput, now = Date.now()) {
  if (!['published','scheduled'].includes(post.status)) return;
  if (!articleDocument(post.body).words) throw new Error('Add article content before publishing');
  if (post.featured_image && !post.image_alt?.trim()) throw new Error('Add featured image alt text before publishing');
  if (post.status==='scheduled' && (!post.scheduled_at || Date.parse(post.scheduled_at)<=now)) throw new Error('Choose a future publishing date and time');
}
export function canEditPost(role: string | null, userId:string, post:{created_by:string|null;status:string}) {
  return role==='admin' || role==='editor' || (role==='writer' && post.created_by===userId && ['draft','in_review'].includes(post.status));
}