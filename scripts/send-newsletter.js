#!/usr/bin/env node
/**
 * Horóscopo Diario — Newsletter Sender
 * Sends each subscriber their personalized horoscope via Gmail SMTP.
 * Usage: node send-newsletter.js [YYYY-MM-DD]
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const CREDS_PATH = path.join(__dirname, '..', '..', '.credentials', 'gmail.json');
const SUBSCRIBERS_PATH = path.join(__dirname, '..', 'subscribers', 'list.json');
const ARTICLES_DIR = path.join(__dirname, '..', 'articles');
const SITE_URL = 'https://diego-devs.github.io/horoscopo-diario';

const MONTHS = {
  '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio',
  '07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'
};

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const { subscribers } = JSON.parse(fs.readFileSync(SUBSCRIBERS_PATH, 'utf8'));
  const active = subscribers.filter(s => s.active !== false);

  if (active.length === 0) {
    console.log('No active subscribers. Skipping.');
    return;
  }

  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  const articlePath = path.join(ARTICLES_DIR, `${date}.json`);

  if (!fs.existsSync(articlePath)) {
    console.error(`Article not found: ${articlePath}`);
    process.exit(1);
  }

  const article = JSON.parse(fs.readFileSync(articlePath, 'utf8'));
  const [y, m, d] = date.split('-');
  const dateStr = `${parseInt(d)} de ${MONTHS[m]}, ${y}`;

  const transporter = nodemailer.createTransport({
    host: creds.smtp.host,
    port: creds.smtp.port,
    secure: creds.smtp.secure,
    auth: { user: creds.email, pass: creds.appPassword }
  });

  let sent = 0, failed = 0;
  for (const sub of active) {
    const horoscope = article.horoscopes.find(h => h.sign === sub.sign);
    if (!horoscope) {
      console.log(`⚠ No horoscope found for sign "${sub.sign}" — skipping ${sub.email}`);
      continue;
    }

    const subject = `✨ ${horoscope.emoji} Tu horóscopo de hoy, ${horoscope.sign} — ${dateStr}`;
    const html = buildEmailHTML(horoscope, dateStr, sub.email);
    const text = buildEmailText(horoscope, dateStr);

    try {
      await transporter.sendMail({
        from: `"Horóscopo Diario" <${creds.email}>`,
        to: sub.email,
        subject,
        html,
        text
      });
      sent++;
      console.log(`✓ Sent to ${sub.email} (${sub.sign})`);
    } catch (err) {
      failed++;
      console.error(`✗ Failed ${sub.email}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nDone: ${sent} sent, ${failed} failed, ${active.length} total subscribers.`);
}

function buildEmailHTML(h, dateStr, email) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:600px;margin:0 auto;background:#12121e;border:1px solid #1e1e30;">
    <!-- Header -->
    <div style="padding:2.5rem;text-align:center;border-bottom:1px solid #1e1e30;">
      <div style="font-size:4rem;margin-bottom:0.5rem;">${h.emoji}</div>
      <p style="font-size:0.7rem;letter-spacing:0.25em;text-transform:uppercase;color:#9b59b6;margin:0 0 0.5rem;">Horóscopo Diario</p>
      <h1 style="font-size:1.8rem;font-weight:400;color:#e8e6e3;margin:0;">${h.sign}</h1>
      <p style="font-size:0.85rem;color:#8a8a9a;margin:0.5rem 0 0;">${dateStr}</p>
    </div>

    <!-- Prediction -->
    <div style="padding:2rem 2.5rem;">
      <p style="font-size:1.05rem;line-height:1.8;color:#e8e6e3;">${h.prediction}</p>
    </div>

    <!-- Meta -->
    <div style="padding:0 2.5rem 2rem;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:0.75rem;text-align:center;background:rgba(155,89,182,0.1);border:1px solid rgba(155,89,182,0.15);border-radius:8px;">
            <div style="font-size:0.65rem;color:#9b59b6;text-transform:uppercase;letter-spacing:0.1em;">Número de suerte</div>
            <div style="font-size:1.5rem;color:#e8e6e3;margin-top:0.25rem;">${h.luckyNumber}</div>
          </td>
          <td style="width:10px;"></td>
          <td style="padding:0.75rem;text-align:center;background:rgba(155,89,182,0.1);border:1px solid rgba(155,89,182,0.15);border-radius:8px;">
            <div style="font-size:0.65rem;color:#9b59b6;text-transform:uppercase;letter-spacing:0.1em;">Mood</div>
            <div style="font-size:1.1rem;color:#e8e6e3;margin-top:0.25rem;">${h.mood}</div>
          </td>
          <td style="width:10px;"></td>
          <td style="padding:0.75rem;text-align:center;background:rgba(155,89,182,0.1);border:1px solid rgba(155,89,182,0.15);border-radius:8px;">
            <div style="font-size:0.65rem;color:#9b59b6;text-transform:uppercase;letter-spacing:0.1em;">Compatible</div>
            <div style="font-size:1.1rem;color:#e8e6e3;margin-top:0.25rem;">${h.compatibility}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- CTA -->
    <div style="padding:1.5rem 2.5rem;text-align:center;border-top:1px solid #1e1e30;">
      <a href="${SITE_URL}" style="display:inline-block;padding:0.75rem 2rem;background:#9b59b6;color:#fff;text-decoration:none;border-radius:8px;font-size:0.85rem;font-weight:600;">Ver todos los signos</a>
    </div>

    <!-- Footer -->
    <div style="padding:1.5rem 2.5rem;text-align:center;border-top:1px solid #1e1e30;">
      <p style="font-size:0.75rem;color:#5a5a5a;margin:0;">Recibes este correo porque te suscribiste a Horóscopo Diario.</p>
      <p style="font-size:0.75rem;color:#5a5a5a;margin:0.5rem 0 0;">Para cancelar, responde con asunto "CANCELAR HOROSCOPO".</p>
    </div>
  </div>
</body>
</html>`;
}

function buildEmailText(h, dateStr) {
  return `HORÓSCOPO DIARIO — ${dateStr}\n\n${h.emoji} ${h.sign}\n\n${h.prediction}\n\n🍀 Número de suerte: ${h.luckyNumber}\n💫 Mood: ${h.mood}\n💕 Compatible con: ${h.compatibility}\n\n---\nVer en el sitio: ${SITE_URL}\nPara cancelar, responde con asunto "CANCELAR HOROSCOPO".`;
}

main().catch(err => { console.error(err); process.exit(1); });
