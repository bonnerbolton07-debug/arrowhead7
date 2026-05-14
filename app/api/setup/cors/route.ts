// =============================================================================
// Arrowhead 7 — One-time R2 CORS Setup
// =============================================================================
// Configures CORS on the R2 bucket so presigned URL uploads work from the browser.
// DELETE THIS ROUTE after running it once successfully.

import { NextResponse } from 'next/server';
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

export async function POST() {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET_NAME || 'arrowhead7-processing';

    if (!accountId || !accessKeyId || !secretAccessKey) {
      return NextResponse.json(
        { error: 'R2 is not configured. Missing credentials.' },
        { status: 500 }
      );
    }

    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://arrowhead7.ai';

    await client.send(new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [appUrl, 'https://arrowhead7.ai', 'https://*.vercel.app'],
            AllowedMethods: ['GET', 'PUT', 'HEAD'],
            AllowedHeaders: ['Content-Type', 'x-amz-*', 'Authorization'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }));

    return NextResponse.json({ success: true, message: 'CORS policy applied to R2 bucket', bucket });
  } catch (error) {
    console.error('CORS setup error:', error);
    return NextResponse.json(
      { error: 'Failed to set CORS', details: String(error) },
      { status: 500 }
    );
  }
}
