import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';

export class S3Service {
  private s3: S3Client;
  private bucketName: string;

  constructor() {
    const region = process.env.AWS_REGION;
    this.bucketName = process.env.S3_BUCKET_NAME!;

    if (!region || !this.bucketName) {
      throw new Error('AWS_REGION and S3_BUCKET_NAME environment variables must be set.');
    }

    this.s3 = new S3Client({ region });
  }

  /**
   * Searches the entire bucket for a file by its base name.
   * @param filename The base name of the file to find (e.g., 'document1.json').
   * @returns The full S3 key (path) if found, otherwise null.
   */
  async findFileKey(filename: string): Promise<string | null> {
    let continuationToken: string | undefined;
    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        ContinuationToken: continuationToken,
      });

      const response = await this.s3.send(command);

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key && path.basename(object.Key) === filename) {
            console.log(`Found existing file in S3 with key: ${object.Key}`);
            return object.Key;
          }
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`No file named '${filename}' found in S3 bucket. A new file will be created at the root.`);
    return null;
  }

  /**
   * Uploads a file to the S3 bucket.
   * @param key The full S3 key (path) for the destination file.
   * @param body The content of the file.
   */
  async uploadFile(key: string, body: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    });

    await this.s3.send(command);
    console.log(`Successfully uploaded to S3: s3://${this.bucketName}/${key}`);
  }
}