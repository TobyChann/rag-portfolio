import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "@/components/portfolio/NavBar";
import Footer from "@/components/portfolio/Footer";
import Chatbot from "@/components/chat/Chatbot";
import { PROFILE, EDUCATION, SITE_URL } from "@/lib/profile";

const description = `${PROFILE.tagline}. Ask an AI assistant grounded in his actual study notes about his skills, coursework and projects.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${PROFILE.name} | Analytics, data engineering & accountancy`, template: `%s | ${PROFILE.name}` },
  description,
  authors: [{ name: PROFILE.fullName }],
  openGraph: { type: "profile", title: PROFILE.name, description, url: "/", siteName: PROFILE.name },
  twitter: { card: "summary_large_image", title: PROFILE.name, description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0C" },
  ],
};

// Runs before first paint so a saved theme never flashes the other one.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const personLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: PROFILE.name,
  alternateName: PROFILE.fullName,
  url: SITE_URL,
  description: PROFILE.tagline,
  alumniOf: { "@type": "CollegeOrUniversity", name: EDUCATION.school },
  sameAs: [PROFILE.github],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd) }} />
      </head>
      <body style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <NavBar />
        <div style={{ flex: 1 }}>
          {children}
        </div>
        <Footer />
        <Chatbot />
      </body>
    </html>
  );
}
