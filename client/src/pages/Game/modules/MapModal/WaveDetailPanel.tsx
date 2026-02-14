import { useMemo } from 'react';
import { formatPercent } from '../../shared/formatAttr';
import type { DungeonPreviewResponse } from '../../../../services/api';
import './WaveDetailPanel.scss';

type DungeonStages = NonNullable<DungeonPreviewResponse['data']>['stages'];
type DungeonWave = NonNullable<DungeonStages[number]['waves']>[number];
type DungeonMonster = NonNullable<DungeonWave['monsters']>[number];

type StageWaveView = {
  key: string;
  stageIndex: number;
  stageName: string;
  waves: Array<{
    key: string;
    waveIndex: number;
    spawnDelaySec: number;
    monsters: DungeonMonster[];
    totalMonsterCount: number;
  }>;
};

interface WaveDetailPanelProps {
  stages: DungeonStages;
  loading: boolean;
}

const formatDropProbPercent = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return formatPercent(Math.max(0, Math.min(1, value)));
};

/**
 * 波次详情展示面板
 * - 作用：把秘境数据按「关卡 -> 波次 -> 怪物与掉落」可视化展示，提升可读性。
 * - 输入：`stages`（后端返回的关卡/波次结构）、`loading`（详情是否仍在加载）。
 * - 输出：仅返回 UI，不修改任何业务状态或数据。
 * - 约束：保持原有字段语义，不新增兜底分支，空数据时给出明确提示。
 */
const WaveDetailPanel = ({ stages, loading }: WaveDetailPanelProps) => {
  const stageViews = useMemo<StageWaveView[]>(
    () =>
      stages.map((stage) => {
        const waves = (stage.waves ?? []).map((wave) => {
          const monsters = wave.monsters ?? [];
          const totalMonsterCount = monsters.reduce((sum, monster) => sum + monster.count, 0);
          return {
            key: `${stage.id}-${wave.wave_index}`,
            waveIndex: wave.wave_index,
            spawnDelaySec: wave.spawn_delay_sec,
            monsters,
            totalMonsterCount,
          };
        });
        return {
          key: stage.id,
          stageIndex: stage.stage_index,
          stageName: stage.name || `第${stage.stage_index}关`,
          waves,
        };
      }),
    [stages],
  );

  const totalWaveCount = useMemo(() => stageViews.reduce((sum, stage) => sum + stage.waves.length, 0), [stageViews]);

  if (loading && totalWaveCount === 0) {
    return <div className="map-modal-empty">加载中...</div>;
  }

  if (totalWaveCount === 0) {
    return <div className="map-modal-empty">暂无波次</div>;
  }

  return (
    <div className="map-modal-wave-board">
      <div className="map-modal-wave-overview">
        <div className="map-modal-wave-overview-cell">
          <span className="map-modal-wave-overview-label">关卡数</span>
          <strong className="map-modal-wave-overview-value">{stageViews.length}</strong>
        </div>
        <div className="map-modal-wave-overview-cell">
          <span className="map-modal-wave-overview-label">总波次</span>
          <strong className="map-modal-wave-overview-value">{totalWaveCount}</strong>
        </div>
      </div>

      {stageViews.map((stage) => (
        <div key={stage.key} className="map-modal-wave-stage">
          <div className="map-modal-wave-stage-head">
            <div className="map-modal-wave-stage-title">
              <span className="map-modal-wave-stage-index">第 {stage.stageIndex} 关</span>
              <span className="map-modal-wave-stage-name">{stage.stageName}</span>
            </div>
            <span className="map-modal-wave-stage-count">{stage.waves.length} 波</span>
          </div>

          {stage.waves.length === 0 ? (
            <div className="map-modal-wave-empty">本关暂无波次配置</div>
          ) : (
            <div className="map-modal-wave-list">
              {stage.waves.map((wave) => (
                <article key={wave.key} className="map-modal-wave-card">
                  <div className="map-modal-wave-badge">第 {wave.waveIndex} 波</div>

                  <div className="map-modal-wave-content">
                    <div className="map-modal-wave-meta">
                      <span>出怪延迟 {wave.spawnDelaySec}s</span>
                      <span>怪物总量 {wave.totalMonsterCount}</span>
                    </div>

                    <div className="map-modal-wave-monsters">
                      {wave.monsters.length === 0 ? (
                        <div className="map-modal-wave-empty">暂无怪物</div>
                      ) : (
                        wave.monsters.map((monster, monsterIndex) => (
                          <div key={`${wave.key}-${monster.id}-${monsterIndex}`} className="map-modal-wave-monster-chip">
                            <span className="map-modal-wave-monster-main">
                              {monster.count}×{monster.name}
                            </span>
                            {monster.realm ? <span className="map-modal-wave-monster-realm">{monster.realm}</span> : null}
                          </div>
                        ))
                      )}
                    </div>

                    {wave.monsters.length > 0 ? (
                      <div className="map-modal-wave-drop-grid">
                        {wave.monsters.map((monster, monsterIndex) => (
                          <div key={`${wave.key}-${monster.id}-${monsterIndex}-drops`} className="map-modal-wave-drop-block">
                            <div className="map-modal-wave-drop-monster">{monster.name}</div>
                            {(monster.drop_preview ?? []).length > 0 ? (
                              <div className="map-modal-wave-drop-list">
                                {(monster.drop_preview ?? []).map((drop, dropIndex) => {
                                  const qty = drop.qty_min === drop.qty_max ? `${drop.qty_min}` : `${drop.qty_min}-${drop.qty_max}`;
                                  const rate =
                                    drop.mode === 'prob'
                                      ? formatDropProbPercent(drop.chance)
                                      : drop.weight !== null
                                        ? `${drop.weight}`
                                        : '-';
                                  const rateLabel = drop.mode === 'prob' ? '概率' : '权重';
                                  return (
                                    <div key={`${wave.key}-${monster.id}-${drop.item.id}-${dropIndex}`} className="map-modal-wave-drop-item">
                                      <span className="map-modal-wave-drop-item-name">
                                        {drop.item.name} ×{qty}
                                      </span>
                                      <span className="map-modal-wave-drop-item-rate">
                                        {rateLabel}:{rate}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="map-modal-wave-drop-empty">暂无掉落预览</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default WaveDetailPanel;
