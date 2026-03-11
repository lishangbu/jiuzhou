# 坊市部分购买 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为坊市挂单增加自定义数量购买能力，并在部分成交后按剩余比例退还下架手续费。

**Architecture:** 保持单条 `market_listing` 挂单模型不变，通过新增 `original_qty` 记录原始挂单数量。后端抽取共享数量/金额计算函数，统一驱动创建挂单、部分购买与按比例退手续费；前端抽取共享购买数量工具，统一桌面和移动端交互。

**Tech Stack:** TypeScript, React, Ant Design, Express, PostgreSQL, Prisma schema

---

### Task 1: 补设计依赖与失败测试

**Files:**
- Create: `server/src/services/__tests__/marketListingPurchaseShared.test.ts`
- Create: `client/src/pages/Game/modules/MarketModal/__tests__/marketBuyShared.test.ts`

**Step 1: 写后端共享金额/数量测试**

- 断言购买数量会被规范到 `1 ~ listingQty`。
- 断言部分购买时总价按 `buyQty * unitPrice` 计算。
- 断言下架退款按 `listing_fee_silver * remainingQty / originalQty` 向下取整。

**Step 2: 写前端共享购买状态测试**

- 断言 `qty=1` 时无需自定义数量。
- 断言 `qty>1` 时会展示批量购买文案与正确总价。
- 断言输入数量越界会被夹紧到合法范围。

**Step 3: 不运行测试，继续最小实现**

- 按项目约束不执行测试命令，仅保留测试文件作为回归覆盖。

### Task 2: 实现后端共享购买规则

**Files:**
- Create: `server/src/services/shared/marketListingPurchaseShared.ts`
- Modify: `server/src/services/marketService.ts`
- Modify: `server/prisma/schema.prisma`

**Step 1: 创建共享纯函数**

- 提供购买数量规范化。
- 提供部分购买金额计算。
- 提供手续费比例退还计算。

**Step 2: 改造创建挂单**

- 插入 `market_listing` 时写入 `original_qty`。

**Step 3: 改造部分购买**

- `buyMarketListing` 接收 `qty`。
- 本次成交按 `buyQty` 计算总价、税费、邮件附件和成交记录。
- 部分购买后只更新剩余数量；整单购买时沿用原售罄流程。

**Step 4: 改造下架退款**

- 读取 `original_qty` 与当前 `qty`。
- 统一通过共享函数计算退款金额并返回提示文案。

### Task 3: 实现前端自定义购买数量

**Files:**
- Create: `client/src/pages/Game/modules/MarketModal/marketBuyShared.ts`
- Modify: `client/src/services/api/market-mail.ts`
- Modify: `client/src/pages/Game/modules/MarketModal/index.tsx`

**Step 1: 创建前端共享购买工具**

- 规范化输入数量。
- 计算购买总价与文案。
- 给桌面与移动端复用。

**Step 2: 改造 API**

- `buyMarketListing` 支持提交 `{ listingId, qty }`。

**Step 3: 改造 UI**

- `qty === 1` 时保持一键购买。
- `qty > 1` 时弹出统一购买弹窗。
- 桌面列表、移动列表、移动预览抽屉全部复用同一套购买状态与确认逻辑。

### Task 4: 静态校验与收尾

**Files:**
- Modify: 如实现中受影响文件

**Step 1: 复查类型与重复逻辑**

- 确认没有在前后端重复实现数量校验与退款计算。

**Step 2: 运行 TypeScript 构建校验**

- Run: `tsc -b`

**Step 3: 汇总变更与风险**

- 明确说明未执行测试命令，仅完成测试文件补充与 `tsc -b` 校验。
