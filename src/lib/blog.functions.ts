import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { blogPostSchema, cleanBlogHtml, validatePublishing, canEditPost, safeBlogUrl } from './blog-rules';
import { defaultBlogSettings } from './blog.types';

export const blogAdminData = createServerFn({method:'GET'}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>z.object({id:z.string().uuid().optional(),page:z.number().int().min(0).default(0),search:z.string().max(100).default(''),status:z.string().max(30).default(''),topic:z.string().max(120).default(''),author:z.string().default(''),sort:z.enum(['updated_at','title','published_at']).default('updated_at')}).parse(input ?? {}))
 .handler(async({context,data})=>{
  const db=context.supabase; const {data:role,error:roleError}=await db.rpc('blog_role');
  if(roleError || !role) throw new Error('Content management access required');
  let query=db.from('content_posts').select('*',{count:'exact'}).order(data.sort,{ascending:data.sort==='title'}).range(data.page*30,data.page*30+29);
  if(data.id) query=query.eq('id',data.id);
  if(data.search) query=query.ilike('title',`%${data.search.replace(/[%_]/g,'')}%`);
  if(data.status) query=query.eq('status',data.status as 'draft');
  if(data.topic) query=query.eq('topic',data.topic);
  if(data.author) query=query.eq('author_id',data.author);
  const [posts,categories,authors,settings,media,revisions]=await Promise.all([
   query,db.from('blog_categories').select('*').order('name'),db.from('content_authors').select('*').order('name'),db.from('blog_settings').select('*').maybeSingle(),
   db.from('media_assets').select('*').eq('blog_asset',true).order('created_at',{ascending:false}).limit(200),
   data.id?db.from('blog_revisions').select('*').eq('post_id',data.id).order('created_at',{ascending:false}).limit(30):Promise.resolve({data:[]}),
  ]);
  if(posts.error) throw new Error(posts.error.message);
  return {role,posts:posts.data ?? [],count:posts.count ?? 0,categories:categories.data ?? [],authors:authors.data ?? [],settings:settings.data ?? defaultBlogSettings,media:media.data ?? [],revisions:revisions.data ?? []};
 });

export const blogSavePost=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>blogPostSchema.parse(input))
 .handler(async({context,data})=>{
  const db=context.supabase; const {data:role}=await db.rpc('blog_role');
  if(!role) throw new Error('Content management access required');
  const {id,version,...values}=data;
  if(role==='writer' && !['draft','in_review'].includes(values.status)) throw new Error('Writers must submit drafts for review');
  let existing;
  if(id){const result=await db.from('content_posts').select('created_by,status,version').eq('id',id).single(); existing=result.data;
   if(!existing || !canEditPost(role,context.userId,existing)) throw new Error('You cannot edit this article');
   if(version!==existing.version) throw new Error('This article changed in another session. Reload before saving.');
  }
  values.body=cleanBlogHtml(values.body); validatePublishing({...data,body:values.body});
  const {data:reserved}=await db.from('blog_redirects').select('post_id').eq('old_slug',values.slug).maybeSingle();
  if(reserved && reserved.post_id!==id) throw new Error('This URL belongs to a previous article');
  const query=id ? db.from('content_posts').update(values).eq('id',id).eq('version',version ?? 0) : db.from('content_posts').insert({...values,created_by:context.userId});
  const {data:row,error}=await query.select('*').single();
  if(error) throw new Error(error.code==='23505'?'That URL slug is already in use':error.message);
  return row;
 });

export const blogDeletePost=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({id:z.string().uuid()}).parse(input))
 .handler(async({context,data})=>{const {data:role}=await context.supabase.rpc('blog_role'); if(role!=='admin') throw new Error('Only administrators may delete articles'); const {error}=await context.supabase.from('content_posts').delete().eq('id',data.id); if(error) throw new Error(error.message); return {ok:true};});

export const blogSaveCategory=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>z.object({id:z.string().uuid().optional(),name:z.string().trim().min(1).max(120),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),description:z.string().max(2000).default(''),seo_title:z.string().max(250).nullable().default(null),meta_description:z.string().max(1000).nullable().default(null),image_url:z.string().refine(v=>!v||safeBlogUrl(v)).nullable().default(null),archived:z.boolean().default(false)}).parse(input))
 .handler(async({context,data})=>{const {data:role}=await context.supabase.rpc('blog_role');if(!['admin','editor'].includes(role ?? '')) throw new Error('Editor access required'); const {id,...values}=data;
 if(id && values.archived){const {count}=await context.supabase.from('content_posts').select('id',{count:'exact',head:true}).eq('topic',values.slug);if(count) throw new Error('Move articles to another category before archiving');}
 if(id){const {data:old}=await context.supabase.from('blog_categories').select('slug').eq('id',id).single();if(old && old.slug!==values.slug) throw new Error('Category URLs are permanent; create a new category and reassign articles');}
 const {data:row,error}=await (id?context.supabase.from('blog_categories').update(values).eq('id',id):context.supabase.from('blog_categories').insert(values)).select('*').single();if(error) throw new Error(error.message);return row;});

export const blogSaveAuthor=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({id:z.string().uuid().optional(),name:z.string().min(1).max(120),slug:z.string().regex(/^[a-z0-9-]+$/),bio:z.string().max(2000).default(''),title:z.string().max(120).default('')}).parse(input))
 .handler(async({context,data})=>{const {data:role}=await context.supabase.rpc('blog_role');if(!['admin','editor'].includes(role ?? '')) throw new Error('Editor access required');const {id,...values}=data;const {data:row,error}=await(id?context.supabase.from('content_authors').update(values).eq('id',id):context.supabase.from('content_authors').insert(values)).select('*').single();if(error) throw new Error(error.message);return row;});

export const blogSaveSettings=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({title:z.string().min(1).max(120),description:z.string().max(1000),cta_label:z.string().min(1).max(150),cta_url:z.string().refine(safeBlogUrl),newsletter_enabled:z.boolean()}).parse(input))
 .handler(async({context,data})=>{const {data:role}=await context.supabase.rpc('blog_role');if(role!=='admin') throw new Error('Administrator access required');const {error}=await context.supabase.from('blog_settings').upsert({...data,id:true});if(error)throw new Error(error.message);return {ok:true};});

export const blogMediaAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>z.object({action:z.enum(['upload','confirm','rename','delete']),id:z.string().uuid().optional(),name:z.string().max(200).default('image'),alt:z.string().max(500).default(''),path:z.string().max(300).optional(),type:z.enum(['image/png','image/jpeg','image/webp','image/gif','image/avif']).default('image/jpeg'),size:z.number().int().min(1).max(10*1024*1024).default(1)}).parse(input))
 .handler(async({context,data})=>{
  const {data:role}=await context.supabase.rpc('blog_role'); if(!role)throw new Error('Content management access required');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  if(data.action==='upload'){const ext=data.type.split('/')[1];const path=`${context.userId}/blog/${crypto.randomUUID()}.${ext}`;const {data:signed,error}=await db.storage.from('tenant-media').createSignedUploadUrl(path);if(error||!signed)throw new Error(error?.message ?? 'Upload unavailable');return {path,token:signed.token,bucket:'tenant-media'};}
  if(data.action==='confirm'){
   if(!data.path?.startsWith(`${context.userId}/blog/`))throw new Error('Invalid upload path');
   const {data:file,error:infoError}=await db.storage.from('tenant-media').info(data.path);
   if(infoError||!file)throw new Error('Upload was not completed');
   const metadata=file.metadata as {size?:number;mimetype?:string};
   if(!metadata || (metadata.size ?? 0)>10*1024*1024 || !['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(metadata.mimetype ?? ''))throw new Error('Invalid uploaded image');
   const {error}=await db.from('media_assets').insert({account_id:context.userId,created_by:context.userId,name:data.name,alt_text:data.alt,kind:'image',content_type:metadata.mimetype ?? data.type,size:metadata.size ?? data.size,storage_path:data.path,url:`/api/public/media/${data.path}`,blog_asset:true});if(error)throw new Error(error.message);return {ok:true};
  }
  if(!data.id)throw new Error('Select an image');
  const {data:asset}=await context.supabase.from('media_assets').select('*').eq('id',data.id).eq('blog_asset',true).single();if(!asset)throw new Error('Image not found');
  if(role==='writer' && asset.created_by!==context.userId)throw new Error('You may only manage your own uploads');
  if(data.action==='rename'){const {error}=await db.from('media_assets').update({name:data.name,alt_text:data.alt}).eq('id',data.id);if(error)throw new Error(error.message);return {ok:true};}
  const {count}=await db.from('content_posts').select('id',{count:'exact',head:true}).or(`featured_image.eq.${asset.url},og_image.eq.${asset.url},body.ilike.%${asset.url}%`);
  if(count)throw new Error('This image is used by an article; remove it from the article first');
  const {error}=await db.storage.from('tenant-media').remove([asset.storage_path]);if(error)throw new Error(error.message);await db.from('media_assets').delete().eq('id',asset.id);return {ok:true};
 });

export const blogAnalytics=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {data:role}=await context.supabase.rpc('blog_role');if(!['admin','editor'].includes(role ?? ''))throw new Error('Editor access required');
 const {data,error}=await context.supabase.rpc('blog_metrics');if(error)throw new Error(error.message);return data;
});