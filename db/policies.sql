-- 학생이 검토한 뒤 직접 실행할 RLS 및 최소 권한 SQL입니다.
-- 이 파일은 public.training_notes 테이블만 대상으로 합니다.

-- 1) PUBLIC 및 API 역할에서 기존 테이블 권한을 회수합니다.
REVOKE ALL ON TABLE public.training_notes FROM PUBLIC, anon, authenticated;

-- 2) 로그인 역할에 필요한 테이블 작업 권한만 부여합니다.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_notes TO authenticated;
-- 서버 함수가 서버 전용 키로 접근하므로 service_role에만 부여하며, anon에는 부여하지 않습니다.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_notes TO service_role;

-- 3) 행 수준 보안을 활성화합니다.
ALTER TABLE public.training_notes ENABLE ROW LEVEL SECURITY;

-- 4) 정책을 다시 만들 수 있도록 같은 이름의 기존 정책을 제거합니다.
DROP POLICY IF EXISTS training_notes_select_own ON public.training_notes;
DROP POLICY IF EXISTS training_notes_insert_own ON public.training_notes;
DROP POLICY IF EXISTS training_notes_update_own ON public.training_notes;
DROP POLICY IF EXISTS training_notes_delete_own ON public.training_notes;

CREATE POLICY training_notes_select_own
  ON public.training_notes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY training_notes_insert_own
  ON public.training_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY training_notes_update_own
  ON public.training_notes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY training_notes_delete_own
  ON public.training_notes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- 확인 쿼리: 이 테이블에 부여된 역할별 권한
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'training_notes'
ORDER BY grantee, privilege_type;

-- 확인 쿼리: 요청된 역할 권한 검사
SELECT has_table_privilege(
  'anon',
  'public.training_notes',
  'SELECT'
) AS anon_can_select,
has_table_privilege(
  'authenticated',
  'public.training_notes',
  'SELECT,INSERT,UPDATE,DELETE'
) AS authenticated_has_requested_privileges,
has_table_privilege(
  'service_role',
  'public.training_notes',
  'SELECT,INSERT,UPDATE,DELETE'
) AS service_role_has_requested_privileges;
