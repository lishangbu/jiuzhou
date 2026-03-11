import assert from "node:assert/strict";
import test from "node:test";
import {
  isLocalAvatarUploadEnabled,
  LOCAL_AVATAR_UPLOAD_DISABLED_MESSAGE,
} from "../avatarUploadMode.js";

/**
 * 头像上传模式判定回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住“COS 启用时必须禁止本地头像上传”的单一规则，避免回归后再次出现双写覆盖。
 * 2. 做什么：锁住统一错误文案，保证路由层拒绝本地上传时给出明确提示。
 * 3. 不做什么：不触发真实 HTTP 请求，不写入本地文件，也不依赖真实环境变量。
 *
 * 输入/输出：
 * - 输入：人工构造的 `cosEnabled` 布尔值。
 * - 输出：本地上传许可判定结果，以及统一错误文案常量。
 *
 * 数据流/状态流：
 * - 测试输入 `cosEnabled`
 * - 调用 `isLocalAvatarUploadEnabled`
 * - 断言路由层会复用的判定与文案保持稳定
 *
 * 关键边界条件与坑点：
 * 1. 这里刻意不读 `process.env`，避免测试依赖本机或 CI 的真实 COS 配置而误绿。
 * 2. 规则必须保持“COS 开启即禁本地上传”，不能退化成仅提示但仍允许落盘，否则会再次覆盖 DB 中的 COS URL。
 */

test("isLocalAvatarUploadEnabled: COS 启用时应禁止本地头像上传", () => {
  assert.equal(isLocalAvatarUploadEnabled(true), false);
});

test("isLocalAvatarUploadEnabled: COS 未启用时应允许本地头像上传", () => {
  assert.equal(isLocalAvatarUploadEnabled(false), true);
});

test("LOCAL_AVATAR_UPLOAD_DISABLED_MESSAGE: 应返回统一拒绝文案", () => {
  assert.equal(
    LOCAL_AVATAR_UPLOAD_DISABLED_MESSAGE,
    "COS 已启用，请使用预签名直传头像",
  );
});
