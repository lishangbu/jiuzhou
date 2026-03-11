import assert from "node:assert/strict";
import test from "node:test";
import { AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES } from "../avatarUploadRules.js";
import {
  buildAvatarUploadPolicy,
  buildAvatarUploadResource,
} from "../avatarUploadStsService.js";

/**
 * 头像上传 STS policy 回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住 STS policy 只授予单对象上传权限，并附带文件大小与内容类型限制。
 * 2. 做什么：验证资源串拼接逻辑，避免 bucket/appid 前缀拼错后把权限放大或导致上传失败。
 * 3. 不做什么：不请求真实腾讯云 STS，也不发起真实 COS 上传。
 *
 * 输入/输出：
 * - 输入：bucket、region、key、contentType。
 * - 输出：resource 字符串与 STS policy 对象。
 *
 * 数据流/状态流：
 * - 测试构造头像上传目标键
 * - 调用纯函数生成 resource / policy
 * - 断言路由真正依赖的权限范围与条件保持稳定
 *
 * 关键边界条件与坑点：
 * 1. resource 必须精确到单个 key，不能退化成目录通配符，否则临时密钥会被用来覆盖其他对象。
 * 2. condition 必须同时包含 `cos:content-type` 和 `cos:content-length`，否则大小限制与类型限制会退化为仅靠业务层校验。
 */

test("buildAvatarUploadResource: 应生成单对象精确资源串", () => {
  const resource = buildAvatarUploadResource(
    "idle-1254084933",
    "ap-guangzhou",
    "jiuzhou/avatars/avatar-1.png",
  );

  assert.equal(
    resource,
    "qcs::cos:ap-guangzhou:uid/1254084933:prefix//1254084933/idle/jiuzhou/avatars/avatar-1.png",
  );
});

test("buildAvatarUploadPolicy: 应附带内容类型与大小限制", () => {
  const policy = buildAvatarUploadPolicy(
    "idle-1254084933",
    "ap-guangzhou",
    "jiuzhou/avatars/avatar-1.png",
    "image/png",
  );

  assert.deepEqual(policy, {
    version: "2.0",
    statement: [
      {
        action: ["name/cos:PutObject"],
        effect: "allow",
        principal: { qcs: ["*"] },
        resource: [
          "qcs::cos:ap-guangzhou:uid/1254084933:prefix//1254084933/idle/jiuzhou/avatars/avatar-1.png",
        ],
        condition: {
          string_equal: {
            "cos:content-type": "image/png",
          },
          numeric_less_than_equal: {
            "cos:content-length": AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
          },
        },
      },
    ],
  });
});
