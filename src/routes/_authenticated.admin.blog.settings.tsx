import { createFileRoute } from '@tanstack/react-router';
import { BlogAdmin } from '@/components/blog/BlogAdmin';
import { pageHead } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/admin/blog/settings')({head:()=>pageHead({title:'Blog Settings | Xellvio Admin',description:'Manage blog identity, calls to action and authors.',path:'/admin/blog/settings',robots:'noindex',image:null}),component:()=> <BlogAdmin view="settings"/>});