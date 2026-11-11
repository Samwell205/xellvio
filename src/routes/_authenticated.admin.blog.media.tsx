import { createFileRoute } from '@tanstack/react-router';
import { BlogAdmin } from '@/components/blog/BlogAdmin';
import { pageHead } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/admin/blog/media')({head:()=>pageHead({title:'Blog Media Library | Xellvio Admin',description:'Upload and manage article images and alt text.',path:'/admin/blog/media',robots:'noindex',image:null}),component:()=> <BlogAdmin view="media"/>});