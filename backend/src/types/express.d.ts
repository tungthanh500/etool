import type { Department, Role, User } from "@prisma/client";

type AuthenticatedUser = User & { role: Role; department: Department };

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
