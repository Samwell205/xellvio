// Renderers shared by the in-app live preview and the public hosted pages.
import { useState } from "react";
import {
  type Design,
  type Section,
  FONT_STACKS,
  MAX_WIDTH,
  buttonStyle,
  designVars,
  headingStyle,
} from "@/lib/website-design";

export type SubscribeHandler = (v: { phone: string; firstName: string; lastName: string }) => Promise<string>;

type FormConfig = {
  ctaLabel: string;
  successMessage: string;
  consentText: string;
  collectName: boolean;
  collectLastName?: boolean;
};

function fieldStyle(d: Design): React.CSSProperties {
  return {
    width: "100%",
    padding: "0.7rem 0.9rem",
    borderRadius: Math.min(d.radius, 14),
    border: `1px solid ${d.border}`,
    background: d.surface,
    color: d.text,
    fontSize: "0.95rem",
    outline: "none",
  };
}

export function SubscribeBox({
  design: d,
  config,
  onSubmit,
  preview,
  heading,
  note,
  flat,
}: {
  design: Design;
  config: FormConfig;
  onSubmit?: SubscribeHandler;
  preview?: boolean;
  heading?: string;
  note?: string;
  flat?: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || !onSubmit) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await onSubmit({ phone, firstName, lastName }));
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: flat ? "transparent" : d.surface,
        border: flat ? "none" : `1px solid ${d.border}`,
        borderRadius: d.radius,
        padding: flat ? 0 : "1.5rem",
        boxShadow: !flat && d.shadow ? "0 18px 40px -24px rgba(15,23,42,.45)" : "none",
      }}
    >
      {heading ? <div style={{ ...headingStyle(d, 1.25), fontWeight: 700, marginBottom: ".75rem" }}>{heading}</div> : null}
      {done ? (
        <div style={{ padding: "1rem 0", textAlign: "center" }}>
          <div style={{ ...headingStyle(d, 1.4), fontWeight: 800 }}>You're in 🎉</div>
          <p style={{ color: d.muted, marginTop: ".5rem", fontSize: ".9rem" }}>{done}</p>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: "grid", gap: ".6rem" }}>
          {config.collectName && (
            <input
              style={fieldStyle(d)}
              placeholder="First name"
              value={firstName}
              maxLength={60}
              onChange={(e) => setFirstName(e.target.value)}
            />
          )}
          {config.collectLastName && (
            <input
              style={fieldStyle(d)}
              placeholder="Last name"
              value={lastName}
              maxLength={60}
              onChange={(e) => setLastName(e.target.value)}
            />
          )}
          <input
            style={fieldStyle(d)}
            placeholder="Phone number with country code"
            value={phone}
            required
            inputMode="tel"
            maxLength={24}
            onChange={(e) => setPhone(e.target.value)}
          />
          {error && <p style={{ color: "#dc2626", fontSize: ".85rem" }}>{error}</p>}
          <button
            type="submit"
            disabled={busy || (!preview && phone.trim().length < 6)}
            style={{
              ...buttonStyle(d),
              padding: ".75rem 1rem",
              fontWeight: 600,
              fontSize: ".95rem",
              cursor: preview ? "default" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "One moment…" : config.ctaLabel}
          </button>
          {note ? <p style={{ color: d.muted, fontSize: ".8rem" }}>{note}</p> : null}
          <p style={{ color: d.muted, fontSize: ".72rem", lineHeight: 1.5 }}>{config.consentText}</p>
        </form>
      )}
    </div>
  );
}

