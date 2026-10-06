import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { catchAsync } from '../utils/catchAsync';
import { verifyAccessToken, cookieNames } from '../services/token.service';
import { UserRole, UserStatus } from '../types/enums';
import { User } from '../models/User';

/**
 * Verifies the access token and attaches req.user. The user's role, status
 * and installer company are re-read from the DB on every request - never
 * trusted from the token - so a disabled account, or one moved to another
 * installer, takes effect immediately.
 */
export const requireAuth = catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.[cookieNames.ACCESS_COOKIE];
  if (!token) {
    throw ApiError.unauthorized();
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Session expired, please log in again');
  }

  const user = await User.findById(payload.sub)
    .select('_id name email role status installer')
    .populate<{ installer?: { _id: unknown; name: string; active: boolean } }>('installer', 'name active')
    .lean();
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw ApiError.unauthorized('Account is not active');
  }
  // Only office staff sign in. Installers work from the Excel sheet the office sends them.
  if (user.role !== UserRole.ADMIN) {
    throw ApiError.unauthorized('This account can no longer sign in');
  }

  req.user = {
    id: user._id.toString(),
    role: user.role as UserRole,
    name: user.name,
    email: user.email,
    installerId: user.installer ? String(user.installer._id) : undefined,
    installerName: user.installer?.name,
  };
  next();
});

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden());
    }
    next();
  };
}
