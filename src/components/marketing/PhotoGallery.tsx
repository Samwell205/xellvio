import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import cafe from "@/assets/gallery-cafe.jpg";
import shopper from "@/assets/gallery-shopper.jpg";
import product from "@/assets/gallery-product.jpg";
import shopOwner from "@/assets/landing-shop-owner.jpg";

const tiles = [
  { src: product, label: "Beauty & skincare", w: "md:col-span-2" },
  { src: cafe, label: "Cafés & restaurants", w: "md:col-span-3" },
  { stat: true, w: "md:col-span-3" },
  { src: shopper, label: "Fashion retail", w: "md:col-span-2" },
  { src: shopOwner, label: "Local shops", w: "md:col-span-2" },
] as const;

/** Klaviyo-style photo strip with one green stat panel. */
export function PhotoGallery() {
  return (
    <section className="bg-ink py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-12 md:gap-4">
          {tiles.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className={`group relative h-72 overflow-hidden rounded-2xl md:h-[520px] ${t.w} ${"stat" in t ? "col-span-2" : ""}`}
            >
              {"stat" in t ? (
                <div className="flex h-full flex-col justify-between bg-primary p-7 text-primary-foreground md:p-9">
                  <p className="text-xl font-bold tracking-tight">Xellvio</p>
                  <div>
                    <p className="flex items-start text-6xl font-bold leading-none md:text-8xl">
                      98%
                      <ArrowUpRight className="ml-1 h-10 w-10 md:h-14 md:w-14" />
                    </p>
                    <p className="mt-4 max-w-xs text-base opacity-90 md:text-lg">
                      Average delivery rate for businesses texting their customers worldwide
                    </p>
                    <Link
                      to="/auth"
                      search={{ mode: "signup" }}
                      className="mt-8 inline-flex items-center gap-1 border-b border-current pb-1 text-sm font-semibold"
                    >
                      Start sending today <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <img
                    src={t.src}
                    alt={t.label}
                    loading="lazy"
                    width={768}
                    height={1152}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-5">
                    <p className="text-sm font-semibold uppercase tracking-widest text-ink-foreground">
                      {t.label}
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
