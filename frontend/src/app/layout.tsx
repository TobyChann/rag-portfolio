import type { Metadata } from "next";
// @ts-ignore
import "./globals.css";
import Chatbot from "@/components/chat/Chatbot";
// @ts-ignore
import NavBar from "@/components/portfolio/NavBar";

export const metadata: Metadata = {
  title: "Your Name — Portfolio",
  description: "CS student portfolio with RAG-powered chatbot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        {children}
        <Chatbot />
      </body>
    </html>
  );
}
