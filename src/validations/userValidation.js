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
