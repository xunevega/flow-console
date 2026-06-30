import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL || "";

if (!databaseUrl) {
  console.error("Missing DATABASE_URL. Run this script inside the Flow Console or Postgres Railway environment.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
  max: 1,
});

const sql = `
create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'nota',
  project text not null default 'otro',
  source text not null default 'manual',
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'validado',
  author text,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk_index integer not null default 0,
  content text not null,
  embedding vector(1024) not null,
  metadata jsonb not null default '{}'::jsonb,
  retrieval_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists document_chunks_document_idx_unique
  on document_chunks (document_id, chunk_index);

create index if not exists documents_project_idx
  on documents (project);

create index if not exists documents_type_idx
  on documents (type);

create index if not exists document_chunks_embedding_hnsw_idx
  on document_chunks using hnsw (embedding vector_cosine_ops);
`;

try {
  await pool.query(sql);
  console.log("RAG pgvector schema is ready.");
} finally {
  await pool.end();
}
