import assert from 'node:assert/strict';
import test from 'node:test';

import { CLAIM_MAIL_STATUS_UPDATE_SQL } from '../mailService.js';

test('邮件领取状态更新 SQL 应只使用单个 mailId 占位符', () => {
  assert.match(CLAIM_MAIL_STATUS_UPDATE_SQL, /WHERE id = \$1/);
  assert.doesNotMatch(CLAIM_MAIL_STATUS_UPDATE_SQL, /WHERE id = \$2/);
});
