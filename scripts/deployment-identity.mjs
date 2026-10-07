const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || !Number.isInteger(config?.step) || config.step < 1
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || typeof config.sampleMarker !== 'string'
      || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 1단계 시작 틀을 확인하세요.');
  }
  const allowedRoutes = Array.isArray(config.allowedRoutes)
    && config.allowedRoutes.length > 0
    && config.allowedRoutes.length <= 20
    && config.allowedRoutes.every((route) => typeof route === 'string' && route.length > 0 && route.length <= 120)
    ? config.allowedRoutes
    : [];
  let originalApiUrl = null;
  if (typeof config.originalApiUrl === 'string'
      && config.originalApiUrl.startsWith('https://')
      && config.originalApiUrl.length <= 300) {
    try {
      const parsed = new URL(config.originalApiUrl);
      const authority = config.originalApiUrl.match(/^https:\/\/([^/?#]*)/u)?.[1] ?? '';
      if (parsed.protocol === 'https:'
          && parsed.username === ''
          && parsed.password === ''
          && !authority.includes('@')
          && parsed.search === ''
          && parsed.hash === ''
          && !config.originalApiUrl.includes('?')
          && !config.originalApiUrl.includes('#')) {
        originalApiUrl = config.originalApiUrl;
      }
    } catch {
      // Invalid URLs are omitted from the deployment identity.
    }
  }
  return {
    schema: 'aleph.defense.deployment.v1',
    step: config.step,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: `https://${host.toLowerCase()}`,
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    allowedRoutes,
    originalApiUrl,
  };
}
