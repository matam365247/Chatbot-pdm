// התקנות:  npm install whatsapp-web.js qrcode-terminal express qrcode
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode         = require('qrcode');
const express        = require('express');

/* ── חיבור ל-WhatsApp ── */
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: 'sessions' }),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }   // נדרש ב-Render
});

const chats    = new Map();   // chatId → { state, name, category }
let   latestQR = '';          // QR אחרון להצגה במסלול ‎/qr

/* ── הצגת QR (לוג + /qr) ── */
client.on('qr', qr => {
  latestQR = qr;
  qrcodeTerminal.generate(qr, { small: false });    // QR גדול בלוג
});

/* ── כשהבוט מוכן ── */
client.on('ready', () => console.log('✅ Bot is ready'));

/* ── טיפול בכל הודעה ── */
client.on('message', async msg => {
  const chatId = msg.from;
  const text   = msg.body.trim();

  /* ← סינון מוחלט של קבוצות */
  if (msg.isGroupMsg || chatId.endsWith('@g.us')) {
    console.log('⤷ group message ignored:', chatId);
    return;   // הבוט לא מגיב בקבוצות
  }

  /* ← איפוס השיחה ב-"start" */
  if (text.toLowerCase() === 'start') {
    chats.set(chatId, { state: 'awaitingName' });
    await msg.reply(
`שלום וברוכים הבאים למוקד התמיכה של מדור מערכות מידע.
אנו מטפלים כעת בפניות קודמות ונשוב אליך בהקדם האפשרי.
לצורך המשך הטיפול, אנא כתוב/כתבי את שמך המלא.`);
    return;
  }

  /* ← הודעה ראשונה (ללא reset) */
  if (!chats.has(chatId)) {
    chats.set(chatId, { state: 'awaitingName' });
    await msg.reply(
`שלום וברוכים הבאים למוקד התמיכה של מדור מערכות מידע.
אנו מטפלים כעת בפניות קודמות ונשוב אליך בהקדם האפשרי.
לצורך המשך הטיפול, אנא כתוב/כתבי את שמך המלא.`);
    return;
  }

  /* ← המשך תהליך השיחה */
  const data = chats.get(chatId);

  if (data.state === 'awaitingName') {
    const name = text.split(/\s+/)[0];
    Object.assign(data, { name, state: 'awaitingMenu' });
    await msg.reply(
`תודה ${name}, אנא בחר/י באופציה המתאימה:
1️⃣ תקלת חומרה
2️⃣ בעיית תקשורת
3️⃣ בעיית הרשאות
4️⃣ אחר`);
    return;
  }

  if (data.state === 'awaitingMenu') {
    switch (text) {
      case '1': data.category = 'תקלת חומרה';   break;
      case '2': data.category = 'בעיית תקשורת'; break;
      case '3': data.category = 'בעיית הרשאות'; break;
      case '4': data.category = 'אחר';           break;
      default:
        await msg.reply('אנא הקלד/י 1, 2, 3 או 4.'); return;
    }
    data.state = 'awaitingDetails';
    await msg.reply(`רשמנו ${data.category}. נא פרט/י את הבעיה בקצרה:`);
    return;
  }

  if (data.state === 'awaitingDetails') {
    await msg.reply(`תודה, ${data.name}! פנייתך בקטגוריית “${data.category}” נקלטה. נחזור אליך בהקדם.`);
    data.state = 'done';
    return;
  }

  if (data.state === 'done') {
    await msg.reply('קיבלנו. לפתיחת פנייה חדשה כתוב/י ‎start‎.');
  }
});

/* ── הפעלת הקליינט ── */
client.initialize();

/* ── שרת Express קטן (פורט + /qr) ── */
const app = express();

app.get('/', (_, res) => res.send('Bot alive ✓'));

app.get('/qr', async (_, res) => {
  if (!latestQR) return res.send('QR not ready, נסה שוב בעוד רגע.');
  const svg = await QRCode.toString(latestQR, { type: 'svg' });
  res.type('image/svg+xml').send(svg);
});

const PORT = process.env.PORT || 3000;   // Render מקצה PORT אוטומטי
app.listen(PORT, () => console.log('HTTP server listening on', PORT));
