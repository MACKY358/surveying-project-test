'use strict';

const config = require('../config');

/**
 * Optional email transport.
 *
 * The project ships WITHOUT an SMTP provider configured. If you want email
 * notifications, enable EMAIL_ENABLED=true in server/.env and implement the
 * transport here (nodemailer is the common choice). Until then the app only
 * creates in-app notifications and the UI never claims email was delivered.
 */
async function sendMail({ to, subject, text, html }) {
  if (!config.email.enabled) {
    throw new Error('Email delivery is not configured. Set EMAIL_ENABLED=true and provide SMTP settings.');
  }

  // --- Replace the block below with a real transport, e.g.:
  // const nodemailer = require('nodemailer');
  // const transport = nodemailer.createTransport({ ... });
  // await transport.sendMail({ from: config.email.from, to, subject, text, html });
  throw new Error(
    'EMAIL_ENABLED is true but no mail transport has been implemented in src/lib/mailer.js.',
  );
}

module.exports = { sendMail };
