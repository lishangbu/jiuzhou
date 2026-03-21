declare module 'cos-nodejs-sdk-v5' {
  type CosCallback<T> = (err: Error | null, data: T) => void;

  interface CosClientOptions {
    SecretId: string;
    SecretKey: string;
  }

  interface CosObjectBaseParams {
    Bucket: string;
    Region: string;
    Key: string;
  }

  interface CosGetObjectUrlParams extends CosObjectBaseParams {
    Method?: string;
    Sign?: boolean;
    Expires?: number;
  }

  interface CosGetObjectUrlResult {
    Url: string;
  }

  interface CosDeleteObjectResult {
    [key: string]: unknown;
  }

  interface CosPutObjectParams extends CosObjectBaseParams {
    Body: Buffer;
    ContentType?: string;
  }

  interface CosPutObjectResult {
    [key: string]: unknown;
  }

  class COS {
    constructor(options: CosClientOptions);

    getObjectUrl(
      params: CosGetObjectUrlParams,
      callback: CosCallback<CosGetObjectUrlResult>,
    ): void;

    deleteObject(
      params: CosObjectBaseParams,
      callback: CosCallback<CosDeleteObjectResult>,
    ): void;

    putObject(
      params: CosPutObjectParams,
      callback: CosCallback<CosPutObjectResult>,
    ): void;
  }

  export = COS;
}
