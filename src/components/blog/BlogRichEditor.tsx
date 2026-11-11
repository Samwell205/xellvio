import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import Youtube from '@tiptap/extension-youtube';
import { Bold, Italic, Underline, List, ListOrdered, Quote, Link, ImagePlus, Video, Table2, Minus, Code, Undo2, Redo2, AlignLeft, AlignCenter, AlignRight, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect, useState } from 'react';
import { safeBlogUrl } from '@/lib/blog-rules';

export function BlogRichEditor({html,onChange,onUpload}:{html:string;onChange:(html:string)=>void;onUpload:()=>void}){
 const [insert,setInsert]=useState<'link'|'video'|'cta'|null>(null);const [url,setUrl]=useState('');const [label,setLabel]=useState('');
 const editor=useEditor({extensions:[StarterKit.configure({heading:{levels:[1,2,3,4]}}),Image,TextAlign.configure({types:['heading','paragraph']}),Table.configure({resizable:true}),TableRow,TableHeader,TableCell,Youtube.configure({nocookie:true})],content:html,immediatelyRender:false,onUpdate:({editor})=>onChange(editor.getHTML()),editorProps:{attributes:{class:'blog-prose min-h-[440px] px-6 py-8 outline-none','aria-label':'Article content'}}});
 useEffect(()=>{if(editor&&html!==editor.getHTML())editor.commands.setContent(html,{emitUpdate:false});},[html,editor]);
 if(!editor)return <div className="h-96 bg-muted"/>;
 const tool=(name:string,Icon:typeof Bold,action:()=>void,active=false)=><Button key={name} type="button" variant={active?'secondary':'ghost'} size="icon" title={name} aria-label={name} onClick={action} className="size-9 shrink-0"><Icon className="size-4"/></Button>;
 return <div className="overflow-hidden rounded-lg border border-border bg-card"><div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 p-2">
 <select aria-label="Paragraph style" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={editor.isActive('heading',{level:1})?'1':editor.isActive('heading',{level:2})?'2':editor.isActive('heading',{level:3})?'3':editor.isActive('heading',{level:4})?'4':'p'} onChange={e=>{const level=Number(e.target.value);if(level>=1&&level<=4)editor.chain().focus().toggleHeading({level:level as 1|2|3|4}).run();else editor.chain().focus().setParagraph().run();}}><option value="p">Paragraph</option>{[1,2,3,4].map(l=><option key={l} value={l}>Heading {l}</option>)}</select>
 {tool('Bold',Bold,()=>{editor.chain().focus().toggleBold().run();},editor.isActive('bold'))}{tool('Italic',Italic,()=>{editor.chain().focus().toggleItalic().run();},editor.isActive('italic'))}{tool('Underline',Underline,()=>{editor.chain().focus().toggleUnderline().run();},editor.isActive('underline'))}
 {tool('Bulleted list',List,()=>{editor.chain().focus().toggleBulletList().run();})}{tool('Numbered list',ListOrdered,()=>{editor.chain().focus().toggleOrderedList().run();})}{tool('Quote',Quote,()=>{editor.chain().focus().toggleBlockquote().run();})}
 {tool('Align left',AlignLeft,()=>{editor.chain().focus().setTextAlign('left').run();})}{tool('Align center',AlignCenter,()=>{editor.chain().focus().setTextAlign('center').run();})}{tool('Align right',AlignRight,()=>{editor.chain().focus().setTextAlign('right').run();})}
 {tool('Insert link',Link,()=>{setInsert('link');setUrl(editor.getAttributes('link').href || '');setLabel('');})}{tool('Upload image',ImagePlus,onUpload)}{tool('Embed video',Video,()=>{setInsert('video');setUrl('');})}{tool('Insert table',Table2,()=>{editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run();})}{tool('Divider',Minus,()=>{editor.chain().focus().setHorizontalRule().run();})}{tool('Code block',Code,()=>{editor.chain().focus().toggleCodeBlock().run();})}{tool('Call to action',MousePointerClick,()=>{setInsert('cta');setUrl('/auth?mode=signup');setLabel('Create your account');})}
 {tool('Undo',Undo2,()=>{editor.chain().focus().undo().run();})}{tool('Redo',Redo2,()=>{editor.chain().focus().redo().run();})}</div><EditorContent editor={editor}/>
 <Dialog open={!!insert} onOpenChange={open=>{if(!open)setInsert(null);}}><DialogContent><DialogHeader><DialogTitle>{insert==='video'?'Embed YouTube video':insert==='cta'?'Add call to action':'Add article or website link'}</DialogTitle></DialogHeader><Input aria-label="Link URL" placeholder={insert==='video'?'https://www.youtube.com/watch?v=…':'https://… or /blog/article-slug'} value={url} onChange={e=>setUrl(e.target.value)}/>{insert==='cta'&&<Input aria-label="Button text" value={label} onChange={e=>setLabel(e.target.value)}/>}<Button disabled={!safeBlogUrl(url)} onClick={()=>{if(insert==='video'){if(/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url))editor.commands.setYoutubeVideo({src:url});}else if(insert==='cta'){editor.chain().focus().insertContent({type:'paragraph',content:[{type:'text',text:label || 'Learn more',marks:[{type:'link',attrs:{href:url}}]}]}).run();}else editor.chain().focus().extendMarkRange('link').setLink({href:url}).run();setInsert(null);}}>Insert</Button></DialogContent></Dialog>
 </div>;
}