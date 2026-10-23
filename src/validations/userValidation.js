const { z } = require('zod');

exports.createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3, "帳號至少需要 3 個字元"),
    password: z.string().min(6, "密碼至少需要 6 個字元"),
    name: z.string().min(1, "姓名為必填"),
    hourly_rate: z.number().min(0, "時薪不能為負數"),
    role: z.enum(['ADMIN', 'EMPLOYEE']).optional(),
  }),
});

exports.loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, "帳號為必填"),
    password: z.string().min(1, "密碼為必填"),
  }),
});

exports.clockSchema = z.object({
  body: z.object({
    type: z.enum(['in', 'out']),
    punch_type: z.enum(['正常', '加班']).optional(),
  }),
});

exports.updateUserSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    name: z.string().min(1).optional(),
    hourly_rate: z.number().min(0).optional(),
  }),
});

exports.leaveSchema = z.object({
  body: z.object({
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    reason: z.string().min(1, "請填寫請假原因"),
  }).refine((b) => b.end_date >= b.start_date, { message: "結束日期不可早於開始日期" }),
});

exports.leaveStatusSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({ status: z.enum(['APPROVED', 'REJECTED']) }),
});

exports.shiftSchema = z.object({
  body: z.object({
    userId: z.coerce.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式需為 YYYY-MM-DD"),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "時間格式需為 HH:mm"),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, "時間格式需為 HH:mm"),
  }),
});
