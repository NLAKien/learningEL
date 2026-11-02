-- Bản 2: schema cho Supabase (PostgreSQL). Chạy trong SQL Editor của Supabase
-- hoặc bằng Supabase CLI: supabase db push

create table public.cards (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  lemma            text not null,
  surface          text not null,
  context          text not null,
  meaning          text,
  phonetic         text,
  -- trạng thái SM-2
  repetitions      int  not null default 0,
  interval_days    int  not null default 0,
  ease_factor      real not null default 2.5,
  due_at           timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, lemma)
);
create index cards_user_due_idx on public.cards (user_id, due_at);

-- Nhật ký mỗi lần ôn: cần cho FSRS sau này và để đo đạc (khóa luận)
create table public.review_logs (
  id              bigint generated always as identity primary key,
  card_id         uuid not null references public.cards (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  grade           smallint not null check (grade between 0 and 3),
  interval_before int not null,
  interval_after  int not null,
  reviewed_at     timestamptz not null default now()
);
create index review_logs_user_idx on public.review_logs (user_id, reviewed_at);

-- Từ người dùng đã đánh dấu "đã biết"
create table public.known_words (
  user_id    uuid not null references auth.users (id) on delete cascade,
  lemma      text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, lemma)
);

-- Row Level Security: mỗi người chỉ đọc/ghi dữ liệu của chính mình
alter table public.cards       enable row level security;
alter table public.review_logs enable row level security;
alter table public.known_words enable row level security;

create policy "own cards" on public.cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own review logs" on public.review_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own known words" on public.known_words
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
