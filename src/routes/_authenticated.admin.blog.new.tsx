import { createFileRoute } from '@tanstack/react-router';
import { BlogEditor } from '@/components/blog/BlogEditor';
import { pageHead } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/admin/blog/new')({head:()=>pageHead({title:'Create New Post | Xellvio Admin',description:'Write and publish a new Xellvio blog article.',path:'/admin/blog/new',robots:'noindex',image:null}),component:()=> <BlogEditor/>});