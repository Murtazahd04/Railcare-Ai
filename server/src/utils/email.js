const { Resend } = require("resend");

let resendClient = null;

function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

async function sendEmail(toEmail, subject, body, attachments) {
  const resend = getResendClient();
  if (!resend) {
    console.log("[email] RESEND_API_KEY not set — skipping email notification:", subject);
    return { sent: false, reason: "not_configured" };
  }

  const fromName = process.env.EMAIL_FROM_NAME || "Indian Railways SRLMS";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  try {
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: Array.isArray(toEmail) ? toEmail : [toEmail],
      subject,
      text: body,
      attachments: attachments?.map(({ filename, content, path, contentType, cid }) => ({
        filename,
        ...(content !== undefined ? { content } : { path }),
        ...(contentType ? { contentType } : {}),
        ...(cid ? { contentId: cid } : {}),
      })),
    });

    if (error) {
      console.error("[email] failed to send:", error.message);
      return { sent: false, reason: error.message };
    }

    return { sent: true, id: data.id };
  } catch (err) {
    console.error("[email] failed to send:", err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendEmail };
