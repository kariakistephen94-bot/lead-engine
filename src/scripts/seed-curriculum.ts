/**
 * Seed the 9-week, 27-project build curriculum. `npm run build:seed`
 *
 * Idempotent: `number` is the natural key, so re-running updates the plan text
 * and leaves your status, dates, links, notes and build logs untouched. That
 * matters — the plan is a document you will revise, and revising it must never
 * cost you the record of what you actually did.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

import * as schema from "../db/schema";

config({ path: ".env.local" });

type Seed = {
  number: number;
  title: string;
  summary: string;
  features: string[];
  stack: string[];
};

type Week = { week: number; theme: string; learn: string[]; projects: Seed[] };

const CURRICULUM: Week[] = [
  {
    week: 1,
    theme: "Python Refresh + Mini APIs",
    learn: [
      "functions", "classes", "async/await", "JSON", "file handling",
      "virtual environments", "requests", "error handling",
    ],
    projects: [
      {
        number: 1,
        title: "Notes REST API",
        summary: "A CRUD API with pagination, built to get comfortable with FastAPI's request/response cycle before a database is in the picture.",
        features: ["create notes", "update notes", "delete notes", "pagination"],
        stack: ["FastAPI", "in-memory storage"],
      },
      {
        number: 2,
        title: "Weather API Wrapper",
        summary: "A thin service over a third-party weather API — the project where calling someone else's API asynchronously stops being theory.",
        features: ["fetch weather", "city search", "formatted JSON responses"],
        stack: ["FastAPI", "httpx", "async requests"],
      },
      {
        number: 3,
        title: "File Upload API",
        summary: "Accepts PDFs and images, validates what it is handed, and writes to local disk.",
        features: ["upload PDFs/images", "validate file types", "save locally"],
        stack: ["FastAPI", "python-multipart"],
      },
    ],
  },
  {
    week: 2,
    theme: "FastAPI Backend Engineering",
    learn: [
      "routing", "middleware", "auth basics", "request validation",
      "Pydantic", "environment variables",
    ],
    projects: [
      {
        number: 4,
        title: "Authentication Backend",
        summary: "Signup, login and route protection with JWTs — the piece every later project assumes exists.",
        features: ["JWT auth", "signup/login", "protected routes"],
        stack: ["FastAPI", "PyJWT", "Pydantic"],
      },
      {
        number: 5,
        title: "Task Management API",
        summary: "CRUD against a real database, with filtering and status transitions.",
        features: ["CRUD", "PostgreSQL", "filtering", "status management"],
        stack: ["FastAPI", "PostgreSQL", "SQLAlchemy"],
      },
      {
        number: 6,
        title: "AI Backend Starter",
        summary: "The three endpoints every AI product ends up needing, in one reusable service.",
        features: ["/chat", "/summarize", "/generate", "OpenAI integration"],
        stack: ["FastAPI", "OpenAI"],
      },
    ],
  },
  {
    week: 3,
    theme: "OpenAI + AI Systems",
    learn: [
      "prompting", "structured outputs", "streaming", "tool calling",
      "memory", "token usage", "context handling",
    ],
    projects: [
      {
        number: 7,
        title: "AI Chatbot",
        summary: "A chat app with persistent history and streaming responses — the first full-stack project of the run.",
        features: ["persistent chat", "markdown rendering", "streaming responses"],
        stack: ["Next.js", "FastAPI", "OpenAI"],
      },
      {
        number: 8,
        title: "AI Email Assistant",
        summary: "Drafts, rewrites and summarises email with a selectable tone.",
        features: ["generate emails", "tone selection", "summarization", "rewrite functionality"],
        stack: ["Next.js", "FastAPI", "OpenAI"],
      },
      {
        number: 9,
        title: "AI Content Generator",
        summary: "One brief in, several formats out — the tool shape most clients recognise immediately.",
        features: ["blogs", "tweets", "LinkedIn posts", "SEO titles"],
        stack: ["Next.js", "FastAPI", "OpenAI"],
      },
    ],
  },
  {
    week: 4,
    theme: "No-Code Automation Systems",
    learn: [
      "workflows", "triggers", "webhooks", "API integrations",
      "branching", "scheduling",
    ],
    projects: [
      {
        number: 10,
        title: "Gmail AI Summarizer",
        summary: "Email arrives, the model summarises it, the summary lands in Slack or Telegram.",
        features: ["email received trigger", "AI summarizes", "sends to Slack/Telegram"],
        stack: ["n8n", "Gmail API", "OpenAI"],
      },
      {
        number: 11,
        title: "AI Lead Qualification System",
        summary: "A form submission is scored by the model, stored, and announced. Directly sellable.",
        features: ["form submitted", "AI scores lead", "stores in database", "sends notification"],
        stack: ["n8n", "PostgreSQL", "OpenAI"],
      },
      {
        number: 12,
        title: "AI Support Ticket Router",
        summary: "Categorises an incoming ticket and routes it to the right department.",
        features: ["support ticket arrives", "AI categorizes", "routes to correct department"],
        stack: ["n8n", "OpenAI"],
      },
    ],
  },
  {
    week: 5,
    theme: "Databases + RAG",
    learn: [
      "PostgreSQL", "embeddings", "vector search", "semantic retrieval",
      "chunking", "pgvector",
    ],
    projects: [
      {
        number: 13,
        title: "PDF Chatbot",
        summary: "Upload a PDF, ask questions, get answers with citations back to the source.",
        features: ["upload PDFs", "ask questions", "citation responses", "semantic search"],
        stack: ["FastAPI", "pgvector", "PostgreSQL", "OpenAI"],
      },
      {
        number: 14,
        title: "Documentation AI Assistant",
        summary: "Ingests a documentation set and answers in context. The SaaS-facing version of the PDF bot.",
        features: ["docs ingestion", "retrieval system", "contextual answers"],
        stack: ["FastAPI", "pgvector", "Next.js"],
      },
      {
        number: 15,
        title: "AI Knowledge Base",
        summary: "Internal company search over embedded documents, with an admin dashboard.",
        features: ["internal company search", "embeddings", "admin dashboard"],
        stack: ["Next.js", "FastAPI", "pgvector"],
      },
    ],
  },
  {
    week: 6,
    theme: "AI Agents",
    learn: ["agents", "planning loops", "memory systems", "tool usage", "orchestration"],
    projects: [
      {
        number: 16,
        title: "AI Research Agent",
        summary: "Searches a topic, summarises what it finds, and writes a report.",
        features: ["searches topics", "summarizes findings", "generates reports"],
        stack: ["LangGraph", "LangChain", "FastAPI"],
      },
      {
        number: 17,
        title: "AI Sales Assistant",
        summary: "Analyses leads, drafts outreach and ranks who to contact first.",
        features: ["analyzes leads", "drafts outreach", "prioritizes prospects"],
        stack: ["LangGraph", "FastAPI", "PostgreSQL"],
      },
      {
        number: 18,
        title: "AI Operations Agent",
        summary: "Checks running workflows, summarises their state, and handles the repetitive parts.",
        features: ["checks workflows", "generates summaries", "automates repetitive tasks"],
        stack: ["LangGraph", "n8n", "FastAPI"],
      },
    ],
  },
  {
    week: 7,
    theme: "Production Systems",
    learn: ["Docker", "Redis", "queues", "caching", "rate limiting", "monitoring"],
    projects: [
      {
        number: 19,
        title: "Background Job System",
        summary: "Async task processing with an email queue and scheduled jobs.",
        features: ["async task processing", "email queues", "scheduled jobs"],
        stack: ["Celery", "Redis", "FastAPI", "Docker"],
      },
      {
        number: 20,
        title: "AI SaaS Infrastructure",
        summary: "The plumbing under a paid product: auth, billing, logging, usage tracking, dashboard.",
        features: ["auth", "billing mockup", "logging", "dashboard", "API usage tracking"],
        stack: ["Next.js", "FastAPI", "PostgreSQL", "Redis"],
      },
      {
        number: 21,
        title: "Deployment Pipeline",
        summary: "Frontend, backend, database and workflows all deployed and wired together.",
        features: ["deploy frontend", "deploy backend", "deploy DB", "deploy workflows"],
        stack: ["Docker", "GitHub Actions", "Vercel", "Railway"],
      },
    ],
  },
  {
    week: 8,
    theme: "Full Real-World AI Automation Projects",
    learn: ["system design", "integration", "portfolio-grade delivery"],
    projects: [
      {
        number: 22,
        title: "AI Customer Support Platform",
        summary: "Portfolio-level: a website chatbot with FAQ retrieval, ticket escalation and a live dashboard.",
        features: [
          "website chatbot", "FAQ retrieval", "ticket escalation",
          "live dashboard", "analytics",
        ],
        stack: ["Next.js", "FastAPI", "Supabase", "OpenAI", "n8n"],
      },
      {
        number: 23,
        title: "AI Outreach Automation System",
        summary: "Portfolio-level: scraping, personalisation, sending and reply tracking end to end.",
        features: [
          "lead scraping", "AI personalization", "automated emails",
          "reply tracking", "CRM integration",
        ],
        stack: ["Next.js", "FastAPI", "PostgreSQL", "OpenAI"],
      },
      {
        number: 24,
        title: "AI Workflow Dashboard",
        summary: "Portfolio-level: build workflows, watch them run, read the logs, get told when they break.",
        features: [
          "create workflows", "monitor automations", "workflow logs",
          "notifications", "AI execution history",
        ],
        stack: ["Next.js", "FastAPI", "PostgreSQL", "n8n"],
      },
    ],
  },
  {
    week: 9,
    theme: "Portfolio + Monetization",
    learn: ["positioning", "outreach", "offers", "pricing", "client communication"],
    projects: [
      {
        number: 25,
        title: "Personal Portfolio",
        summary: "Projects, demos, case studies, services and a way to get in touch.",
        features: ["projects", "demos", "case studies", "services", "contact"],
        stack: ["Next.js"],
      },
      {
        number: 26,
        title: "Demo Video System",
        summary: "Loom demos, workflow walkthroughs and architecture explanations for the work already built.",
        features: ["Loom demos", "workflow walkthroughs", "architecture explanations"],
        stack: ["Loom", "OBS"],
      },
      {
        number: 27,
        title: "AI Automation Agency Landing Page",
        summary: "The offer page: AI workflows, support systems, internal tools and consulting.",
        features: [
          "AI workflows offer", "AI support systems offer",
          "AI internal tools offer", "AI automation consulting offer",
        ],
        stack: ["Next.js"],
      },
    ],
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  const rows = CURRICULUM.flatMap((w) =>
    w.projects.map((p) => ({
      number: p.number,
      week: w.week,
      weekTheme: w.theme,
      title: p.title,
      summary: p.summary,
      features: p.features,
      stack: p.stack,
      learningGoals: w.learn,
    })),
  );

  const total = rows.length;
  if (total !== 27) throw new Error(`Expected 27 projects, built ${total}`);

  await db
    .insert(schema.buildProjects)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.buildProjects.number,
      set: {
        week: sql`excluded.week`,
        weekTheme: sql`excluded.week_theme`,
        title: sql`excluded.title`,
        summary: sql`excluded.summary`,
        features: sql`excluded.features`,
        stack: sql`excluded.stack`,
        learningGoals: sql`excluded.learning_goals`,
        updatedAt: new Date(),
      },
    });

  console.log(`Curriculum seeded: ${total} projects across ${CURRICULUM.length} weeks.`);
  console.log("Status, dates, links, notes and build logs were left untouched.");
  await pool.end();
}

main().catch((error) => {
  console.error("Curriculum seed failed:", error);
  process.exit(1);
});
