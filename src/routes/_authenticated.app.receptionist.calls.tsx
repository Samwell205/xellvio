import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/app/receptionist/calls")({
  beforeLoad: () => { throw redirect({ to: "/app", replace: true }); },
  head: () => ({ meta: [{ title: "Unavailable call history — Xellvio" }, { name: "description", content: "This page is not available in Xellvio." }, { property: "og:title", content: "Unavailable call history — Xellvio" }, { property: "og:description", content: "This page is not available in Xellvio." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
});
