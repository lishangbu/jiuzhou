# 2026-04-07 库存与结算 Cache-First 改造进度

## 目标

把高频结算与库存相关写路径从“同步直写 DB”改成“Redis Delta 聚合 + 后台批量 flush”，优先降低：

- `battleDropService.settleBattleRewardPlan`
- `grantRewardDrops`
- `recordCollectItemEvents`
- `recordKillMonsterEventsForParticipants`
- 邮件领取 / 坊市 / 主线奖励 / 成就奖励等高频正向发奖路径

明确不做的事：

- 不保留旧同步写库分支
- 不加 fallback 双写
- 不做向后兼容协议

---

## 已完成

### 1. 资源 Delta

已完成模块：

- `server/src/services/shared/characterSettlementResourceDeltaService.ts`
- `server/src/services/shared/characterRewardSettlement.ts`
- `server/src/services/characterComputedService.ts`
- `server/src/services/inventory/shared/consume.ts`

当前状态：

- `exp / silver / spirit_stones` 已改成 Redis Delta 聚合后批量 flush 到 `characters`
- `bigint` 货币 exact 链路也已接入 Delta
- 角色读取已叠加 pending Delta，不会因为 flush 窗口读到旧值

### 2. 软进度 Delta

已完成模块：

- `server/src/services/shared/characterProgressDeltaStore.ts`
- `server/src/services/taskService.ts`
- `server/src/services/mainQuest/progressUpdater.ts`
- `server/src/services/mainQuest/index.ts`

当前状态：

- `task / mainQuest / achievement` 高频事件已先写 Redis Delta
- `talk / kill / collect / gather / dungeon_clear / craft` 已统一走批量推进管线
- 邮件领取后的收集事件也已改成批量入口

### 3. 正向物品授予 Delta

已完成模块：

- `server/src/services/shared/characterItemGrantDeltaService.ts`
- `server/src/services/battleDropService.ts`
- `server/src/services/onlineBattleSettlementRunner.ts`
- `server/src/services/mainQuest/grantRewards.ts`
- `server/src/services/achievement/claim.ts`
- `server/src/services/dialogueService.ts`
- `server/src/services/sect/shop.ts`
- `server/src/services/roomObjectService.ts`
- `server/src/services/inventory/disassemble.ts`
- `server/src/services/craftService.ts`
- `server/src/services/gemSynthesisService.ts`
- `server/src/services/techniqueGenerationService.ts`
- `server/src/services/itemService.ts`

当前状态：

- 战斗/秘境奖励物品已先写 Redis 资产 Delta
- 采集、拾取、拆解、制作、宝石合成、道具使用掉落等正向授予已切到资产 Delta
- 背包满时由异步 flush 统一补发系统邮件

### 4. 坊市与邮件链路已收掉的一部分

已完成模块：

- `server/src/services/marketService.ts`
- `server/src/services/mailService.ts`

当前状态：

- 坊市成交发货已走邮件附件池
- 坊市下架返还已改成邮件附件池，不再同步回包
- 邮件领取里的普通附件和奖励附件不再提前做背包容量预检
- 邮件领取只对“实例附件”保留同步背包锁和容量校验

### 5. 背包读侧 overlay 已完成的一部分

已完成模块：

- `server/src/services/inventory/bag.ts`

当前状态：

- `getInventoryInfo`
- `getInventoryItems(characterId, 'bag', ...)`

这两条读侧已经支持叠加 pending 资产 Delta。

---

## 仍未完成

### A. 实例迁移的统一 Delta 协议

当前仍保留同步实例迁移的地方：

- `server/src/services/mailService.ts`
  - `claimAttachments` 中 `attachInstanceIds` 仍使用 `moveItemInstanceToBagWithStacking`
- `server/src/services/inventory/bag.ts`
  - `moveItemInstanceToBagWithStacking`

原因：

- 这是“保留原实例属性”的迁移，不是普通新建物品
- 一旦改成异步 flush，必须明确 mail/auction 实例在 flush 失败、背包已满、重复领取、重放时的单一语义
- 这部分还没有抽出独立的“实例迁移 Delta”协议

### B. 库存内核仍未 cache-first

仍未切掉的核心同步路径：

- `server/src/services/inventory/bag.ts`
  - `moveItem`
  - `removeItemFromInventory`
  - `removeItemsBatch`
  - `sortInventory`
- `server/src/services/inventory/equipment.ts`
  - `equipItem`
  - `unequipItem`
  - `enhanceEquipment`
  - `refineEquipment`
  - `rerollEquipmentAffixes`
- `server/src/services/inventory/socket.ts`
  - `socketEquipment`

这些动作目前仍然直接读写 `item_instance`，还没改成缓存优先模型。

### C. 读侧 overlay 还没补全

仍未完成的读侧：

- `warehouse`
- `equipped`
- 角色详情里的装备展示
- 其他直接查 `item_instance(location='equipped')` 的展示路径

当前只有 `bag` 视图补了 pending 资产 overlay。

### D. 部分交易 / 附件链路仍是同步实例协议

后续要统一处理的地方：

- 邮件实例附件领取
- 坊市实例迁移的最终统一协议
- 任何 `mail / auction / bag / warehouse / equipped` 之间的已有实例迁移

---

## 下一步顺序

### 第一优先级

先抽 `CharacterItemInstanceTransferDeltaService`

目标：

- 统一处理已有实例从 `mail / auction` 进入角色资产视图
- 不再让邮件实例附件领取走同步 `moveItemInstanceToBagWithStacking`
- 为后续实例级 cache-first 打基础

必须解决的问题：

- 幂等键
- 重复领取保护
- flush 失败恢复
- 背包满时实例去向
- 读侧 overlay 如何显示 pending 实例

### 第二优先级

补 `warehouse / equipped` 读侧 overlay

目标文件：

- `server/src/services/inventory/bag.ts`
- `server/src/services/infoTargetService.ts`
- 其他直接读取 `location='equipped'` 的展示入口

### 第三优先级

改库存内核主动操作

目标文件：

- `server/src/services/inventory/bag.ts`
- `server/src/services/inventory/equipment.ts`
- `server/src/services/inventory/socket.ts`

方向：

- 先把“正向授予”和“实例迁移”完全协议化
- 再处理主动移动、穿脱、强化、镶嵌这类已有实例变更

---

## 当前结论

当前不是“全站彻底改完”，但高频 TPS 主链已经切掉大半：

- 资源结算
- 软进度推进
- 战斗/秘境奖励
- 大部分正向授予
- 坊市下架/成交
- 邮件领取中的非实例附件

剩下真正难的部分，是“已有实例迁移”和“库存内核本体”。

后续继续开发时，默认从本文件的“第一优先级”开始。
