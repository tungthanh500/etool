import { Router } from "express";
import type { CookieOptions } from "express";
import type { Department, Role, User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { comparePassword } from "../lib/password";
import { signToken } from "../lib/jwt";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

const COOKIE_NAME = process.env.COOKIE_NAME || "eapproval_token";
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h, khớp JWT_EXPIRES_IN mặc định

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function toSafeUser(user: User & { role: Role; department: Department }) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Email hoặc mật khẩu không hợp lệ" });
      return;
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, department: true },
    });

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      res.status(401).json({ error: "Email hoặc mật khẩu không đúng" });
      return;
    }

    const token = signToken(user.id);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: COOKIE_MAX_AGE_MS });
    res.json(toSafeUser(user));
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.status(204).send();
});

router.get("/me", authenticate, (req, res) => {
  res.json(toSafeUser(req.user!));
});

export default router;
