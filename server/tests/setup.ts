process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_do_not_use_in_prod';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_do_not_use_in_prod';
process.env.CLIENT_URL = 'http://localhost:5174';
process.env.SERVER_URL = 'http://localhost:5050';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.N8N_WEBHOOK_URL = '';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.UPLOAD_DIR = require('path').join(require('os').tmpdir(), 'solar-complaints-test-uploads');

import { beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
