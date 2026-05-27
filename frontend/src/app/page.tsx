import CourseCard from "@/components/portfolio/CourseCard";
import { Course, Experience } from "@/types";

const EXPERIENCES: Experience[] = [
  {
    title: "Software Engineering Intern",
    company: "Acme Corp",
    period: "May 2024 – Aug 2024",
    description: "Built a data pipeline processing 10M records/day using Python and Kafka.",
  },
  {
    title: "Teaching Assistant",
    company: "NUS School of Computing",
    period: "Aug 2023 – May 2024",
    description: "Led weekly tutorials for CS2103T (Software Engineering) for a cohort of 30 students.",
  },
];

const COURSES: Course[] = [
  {
    id: "1",
    name: "Database Systems",
    institution: "NUS",
    year: 2024,
    summary: "Covered relational algebra, query optimisation, B+ tree indexing, and transaction management with ACID guarantees. Labs involved implementing a buffer manager in Java.",
    topics: ["SQL", "B+ Trees", "Query Optimisation", "Transactions"],
  },
  {
    id: "2",
    name: "Machine Learning",
    institution: "NUS",
    year: 2024,
    summary: "Covered supervised and unsupervised learning, neural networks, and practical deep learning with PyTorch. Final project: sentiment classifier on financial news.",
    topics: ["PyTorch", "Neural Networks", "NLP", "Model Evaluation"],
  },
  {
    id: "3",
    name: "Computer Networks",
    institution: "NUS",
    year: 2023,
    summary: "OSI model, TCP/IP stack, routing protocols, and congestion control. Built a simple HTTP server from scratch in C.",
    topics: ["TCP/IP", "Routing", "HTTP", "Socket Programming"],
  },
];

const SKILLS = ["Python", "TypeScript", "Java", "SQL", "Docker", "FastAPI", "React", "RAG", "LangChain", "Postgres", "Redis"];

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>

      {/* Hero */}
      <section style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
            background: "var(--accent-light)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 600, color: "var(--accent-text)",
          }}>YN</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Your Name</h1>
            <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>Computer Science · NUS · Class of 2025</p>
            <span style={{
              display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 500,
              padding: "3px 10px", borderRadius: 20,
              background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0",
            }}>
              Open to opportunities
            </span>
          </div>
        </div>
        <p style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.8, marginBottom: 16 }}>
          Final year CS student interested in backend systems, ML infrastructure, and building
          things that scale. Looking for full-time roles starting 2025.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SKILLS.map(s => (
            <span key={s} className="tag tag-gray">{s}</span>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section style={{ marginBottom: 48 }}>
        <p className="section-label">Experience</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {EXPERIENCES.map((exp, i) => (
            <div key={i} style={{ display: "flex", gap: 16, paddingBottom: i < EXPERIENCES.length - 1 ? 20 : 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--border-strong)", flexShrink: 0 }} />
                {i < EXPERIENCES.length - 1 && (
                  <div style={{ width: 1, flex: 1, background: "var(--border)", marginTop: 4 }} />
                )}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{exp.title}</p>
                <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{exp.company} · {exp.period}</p>
                <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 6, lineHeight: 1.7 }}>{exp.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Courses */}
      <section>
        <p className="section-label">
          Courses
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--fg-subtle)", marginLeft: 8 }}>
            · click to expand
          </span>
        </p>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}>
          {COURSES.map(course => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </section>

    </main>
  );
}
