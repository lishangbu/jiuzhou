/**
 * 控制效果名称映射（战斗日志 / 技能描述共用）
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：集中维护控制类型到中文名的映射，并提供统一翻译函数。
 * - 不做什么：不负责控制效果的业务判定，不负责文案句式拼接。
 *
 * 输入/输出：
 * - 输入：控制类型字符串，如 `root`、`freeze`、`silence`。
 * - 输出：对应中文名称；未收录时原样返回，空值返回空字符串。
 *
 * 数据流/状态流：
 * - 战斗日志与技能效果格式化模块传入原始 controlType
 * - 本模块完成名称归一化与中文翻译
 * - 调用方继续拼接自己的展示文案，保证“同一控制 = 同一中文名”
 *
 * 关键边界条件与坑点：
 * 1) 传入 null / undefined / 空白字符串时直接返回空字符串，避免调用方拼出脏文案。
 * 2) 未知控制类型保留原值返回，方便尽早暴露数据问题，而不是静默替换成含糊文本。
 */

const CONTROL_LABEL_MAP: Record<string, string> = {
  stun: "眩晕",
  freeze: "冻结",
  silence: "沉默",
  disarm: "缴械",
  root: "定身",
  taunt: "嘲讽",
  fear: "恐惧",
};

export function translateControlName(controlType: string | null | undefined): string {
  const raw = String(controlType ?? "").trim();
  if (!raw) return "";
  return CONTROL_LABEL_MAP[raw] ?? raw;
}
