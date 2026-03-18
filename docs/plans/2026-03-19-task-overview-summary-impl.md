# Task Overview Summary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将任务总览拆成“摘要快照”和“详情列表”两条数据流，缩小 `/api/task/overview` 高频消费场景的返回体积。

**Architecture:** 后端在 `taskService` 中抽出可复用的任务总览行构建逻辑，并基于同一份原始行分别产出 summary DTO 与 detail DTO，避免再次复制筛选/进度拼装。前端保留任务弹窗的详情请求链路，同时为首页角标和房间追踪引入 summary 请求链路，让高频场景只消费最小字段集。

**Tech Stack:** TypeScript、Express、React、Ant Design、共享 DTO 映射

---

### Task 1: 后端任务总览抽象与摘要接口

**Files:**
- Modify: `server/src/services/taskService.ts`
- Modify: `server/src/routes/taskRoutes.ts`

**Step 1: 抽出普通任务 overview 原始行构建函数**

把 `getTaskOverview` 里“读取可见任务定义 + 查询进度 + 组装 rows”的逻辑抽成内部共享函数，确保 summary 与 detail 共用同一数据源。

**Step 2: 基于共享原始行生成 detail DTO**

保留现有 `getTaskOverview` 行为不变，但改为复用新的共享构建函数，避免后续 summary 再复制一份相同拼装。

**Step 3: 新增普通任务 summary DTO 与接口函数**

增加只保留 `id/category/status/tracked/mapId/roomId` 的任务摘要结构，并提供 `/task/overview/summary` 路由。

**Step 4: 新增悬赏任务 summary DTO 与接口函数**

为悬赏任务提供只保留 `id/status/sourceType/expiresAt/remainingSeconds` 的摘要结构，并提供 `/task/bounty/overview/summary` 路由。

### Task 2: 前端 API 与共享请求层拆分

**Files:**
- Modify: `client/src/services/api/task-achievement.ts`
- Modify: `client/src/services/api/index.ts`
- Modify: `client/src/pages/Game/shared/taskOverviewRequests.ts`

**Step 1: 补充 summary DTO 与请求函数**

新增普通任务与悬赏任务摘要响应类型，并导出新的请求方法。

**Step 2: 扩展共享请求层**

在现有请求去重层里加入 summary inflight 状态，保持“详情接口”和“摘要接口”两套链路互不干扰。

### Task 3: 首页高频消费切到 summary

**Files:**
- Modify: `client/src/pages/Game/index.tsx`
- Modify: `client/src/pages/Game/shared/taskIndicator.ts`

**Step 1: 定义首页所需的最小摘要类型消费方式**

让角标统计和房间追踪只依赖 summary 所需字段，不再引用 detail DTO。

**Step 2: 切换首页刷新链路**

把首页初始化/刷新任务角标、追踪房间的请求改为 summary 接口，确保任务弹窗仍走 detail。

### Task 4: 类型校验与回归确认

**Files:**
- Verify: `server/src/services/taskService.ts`
- Verify: `client/src/pages/Game/index.tsx`
- Verify: `client/src/pages/Game/modules/TaskModal/taskModalShared.ts`

**Step 1: 自查接口边界**

确认任务弹窗仍能拿到 `description/objectives/rewards`，首页只拿摘要字段，不引入 fallback 或兼容分支。

**Step 2: 运行 TypeScript 构建校验**

运行 `tsc -b`，若报错则修复直到通过。
