import type { Metadata } from "next";
import MatchClient from "@/components/match/MatchClient";

export const metadata: Metadata = {
  title: "Match me to a job description",
  description: "Paste a job description and see how each requirement stacks up against my study notes and resume, with the evidence behind every verdict.",
};

export default function MatchPage() {
  return (
    <main className="page">
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em" }}>See how I fit your role</h1>
      <p style={{ fontSize: 15, color: "var(--fg-muted)", lineHeight: 1.7, margin: "8px 0 24px", maxWidth: 640 }}>
        Paste a job description. Each requirement is graded strong, partial or gap against what I&apos;ve actually
        documented in my notes and resume, with the evidence shown. Where I have a gap, you&apos;ll see it.
      </p>
      <MatchClient />
    </main>
  );
}
