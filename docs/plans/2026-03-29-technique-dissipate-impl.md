# 角色功法散功 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为角色已学功法增加仅针对未装配功法的“散功”能力，并在功法面板提供确认操作入口。

**Architecture:** 后端把散功规则收口到 `characterTechniqueService` 与对应路由，保证“仅未装配可散功”的校验只有一份。前端通过功法面板共享纯函数集中维护按钮态与确认文案，避免 JSX 内散落重复判断与字符串。

**Tech Stack:** TypeScript、React、Ant Design、Node.js、Express、node:test、Vitest

---

### Task 1: 固化散功文案与按钮态共享模块

**Files:**
- Create: `client/src/pages/Game/modules/TechniqueModal/techniqueDissipateShared.ts`
- Test: `client/src/pages/Game/modules/TechniqueModal/__tests__/techniqueDissipateShared.test.ts`

**Step 1: 写前端回归测试**

- 覆盖“未装配时按钮为散功”“已装配时按钮禁用且文案提示先取消运功”“确认文案明确不返还资源或功法书”。

**Step 2: 写最小共享实现**

- 输出按钮状态解析函数。
- 输出确认标题与确认文案构造函数。

**Step 3: 静态校验**

- 不执行测试命令，保留测试文件作为回归约束。

### Task 2: 新增服务端散功能力

**Files:**
- Modify: `server/src/services/characterTechniqueService.ts`
- Modify: `server/src/routes/characterTechniqueRoutes.ts`
- Test: `server/src/services/__tests__/characterTechniqueDissipate.test.ts`

**Step 1: 写服务端回归测试**

- 覆盖“未装配功法可散功并删除记录”。
- 覆盖“已装配功法不可散功”。
- 覆盖“未学习功法时返回失败”。

**Step 2: 写最小服务实现**

- 在 `characterTechniqueService` 新增 `dissipateTechnique`。
- 在路由层新增散功接口并沿用现有角色权限校验与角色推送。

**Step 3: 复查热路径**

- 确认只锁定目标行，不额外扫描列表。
- 确认不引入战斗快照与技能槽刷新等无收益重操作。

### Task 3: 接入功法面板 UI

**Files:**
- Modify: `client/src/services/api/technique.ts`
- Modify: `client/src/services/api.ts`
- Modify: `client/src/pages/Game/modules/TechniqueModal/index.tsx`

**Step 1: 接 API**

- 新增 `dissipateCharacterTechnique(characterId, techniqueId)`。

**Step 2: 接 UI**

- 在“已学功法”列表增加 `散功` 按钮。
- 按共享模块控制按钮态与确认文案。
- 成功后刷新功法状态。

**Step 3: 校对交互**

- 确认移动端与桌面端都能显示一致入口。
- 确认已运功功法不会误触发散功请求。

### Task 4: 最终校验

**Files:**
- Modify: `docs/plans/2026-03-29-technique-dissipate-design.md`
- Modify: `docs/plans/2026-03-29-technique-dissipate-impl.md`

**Step 1: 自查实现与设计一致性**

- 核对规则、文案、接口路径与 UI 入口。

**Step 2: 运行允许的校验命令**

- Run: `tsc -b`
- Expected: 成功构建；若失败，逐条修复直到剩余问题可解释。

**Step 3: 汇总交付结果**

- 输出变更清单、性能说明与 `tsc -b` 结果。
