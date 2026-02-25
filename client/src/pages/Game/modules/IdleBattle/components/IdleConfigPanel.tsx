/**
 * IdleConfigPanel — 挂机配置面板
 *
 * 作用：
 *   提供地图/房间选择、最大挂机时长（1min~8h）、技能策略槽位（最多 6 个）的配置界面。
 *   Stamina 不足时禁用"开始挂机"按钮并显示提示。
 *   不包含任何状态管理逻辑，所有状态通过 props 传入。
 *
 * 输入/输出：
 *   - config: 当前配置草稿
 *   - stamina: 当前 Stamina 值（用于禁用判断）
 *   - isActive: 是否有活跃会话（有则禁用配置修改）
 *   - onConfigChange: 配置变更回调
 *   - onStart: 开始挂机回调
 *   - onStop: 停止挂机回调
 *
 * 数据流：
 *   useIdleBattle.config → props.config → 本地 Select/Slider 展示
 *   用户操作 → onConfigChange → useIdleBattle.setConfig → 重新渲染
 *
 * 关键边界条件：
 *   1. stamina <= 0 时"开始挂机"按钮 disabled，显示 Stamina 不足提示
 *   2. isActive = true 时地图/房间/时长/技能策略均不可修改（只读展示）
 *   3. 技能槽位最多 6 个，超出时"添加槽位"按钮 disabled
 */

import React, { useEffect, useState } from 'react';
import { Button, Select, Slider, InputNumber, Tag, Space, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getEnabledMaps, getMapDetail, type MapDefLite, type MapRoom } from '../../../../../services/api/world';
import type { IdleConfigDto, AutoSkillSlotDto } from '../types';

// ============================================
// 常量
// ============================================

const MIN_DURATION_MS = 60_000;
const MAX_DURATION_MS = 28_800_000;
const MAX_SKILL_SLOTS = 6;

/** 时长预设选项（ms） */
const DURATION_PRESETS: Array<{ label: string; value: number }> = [
  { label: '1小时', value: 3_600_000 },
  { label: '2小时', value: 7_200_000 },
  { label: '4小时', value: 14_400_000 },
  { label: '8小时', value: 28_800_000 },
];

// ============================================
// Props
// ============================================

interface IdleConfigPanelProps {
  config: IdleConfigDto;
  stamina: number;
  isActive: boolean;
  isStopping: boolean;
  isLoading: boolean;
  onConfigChange: (patch: Partial<IdleConfigDto>) => void;
  onStart: () => void;
  onStop: () => void;
  onSave: () => void;
}

// ============================================
// 组件
// ============================================

