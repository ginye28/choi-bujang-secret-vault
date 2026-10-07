-- 학생은 이미 Supabase SQL Editor에서 아래와 같은 구조를 실행했습니다.
-- Supabase 학습용 가상 메모 테이블
-- owner_id는 UUID 칸만 두며 auth.users와 외래 키로 연결하지 않습니다.
CREATE TABLE IF NOT EXISTS public.training_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS를 켜고 anon/authenticated 및 PUBLIC의 테이블 권한을 회수합니다.
-- 별도의 읽기 정책이나 GRANT는 추가하지 않습니다.
ALTER TABLE public.training_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.training_notes FROM PUBLIC, anon, authenticated;
