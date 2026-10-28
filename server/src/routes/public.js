'use strict';

const express = require('express');
const { z } = require('zod');
const { query, one } = require('../db');
const { asyncHandler, notFound } = require('../lib/errors');
const { parse, trimmed, email, phone, isoDate } = require('../lib/validate');
const { dayAvailability, rangeAvailability, todayManila, addDays } = require('../lib/slots');
const { getSettings, getBusinessHours } = require('../lib/settings');
const { notifyAdmins } = require('../lib/notify');
const { audit } = require('../lib/audit');
const { inquiryLimiter } = require('../middleware/rateLimit');

const router = express.Router();

/* Public service catalogue */
router.get(
  '/services',
  asyncHandler(async (req, res) => {
    const services = await query(
      `SELECT s.id, s.code, s.name, s.short_name, s.description, s.category, s.base_fee,
              s.duration_minutes, s.requires_fieldwork, s.turnaround_days,
              (SELECT COUNT(*) FROM document_requirements dr
                WHERE dr.is_active = 1 AND (dr.service_id = s.id OR dr.service_id IS NULL)) AS requirement_count
         FROM services s
        WHERE s.is_active = 1
        ORDER BY s.sort_order, s.name`,
    );
    res.json({
      services: services.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        shortName: s.short_name,
        description: s.description,
        category: s.category,
        baseFee: Number(s.base_fee),
        durationMinutes: s.duration_minutes,
        requiresFieldwork: !!s.requires_fieldwork,
        turnaroundDays: s.turnaround_days,
        requirementCount: Number(s.requirement_count),
      })),
    });
  }),
);

/* Office information + business hours */
router.get(
  '/office',
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const hours = await getBusinessHours();
    res.json({
      office: {
        companyName: settings.company_name,
        tagline: settings.tagline,
        about: settings.about,
        address: settings.address,
        city: settings.city,
        province: settings.province,
        postalCode: settings.postal_code,
        phone: settings.phone,
        mobile: settings.mobile,
        email: settings.email,
        privacyOfficer: settings.privacy_officer,
        privacyEmail: settings.privacy_email,
        tin: settings.tin,
        prcLicense: settings.prc_license,
        facebook: settings.facebook,
        mapLat: settings.map_lat,
        mapLng: settings.map_lng,
        bookingLeadDays: Number(settings.booking_lead_days || 3),
        maxAdvanceDays: Number(settings.max_advance_days || 120),
        retentionYears: Number(settings.document_retention_years || 10),
        emailNotificationsEnabled: String(settings.email_notifications_enabled) === 'true',
      },
      businessHours: hours,
    });
  }),
);

/* Slot availability for the booking wizard */
router.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.query.serviceId) || null;
    let duration = 120;
    if (serviceId) {
      const svc = await one('SELECT duration_minutes FROM services WHERE id = ? AND is_active = 1', [serviceId]);
      if (!svc) throw notFound('Service not found.');
      duration = Number(svc.duration_minutes) || 120;
    }

    const date = req.query.date ? String(req.query.date) : todayManila();
    if (req.query.from && req.query.to) {
      const days = await rangeAvailability(String(req.query.from), String(req.query.to), duration);
      return res.json({ days, durationMinutes: duration });
    }
    const parsedDate = parse(isoDate, date);
    const day = await dayAvailability(parsedDate, duration);
    return res.json({ ...day, durationMinutes: duration });
  }),
);

/* Public contact / inquiry form */
const inquirySchema = z.object({
  name: trimmed(150, 'Name'),
  email,
  phone,
  subject: trimmed(180, 'Subject'),
  message: trimmed(3000, 'Message'),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Please accept the privacy notice before sending.' }),
  }),
  // Simple honeypot: real users never fill this in.
  website: z.string().max(0).optional().or(z.literal('')),
});

router.post(
  '/inquiries',
  inquiryLimiter,
  asyncHandler(async (req, res) => {
    const data = parse(inquirySchema, req.body);
    const id = (await query(
      `INSERT INTO inquiries (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)`,
      [data.name, data.email, data.phone, data.subject, data.message],
    )).insertId;

    await notifyAdmins({
      type: 'inquiry',
      title: 'New website inquiry',
      message: `${data.name}: ${data.subject}`,
      link: '/admin/inquiries',
    });
    await audit(req, 'inquiry.create', `Public inquiry received from ${data.email}`, { entityType: 'inquiry', entityId: id });

    res.status(201).json({
      ok: true,
      message: 'Thank you. Your inquiry has been received and the office will respond during business hours.',
    });
  }),
);

/* Printable acknowledgement reference lookup is intentionally NOT public.
   Clients sign in to view appointments, which prevents reference guessing. */

module.exports = router;