const IdleConfigPanel: React.FC<IdleConfigPanelProps> = ({
  config,
  stamina,
  isActive,
  isStopping,
  isLoading,
  onConfigChange,
  onStart,
  onStop,
  onSave,
}) => {
  const [maps, setMaps] = useState<MapDefLite[]>([]);
  const [rooms, setRooms] = useState<MapRoom[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);

  // 加载地图列表
  useEffect(() => {
    setMapsLoading(true);
    void getEnabledMaps()
      .then((res) => {
        if (res.success && res.data?.maps) {
          // 只展示有怪物的野外地图（map_type = 'field'）
          setMaps(res.data.maps.filter((m) => m.map_type === 'field'));
        }
      })
      .finally(() => setMapsLoading(false));
  }, []);

  // 地图变更时加载房间列表
  useEffect(() => {
    if (!config.mapId) {
      setRooms([]);
      return;
    }
    setRoomsLoading(true);
    void getMapDetail(config.mapId)
      .then((res) => {
        if (res.success && res.data?.rooms) {
          // 只展示有怪物的房间
          setRooms(res.data.rooms.filter((r) => (r.monsters?.length ?? 0) > 0));
        }
      })
      .finally(() => setRoomsLoading(false));
  }, [config.mapId]);

  const handleMapChange = (mapId: string) => {
    onConfigChange({ mapId, roomId: null });
  };

  const handleRoomChange = (roomId: string) => {
    onConfigChange({ roomId });
  };

  const handleDurationChange = (ms: number) => {
    onConfigChange({ maxDurationMs: ms });
  };

  // 技能槽位操作
  const handleAddSlot = () => {
    if (config.autoSkillPolicy.slots.length >= MAX_SKILL_SLOTS) return;
    const nextPriority = config.autoSkillPolicy.slots.length + 1;
    onConfigChange({
      autoSkillPolicy: {
        slots: [...config.autoSkillPolicy.slots, { skillId: '', priority: nextPriority }],
      },
    });
  };

  const handleRemoveSlot = (index: number) => {
    const next = config.autoSkillPolicy.slots.filter((_, i) => i !== index);
    onConfigChange({ autoSkillPolicy: { slots: next } });
  };

  const handleSlotChange = (index: number, patch: Partial<AutoSkillSlotDto>) => {
    const next = config.autoSkillPolicy.slots.map((slot, i) =>
      i === index ? { ...slot, ...patch } : slot
    );
    onConfigChange({ autoSkillPolicy: { slots: next } });
  };

  const canStart = stamina > 0 && !!config.mapId && !!config.roomId && !isActive;
  const durationMinutes = Math.round(config.maxDurationMs / 60_000);

  return (
    <div className="idle-config-panel">
      {/* 地图选择 */}
      <div className="idle-config-row">
        <label className="idle-config-label">挂机地图</label>
        <Select
          className="idle-config-select"
          value={config.mapId ?? undefined}
          onChange={handleMapChange}
          loading={mapsLoading}
          disabled={isActive || isStopping}
          placeholder="选择地图"
          options={maps.map((m) => ({ value: m.id, label: m.name }))}
        />
      </div>

      {/* 房间选择 */}
      <div className="idle-config-row">
        <label className="idle-config-label">挂机房间</label>
        <Select
          className="idle-config-select"
          value={config.roomId ?? undefined}
          onChange={handleRoomChange}
          loading={roomsLoading}
          disabled={isActive || isStopping || !config.mapId}
          placeholder="选择房间"
          options={rooms.map((r) => ({
            value: r.id,
            label: r.name,
            title: r.description,
          }))}
        />
      </div>

      {/* 挂机时长 */}
      <div className="idle-config-row">
        <label className="idle-config-label">挂机时长</label>
        <div className="idle-config-duration">
          <Space wrap size={4}>
            {DURATION_PRESETS.map((p) => (
              <Tag.CheckableTag
                key={p.value}
                checked={config.maxDurationMs === p.value}
                onChange={() => !isActive && !isStopping && handleDurationChange(p.value)}
              >
                {p.label}
              </Tag.CheckableTag>
            ))}
          </Space>
          <div className="idle-config-duration-custom">
            <Slider
              min={MIN_DURATION_MS / 60_000}
              max={MAX_DURATION_MS / 60_000}
              step={30}
              value={durationMinutes}
              onChange={(v) => handleDurationChange(v * 60_000)}
              disabled={isActive || isStopping}
              tooltip={{ formatter: (v) => `${v}分钟` }}
            />
            <InputNumber
              min={MIN_DURATION_MS / 60_000}
              max={MAX_DURATION_MS / 60_000}
              value={durationMinutes}
              onChange={(v) => v !== null && handleDurationChange(v * 60_000)}
              disabled={isActive || isStopping}
              addonAfter="分钟"
              size="small"
              style={{ width: 120 }}
            />
          </div>
        </div>
      </div>

      {/* 技能策略槽位 */}
      <div className="idle-config-row idle-config-row--skills">
        <label className="idle-config-label">
          技能策略
          <span className="idle-config-label-hint">（按优先级顺序释放，最多 {MAX_SKILL_SLOTS} 个）</span>
        </label>
        <div className="idle-skill-slots">
          {config.autoSkillPolicy.slots.map((slot, index) => (
            <div key={index} className="idle-skill-slot">
              <span className="idle-skill-slot-priority">P{slot.priority}</span>
              <InputNumber
                className="idle-skill-slot-id"
                value={slot.skillId || undefined}
                placeholder="技能 ID"
                onChange={(v) => handleSlotChange(index, { skillId: String(v ?? '') })}
                disabled={isActive || isStopping}
                size="small"
              />
              <InputNumber
                className="idle-skill-slot-prio"
                min={1}
                max={99}
                value={slot.priority}
                onChange={(v) => v !== null && handleSlotChange(index, { priority: v })}
                disabled={isActive || isStopping}
                size="small"
                addonBefore="优先级"
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleRemoveSlot(index)}
                disabled={isActive || isStopping}
                size="small"
              />
            </div>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={handleAddSlot}
            disabled={isActive || isStopping || config.autoSkillPolicy.slots.length >= MAX_SKILL_SLOTS}
            size="small"
            block
          >
            添加技能槽位
          </Button>
        </div>
      </div>

      {/* Stamina 提示 */}
      {stamina <= 0 && (
        <div className="idle-config-stamina-warn">
          Stamina 不足，无法开始挂机
        </div>
      )}

      {/* 操作按钮 */}
      <div className="idle-config-actions">
        {!isActive && !isStopping ? (
          <>
            <Button onClick={onSave} disabled={isLoading} size="small">
              保存配置
            </Button>
            <Tooltip title={stamina <= 0 ? 'Stamina 不足' : (!config.mapId || !config.roomId) ? '请先选择地图和房间' : ''}>
              <Button
                type="primary"
                onClick={onStart}
                disabled={!canStart || isLoading}
                loading={isLoading}
              >
                开始挂机
              </Button>
            </Tooltip>
          </>
        ) : (
          <Button
            danger
            onClick={onStop}
            loading={isStopping}
            disabled={isStopping}
          >
            {isStopping ? '停止中...' : '停止挂机'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default IdleConfigPanel;
