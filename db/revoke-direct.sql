-- 학생이 검토한 뒤 직접 실행할 SQL입니다.
-- public.training_notes만 대상으로 하며 service_role 권한은 변경하지 않습니다.
-- 적용 전 권한을 기록하려면, 파일 마지막의 확인 쿼리를 먼저 실행하고 결과를 보관하세요.

REVOKE ALL ON TABLE public.training_notes FROM PUBLIC, anon, authenticated;

-- RLS를 켠 상태로 유지하고, 지정된 기존 소유자별 정책만 제거합니다.
ALTER TABLE public.training_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS training_notes_select_own ON public.training_notes;
DROP POLICY IF EXISTS training_notes_insert_own ON public.training_notes;
DROP POLICY IF EXISTS training_notes_update_own ON public.training_notes;
DROP POLICY IF EXISTS training_notes_delete_own ON public.training_notes;

-- 적용 전후 권한 확인 쿼리
-- 아래 두 쿼리를 적용 전에 실행해 결과를 기록하고, 이 SQL 적용 후 다시 실행해 비교하세요.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'training_notes'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

WITH roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), privileges(privilege_type) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
)
SELECT
  roles.role_name,
  privileges.privilege_type,
  has_table_privilege(
    roles.role_name,
    'public.training_notes',
    privileges.privilege_type
  ) AS has_privilege
FROM roles
CROSS JOIN privileges
ORDER BY roles.role_name, privileges.privilege_type;
