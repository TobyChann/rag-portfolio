import type { Metadata } from "next";
import "./globals.css";
import Chatbot from "@/components/chat/Chatbot";

export const metadata: Metadata = {
  title: "Your Name — Portfolio",
  description: "CS student portfolio with RAG-powered chatbot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">
        <nav className="border-b border-gray-100 px-6 py-3 flex justify-between items-center max-w-2xl mx-auto">
          <span className="text-sm font-medium">Toby Chan</span>
          <div className="flex gap-5 text-sm text-gray-500">
            <a href="/" className="hover:text-gray-900 transition-colors">About</a>
            <a href="/stack" className="hover:text-gray-900 transition-colors">Stack</a>
            <a href="https://github.com/TobyChann" target="_blank" className="hover:text-gray-900 transition-colors">GitHub</a>
          </div>
        </nav>
        {children}
        <Chatbot />
      </body>
    </html>
  );
}
