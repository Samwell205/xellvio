import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { publicBlog } from '@/lib/blog-public.functions';
import { BlogListing } from '@/components/blog/BlogPublic';
import { pageHead } from '@/lib/seo';
const searchSchema=z.object({q:z.string().max(100).optional(),page:z.coerce.number().int().min(0).optional()});
const options=(search:{q?:string;page?:number})=>queryOptions({queryKey:['public-blog',search],queryFn:()=>publicBlog({data:{search:search.q||'',page:search.page||0}})});
export const Route=createFileRoute('/blog/')({validateSearch:(input)=>searchSchema.parse(input),loaderDeps:({search})=>search,loader:({context,deps})=>context.queryClient.ensureQueryData(options(deps)),head:({loaderData})=>pageHead({title:loaderData?.settings.title || 'Xellvio Blog',description:loaderData?.settings.description || 'SMS marketing insights, strategies and resources from Xellvio.',path:'/blog',image:null}),component:BlogPage});
function BlogPage(){const search=Route.useSearch();const navigate=Route.useNavigate();const {data}=useSuspenseQuery(options(search));return <BlogListing data={data} page={search.page||0} onSearch={q=>navigate({search:{q,page:0}})} onPage={page=>navigate({search:{...search,page}})}/>;}