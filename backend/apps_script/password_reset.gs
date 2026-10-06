function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents);
    const expectedSecret = PropertiesService
      .getScriptProperties()
      .getProperty("GOOGLE_SCRIPT_SECRET");

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: "unauthorized" });
    }

    if (
      typeof payload.to !== "string" ||
      typeof payload.resetUrl !== "string" ||
      !payload.resetUrl.startsWith("https://")
    ) {
      return jsonResponse({ ok: false, error: "invalid request" });
    }

    const safeUrl = escapeHtml(payload.resetUrl);
    const message = [
      "Recebemos uma solicitação para redefinir sua senha do ProntuAI.",
      "",
      "Acesse este link em até 30 minutos:",
      payload.resetUrl,
      "",
      "Se você não solicitou a redefinição, ignore esta mensagem.",
    ].join("\n");
    const htmlBody = [
      '<div style="font-family:Arial,sans-serif;color:#202a35;max-width:560px">',
      "<h1>Redefina sua senha</h1>",
      "<p>Recebemos uma solicitação para redefinir a senha da sua conta ",
      "ProntuAI. O link expira em 30 minutos.</p>",
      '<p><a href="' + safeUrl + '" style="display:inline-block;padding:14px 22px;',
      'background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px">',
      "Redefinir senha</a></p>",
      "<p>Se você não solicitou a redefinição, ignore este e-mail.</p>",
      "</div>",
    ].join("");

    MailApp.sendEmail({
      to: payload.to,
      subject: "Redefinição de senha do ProntuAI",
      body: message,
      htmlBody: htmlBody,
      name: "ProntuAI",
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Password reset email failed: " + error.message);
    return jsonResponse({ ok: false, error: "email delivery failed" });
  }
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
