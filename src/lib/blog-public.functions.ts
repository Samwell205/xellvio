import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { articleDocument } from './blog-rules';
import { defaultBlogSettings } from './blog.types';

export const publicBlog = createServerFn({method:'GET'})
 .inputValidator((input:unknown)=>z.object({slug:z.string().max(120).optional(),category:z.string().max(120).optional(),tag:z.string().max(60).optional(),search:z.string().max(100).default(''),page:z.number().int().min(0).max(10000).default(0)}).parse(input ?? {}))
 .handler(async({data})=>{
  const url=process.env['SUPABASE_URL'];const key=process.env['SUPABASE_PUBLISHABLE_KEY'];if(!url||!key)throw new Error('Blog is unavailable');
  const db=createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{const h=new Headers(init?.headers);if(key.startsWith('sb_')&&h.get('Authorization')===`Bearer ${key}`)h.delete('Authorization');h.set('apikey',key);return fetch(input,{...init,headers:h});}}});
  const [categories,settings]=await Promise.all([db.from('blog_categories').select('*').eq('archived',false).order('name'),db.from('blog_settings').select('*').maybeSingle()]);
  const publicFields='id,slug,title,excerpt,body,featured_image,image_alt,topic,tags,author_id,seo_title,meta_description,canonical_url,og_image,og_title,og_description,indexable,featured,published_at,updated_at,cta_label,cta_url';
  let query=db.from('content_posts').select(publicFields,{count:'exact'}).eq('status','published').eq('visibility','public').lte('published_at',new Date().toISOString()).order('published_at',{ascending:false});
  if(data.slug)query=query.eq('slug',data.slug);
  if(data.category)query=query.eq('topic',data.category);
  if(data.tag)query=query.contains('tags',[data.tag]);
  if(data.search)query=query.ilike('title',`%${data.search.replace(/[%_]/g,'')}%`);
  const {data:posts,error,count}=await query.range(data.page*12,data.page*12+11);
  if(error)throw new Error(error.message);
  let redirectSlug:string|null=null;
  if(data.slug&&!posts?.length){const {data:redirect}=await db.from('blog_redirects').select('post_id').eq('old_slug',data.slug).maybeSingle();if(redirect){const {data:target}=await db.from('content_posts').select('slug').eq('id',redirect.post_id).maybeSingle();redirectSlug=target?.slug ?? null;}}
  const authorIds=[...new Set((posts ?? []).map(p=>p.author_id).filter((id):id is string=>!!id))];
  const {data:authors}=authorIds.length?await db.from('content_authors').select('id,name,bio,title,avatar_url').in('id',authorIds):{data:[]};
  const related=data.slug&&posts?.[0]?await db.from('content_posts').select('id,slug,title,excerpt,featured_image,image_alt,topic,published_at').eq('status','published').eq('visibility','public').eq('topic',posts[0].topic).neq('slug',data.slug).order('published_at',{ascending:false}).limit(3):{data:[]};
  const wantPopular=!data.slug&&!data.category&&!data.tag&&!data.search&&!data.page;
  const popular=wantPopular?((await db.rpc('blog_popular',{_limit:4})).data ?? []):null;
  return {popular:popular&&popular.map(p=>({...p,minutes:Math.max(1,Math.ceil((p.words||0)/200))})),posts:(posts ?? []).map(p=>({...p,document:articleDocument(p.body)})),count:count ?? 0,categories:categories.data ?? [],settings:settings.data ?? defaultBlogSettings,authors:authors ?? [],related:related.data ?? [],redirectSlug};
 });

export const recordBlogEvent=createServerFn({method:'POST'})
 .inputValidator((input:unknown)=>z.object({slug:z.string().regex(/^[a-z0-9-]+$/).max(120),event:z.enum(['blog_view','blog_engaged','blog_cta']),session:z.string().uuid(),source:z.string().max(120).default('direct')}).parse(input))
 .handler(async({data})=>{const {supabaseAdmin}=await import('@/integrations/supabase/client.server');await supabaseAdmin.rpc('blog_record_event',{_slug:data.slug,_event:data.event,_session:data.session,_source:data.source});return {ok:true};});

export const subscribeBlog=createServerFn({method:'POST'})
 .inputValidator((input:unknown)=>z.object({email:z.string().trim().email().max(254),consent:z.literal(true),website:z.string().max(200).default('')}).parse(input))
 .handler(async({data})=>{
  if(data.website)return {ok:true};
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {error}=await supabaseAdmin.from('blog_subscriptions').upsert({email:data.email.toLowerCase(),consent_text:'I agree to receive Xellvio marketing tips by email and can unsubscribe at any time.',source:'/blog'},{onConflict:'email',ignoreDuplicates:true});
  if(error)throw new Error('Could not save your subscription. Please try again.');return {ok:true};
 });