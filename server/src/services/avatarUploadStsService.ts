/**
 * 头像上传 STS 服务
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：在 COS 启用时按头像上传规则签发短期临时密钥，并把权限严格收敛到单个头像对象键。
 * 2. 做什么：把 COS 侧大小限制、内容类型限制和对象路径限制一起绑定到 STS policy。
 * 3. 不做什么：不负责确认上传完成后的写库，不负责本地上传回退，也不负责删除旧头像。
 *
 * 输入/输出：
 * - 输入：头像 MIME、文件大小。
 * - 输出：上传模式标记、COS 目标对象键、访问 URL、短期临时密钥。
 *
 * 数据流/状态流：
 * - 路由接收客户端的 `contentType/fileSize`
 * - 本模块校验上传规则并生成对象键、STS policy、临时密钥
 * - 前端用返回的临时密钥通过 COS SDK 直传
 * - 上传完成后仍由 confirm 路由更新数据库
 *
 * 关键边界条件与坑点：
 * 1. policy 必须绑定到单个对象键，不能放宽为整个目录通配符，否则临时密钥会具备越权上传风险。
 * 2. COS 侧大小限制应在 STS policy 中声明 `cos:content-length`，confirm 只负责写库，不能承担上传前约束。
 */
import STS from "qcloud-cos-sts";
import {
  COS_AVATAR_PREFIX,
  COS_BUCKET,
  COS_DOMAIN,
  COS_ENABLED,
  COS_REGION,
  COS_SECRET_ID,
  COS_SECRET_KEY,
} from "../config/cos.js";
import {
  AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
  buildAvatarCosKey,
  isAllowedAvatarMimeType,
  isAvatarFileSizeAllowed,
  type AvatarMimeType,
} from "./avatarUploadRules.js";

export const AVATAR_UPLOAD_STS_DURATION_SECONDS = Math.max(
  60,
  Math.min(
    7200,
    Number.parseInt(process.env.COS_STS_DURATION_SECONDS ?? "600", 10) || 600,
  ),
);

type StsCredentialData = {
  startTime: number;
  expiredTime: number;
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
  };
};

export type AvatarUploadStsPayload =
  | {
      cosEnabled: false;
      maxFileSizeBytes: number;
    }
  | {
      cosEnabled: true;
      maxFileSizeBytes: number;
      bucket: string;
      region: string;
      key: string;
      avatarUrl: string;
      startTime: number;
      expiredTime: number;
      credentials: {
        tmpSecretId: string;
        tmpSecretKey: string;
        sessionToken: string;
      };
    };

const extractCosAppId = (bucket: string): string => {
  const lastDashIndex = bucket.lastIndexOf("-");
  if (lastDashIndex <= 0 || lastDashIndex === bucket.length - 1) {
    throw new Error("COS_BUCKET 格式不合法，需为 BucketName-APPID");
  }
  return bucket.slice(lastDashIndex + 1);
};

const extractCosShortBucketName = (bucket: string): string => {
  const lastDashIndex = bucket.lastIndexOf("-");
  if (lastDashIndex <= 0) {
    throw new Error("COS_BUCKET 格式不合法，需为 BucketName-APPID");
  }
  return bucket.slice(0, lastDashIndex);
};

export const buildAvatarUploadResource = (
  bucket: string,
  region: string,
  key: string,
): string => {
  const appId = extractCosAppId(bucket);
  const shortBucketName = extractCosShortBucketName(bucket);
  return `qcs::cos:${region}:uid/${appId}:prefix//${appId}/${shortBucketName}/${key}`;
};

export const buildAvatarUploadPolicy = (
  bucket: string,
  region: string,
  key: string,
  contentType: AvatarMimeType,
) => {
  return {
    version: "2.0",
    statement: [
      {
        action: ["name/cos:PutObject"],
        effect: "allow",
        principal: { qcs: ["*"] },
        resource: [buildAvatarUploadResource(bucket, region, key)],
        condition: {
          string_equal: {
            "cos:content-type": contentType,
          },
          numeric_less_than_equal: {
            "cos:content-length": AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
          },
        },
      },
    ],
  };
};

const requestAvatarUploadCredential = (
  key: string,
  contentType: AvatarMimeType,
): Promise<StsCredentialData> => {
  const policy = buildAvatarUploadPolicy(COS_BUCKET, COS_REGION, key, contentType);

  return new Promise((resolve, reject) => {
    STS.getCredential(
      {
        secretId: COS_SECRET_ID,
        secretKey: COS_SECRET_KEY,
        durationSeconds: AVATAR_UPLOAD_STS_DURATION_SECONDS,
        policy,
      },
      (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        if (
          !data ||
          !data.credentials ||
          !data.credentials.tmpSecretId ||
          !data.credentials.tmpSecretKey ||
          !data.credentials.sessionToken
        ) {
          reject(new Error("腾讯云 STS 返回的临时密钥不完整"));
          return;
        }
        resolve({
          startTime: data.startTime,
          expiredTime: data.expiredTime,
          credentials: {
            tmpSecretId: data.credentials.tmpSecretId,
            tmpSecretKey: data.credentials.tmpSecretKey,
            sessionToken: data.credentials.sessionToken,
          },
        });
      },
    );
  });
};

export const issueAvatarUploadSts = async (
  contentType: string,
  fileSize: number,
): Promise<AvatarUploadStsPayload> => {
  if (!COS_ENABLED) {
    return {
      cosEnabled: false,
      maxFileSizeBytes: AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
    };
  }

  if (!isAllowedAvatarMimeType(contentType)) {
    throw new Error("只支持 JPG、PNG、GIF、WEBP 格式的图片");
  }

  if (!isAvatarFileSizeAllowed(fileSize)) {
    throw new Error(
      `图片大小不能超过${Math.floor(
        AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES / 1024 / 1024,
      )}MB`,
    );
  }

  const key = buildAvatarCosKey(COS_AVATAR_PREFIX, contentType);
  const avatarUrl = COS_DOMAIN
    ? `https://${COS_DOMAIN}/${key}`
    : `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`;
  const credential = await requestAvatarUploadCredential(key, contentType);

  return {
    cosEnabled: true,
    maxFileSizeBytes: AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
    bucket: COS_BUCKET,
    region: COS_REGION,
    key,
    avatarUrl,
    startTime: credential.startTime,
    expiredTime: credential.expiredTime,
    credentials: credential.credentials,
  };
};
