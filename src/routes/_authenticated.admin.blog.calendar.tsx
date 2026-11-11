import { createFileRoute } from '@tanstack/react-router';
import { BlogAdmin } from '@/components/blog/BlogAdmin';
import { pageHead } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/admin/blog/calendar')({head:()=>pageHead({title:'Publishing Calendar | Xellvio Admin',description:'Review scheduled Xellvio articles and publication dates.',path:'/admin/blog/calendar',robots:'noindex',image:null}),component:()=> <BlogAdmin view="calendar"/>});