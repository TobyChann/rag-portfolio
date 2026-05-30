import type { Metadata } from "next";
// @ts-ignore
import "./globals.css";
// @ts-ignore
import NavBar from "@/components/portfolio/NavBar";
import Footer from "@/components/portfolio/Footer";
import Chatbot from "@/components/chat/Chatbot";

export const metadata: Metadata = {
  title: "My Portfolio",
  description: "Information Systems and Accountancy student at SMU, analytics engineering focus.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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