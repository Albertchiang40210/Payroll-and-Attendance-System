const { z } = require('zod');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式需為 YYYY-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時間格式需為 HH:mm");
const note = z.string().max(200, "備註最多 200 字");

exports.monthQuerySchema = z.object({
  query: z.object({
    userId: z.coerce.number().int().positive(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "月份格式需為 YYYY-MM"),
  }),
});

exports.createRecordSchema = z.object({
  body: z.object({
    userId: z.coerce.number().int().positive(),
    work_date: date,
    punch_type: z.enum(['正常', '加班']).default('正常'),
    clock_in: time,
    clock_out: time.nullable().optional(),
    note: note.nullable().optional(),
  }),
});

exports.updateRecordSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    clock_in: time.optional(),
    clock_out: time.nullable().optional(),
    note: note.nullable().optional(),
  }),
});

exports.deleteRecordSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
});

exports.dayQuerySchema = z.object({
  query: z.object({ date }),
});
