import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/admin/receptionist")({
  beforeLoad: () => { throw redirect({ to: "/admin", replace: true }); },
  head: () => ({ meta: [{ title: "Unavailable voice setup — Xellvio" }, { name: "description", content: "This page is not available in Xellvio." }, { property: "og:title", content: "Unavailable voice setup — Xellvio" }, { property: "og:description", content: "This page is not available in Xellvio." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
});
