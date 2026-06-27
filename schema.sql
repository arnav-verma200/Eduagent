-- Create exams table
create table if not exists exams (
  id uuid default gen_random_uuid() primary key,
  topic text,
  questions jsonb,
  created_by text,
  created_at timestamp default now()
);

-- Create results table
create table if not exists results (
  id uuid default gen_random_uuid() primary key,
  exam_id uuid references exams(id) on delete cascade,
  student_id text,
  evaluation jsonb,
  integrity jsonb,
  probe_questions jsonb,
  probe_evaluation jsonb,
  gap_depth text,
  confirmed_diagnosis jsonb,
  created_at timestamp default now()
);

-- Create debates table
create table if not exists debates (
  id uuid default gen_random_uuid() primary key,
  exam_id text,
  student_id text,
  question_id text,
  student_answer text,
  original_error_type text,
  original_feedback text,
  conversation_history jsonb default '[]',
  diagnosis jsonb,
  debate_complete boolean default false,
  created_at timestamp default now()
);
