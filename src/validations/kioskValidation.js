const { z } = require('zod');

exports.pairSchema = z.object({
  body: z.object({ code: z.string().min(1, "請輸入通行碼").max(64) }),
});

exports.recordsSchema = z.object({
  query: z.object({ userId: z.coerce.number().int().positive() }),
});

exports.kioskClockSchema = z.object({
  body: z.object({
    userId: z.coerce.number().int().positive(),
    type: z.enum(['in', 'out']),
    punch_type: z.enum(['正常', '加班']).optional(),
  }),
});

exports.createQrSchema = z.object({
  body: z.object({
    ttl_minutes: z.coerce.number().int().min(1, "有效時間至少 1 分鐘").max(120, "有效時間最長 120 分鐘").optional(),
    max_uses: z.coerce.number().int().min(1, "至少可登記 1 支手機").max(20, "最多可登記 20 支手機").optional(),
  }).optional(),
});
