-- Supabase SQL Editor에서 검토 후 실행하세요.
-- public.training_notes 한 테이블의 PUBLIC, anon, authenticated 권한만 회수합니다.
-- 다른 테이블, RLS 정책, service_role 권한은 변경하지 않습니다.
--
-- 적용 전·후 비교:
-- 1) 아래 '적용 전 확인' 쿼리 두 개를 먼저 실행하고 결과를 보관합니다.
-- 2) REVOKE 문을 실행합니다.
-- 3) 아래 '적용 후 확인'의 같은 쿼리를 실행해 결과를 비교합니다.

-- 적용 전 확인 1: 테이블 ACL에 직접 기록된 권한
SELECT
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_class AS table_info
JOIN pg_namespace AS schema_info ON schema_info.oid = table_info.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(table_info.relacl, acldefault('r', table_info.relowner))
) AS acl
WHERE schema_info.nspname = 'public'
  AND table_info.relname = 'training_notes'
  AND (
    acl.grantee = 0
    OR pg_get_userbyid(acl.grantee) IN ('anon', 'authenticated', 'service_role')
  )
ORDER BY grantee, acl.privilege_type;

-- 적용 전 확인 2: API 역할의 유효 권한 (PUBLIC 권한도 반영됩니다)
SELECT
  roles.role_name,
  has_table_privilege(roles.role_name, 'public.training_notes', 'SELECT') AS can_select,
  has_table_privilege(roles.role_name, 'public.training_notes', 'INSERT') AS can_insert,
  has_table_privilege(roles.role_name, 'public.training_notes', 'UPDATE') AS can_update,
  has_table_privilege(roles.role_name, 'public.training_notes', 'DELETE') AS can_delete
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name)
ORDER BY roles.role_name;

-- 변경: 지정된 한 테이블에서만 직접 권한을 회수합니다.
REVOKE ALL PRIVILEGES ON TABLE public.training_notes FROM PUBLIC, anon, authenticated;

-- 적용 후 확인: 위의 두 확인 쿼리를 다시 실행하세요.
-- anon/authenticated의 네 권한은 모두 false여야 합니다.
-- service_role의 권한은 적용 전과 같아야 합니다.
-- ACL 결과에는 PUBLIC, anon, authenticated 권한이 없어야 합니다.
-- (적용 후 확인을 위해 같은 두 쿼리를 다시 복사해 실행하세요.)

-- 아래 SQL을 선택 실행해 적용 후 확인할 수 있습니다.
SELECT
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_class AS table_info
JOIN pg_namespace AS schema_info ON schema_info.oid = table_info.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(table_info.relacl, acldefault('r', table_info.relowner))
) AS acl
WHERE schema_info.nspname = 'public'
  AND table_info.relname = 'training_notes'
  AND (
    acl.grantee = 0
    OR pg_get_userbyid(acl.grantee) IN ('anon', 'authenticated', 'service_role')
  )
ORDER BY grantee, acl.privilege_type;

SELECT
  roles.role_name,
  has_table_privilege(roles.role_name, 'public.training_notes', 'SELECT') AS can_select,
  has_table_privilege(roles.role_name, 'public.training_notes', 'INSERT') AS can_insert,
  has_table_privilege(roles.role_name, 'public.training_notes', 'UPDATE') AS can_update,
  has_table_privilege(roles.role_name, 'public.training_notes', 'DELETE') AS can_delete
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name)
ORDER BY roles.role_name;
