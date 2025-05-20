// התקנות:  npm install whatsapp-web.js qrcode-terminal express qrcode
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal         = require('qrcode-terminal');
const QRCode                 = require('qrcode');
const express                = require('express');

/* ── WhatsApp client ── */
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: 'sessions' }),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

const chats = new Map();     // chatId → { state, name, category, details }
let   latestQR = '';         // QR for /qr

/* ── QR למסוף + /qr ── */
client.on('qr', qr => {
  latestQR = qr;
  qrcodeTerminal.generate(qr, { small: false });
});
client.on('ready', () => console.log('✅ Bot is ready'));

/* ── הודעות ── */
client.on('message', async msg => {
  const chatId = msg.from;
  const text   = msg.body.trim();

  /* סינון קבוצות */
  if (msg.isGroupMsg || chatId.endsWith('@g.us')) return;

  /* reset */
  if (text.toLowerCase() === 'start') {
    chats.set(chatId, { state: 'awaitingName' });
    await msg.reply(
`שלום וברוכים הבאים למוקד התמיכה של מדור מערכות מידע.
אנו מטפלים כעת בפניות קודמות ונשוב אליך בהקדם האפשרי.
לצורך המשך הטיפול, אנא כתוב/כתבי את שמך המלא.

*התחל קריאה חדשה:* https://wa.me/?text=start`);
    return;
  }

  /* יצירת סשן חדש אם אין */
  if (!chats.has(chatId)) {
    chats.set(chatId, { state: 'awaitingName' });
    await msg.reply(
`שלום וברוכים הבאים למוקד התמיכה של מדור מערכות מידע.
אנו מטפלים כעת בפניות קודמות ונשוב אליך בהקדם האפשרי.
לצורך המשך הטיפול, אנא כתוב/כתבי את שמך המלא.

*התחל קריאה חדשה:* https://wa.me/?text=start`);
    return;
  }

  const data = chats.get(chatId);

  /* מצב סגור – משיבים רק לינק לפתיחה חדשה */
  if (data.state === 'closed') {
    await msg.reply('הפנייה נסגרה.\n*התחל קריאה חדשה:* https://wa.me/?text=start');
    return;
  }

  /* קבלת שם */
  if (data.state === 'awaitingName') {
    data.name  = text.split(/\s+/)[0];
    data.state = 'awaitingMenu';
    await msg.reply(
`תודה ${data.name}, אנא בחר/י באופציה המתאימה:
1️⃣ אין לי רשת
2️⃣ לא נדלק לי המחשב/המסך
3️⃣ לא נכנס לי לתיקיות
4️⃣ יצירת יוזר
5️⃣ איפוס סיסמה ליוזר
6️⃣ איטיות במחשב
7️⃣ אחר`);
    return;
  }

  /* בחירת נושא */
  if (data.state === 'awaitingMenu') {
    const menu = {
      '1': 'אין לי רשת',
      '2': 'לא נדלק מחשב/מסך',
      '3': 'לא נכנס לתיקיות',
      '4': 'יצירת יוזר',
      '5': 'איפוס סיסמה ליוזר',
      '6': 'איטיות במחשב',
      '7': 'אחר'
    };
    if (!menu[text]) {
      await msg.reply('אנא הקלד/י מספר בין 1 ל-7.'); return;
    }
    data.category = menu[text];
    data.state    = 'awaitingDetails';
    await msg.reply(`רשמנו “${data.category}”. נא פרט/י את הבעיה בקצרה:`);
    return;
  }

  /* קבלת תיאור → סיכום מיידי */
  if (data.state === 'awaitingDetails') {
    data.details = text;
    await msg.reply(
`סיכום פנייתך:
• שם: ${data.name}
• נושא: ${data.category}
• תיאור: ${data.details}

תודה! פנייתך נקלטה ונחזור אליך בהקדם.
*התחל קריאה חדשה:* https://wa.me/?text=start`);
    data.state = 'closed';   // מכאן ואילך נענה רק בלינק לפתיחה חדשה
    return;
  }
});

/* ── Express קטן ── */
const app = express();
app.get('/', (_, r) => r.send('Bot alive ✓'));
app.get('/qr', async (_, r) => {
  if (!latestQR) return r.send('QR not ready, נסה שוב בעוד רגע.');
  const svg = await QRCode.toString(latestQR, { type: 'svg' });
  r.type('image/svg+xml').send(svg);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HTTP on', PORT));

client.initialize();
