import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Check, Copy, ExternalLink, RefreshCw, Terminal } from "lucide-react";
import { toast } from "sonner";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/connect")({
  head: () =>
    pageHead({
      path: "/connect",
      title: "Connect an AI Assistant to Xellvio",
      description:
        "Connect ChatGPT, Claude or any MCP-compatible AI assistant to your Xellvio workspace and manage contacts, campaigns and reports in natural language.",
    }),
  component: ConnectPage,
});

function useMcpUrl() {
  const [mcpUrl, setMcpUrl] = useState("");
  useEffect(() => {
    setMcpUrl(new URL("/mcp", window.location.origin).toString());
  }, []);
  return mcpUrl;
}

function ConnectPage() {
  const mcpUrl = useMcpUrl();
  const appNameSlug = "xellvio";

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <section className="hero-gradient border-b">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 md:py-24 text-center">
            <Badge variant="outline" className="bg-background/70">
              <Bot className="mr-1 size-3" /> Agent integrations
            </Badge>
            <h1 className="mt-5 text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.1]">
              Connect an AI assistant to Xellvio
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
              Link ChatGPT, Claude, or Claude Code to your Xellvio workspace and manage campaigns,
              check delivery reports, and review replies with natural language.
            </p>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 space-y-10">
            <McpUrlCard mcpUrl={mcpUrl} />

            <div>
              <h2 className="text-xl font-bold mb-4">Choose your assistant</h2>
              <Tabs defaultValue="chatgpt">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
                  <TabsTrigger value="claude">Claude</TabsTrigger>
                  <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
                  <TabsTrigger value="other">Other</TabsTrigger>
                </TabsList>
                <TabsContent value="chatgpt" className="mt-4">
                  <Card className="p-6">
                    <h3 className="font-semibold">Connect ChatGPT</h3>
                    <ol className="mt-4 space-y-3 text-sm text-muted-foreground list-decimal pl-4">
                      <li>
                        Open{" "}
                        <a
                          href="https://chatgpt.com/#settings/Connectors/Advanced"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          ChatGPT Apps <ExternalLink className="size-3" />
                        </a>{" "}
                        and enable Developer mode if prompted.
                      </li>
                      <li>
                        Click the <strong>Create app</strong> button.
                      </li>
                      <li>
                        Name the connector (for example, “Xellvio”) and paste the MCP URL above.
                      </li>
                      <li>
                        Click <strong>Create</strong>.
                      </li>
                      <li>
                        Enable the app from the chat composer, then ask ChatGPT to use Xellvio.
                      </li>
                    </ol>
                  </Card>
                </TabsContent>
                <TabsContent value="claude" className="mt-4">
                  <Card className="p-6">
                    <h3 className="font-semibold">Connect Claude</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Click the button below to open Claude’s custom connector dialog with the name
                      and URL prefilled.
                    </p>
                    <div className="mt-4">
                      <Button asChild size="sm">
                        <a
                          href={
                            mcpUrl
                              ? `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent("Xellvio")}&connectorUrl=${encodeURIComponent(mcpUrl)}`
                              : undefined
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open Claude connector <ExternalLink className="ml-1 size-3" />
                        </a>
                      </Button>
                    </div>
                    <ol className="mt-5 space-y-3 text-sm text-muted-foreground list-decimal pl-4">
                      <li>
                        Review the details in the dialog and click <strong>Add</strong>.
                      </li>
                      <li>
                        If the prefilled form does not open, go to Claude’s Connectors page, choose{" "}
                        <strong>Add custom connector</strong>, name it “Xellvio,” and paste the MCP
                        URL above.
                      </li>
                      <li>
                        Enable the connector from the chat composer, then ask Claude to use Xellvio.
                      </li>
                    </ol>
                  </Card>
                </TabsContent>
                <TabsContent value="claude-code" className="mt-4">
                  <Card className="p-6">
                    <h3 className="font-semibold">Connect Claude Code</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Run this one-line command in your terminal. It installs the Xellvio MCP server
                      for your user profile.
                    </p>
                    <div className="mt-4 relative">
                      <pre className="rounded-lg bg-muted p-4 pr-10 text-sm font-mono overflow-x-auto">
                        {mcpUrl
                          ? `claude mcp add --scope user --transport http ${appNameSlug} '${mcpUrl.replace(/'/g, "'\\''")}'`
                          : "Loading URL…"}
                      </pre>
                      {mcpUrl && (
                        <CopyButton
                          text={`claude mcp add --scope user --transport http ${appNameSlug} '${mcpUrl.replace(/'/g, "'\\''")}'`}
                          className="absolute top-2 right-2"
                        />
                      )}
                    </div>
                    <ol className="mt-5 space-y-3 text-sm text-muted-foreground list-decimal pl-4">
                      <li>Paste the command above into a terminal and press Enter.</li>
                      <li>
                        Start Claude Code and run{" "}
                        <code className="bg-muted px-1 py-0.5 rounded">/mcp</code> to confirm
                        Xellvio is connected.
                      </li>
                      <li>Claude Code will ask you to sign in if you have not already.</li>
                      <li>Ask Claude Code to use Xellvio.</li>
                    </ol>
                  </Card>
                </TabsContent>
                <TabsContent value="other" className="mt-4">
                  <Card className="p-6">
                    <h3 className="font-semibold">Connect another MCP client</h3>
                    <ol className="mt-4 space-y-3 text-sm text-muted-foreground list-decimal pl-4">
                      <li>Open the client’s MCP server or custom connector settings.</li>
                      <li>Create a remote MCP server connection.</li>
                      <li>Name the connection “Xellvio” and paste the MCP URL above.</li>
                      <li>Complete any sign-in or authorization prompts.</li>
                      <li>Enable the connection, then ask the assistant to use Xellvio.</li>
                    </ol>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <RefreshCw className="size-5 text-primary" /> Refresh after the app changes
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                AI assistants cache the list of available tools. After Xellvio is updated, refresh
                the connection so the assistant sees the latest tools.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Card className="p-5">
                  <h3 className="font-semibold text-sm">ChatGPT</h3>
                  <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-4">
                    <li>Open ChatGPT’s app preferences and pick Xellvio under Enabled apps.</li>
                    <li>
                      Next to Information, click <strong>Refresh</strong>.
                    </li>
                    <li>If the URL changed, paste the latest URL from above.</li>
                    <li>Start a new chat and ask ChatGPT to use Xellvio.</li>
                  </ol>
                </Card>
                <Card className="p-5">
                  <h3 className="font-semibold text-sm">Claude</h3>
                  <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-4">
                    <li>Open the Connectors page and select the Xellvio connector.</li>
                    <li>Refresh or update the connector’s tools.</li>
                    <li>If the URL changed, paste the latest URL from above.</li>
                    <li>Ask Claude to use Xellvio.</li>
                  </ol>
                </Card>
                <Card className="p-5">
                  <h3 className="font-semibold text-sm">Claude Code</h3>
                  <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-4">
                    <li>Start a new Claude Code session — it loads the latest tools on connect.</li>
                    <li>
                      If the URL changed, run{" "}
                      <code className="bg-muted px-1 py-0.5 rounded">
                        claude mcp remove {appNameSlug}
                      </code>
                      , then run the install command again with the latest quoted URL.
                    </li>
                    <li>Ask Claude Code to use Xellvio.</li>
                  </ol>
                </Card>
                <Card className="p-5">
                  <h3 className="font-semibold text-sm">Other MCP clients</h3>
                  <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-4">
                    <li>Open the client’s MCP server or connector settings.</li>
                    <li>Select the Xellvio connection.</li>
                    <li>Refresh the tool list, reload the server, or reconnect it.</li>
                    <li>If the URL changed, paste the latest URL from above.</li>
                    <li>Start a new chat or session and ask the assistant to use Xellvio.</li>
                  </ol>
                </Card>
              </div>
            </div>

            <Card className="p-6 bg-primary-soft">
              <h2 className="font-semibold">What the assistant can do</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Once connected, the assistant can read your account summary, list campaigns, pull
                delivery reports, view contact lists, and check inbound SMS replies — all acting as
                your signed-in Xellvio user. It cannot send messages or spend credits.
              </p>
              <div className="mt-4">
                <Button asChild variant="outline" size="sm">
                  <Link to="/docs">Read the API docs</Link>
                </Button>
              </div>
            </Card>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function McpUrlCard({ mcpUrl }: { mcpUrl: string }) {
  return (
    <Card className="p-6 card-elevated border-primary/20">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold">Your MCP server URL</h2>
          <p className="text-sm text-muted-foreground">Copy this link into your AI assistant.</p>
        </div>
        <CopyButton text={mcpUrl} />
      </div>
      <div className="mt-4 rounded-lg bg-muted p-4 font-mono text-sm break-all">
        {mcpUrl || "Loading URL…"}
      </div>
    </Card>
  );
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy} disabled={!text} className={className}>
      {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
