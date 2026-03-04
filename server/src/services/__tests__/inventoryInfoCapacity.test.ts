/**
 * 作用（做什么 / 不做什么）：
 * - 做什么：校验背包默认容量常量与容量读取逻辑，确保仓库默认容量维持 1000。
 * - 不做什么：不覆盖真实数据库 I/O，不验证路由层与前端分仓展示逻辑。
 *
 * 输入/输出：
 * - 输入：`createDefaultInventoryInfo()` 生成的默认库存信息。
 * - 输出：默认容量字段及 `getSlottedCapacity` 对 bag/warehouse 的读取结果。
 *
 * 数据流/状态流：
 * - 测试直接调用库存纯函数；
 * - 断言默认值与容量读取结果一致。
 *
 * 关键边界条件与坑点：
 * 1) 仓库容量是历史高频变更点，必须有显式断言，避免误改为 100。
 * 2) `getSlottedCapacity` 必须与 `InventoryInfo` 字段一致，避免 UI 与服务端显示不一致。
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultInventoryInfo,
  getSlottedCapacity,
} from "../inventory/shared/helpers.js";

test("默认库存容量应保持背包100和仓库1000", () => {
  const info = createDefaultInventoryInfo();
  assert.equal(info.bag_capacity, 100);
  assert.equal(info.warehouse_capacity, 1000);
  assert.equal(info.bag_used, 0);
  assert.equal(info.warehouse_used, 0);
});

test("容量读取函数应按位置返回对应容量", () => {
  const info = {
    bag_capacity: 150,
    warehouse_capacity: 1000,
    bag_used: 10,
    warehouse_used: 99,
  };
  assert.equal(getSlottedCapacity(info, "bag"), 150);
  assert.equal(getSlottedCapacity(info, "warehouse"), 1000);
});
