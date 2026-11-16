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
