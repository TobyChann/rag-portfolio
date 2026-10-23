// Who the site is about. Used by the homepage, metadata, JSON-LD and the OG image.
export const PROFILE = {
  name: "Toby Chan",
  fullName: "Chan Ngok Jung Toby",
  tagline: "Information Systems (Business Analytics) & Accountancy @ SMU",
  pitch: "I build data products end to end, and this site is one of them: my study notes are ingested from Google Drive, embedded, and answerable through the chat. Ask it what I know.",
  github: "https://github.com/TobyChann",
};

export const EDUCATION = {
  school: "Singapore Management University",
  degree: "BSc (Information Systems, Business Analytics)",
  double: "Bachelor of Accountancy (double degree)",
  period: "Aug 2023 – Nov 2027",
  gpa: "3.93 / 4.00",
  awards: ["Dean's List AY23/24", "Dean's List AY24/25", "Dean's List AY25/26",
           "SCIS Achievements Scholarship", "Teaching Assistant, IS430 Digital Payments and Innovation"],
};

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
