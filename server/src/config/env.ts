import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 5050),
  // On Render the public address is provided automatically, so neither needs setting there.
  clientUrl: required('CLIENT_URL', process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5174'),
  serverUrl: required('SERVER_URL', process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5050'),

  mongodbUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/solar-coop-complaints'),

  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',

  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL ?? '',
  webhookSecret: process.env.WEBHOOK_SECRET ?? '',

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@solarcoop.dev',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',

  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 900000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 600),
};
