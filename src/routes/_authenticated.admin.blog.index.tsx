import { createFileRoute } from '@tanstack/react-router';
import { BlogAdmin } from '@/components/blog/BlogAdmin';
import { pageHead } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/admin/blog/')({head:()=>pageHead({title:'Blog Overview | Xellvio Admin',description:'Manage Xellvio articles and publishing performance.',path:'/admin/blog',robots:'noindex',image:null}),component:()=> <BlogAdmin view="overview"/>});