/**
 * AutoSkillPolicyCodec — 自动技能策略序列化/解析/校验
 *
 * 作用：
 *   提供 AutoSkillPolicy 的序列化（→ JSON 字符串）、解析（JSON 字符串 → 对象）
 *   和校验（unknown → 类型安全对象）三个纯函数。
 *   不包含任何副作用，不依赖数据库或外部服务。
 *
 * 输入/输出：
 *   - serializeAutoSkillPolicy(policy: AutoSkillPolicy): string
 *       输入合法策略对象，输出 2 空格缩进的 JSON 字符串（slots 按 priority 升序排列）
 *   - validateAutoSkillPolicy(raw: unknown): ValidationResult<AutoSkillPolicy>
 *       输入任意值，输出校验结果（收集全部字段错误，不提前中止）
 *   - parseAutoSkillPolicy(json: string): ParseResult<AutoSkillPolicy>
 *       输入 JSON 字符串，先解析再校验，成功时返回 slots 按 priority 升序排列的策略对象
 *
 * 数据流：
 *   客户端 PUT /api/idle/config → idleRoutes → parseAutoSkillPolicy → validateAutoSkillPolicy
 *   → 合法策略写入 idle_configs.auto_skill_policy（JSONB）
 *   读取时：JSONB → serializeAutoSkillPolicy（用于往返校验）
 *
 * 关键边界条件：
 *   1. 往返属性：parseAutoSkillPolicy(serializeAutoSkillPolicy(p)) 必须成功，
 *      且 serializeAutoSkillPolicy(result.value) === serializeAutoSkillPolicy(p)
 *      保证依赖：serializeAutoSkillPolicy 在序列化前对 slots 按 priority 升序排序，
 *      parseAutoSkillPolicy 在返回前同样对 slots 排序，两者排序逻辑一致。
 *   2. 全量错误收集：validateAutoSkillPolicy 不在遇到第一个错误时停止，
 *      而是遍历所有 slots 后一次性返回所有 FieldError，便于前端批量展示。
 *   3. slots 最多 6 个：超出时返回 path="slots" 的错误，不再校验各槽位内部字段。
 *   4. JSON 解析失败时返回 path="" 的错误，与字段路径错误区分。
 */

import type {
  AutoSkillPolicy,
  AutoSkillSlot,
  ParseResult,
  ValidationResult,
  FieldError,
} from './types.js';

// ============================================
// 内部工具
// ============================================

/**
 * 对 slots 按 priority 升序排序（不修改原数组，返回新数组）
 * 排序稳定性：priority 相同时保持原始顺序（Array.prototype.sort 在 V8 中稳定）
 */
function sortSlotsByPriority(slots: AutoSkillSlot[]): AutoSkillSlot[] {
  return [...slots].sort((a, b) => a.priority - b.priority);
}

// ============================================
// 公开函数
// ============================================

/**
 * 将 AutoSkillPolicy 序列化为 JSON 字符串（Pretty_Printer，2 空格缩进）
 *
 * 输出格式稳定：序列化前对 slots 按 priority 升序排列，
 * 保证相同语义的策略对象始终产生相同字符串（往返属性的前提）。
 */
export function serializeAutoSkillPolicy(policy: AutoSkillPolicy): string {
  const normalized: AutoSkillPolicy = {
    slots: sortSlotsByPriority(policy.slots),
  };
  return JSON.stringify(normalized, null, 2);
}

/**
 * 校验 raw 是否符合 AutoSkillPolicy 结构
 *
 * 校验规则（全量收集，不提前中止）：
 *   - raw 不是对象或为 null → path="slots", message="..."
 *   - raw.slots 不是数组    → path="slots", message="..."
 *   - raw.slots.length > 6  → path="slots", message="技能槽位最多 6 个"（不再校验内部字段）
 *   - raw.slots[i].skillId 不是非空字符串 → path="slots[i].skillId", message="..."
 *   - raw.slots[i].priority 不是有限数字  → path="slots[i].priority", message="..."
 *
 * 返回：
 *   - 无错误 → { success: true, value: AutoSkillPolicy }（slots 已按 priority 升序排列）
 *   - 有错误 → { success: false, errors: FieldError[] }
 */
export function validateAutoSkillPolicy(raw: unknown): ValidationResult<AutoSkillPolicy> {
  const errors: FieldError[] = [];

  // 检查顶层是否为非 null 对象
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    errors.push({ path: 'slots', message: '策略必须是一个对象' });
    return { success: false, errors };
  }

  const obj = raw as Record<string, unknown>;

  // 检查 slots 字段是否为数组
  if (!Array.isArray(obj['slots'])) {
    errors.push({ path: 'slots', message: 'slots 必须是数组' });
    return { success: false, errors };
  }

  const slots = obj['slots'] as unknown[];

  // 检查 slots 数量上限
  if (slots.length > 6) {
    errors.push({ path: 'slots', message: '技能槽位最多 6 个' });
    // 超出上限时不再校验内部字段，直接返回
    return { success: false, errors };
  }

  // 逐一校验每个槽位
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];

    if (typeof slot !== 'object' || slot === null || Array.isArray(slot)) {
      // 槽位本身不是对象，两个子字段都报错
      errors.push({ path: `slots[${i}].skillId`, message: 'skillId 必须是非空字符串' });
      errors.push({ path: `slots[${i}].priority`, message: 'priority 必须是有限数字' });
      continue;
    }

    const slotObj = slot as Record<string, unknown>;

    // 校验 skillId：必须是非空字符串
    if (typeof slotObj['skillId'] !== 'string' || slotObj['skillId'].trim() === '') {
      errors.push({ path: `slots[${i}].skillId`, message: 'skillId 必须是非空字符串' });
    }

    // 校验 priority：必须是有限数字
    if (typeof slotObj['priority'] !== 'number' || !Number.isFinite(slotObj['priority'])) {
      errors.push({ path: `slots[${i}].priority`, message: 'priority 必须是有限数字' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // 校验通过，构造类型安全的结果并按 priority 升序排列
  const validSlots: AutoSkillSlot[] = (slots as Array<Record<string, unknown>>).map((s) => ({
    skillId: s['skillId'] as string,
    priority: s['priority'] as number,
  }));

  return {
    success: true,
    value: { slots: sortSlotsByPriority(validSlots) },
  };
}

/**
 * 从 JSON 字符串解析 AutoSkillPolicy
 *
 * 步骤：
 *   1. JSON.parse（失败 → { success: false, errors: [{ path: "", message: "JSON 格式错误" }] }）
 *   2. validateAutoSkillPolicy 校验
 *   3. 校验通过时，slots 已由 validateAutoSkillPolicy 按 priority 升序排列后返回
 *
 * 往返保证：
 *   parseAutoSkillPolicy(serializeAutoSkillPolicy(p)).value 与 p 语义等价，
 *   且 serializeAutoSkillPolicy(result.value) === serializeAutoSkillPolicy(p)
 */
export function parseAutoSkillPolicy(json: string): ParseResult<AutoSkillPolicy> {
  let raw: unknown;

  try {
    raw = JSON.parse(json);
  } catch {
    return {
      success: false,
      errors: [{ path: '', message: 'JSON 格式错误' }],
    };
  }

  return validateAutoSkillPolicy(raw);
}
