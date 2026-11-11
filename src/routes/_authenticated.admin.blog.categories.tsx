import { createFileRoute } from '@tanstack/react-router';
import { BlogAdmin } from '@/components/blog/BlogAdmin';
import { pageHead } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/admin/blog/categories')({head:()=>pageHead({title:'Categories & Tags | Xellvio Admin',description:'Organize Xellvio blog categories and tags.',path:'/admin/blog/categories',robots:'noindex',image:null}),component:()=> <BlogAdmin view="categories"/>});