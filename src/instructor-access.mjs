// Instructor permission is read from Supabase Auth's server-managed app_metadata.
// Never infer it from a browser menu, request body, or user-editable metadata.
export async function hasStoredInstructorPermission(supabase, identity) {
  if (identity?.kind !== 'student' || typeof identity.userId !== 'string') return false;

  const getUserById = supabase?.auth?.admin?.getUserById;
  if (typeof getUserById !== 'function') {
    throw new TypeError('instructor_permission_lookup_unavailable');
  }

  const { data, error } = await getUserById.call(supabase.auth.admin, identity.userId);
  if (error) throw error;

  const user = data?.user;
  return user?.id === identity.userId && user?.app_metadata?.role === 'instructor';
}
