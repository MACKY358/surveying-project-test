'use strict';

const { z } = require('zod');
const { badRequest } = require('./errors');

/**
 * Parse input against a zod schema and throw a 400 with per-field details.
 */
function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!details[key]) details[key] = issue.message;
    }
    throw badRequest('Please check the highlighted fields and try again.', details);
  }
  return result.data;
}

const trimmed = (max, label) => z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null));

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'Enter a valid email address.')
  .max(190, 'Email is too long.')
  .email('Enter a valid email address.');

const password = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .max(128, 'Password must be 128 characters or fewer.')
  .regex(/[a-zA-Z]/, 'Password must contain a letter.')
  .regex(/[0-9]/, 'Password must contain a number.');

const phone = z
  .string()
  .trim()
  .max(40, 'Phone number is too long.')
  .regex(/^[0-9+()\-.\s]*$/, 'Enter a valid phone number.')
  .optional()
  .nullable()
  .transform((v) => (v === '' ? null : v ?? null));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Enter a valid date.');

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use the time format HH:MM.');

const idParam = z.coerce.number().int().positive('Invalid record identifier.');

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
  q: z.string().trim().max(120).optional().default(''),
  sort: z.string().trim().max(40).optional().default(''),
  dir: z.enum(['asc', 'desc']).optional().default('desc'),
});

const idsList = z
  .union([z.string(), z.array(z.union([z.number(), z.string()]))])
  .optional()
  .transform((value) => {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : String(value).split(',');
    return arr.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
  });

/** Whitelist ORDER BY fragments to avoid SQL injection through sorting. */
function orderBy(sort, dir, allowed, fallback) {
  const column = allowed[sort] || fallback;
  return `ORDER BY ${column} ${dir === 'asc' ? 'ASC' : 'DESC'}`;
}

/** Escape % and _ for LIKE queries. */
function likeTerm(term) {
  return `%${String(term).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

module.exports = {
  z,
  parse,
  trimmed,
  optionalText,
  email,
  password,
  phone,
  isoDate,
  timeOfDay,
  idParam,
  pagination,
  idsList,
  orderBy,
  likeTerm,
};
