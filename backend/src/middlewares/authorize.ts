import type { NextFunction, Request, Response } from "express";

export function authorize(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Chưa đăng nhập" });
      return;
    }

    if (!req.user.role.permissions.includes(permission)) {
      res.status(403).json({ error: "Không đủ quyền thực hiện thao tác này" });
      return;
    }

    next();
  };
}
