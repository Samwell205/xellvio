import { createFileRoute } from '@tanstack/react-router';
import { BlogAdmin } from '@/components/blog/BlogAdmin';
import { pageHead } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/admin/blog/posts/')({head:()=>pageHead({title:'All Blog Posts | Xellvio Admin',description:'Search, edit and manage Xellvio articles.',path:'/admin/blog/posts',robots:'noindex',image:null}),component:()=> <BlogAdmin view="posts"/>});