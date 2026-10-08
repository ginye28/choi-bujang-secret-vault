import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBruteForceDenyRules } from '../xdr/brute-force/connect-ztna.mjs';

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = await syncBruteForceDenyRules();
    process.stdout.write(`${JSON.stringify({
      addedRuleCount: result.addedRules.length,
      activeRuleCount: result.activeRules.length,
      notificationsAppended: result.notificationsAppended,
      evidenceAlertIds: result.addedRules.map((rule) => rule.evidenceAlertId),
      expiresAt: result.addedRules.map((rule) => rule.expiresAt),
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`XDR→ZTNA 연결 오류: ${error instanceof Error ? error.message : '실행 실패'}\n`);
    process.exitCode = 1;
  }
}
