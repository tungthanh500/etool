import type { NextFunction, Request, Response } from "express";

export function authorize(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Chưa đăng nhập" });
      return;
    }

    // "*" là quyền wildcard của role Admin — phủ mọi permission cấp route.
    const perms = req.user.role.permissions;
    if (!perms.includes("*") && !perms.includes(permission)) {
      res.status(403).json({ error: "Không đủ quyền thực hiện thao tác này" });
      return;
    }

    next();
  };
}
