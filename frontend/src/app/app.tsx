import CourseCard from "@/components/portfolio/CourseCard";
import { Course, Experience } from "@/types";

// Replace with your real data
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
    description: "Led weekly tutorials for CS2103T (Software Engineering) cohort of 30 students.",
  },
];

const COURSES: Course[] = [
  {
    id: "1",
    name: "Database Systems",
    institution: "NUS",
    year: 2024,
    summary: "Covered relational algebra, query optimisation, indexing strategies (B+ trees, hash indexes), and transaction management with ACID guarantees. Labs involved implementing a buffer manager in Java.",
    topics: ["SQL", "B+ Trees", "Query Optimisation", "Transactions", "ACID"],
  },
  {
    id: "2",
    name: "Machine Learning",
    institution: "NUS",
    year: 2024,
    summary: "Covered supervised and unsupervised learning, neural networks, model evaluation, and practical deep learning with PyTorch. Final project: sentiment classifier on financial news.",
    topics: ["PyTorch", "Neural Networks", "NLP", "Model Evaluation"],
  },
  {
    id: "3",
    name: "Computer Networks",
    institution: "NUS",
    year: 2023,
    summary: "OSI model, TCP/IP stack, routing protocols, congestion control, and application-layer protocols. Built a simple HTTP server from scratch in C.",
    topics: ["TCP/IP", "Routing", "HTTP", "Socket Programming"],
  },
];

const SKILLS = ["Python", "TypeScript", "Java", "SQL", "Docker", "FastAPI", "React", "RAG", "LangChain", "Postgres", "Redis"];

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      {/* Hero */}
      <section className="mb-10">
        <div className="flex items-center gap-5 mb-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-lg shrink-0">
            YN
          </div>
          <div>
            <h1 className="text-xl font-medium text-gray-900">Your Name</h1>
            <p className="text-sm text-gray-500 mt-0.5">Computer Science · NUS · Class of 2025</p>
            <span className="inline-block text-xs px-2.5 py-0.5 bg-green-50 text-green-700 rounded-full mt-1.5 border border-green-200">
              Open to opportunities
            </span>
          </div>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          Final year CS student interested in backend systems, ML infrastructure, and building things that scale.
          Currently looking for full-time roles starting 2025.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {SKILLS.map(s => (
            <span key={s} className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full">{s}</span>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section className="mb-10">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-4">Experience</h2>
        <div className="flex flex-col gap-5">
          {EXPERIENCES.map((exp, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center pt-1.5">
                <div className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                {i < EXPERIENCES.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
              </div>
              <div className="pb-2">
                <p className="text-sm font-medium text-gray-900">{exp.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{exp.company} · {exp.period}</p>
                <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{exp.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Courses */}
      <section className="mb-10">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-4">
          Courses <span className="normal-case text-gray-400 tracking-normal font-normal">· click to expand</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COURSES.map(course => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </section>
    </main>
  );
}
