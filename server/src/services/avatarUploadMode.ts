/**
 * 头像上传模式判定
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中判断当前是否允许本地头像上传，避免路由层散落相同的 COS 分支判断。
 * 2. 做什么：统一维护“COS 已启用时禁止本地回退”的提示文案，避免前后端出现多份不一致文案。
 * 3. 不做什么：不负责读取环境变量，不负责 COS 直传签名，也不负责本地文件写入。
 *
 * 输入/输出：
 * - 输入：`cosEnabled`，表示当前运行环境是否已完整启用 COS 上传。
 * - 输出：本地头像上传是否可用的布尔值，以及禁用时的统一提示文案。
 *
 * 数据流/状态流：
 * - `uploadRoutes` 从 `config/cos` 拿到 `COS_ENABLED`
 * - 路由通过本模块判断是否允许进入本地 multipart 上传
 * - 若不允许，则在进入 multer 前直接拒绝，避免额外写入 `uploads/avatars`
 *
 * 关键边界条件与坑点：
 * 1. 这里故意只保留一个布尔判定入口，避免未来在多个路由里重复写 `if (COS_ENABLED)` 导致行为漂移。
 * 2. 禁止本地上传必须发生在 multer 之前，否则即使最终返回错误，也已经把文件写进本地目录了。
 */

export const LOCAL_AVATAR_UPLOAD_DISABLED_MESSAGE =
  "COS 已启用，请使用预签名直传头像";

export const isLocalAvatarUploadEnabled = (cosEnabled: boolean): boolean => {
  return !cosEnabled;
};
