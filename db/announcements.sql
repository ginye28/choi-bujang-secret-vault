-- 기존 training_notes와 자료 주소를 건드리지 않고 별도 공지 자원 테이블을 추가합니다.
-- 검토 후 Supabase SQL Editor에서 한 번 실행하세요.
CREATE TABLE IF NOT EXISTS public.instructor_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 이 자료실에서는 공지 조회를 로그인한 뒤 서버 API가 처리합니다.
-- 브라우저 역할의 직접 테이블 접근은 허용하지 않으며 API 서버의 service_role만 사용합니다.
ALTER TABLE public.instructor_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.instructor_announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.instructor_announcements TO service_role;

-- 공지 작성·수정·삭제는 이 API에서 제공하지 않습니다.
-- 강사 공지 등록은 검토된 운영자 절차로 진행하고 실제 개인 정보는 넣지 마세요.

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'instructor_announcements'
ORDER BY grantee, privilege_type;

SELECT
  has_table_privilege('anon', 'public.instructor_announcements', 'SELECT') AS anon_can_select,
  has_table_privilege('authenticated', 'public.instructor_announcements', 'SELECT') AS authenticated_can_select,
  has_table_privilege('service_role', 'public.instructor_announcements', 'SELECT') AS service_role_can_select;
-- 기대: anon/authenticated false, service_role true.
