import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, blogPosting, DEFAULT_OG_IMAGE } from "@/lib/schema";
import { getPost } from "@/lib/blog";

export const revalidate = 60;

function fmtDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Post not found", robots: { index: false, follow: false } };
  const title = post.metaTitle || post.title;
  const description = post.metaDescription || post.excerpt || `${post.title} — SerpScale SEO blog.`;
  return {
    title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title,
      description,
      url: `/blog/${post.slug}`,
      type: "article",
      images: [post.coverUrl || DEFAULT_OG_IMAGE],
    },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const shortTitle = post.title.length > 40 ? post.title.slice(0, 40) + "…" : post.title;

  return (
    <>
      <JsonLd
        data={[
          breadcrumb([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: shortTitle, path: `/blog/${post.slug}` },
          ]),
          blogPosting({
            headline: post.title,
            description: post.metaDescription || post.excerpt || post.title,
            slug: post.slug,
            datePublished: post.publishedAt || post.createdAt,
            image: post.coverUrl || undefined,
          }),
        ]}
      />
      <Header />
      <main>
        <div className="pp-breadcrumb-wrapper fix bg-cover" style={{ backgroundImage: "url(/assets/img/inner-page/breadcrumb.jpg)" }}>
          <div className="container">
            <div className="pp-page-heading">
              <div className="pp-breadcrumb-sub-title"><h1>{post.title}</h1></div>
              <ul className="pp-breadcrumb-items">
                <li><a href="/">Home</a></li>
                <li><i className="fa-solid fa-chevron-right"></i></li>
                <li><a href="/blog">Blog</a></li>
                <li><i className="fa-solid fa-chevron-right"></i></li>
                <li>{post.categories[0]?.name || "Article"}</li>
              </ul>
            </div>
          </div>
        </div>

        <section className="pp-news-details-section section-padding">
          <div className="container">
            <div className="pp-news-details-wrapper">
              <div className="row justify-content-center">
                <div className="col-12 col-lg-9">
                  {post.coverUrl && (
                    <div className="pp-details-image">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={post.coverUrl} alt={post.title} />
                    </div>
                  )}
                  <ul className="news-post" style={{ display: "flex", gap: "20px", listStyle: "none", padding: 0, margin: "18px 0" }}>
                    <li itemProp="author"><i className="fa-regular fa-user"></i> {post.author?.name || "SerpScale Team"}</li>
                    <li><i className="fa-regular fa-calendar-days"></i> {fmtDate(post.publishedAt)}</li>
                    {post.categories[0] && <li><i className="fa-regular fa-folder"></i> {post.categories[0].name}</li>}
                  </ul>
                  <div className="pp-news-details-content blog-content" dangerouslySetInnerHTML={{ __html: post.content }} />
                  {post.tags.length > 0 && (
                    <div className="pp-tag-share-wrap mt-4" style={{ marginTop: "24px" }}>
                      <span style={{ fontWeight: 600, marginRight: "8px" }}>Tags:</span>
                      {post.tags.map((t) => (
                        <span key={t} className="pp-theme-btn" style={{ padding: "4px 12px", marginRight: "6px", fontSize: "12px" }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
