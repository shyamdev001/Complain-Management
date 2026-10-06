import { UserRole } from './enums';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        name: string;
        email: string;
        /** Set for INSTALLER users: the installer company they belong to. */
        installerId?: string;
        installerName?: string;
      };
    }
  }
}

export {};
