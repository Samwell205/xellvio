import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import type { LegalDoc } from "@/content/legal";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  // Extract h2 headings for ToC
  const headings = useMemo(() => {
    const out: { id: string; text: string }[] = [];
    const re = /^##\s+(.+?)\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(doc.markdown))) out.push({ id: slugify(m[1]), text: m[1] });
    return out;
  }, [doc.markdown]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12 md:py-16">
          {doc.toc && headings.length > 2 && (
            <nav aria-label="On this page" className="mb-10 rounded-xl border border-border bg-muted/30 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">On this page</div>
              <ol className="space-y-1.5 text-sm">
                {headings.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="text-foreground/80 hover:text-primary hover:underline">{h.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className="legal-prose">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSlug]}
              components={{
                table: (props) => (
                  <div className="my-6 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm" {...props} />
                  </div>
                ),
                thead: (props) => <thead className="bg-muted/50" {...props} />,
                th: (props) => <th className="text-left px-3 py-2 font-semibold border-b border-border" {...props} />,
                td: (props) => <td className="px-3 py-2 align-top border-b border-border/60" {...props} />,
                a: ({ href, ...rest }) => (
                  <a href={href} className="text-primary hover:underline" target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noopener noreferrer" : undefined} {...rest} />
                ),
              }}
            >
              {doc.markdown}
            </ReactMarkdown>
          </div>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}
