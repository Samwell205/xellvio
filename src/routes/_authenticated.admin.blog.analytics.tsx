import { createFileRoute } from '@tanstack/react-router';
import { BlogAdmin } from '@/components/blog/BlogAdmin';
import { pageHead } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/admin/blog/analytics')({head:()=>pageHead({title:'Blog Analytics | Xellvio Admin',description:'Measure article views, engagement and newsletter subscriptions.',path:'/admin/blog/analytics',robots:'noindex',image:null}),component:()=> <BlogAdmin view="analytics"/>});