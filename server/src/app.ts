import express from 'express';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import apiRouter from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { generalLimiter } from './middleware/rateLimit.middleware';
import { sanitizeInput } from './utils/sanitize';

export const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: {
      directives: {
        // Service photos are fetched with the session and shown from blob: URLs.
        'img-src': ["'self'", 'data:', 'blob:'],
      },
    },
  }),
);

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Basic NoSQL-injection guard: strips any keys starting with '$' or containing '.'
// from user-controlled input objects before they reach Mongoose queries.
app.use((req, _res, next) => {
  if (req.body) req.body = sanitizeInput(req.body);
  if (req.params) req.params = sanitizeInput(req.params);
  next();
});

if (env.nodeEnv !== 'test') {
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
}

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api', generalLimiter, apiRouter);
app.use('/api', notFoundHandler);

// When the client has been built (production), this one service also serves
// the screens, so the app and its API share a single address. In development
// the Vite dev server does this instead and the folder does not exist.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  // Any other address is a page inside the app; the browser router takes it from here.
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);
