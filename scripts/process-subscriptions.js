#!/usr/bin/env node
/**
 * Process horoscope subscription requests from Gmail inbox.
 * Looks for emails with subject containing "SUSCRIBIR HOROSCOPO" or "CANCELAR HOROSCOPO".
 */

const { ImapFlow } = require('imapflow');
const fs = require('fs');
const path = require('path');

const CREDS_PATH = path.join(__dirname, '..', '..', '.credentials', 'gmail.json');
const SUBSCRIBERS_PATH = path.join(__dirname, '..', 'subscribers', 'list.json');

const VALID_SIGNS = [
  'Aries', 'Tauro', 'Géminis', 'Cáncer', 'Leo', 'Virgo',
  'Libra', 'Escorpio', 'Sagitario', 'Capricornio', 'Acuario', 'Piscis'
];

// Normalize sign input (handle missing accents)
function normalizeSign(input) {
  const map = {
    'ARIES': 'Aries', 'TAURO': 'Tauro', 'GEMINIS': 'Géminis', 'GÉMINIS': 'Géminis',
    'CANCER': 'Cáncer', 'CÁNCER': 'Cáncer', 'LEO': 'Leo', 'VIRGO': 'Virgo',
    'LIBRA': 'Libra', 'ESCORPIO': 'Escorpio', 'SAGITARIO': 'Sagitario',
    'CAPRICORNIO': 'Capricornio', 'ACUARIO': 'Acuario', 'PISCIS': 'Piscis'
  };
  return map[input.toUpperCase().trim()] || null;
}

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const data = JSON.parse(fs.readFileSync(SUBSCRIBERS_PATH, 'utf8'));

  const client = new ImapFlow({
    host: creds.imap.host,
    port: creds.imap.port,
    secure: creds.imap.secure,
    auth: { user: creds.email, pass: creds.appPassword },
    logger: false
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  let changes = 0;

  try {
    const unseen = await client.search({ seen: false });

    for (const uid of unseen) {
      const msg = await client.fetchOne(uid, { envelope: true });
      const subject = (msg.envelope.subject || '').toUpperCase().trim();
      const fromAddr = msg.envelope.from?.[0]?.address?.toLowerCase();

      if (!fromAddr) continue;

      if (subject.includes('SUSCRIBIR HOROSCOPO')) {
        // Extract sign from subject
        const match = subject.match(/SUSCRIBIR\s+HOROSCOPO\s+(.+)/);
        if (!match) {
          console.log(`⚠ No sign found in subject: "${msg.envelope.subject}" from ${fromAddr}`);
          await client.messageFlagsAdd(uid, ['\\Seen']);
          continue;
        }

        const sign = normalizeSign(match[1]);
        if (!sign) {
          console.log(`⚠ Invalid sign "${match[1]}" from ${fromAddr}`);
          await client.messageFlagsAdd(uid, ['\\Seen']);
          continue;
        }

        const exists = data.subscribers.find(s => s.email === fromAddr);
        if (!exists) {
          data.subscribers.push({
            email: fromAddr,
            sign,
            active: true,
            subscribedAt: new Date().toISOString().split('T')[0]
          });
          console.log(`+ Subscribed: ${fromAddr} (${sign})`);
          changes++;
        } else if (!exists.active) {
          exists.active = true;
          exists.sign = sign;
          console.log(`+ Re-activated: ${fromAddr} (${sign})`);
          changes++;
        } else if (exists.sign !== sign) {
          exists.sign = sign;
          console.log(`~ Updated sign: ${fromAddr} → ${sign}`);
          changes++;
        } else {
          console.log(`= Already subscribed: ${fromAddr} (${sign})`);
        }
        await client.messageFlagsAdd(uid, ['\\Seen']);
      }
      else if (subject.includes('CANCELAR HOROSCOPO')) {
        const exists = data.subscribers.find(s => s.email === fromAddr);
        if (exists) {
          exists.active = false;
          exists.unsubscribedAt = new Date().toISOString().split('T')[0];
          console.log(`- Unsubscribed: ${fromAddr}`);
          changes++;
        }
        await client.messageFlagsAdd(uid, ['\\Seen']);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  if (changes > 0) {
    fs.writeFileSync(SUBSCRIBERS_PATH, JSON.stringify(data, null, 2) + '\n');
    console.log(`\nSaved ${data.subscribers.filter(s => s.active).length} active subscribers.`);
  } else {
    console.log('No subscription changes.');
  }

  return changes;
}

main().catch(err => { console.error(err); process.exit(1); });
