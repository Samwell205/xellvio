import type { Database } from '@/integrations/supabase/types';
export type BlogPost = Database['public']['Tables']['content_posts']['Row'];
export type BlogCategory = Database['public']['Tables']['blog_categories']['Row'];
export type BlogAuthor = Database['public']['Tables']['content_authors']['Row'];
export type BlogMedia = Database['public']['Tables']['media_assets']['Row'];
export type BlogSettings = Database['public']['Tables']['blog_settings']['Row'];
export const defaultBlogSettings: BlogSettings = {id:true,title:'Xellvio Blog',description:'Practical ideas for better customer conversations.',cta_label:'Create your Xellvio account',cta_url:'/auth?mode=signup',newsletter_enabled:true};