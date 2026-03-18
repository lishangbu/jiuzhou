import { describe, expect, it } from 'vitest';

import type { BattleSessionSnapshotDto } from '../../../../services/api/battleSession';
import { normalizeBattleSessionFromRealtime } from '../battleSessionRealtime';

const createSession = (
  status: BattleSessionSnapshotDto['status'],
): BattleSessionSnapshotDto => ({
  sessionId: 'session-1',
  type: 'pve',
  ownerUserId: 1,
  participantUserIds: [1],
  currentBattleId: 'battle-1',
  status,
  nextAction: status === 'waiting_transition' ? 'advance' : 'none',
  canAdvance: status === 'waiting_transition',
  lastResult: status === 'waiting_transition' ? 'attacker_win' : null,
  context: { monsterIds: ['monster-wild-rabbit'] },
});

describe('normalizeBattleSessionFromRealtime', () => {
  it('battle_abandoned 到达时应清空当前会话，而不是保留 abandoned 快照', () => {
    expect(
      normalizeBattleSessionFromRealtime({
        kind: 'battle_abandoned',
        session: createSession('abandoned'),
      }),
    ).toBeNull();
  });

  it('其他 realtime 类型应继续透传服务端 session', () => {
    const session = createSession('waiting_transition');
    expect(
      normalizeBattleSessionFromRealtime({
        kind: 'battle_finished',
        session,
      }),
    ).toBe(session);
  });
});
