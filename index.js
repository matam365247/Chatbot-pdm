/**
 * תלות-התקנה:
 *   npm install whatsapp-web.js qrcode-terminal express qrcode
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal         = require('qrcode-terminal');
const QRCode                 = require('qrcode');
const express                = require('express');

/* ─────────────────────  הגדרת WhatsApp Web  ───────────────────── */
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: 'sessions' }),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

/* chatId → { state, name, category, details } */
const chats   = new Map();
let   latestQR = '';

/* ─────────────────────  QR למסוף + /qr  ───────────────────── */
client.on('qr', qr => {
  latestQR = qr;
  qrcodeTerminal.generate(qr, { small: false });     // QR גדול וברור
});
client.on('ready', () => console.log('✅ Bot is ready'));

/* ─────────────────────  Handler לכל הודעה  ───────────────────── */
client.on('message', async msg => {
  const chatId = msg.from;
  const text   = msg.body.trim();

  /* ➊ - התעלמות מוחלטת מקבוצות */
  if (msg.isGroupMsg || chatId.endsWith('@g.us')) return;

  /* ➋ - 0 = פתיחת קריאה חדשה בכל מצב */
  if (text === '0' || text.toLowerCase() === 'start') {
    chats.set(chatId, { state: 'awaitingName' });
    await msg.reply(
`שלום וברוכים הבאים למוקד התמיכה של מדור מערכות מידע.
אנו מטפלים כעת בפניות קודמות ונשוב אליך בהקדם האפשרי.
לצורך המשך הטיפול, אנא כתוב/כתבי את שמך המלא.`);
    return;
  }

  /* יצירה אוטומטית של סשן אם אין בכלל */
  if (!chats.has(chatId)) {
    chats.set(chatId, { state: 'awaitingName' });
    await msg.reply(
`שלום וברוכים הבאים למוקד התמיכה של מדור מערכות מידע.
אנו מטפלים כעת בפניות קודמות ונשוב אליך בהקדם האפשרי.
לצורך המשך הטיפול, אנא כתוב/כתבי את שמך המלא.`);
    return;
  }

  const data = chats.get(chatId);

  /* ➌ - מצב סגור: רק 0 או 8 חוקיים */
  if (data.state === 'closed') {
    if (text === '8') {
      data.state = 'awaitingExtra';
      await msg.reply('אנא פרט/י את התוכן הנוסף לפנייה האחרונה:');
    } else {
      await msg.reply(
'הפנייה נסגרה.\nלפתיחת קריאה חדשה – רשום 0\nלהוספת תוכן לקריאה האחרונה – רשום 8');
    }
    return;
  }

  /* ➍ - הוספת תוכן נוסף (8) */
  if (data.state === 'awaitingExtra') {
    data.details += `\n[השלמה] ${text}`;

    /* הודעה קצרה */
    await msg.reply('התוכן התווסף בהצלחה.');

    /* סיכום עדכני מלא */
    await msg.reply(
`סיכום פנייתך:
• שם: ${data.name}
• נושא: ${data.category}
• תיאור: ${data.details}

תודה! פנייתך התקבלה בהצלחה ונחזור אליך בהקדם.
לפתיחת קריאה חדשה – רשום 0
להוספת תוכן לקריאה האחרונה – רשום 8`);
    data.state = 'closed';
    return;
  }

  /* ➎ - המשך התהליך הרגיל */
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

  if (data.state === 'awaitingDetails') {
    data.details = text;
    await msg.reply(
`סיכום פנייתך:
• שם: ${data.name}
• נושא: ${data.category}
• תיאור: ${data.details}

תודה! פנייתך התקבלה בהצלחה ונחזור אליך בהקדם.
לפתיחת קריאה חדשה – רשום 0
להוספת תוכן לקריאה האחרונה – רשום 8`);
    data.state = 'closed';
    return;
  }
});

/* ─────────────────────  אקספרס קטן ל-/qr  ───────────────────── */
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
