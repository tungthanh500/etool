import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

const COOKIE_NAME = process.env.COOKIE_NAME || "eapproval_token";

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "Chưa đăng nhập" });
    return;
  }

  let userId: string;
  try {
    userId = verifyToken(token).sub;
  } catch {
    res.status(401).json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, department: true },
    });

    if (!user) {
      res.status(401).json({ error: "Phiên đăng nhập không hợp lệ" });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ error: "Tài khoản đã bị vô hiệu hoá" });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