function SectionBlock({
  section: s,
  design: d,
  form,
  onSubmit,
  preview,
}: {
  section: Section;
  design: Design;
  form: FormConfig;
  onSubmit?: SubscribeHandler;
  preview?: boolean;
}) {
  const wrap: React.CSSProperties = { maxWidth: MAX_WIDTH[d.width], margin: "0 auto", padding: "0 1.5rem" };

  switch (s.type) {
    case "hero":
      return (
        <section style={{ padding: "4rem 0 3rem" }}>
          <div
            style={{
              ...wrap,
              display: "grid",
              gap: "2.5rem",
              gridTemplateColumns: s.showForm && s.align === "left" ? "1.1fr .9fr" : "1fr",
              alignItems: "center",
              textAlign: s.align === "center" ? "center" : "left",
            }}
            className="wb-hero"
          >
            <div style={{ display: "grid", gap: "1rem", justifyItems: s.align === "center" ? "center" : "start" }}>
              <h1 style={{ ...headingStyle(d, 2.9), fontWeight: 800, margin: 0 }}>{s.headline}</h1>
              {s.subheadline && <p style={{ fontSize: "1.15rem", color: d.muted, margin: 0 }}>{s.subheadline}</p>}
              {s.body && <p style={{ color: d.muted, whiteSpace: "pre-wrap", margin: 0 }}>{s.body}</p>}
              {s.imageUrl && (
                <img src={s.imageUrl} alt="" style={{ width: "100%", borderRadius: d.radius, marginTop: ".5rem" }} />
              )}
            </div>
            {s.showForm && (
              <SubscribeBox design={d} config={form} onSubmit={onSubmit} preview={preview} />
            )}
          </div>
        </section>
      );
    case "text":
      return (
        <section style={{ padding: "2.5rem 0" }}>
          <div style={{ ...wrap, display: "grid", gap: ".75rem" }}>
            {s.heading && <h2 style={{ ...headingStyle(d, 1.75), fontWeight: 700, margin: 0 }}>{s.heading}</h2>}
            <p style={{ color: d.muted, whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.7 }}>{s.body}</p>
          </div>
        </section>
      );
    case "image":
      return (
        <section style={{ padding: "2rem 0" }}>
          <div style={wrap}>
            {s.url ? (
              <img src={s.url} alt={s.alt} style={{ width: "100%", borderRadius: d.radius, display: "block" }} />
            ) : (
              <div
                style={{
                  border: `1px dashed ${d.border}`,
                  borderRadius: d.radius,
                  padding: "3rem",
                  textAlign: "center",
                  color: d.muted,
                  fontSize: ".85rem",
                }}
              >
                Add an image link
              </div>
            )}
            {s.caption && <p style={{ color: d.muted, fontSize: ".8rem", marginTop: ".5rem" }}>{s.caption}</p>}
          </div>
        </section>
      );
    case "features":
      return (
        <section style={{ padding: "2.5rem 0" }}>
          <div style={{ ...wrap, display: "grid", gap: "1.5rem" }}>
            {s.heading && <h2 style={{ ...headingStyle(d, 1.75), fontWeight: 700, margin: 0 }}>{s.heading}</h2>}
            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(3, minmax(0,1fr))" }} className="wb-grid3">
              {s.items.map((it, i) => (
                <div
                  key={i}
                  style={{
                    background: d.surface,
                    border: `1px solid ${d.border}`,
                    borderRadius: d.radius,
                    padding: "1.15rem",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: ".35rem" }}>{it.title}</div>
                  <p style={{ color: d.muted, fontSize: ".9rem", margin: 0 }}>{it.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    case "quote":
      return (
        <section style={{ padding: "2.5rem 0" }}>
          <div style={{ ...wrap, textAlign: "center" }}>
            <p style={{ ...headingStyle(d, 1.5), fontWeight: 600, margin: 0 }}>“{s.text}”</p>
            {s.author && <p style={{ color: d.muted, marginTop: ".6rem", fontSize: ".9rem" }}>— {s.author}</p>}
          </div>
        </section>
      );
    case "faq":
      return (
        <section style={{ padding: "2.5rem 0" }}>
          <div style={{ ...wrap, display: "grid", gap: "1rem" }}>
            {s.heading && <h2 style={{ ...headingStyle(d, 1.75), fontWeight: 700, margin: 0 }}>{s.heading}</h2>}
            <div style={{ display: "grid", gap: ".75rem" }}>
              {s.items.map((it, i) => (
                <div key={i} style={{ borderBottom: `1px solid ${d.border}`, paddingBottom: ".75rem" }}>
                  <div style={{ fontWeight: 600 }}>{it.q}</div>
                  <p style={{ color: d.muted, fontSize: ".9rem", margin: ".25rem 0 0" }}>{it.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    case "signup":
      return (
        <section style={{ padding: "2.5rem 0" }}>
          <div style={{ ...wrap, maxWidth: "34rem" }}>
            <SubscribeBox design={d} config={form} onSubmit={onSubmit} preview={preview} heading={s.heading} note={s.note} />
          </div>
        </section>
      );
    case "footer":
      return (
        <footer style={{ padding: "2.5rem 0 3rem", borderTop: `1px solid ${d.border}`, marginTop: "2rem" }}>
          <div style={{ ...wrap, color: d.muted, fontSize: ".8rem", textAlign: "center" }}>{s.text}</div>
        </footer>
      );
  }
}

export function PageRenderer({
  design,
  sections,
  logoUrl,
  form,
  onSubmit,
  preview,
}: {
  design: Design;
  sections: Section[];
  logoUrl?: string | null;
  form: FormConfig;
  onSubmit?: SubscribeHandler;
  preview?: boolean;
}) {
  return (
    <div style={{ ...designVars(design), minHeight: "100%" }}>
      <style>{`
        .wb-hero > * { min-width: 0 }
        @media (max-width: 860px) {
          .wb-hero { grid-template-columns: 1fr !important }
          .wb-grid3 { grid-template-columns: 1fr !important }
        }
      `}</style>
      {logoUrl ? (
        <div style={{ maxWidth: MAX_WIDTH[design.width], margin: "0 auto", padding: "1.75rem 1.5rem 0" }}>
          <img src={logoUrl} alt="" style={{ height: 36, objectFit: "contain" }} />
        </div>
      ) : null}
      {sections.length === 0 ? (
        <div style={{ padding: "5rem 1.5rem", textAlign: "center", color: design.muted, fontFamily: FONT_STACKS[design.font] }}>
          Add your first section to start building this page.
        </div>
      ) : (
        sections.map((s) => (
          <SectionBlock key={s.id} section={s} design={design} form={form} onSubmit={onSubmit} preview={preview} />
        ))
      )}
    </div>
  );
}

export function FormRenderer({
  design,
  headline,
  description,
  logoUrl,
  imageUrl,
  form,
  onSubmit,
  preview,
}: {
  design: Design;
  headline: string;
  description: string;
  logoUrl?: string | null;
  imageUrl?: string | null;
  form: FormConfig;
  onSubmit?: SubscribeHandler;
  preview?: boolean;
}) {
  return (
    <div
      style={{
        ...designVars(design),
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2.5rem 1.25rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "26rem",
          background: design.surface,
          border: `1px solid ${design.border}`,
          borderRadius: design.radius,
          overflow: "hidden",
          boxShadow: design.shadow ? "0 24px 50px -30px rgba(15,23,42,.5)" : "none",
        }}
      >
        {imageUrl ? <img src={imageUrl} alt="" style={{ width: "100%", display: "block", maxHeight: 180, objectFit: "cover" }} /> : null}
        <div style={{ padding: "1.5rem" }}>
          {logoUrl ? <img src={logoUrl} alt="" style={{ height: 28, objectFit: "contain", marginBottom: ".9rem" }} /> : null}
          <h1 style={{ ...headingStyle(design, 1.5), fontWeight: 800, margin: 0 }}>{headline}</h1>
          {description && <p style={{ color: design.muted, fontSize: ".92rem", margin: ".5rem 0 0" }}>{description}</p>}
          <div style={{ marginTop: "1.1rem" }}>
            <SubscribeBox design={design} config={form} onSubmit={onSubmit} preview={preview} flat />
          </div>
        </div>
      </div>
    </div>
  );
}
