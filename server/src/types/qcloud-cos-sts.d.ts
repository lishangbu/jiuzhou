/**
 * qcloud-cos-sts 类型声明
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：为项目内唯一用到的 `getCredential` 能力补充最小必需类型，避免服务端 STS 签发逻辑退化为无类型调用。
 * 2. 做什么：把 policy 与返回凭证结构收敛成统一类型，减少在服务文件里重复声明第三方结构。
 * 3. 不做什么：不扩展整个 SDK 的完整类型面，也不改变第三方库运行时行为。
 *
 * 输入/输出：
 * - 输入：`getCredential` 的 options。
 * - 输出：回调中的临时密钥结果。
 *
 * 数据流/状态流：
 * - `avatarUploadStsService.ts` 调用 `qcloud-cos-sts`
 * - TypeScript 通过本声明校验 policy 和凭证字段
 * - 业务层再把凭证下发给前端 COS SDK
 *
 * 关键边界条件与坑点：
 * 1. 这里只声明当前项目实际使用的字段，后续若扩展 SDK 能力，应在这里增量补齐，避免在业务文件散落局部类型。
 * 2. 回调结果里的临时密钥字段不能写成可选，否则业务层会误以为不完整凭证也可用。
 */
declare module "qcloud-cos-sts" {
  interface StsCredentialOptions {
    secretId: string;
    secretKey: string;
    policy: {
      version: string;
      statement: Array<{
        action: string[];
        effect: string;
        principal: { qcs: string[] };
        resource: string[];
        condition?: Record<string, Record<string, string | number>>;
      }>;
    };
    durationSeconds?: number;
    proxy?: string;
    host?: string;
    endpoint?: string;
  }

  interface StsCredentialResult {
    startTime: number;
    expiredTime: number;
    credentials: {
      tmpSecretId: string;
      tmpSecretKey: string;
      sessionToken: string;
    };
  }

  const STS: {
    getCredential(
      options: StsCredentialOptions,
      callback: (err: Error | null, data: StsCredentialResult) => void,
    ): void;
  };

  export default STS;
}
