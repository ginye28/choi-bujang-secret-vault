// 제품 설정값을 한 곳에 모읍니다. 숫자를 코드 곳곳에 박아 두지 않습니다.
// 5차 변경 요구(탐지 시간 창·승인 유효기간)가 오면 이 파일의 값만 바꾸면 되도록 두었습니다.
export const CONFIG = Object.freeze({
  // D2 탐지 규칙 burst_read: 같은 subject 의 kind 'read' 사건 가운데
  // 시각 차이가 windowMs 미만인 사건이 minEvents 건 이상 모이면 incident 하나.
  burst: Object.freeze({ rule: 'burst_read', kind: 'read', windowMs: 600_000, minEvents: 121 }),

  // D3 대응: 제안한 뒤 이 시간(ms) 안에 승인하지 않으면 만료합니다. null 이면 만료 없음(현재 계약).
  approvalTtlMs: null,
  // 승인한 작업을 집행하는 동안 다른 요청이 같은 작업을 집행하지 못하게 막는 기간(ms).
  // 이 기간이 지나도 끝나지 않은 작업(서버가 도중에 멈춘 경우)만 다시 이어서 집행할 수 있습니다.
  leaseMs: 60_000,
  // 집행 재시도에 쓸 수 있는 전체 시간 예산(ms). 공개 계약 retryDecision 의 기본값과 같습니다.
  retryBudgetMs: 10_000,

  limits: Object.freeze({
    eventBatch: 10_000, // 한 번에 받는 사건 수
    eventBytes: 16_384, // 사건 하나의 직렬화 크기
    policyBytes: 262_144, // 정책 초안 하나의 직렬화 크기
    resourceBytes: 65_536, // 보호 자원 자료 하나의 직렬화 크기
    queryLimitMax: 1000,
    historyLimitMax: 1000,
  }),
});
