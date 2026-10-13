import { withEventLog } from '../src/event-log.mjs';
import { loadCheckRecord, summarizeCheckRecord } from '../src/check-record.mjs';

// GET /api/checks — 탈환 작전실의 공개 수치(12단계). 제출 점검 기록에서 센 점검 항목·막은 공격·뚫린 공격·
// 실행하지 않은 점검만 돌려줍니다. 요청 주소·메모 본문·사용자 정보는 기록에도 응답에도 없습니다.
async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  return response.status(200).json({ schema: 'aleph.checks.summary.v1', ...summarizeCheckRecord(loadCheckRecord()) });
}

// 응답을 보내기 전에 요청·결과를 서버 요청 기록에 남깁니다(12단계).
export default withEventLog(handler);
