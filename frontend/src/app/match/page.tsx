import type { Metadata } from "next";
import MatchClient from "@/components/match/MatchClient";

export const metadata: Metadata = {
  title: "Match Toby to a job description",
  description: "Paste a job description and see each requirement graded against Toby's study notes and resume, with the evidence behind every verdict.",
};

export default function MatchPage() {
  return (
    <main className="page">
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em" }}>Match Toby to a job</h1>
      <p style={{ fontSize: 15, color: "var(--fg-muted)", lineHeight: 1.7, margin: "8px 0 24px", maxWidth: 640 }}>
        Paste a job description. Each requirement is graded strong, partial or gap from what Toby has actually
        documented in his notes and resume, with the evidence shown. Gaps are shown as gaps.
      </p>
      <MatchClient />
    </main>
  );
}
