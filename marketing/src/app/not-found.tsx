import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main>
        <section className="pp-about-section section-padding">
          <div className="container">
            <div className="row">
              <div className="col-lg-8 mx-auto text-center">
                <span className="pp-sub-title">404 ERROR</span>
                <h1 style={{ marginTop: 8 }}>This page went off the SERP</h1>
                <p style={{ maxWidth: 560, margin: "16px auto 28px" }}>
                  The page you're looking for doesn't exist or has moved. Let's get you back to
                  tracking rankings, auditing sites and checking backlinks.
                </p>
                <div className="pp-hero-button" style={{ justifyContent: "center" }}>
                  <Link href="/" className="pp-theme-btn">
                    Back to Home <i className="fa-solid fa-arrow-right-long"></i>
                  </Link>
                  <Link href="/features" className="pp-theme-btn pp-style-2">
                    Explore Features <i className="fa-solid fa-arrow-right-long"></i>
                  </Link>
                </div>
                <ul
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px 22px",
                    justifyContent: "center",
                    listStyle: "none",
                    padding: 0,
                    marginTop: 32,
                  }}
                >
                  <li><Link href="/rank-tracker">Rank Tracker</Link></li>
                  <li><Link href="/keyword-research">Keyword Research</Link></li>
                  <li><Link href="/site-audit">Site Audit</Link></li>
                  <li><Link href="/backlink-checker">Backlink Checker</Link></li>
                  <li><Link href="/pricing">Pricing</Link></li>
                  <li><Link href="/contact">Contact</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
