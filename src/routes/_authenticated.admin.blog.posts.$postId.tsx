import { createFileRoute } from '@tanstack/react-router';
import { BlogEditor } from '@/components/blog/BlogEditor';
import { pageHead } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/admin/blog/posts/$postId')({head:()=>pageHead({title:'Edit Blog Article | Xellvio Admin',description:'Edit article content, images and publishing settings.',path:'/admin/blog/posts',robots:'noindex',image:null}),component:PostEditor});
function PostEditor(){const {postId}=Route.useParams();return <BlogEditor key={postId} id={postId}/>;}