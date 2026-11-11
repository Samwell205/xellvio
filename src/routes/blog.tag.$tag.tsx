import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { publicBlog } from '@/lib/blog-public.functions';
import { BlogListing } from '@/components/blog/BlogPublic';
import { pageHead } from '@/lib/seo';
export const Route=createFileRoute('/blog/tag/$tag')({validateSearch:(input)=>z.object({q:z.string().optional(),page:z.coerce.number().int().min(0).optional()}).parse(input),loaderDeps:({search})=>search,loader:({params,deps})=>publicBlog({data:{tag:params.tag,search:deps.q||'',page:deps.page||0}}),head:({params})=>pageHead({title:`${params.tag} articles | Xellvio Blog`,description:`Explore Xellvio marketing articles tagged ${params.tag}.`,path:`/blog/tag/${params.tag}`,image:null}),component:TagPage});
function TagPage(){const data=Route.useLoaderData();const params=Route.useParams();const search=Route.useSearch();const navigate=Route.useNavigate();return <BlogListing data={data} tag={params.tag} page={search.page||0} onSearch={q=>navigate({search:{q,page:0}})} onPage={page=>navigate({search:{...search,page}})}/>;}