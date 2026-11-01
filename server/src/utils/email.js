const nodemailer = require("nodemailer");

/**
 * Sends a notification email via Gmail SMTP (nodemailer).
 *
 * Uses a Gmail "App Password" (Google Account -> Security -> 2-Step
 * Verification -> App Passwords), NOT your real Gmail login password —
 * Gmail rejects plain-password SMTP logins for accounts with 2FA on,
 * which is why an app password exists.
 *
 * If EMAIL_USER/EMAIL_PASS aren't set, this silently no-ops (logs and
 * returns) so the rest of the app keeps working without it — same
 * philosophy as whatsapp.js / twilioCall.js.
 */
let cachedTransporter = null;
function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return cachedTransporter;
}

async function sendEmail(toEmail, subject, body, attachments) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("[email] EMAIL_USER/EMAIL_PASS not set — skipping email notification:", subject);
    return { sent: false, reason: "not_configured" };
  }
  const fromName = process.env.EMAIL_FROM_NAME || "Indian Railways SRLMS";

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject,
      text: body,
      attachments, // optional: nodemailer attachment array, e.g. [{ filename, content, cid }]
    });
    return { sent: true, id: info.messageId };
  } catch (err) {
    console.error("[email] failed to send:", err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendEmail };
