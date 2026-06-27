-- Create exams table
create table if not exists exams (
  id uuid default gen_random_uuid() primary key,
  topic text not null,
  questions jsonb,
  created_by text,
  created_at timestamp default now()
);

-- Create results table
create table if not exists results (
  id uuid default gen_random_uuid() primary key,
  exam_id uuid not null references exams(id) on delete cascade,
  student_id text not null,
  evaluation jsonb,
  integrity jsonb,
  probe_questions jsonb,
  probe_evaluation jsonb,
  gap_depth text,
  confirmed_diagnosis jsonb,
  created_at timestamp default now(),
  -- Prevent duplicate submissions for the same student+exam (DB-3 fix)
  unique(exam_id, student_id)
);

-- Create debates table
create table if not exists debates (
  id uuid default gen_random_uuid() primary key,
  exam_id uuid not null references exams(id) on delete cascade,
  student_id text not null,
  question_id text not null,
  student_answer text,
  original_error_type text,
  original_feedback text,
  conversation_history jsonb default '[]',
  diagnosis jsonb,
  debate_complete boolean default false,
  created_at timestamp default now()
);

-- Performance indexes (PERF-4 fix)
-- These prevent full table scans on the most common query patterns.
create index if not exists idx_results_exam_id on results(exam_id);
create index if not exists idx_results_student_id on results(student_id);
create index if not exists idx_results_exam_student on results(exam_id, student_id);
create index if not exists idx_results_created_at on results(created_at desc);
create index if not exists idx_debates_exam_student on debates(exam_id, student_id);
