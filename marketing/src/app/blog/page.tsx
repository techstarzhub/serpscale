import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, DEFAULT_OG_IMAGE } from "@/lib/schema";
import { getPosts, getCategories } from "@/lib/blog";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "SEO Blog — Guides on Rank Tracking & Audits",
  description:
    "Actionable SEO guides from SerpScale: rank tracking, technical audits, backlink analysis and keyword research for agencies.",
  keywords: ["SEO blog","SEO guides","SEO tips","rank tracking guide","keyword research guide","site audit guide","backlink analysis","technical SEO","SEO for agencies","white label SEO","SEO strategy","how to improve SEO","SEMrush alternative","SEO tutorials","content optimization","SEO best practices"],
  alternates: { canonical: "/blog" },
  openGraph: { images: [DEFAULT_OG_IMAGE], title: "SerpScale SEO Blog", description: "Actionable SEO guides & tips.", url: "/blog" },
};

function fmtDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const [{ posts }, categories] = await Promise.all([getPosts({ category, limit: 48 }), getCategories()]);

  return (
    <>
      <JsonLd data={breadcrumb([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }])} />
      <Header />
      <main>
        <div className="pp-breadcrumb-wrapper fix bg-cover" style={{ backgroundImage: "url(/assets/img/inner-page/breadcrumb.jpg)" }}>
          <div className="container">
            <div className="pp-page-heading">
              <div className="pp-breadcrumb-sub-title"><h1>SEO Blog &amp; Guides</h1></div>
              <ul className="pp-breadcrumb-items">
                <li><a href="/">Home</a></li>
                <li><i className="fa-solid fa-chevron-right"></i></li>
                <li>Blog</li>
              </ul>
            </div>
          </div>
        </div>

        <section className="pp-pp-news-section-2 section-padding fix">
          <div className="container">
            <p style={{ maxWidth: "760px", margin: "0 auto 36px", textAlign: "center", color: "#5a5f6e" }}>
              Practical SEO guides from the team behind SerpScale — rank tracking playbooks, technical site
              audit checklists, backlink strategy and keyword research workflows written for agencies who need
              answers, not filler.
            </p>
            {/* Category filter */}
            {categories.length > 0 && (
              <div className="pp-blog-cats" style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", marginBottom: "36px" }}>
                <a href="/blog" className="pp-theme-btn" style={{ padding: "8px 18px", opacity: category ? 0.6 : 1 }}>All</a>
                {categories.map((c) => (
                  <a key={c.slug} href={`/blog?category=${c.slug}`} className="pp-theme-btn" style={{ padding: "8px 18px", opacity: category === c.slug ? 1 : 0.6 }}>
                    {c.name}
                  </a>
                ))}
              </div>
            )}

            {posts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#5b6270" }}>
                <h3>New guides are on the way</h3>
                <p style={{ maxWidth: "560px", margin: "12px auto 0" }}>
                  We're putting together in-depth guides on rank tracking, technical site audits, backlink
                  analysis and keyword research — the same playbooks our team uses with agency customers.
                  Check back soon, or <a href="/contact">get in touch</a> if there's a topic you'd like us to
                  cover first.
                </p>
              </div>
            ) : (
              <div className="row g-4">
                {posts.map((p) => (
                  <div key={p.id} className="col-xl-4 col-lg-6 col-md-6">
                    <div className="pp-news-card-item-2 mt-0">
                      <div className="pp-news-image">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.coverUrl || "/assets/img/home-2/news/news-1.jpg"} alt={p.title} />
                        {p.categories[0] && <span>{p.categories[0].name}</span>}
                      </div>
                      <div className="pp-news-content">
                        <h3><a href={`/blog/${p.slug}`}>{p.title}</a></h3>
                        <ul className="news-post">
                          <li itemProp="author"><i className="fa-regular fa-user"></i> {p.author?.name || "SerpScale Team"}</li>
                          <li className="pp-style-2"><i className="fa-regular fa-calendar-days"></i> {fmtDate(p.publishedAt)}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
