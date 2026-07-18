import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { audit } from "../lib/audit";
import { dayStartVN, dayEndVN } from "../lib/dateUtils";

const router = Router();

router.use(authenticate);

const SAFE_USER_SELECT = { id: true, fullName: true, email: true, role: { select: { name: true } } } as const;

const DELEGATION_INCLUDE = {
  fromUser: { select: SAFE_USER_SELECT },
  toUser: { select: SAFE_USER_SELECT },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const createSchema = z.object({
  toUserId: z.string().min(1, "Thiếu người nhận uỷ quyền"),
  startDate: z.string().regex(DATE_RE, "Ngày bắt đầu không hợp lệ (YYYY-MM-DD)"),
  endDate: z.string().regex(DATE_RE, "Ngày kết thúc không hợp lệ (YYYY-MM-DD)"),
});

// Danh sách uỷ quyền liên quan đến tôi (đã cấp + được nhận). Admin truyền ?all=1
// để xem toàn bộ hệ thống.
router.get("/", async (req, res, next) => {
  try {
    const isAdmin = req.user!.role.permissions.includes("*");
    const where =
      isAdmin && req.query.all === "1"
        ? {}
        : { OR: [{ fromUserId: req.user!.id }, { toUserId: req.user!.id }] };

    const delegations = await prisma.delegation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: DELEGATION_INCLUDE,
    });
    res.json(delegations);
  } catch (err) {
    next(err);
  }
});

// Danh sách user có thể nhận uỷ quyền (đang hoạt động, trừ chính mình) — cho ô chọn
// ở frontend. User thường không có quyền gọi /api/users (user:manage) nên cần route này.
router.get("/candidates", async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, id: { not: req.user!.id } },
      select: SAFE_USER_SELECT,
      orderBy: { fullName: "asc" },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }
    const { toUserId } = parsed.data;
    const startDate = dayStartVN(parsed.data.startDate);
    const endDate = dayEndVN(parsed.data.endDate);

    if (toUserId === req.user!.id) {
      throw new AppError(400, "Không thể tự uỷ quyền cho chính mình");
    }
    if (endDate < startDate) {
      throw new AppError(400, "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu");
    }
    if (endDate < new Date()) {
      throw new AppError(400, "Khoảng uỷ quyền đã trôi qua — chọn ngày kết thúc từ hôm nay trở đi");
    }

    const target = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!target || !target.isActive) {
      throw new AppError(400, "Người nhận uỷ quyền không tồn tại hoặc đã bị vô hiệu hoá");
    }

    // Chặn chồng lấn: cùng MỘT người uỷ quyền không được có 2 khoảng giao nhau
    // (tránh nhập nhằng ai đang duyệt thay). Hai khoảng giao nhau khi
    // NOT (kết thúc A < bắt đầu B OR bắt đầu A > kết thúc B).
    const overlap = await prisma.delegation.findFirst({
      where: {
        fromUserId: req.user!.id,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: DELEGATION_INCLUDE,
    });
    if (overlap) {
      throw new AppError(409, `Đã có uỷ quyền cho ${overlap.toUser.fullName} trùng khoảng thời gian này`);
    }

    const delegation = await prisma.delegation.create({
      data: { fromUserId: req.user!.id, toUserId, startDate, endDate },
      include: DELEGATION_INCLUDE,
    });

    audit({
      req,
      category: "USER",
      action: "DELEGATION_CREATE",
      targetType: "delegation",
      targetId: delegation.id,
      detail: `Uỷ quyền cho ${delegation.toUser.fullName} (${parsed.data.startDate} → ${parsed.data.endDate})`,
    });
    res.status(201).json(delegation);
  } catch (err) {
    next(err);
  }
});

// Chỉ người cấp uỷ quyền (hoặc Admin) được thu hồi.
router.delete("/:id", async (req, res, next) => {
  try {
    const delegation = await prisma.delegation.findUnique({
      where: { id: req.params.id },
      include: DELEGATION_INCLUDE,
    });
    if (!delegation) throw new AppError(404, "Không tìm thấy uỷ quyền");

    const isAdmin = req.user!.role.permissions.includes("*");
    if (delegation.fromUserId !== req.user!.id && !isAdmin) {
      throw new AppError(403, "Chỉ người cấp uỷ quyền mới được thu hồi");
    }

    await prisma.delegation.delete({ where: { id: delegation.id } });
    audit({
      req,
      category: "USER",
      action: "DELEGATION_DELETE",
      targetType: "delegation",
      targetId: delegation.id,
      detail: `Thu hồi uỷ quyền ${delegation.fromUser.fullName} → ${delegation.toUser.fullName}`,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
