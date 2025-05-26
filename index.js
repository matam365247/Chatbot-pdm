/**
 * התקנות:
 *   npm install whatsapp-web.js qrcode-terminal express qrcode
 */
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal         = require('qrcode-terminal');
const QRCode                 = require('qrcode');
const express                = require('express');

/* ====== הגדרות ====== */
const SUMMARY_GROUP_NAME = 'סיכום קריאות פדם';
let   summaryGroupId     = null;                  // ימולא ב-ready

/* ====== יצירת לקוח WhatsApp-Web ====== */
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: 'sessions' }),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

/* chatId → { state, fullName, phone, category, details, ticketId, mutedUntil } */
const chats = new Map();
let latestQR = '';

/* עיצוב שם */
const formatName = s => s.trim().split(/\s+/)
  .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');

/* ===== QR למסוף + /qr ===== */
client.on('qr', qr => {
  latestQR = qr;
  qrcodeTerminal.generate(qr, { small: false });
});

/* ===== איתור קבוצת הסיכומים ===== */
async function findSummaryGroup() {
  const chats = await client.getChats();
  const g     = chats.find(c => c.isGroup && c.name === SUMMARY_GROUP_NAME);
  if (g) summaryGroupId = g.id._serialized;
}

client.on('ready', async () => {
  console.log('✅ Bot is ready');
  await findSummaryGroup();
  console.log(summaryGroupId
    ? `ℹ️  הקבוצה “${SUMMARY_GROUP_NAME}” נמצאה`
    : `⚠️  הקבוצה “${SUMMARY_GROUP_NAME}” לא נמצאה`);
});

/* ===== שליחת סיכום לקבוצה (אם קיימת) ===== */
async function sendSummaryToGroup(text) {
  if (!summaryGroupId) await findSummaryGroup();
  if (summaryGroupId)  await client.sendMessage(summaryGroupId, text);
}

/* ===== Handler הודעות ===== */
client.on('message', async msg => {
  const chatId = msg.from;                        // 9725xxxx@c.us
  const phone  = chatId.replace(/@.*/, '');       // 9725xxxx
  const text   = msg.body.trim();

  if (msg.isGroupMsg || chatId.endsWith('@g.us')) return; // להתעלם מקבוצות

  /* ---------- 0 / start = איפוס ---------- */
  if (text === '0' || text.toLowerCase() === 'start') {
    chats.set(chatId, { state: 'awaitingName' });
    await msg.reply(
`שלום וברוכים הבאים למוקד התמיכה של מדור מערכות מידע.
אנו מטפלים כעת בפניות קודמות ונשוב אליך בהקדם האפשרי.
לצורך המשך הטיפול, אנא כתוב/כתבי את שמך המלא.`);
    return;
  }

  /* יצירת סשן בסיסי אם אין */
  if (!chats.has(chatId)) {
    chats.set(chatId, { state: 'awaitingName' });
    await msg.reply(
`שלום וברוכים הבאים למוקד התמיכה של מדור מערכות מידע.
אנו מטפלים כעת בפניות קודמות ונשוב אליך בהקדם האפשרי.
לצורך המשך הטיפול, אנא כתוב/כתבי את שמך המלא.`);
    return;
  }

  const data = chats.get(chatId);

  /* ---------- mute פעיל? ---------- */
  if (data.state === 'muted' && Date.now() < data.mutedUntil) return;
  if (data.state === 'muted') data.state = 'closed';

  /* ---------- מצב closed ---------- */
  if (data.state === 'closed') {
    if (text === '9') {
      data.state = 'awaitingExtra';
      await msg.reply('אנא פרט/י את התוכן הנוסף לקריאה האחרונה:');
    } else {
      await msg.reply(
'קריאה זו נסגרה.\n0️⃣ – פתיחת קריאה חדשה\n9️⃣ – הוספת תוכן לקריאה האחרונה');
    }
    return;
  }

  /* ---------- awaitingExtra (9️⃣) ---------- */
  if (data.state === 'awaitingExtra') {
    data.details += `\n[השלמה] ${text}`;
    await msg.reply('התוכן התווסף בהצלחה.');

    const summary =
`סיכום קריאה:
• מספר קריאה: ${data.ticketId}
• שם: ${data.fullName}
• מספר טלפון: ${data.phone}
• נושא: ${data.category}
• תיאור: ${data.details}`;

    await msg.reply(summary +
`\n\nתודה! קריאתך התקבלה בהצלחה ונחזור אליך בהקדם.
0️⃣ – פתיחת קריאה חדשה
9️⃣ – הוספת תוכן לקריאה האחרונה`);
    await sendSummaryToGroup(summary);

    data.state = 'closed';
    return;
  }

  /* ---------- awaitingName ---------- */
  if (data.state === 'awaitingName') {
    data.fullName = formatName(text);
    data.phone    = phone;                // שמירת מספר הטלפון
    data.state    = 'awaitingMenu';
    await msg.reply(
`תודה ${data.fullName}, אנא בחר/י באופציה המתאימה:
1️⃣ אין לי רשת
2️⃣ לא נדלק לי המחשב/המסך
3️⃣ לא נכנס לי לתיקיות
4️⃣ יצירת יוזר
5️⃣ איפוס סיסמה ליוזר
6️⃣ איטיות במחשב
7️⃣ אחר
8️⃣ שוחחנו כעת – המשך טיפול בצ’אט זה (ללא פתיחת קריאה חדשה)`);
    return;
  }

  /* ---------- awaitingMenu ---------- */
  if (data.state === 'awaitingMenu') {
    const menu = {
      '1': 'אין לי רשת',
      '2': 'לא נדלק מחשב/מסך',
      '3': 'לא נכנס לתיקיות',
      '4': 'יצירת יוזר',
      '5': 'איפוס סיסמה ליוזר',
      '6': 'איטיות במחשב',
      '7': 'אחר',
      '8': 'Mute-120'
    };
    if (!menu[text]) { await msg.reply('אנא הקלד/י מספר בין 1 ל-8.'); return; }

    /* 8️⃣ – mute */
    if (text === '8') {
      data.mutedUntil = Date.now() + 120 * 60 * 1000;
      data.state      = 'muted';
      await msg.reply(
'נמשיך לטפל בקריאה בצ’אט זה, ללא פתיחת קריאה חדשה.\n' +
'0️⃣ – פתיחת קריאה חדשה\n' +
'9️⃣ – הוספת תוכן לקריאה האחרונה (זמין לאחר הסיכום)');
      return;
    }

    /* 1️⃣-7️⃣ – נושא רגיל */
    data.category = menu[text];
    data.ticketId = Math.floor(10000 + Math.random() * 90000);  // מספר קריאה
    data.state    = 'awaitingDetails';
    await msg.reply(`רשמנו “${data.category}”. נא פרט/י את הבעיה בקצרה:`);
    return;
  }

  /* ---------- awaitingDetails ---------- */
  if (data.state === 'awaitingDetails') {
    data.details = text;

    const summary =
`סיכום קריאה:
• מספר קריאה: ${data.ticketId}
• שם: ${data.fullName}
• מספר טלפון: ${data.phone}
• נושא: ${data.category}
• תיאור: ${data.details}`;

    await msg.reply(summary +
`\n\nתודה! קריאתך התקבלה בהצלחה ונחזור אליך בהקדם.
0️⃣ – פתיחת קריאה חדשה
9️⃣ – הוספת תוכן לקריאה האחרונה`);
    await sendSummaryToGroup(summary);

    data.state = 'closed';
    return;
  }
});

/* ===== Express קטן ל־/qr ===== */
const app = express();
app.get('/', (_, r) => r.send('Bot alive ✓'));
app.get('/qr', async (_, r) => {
  if (!latestQR) return r.send('QR not ready, נסה שוב בעוד רגע.');
  const svg = await QRCode.toString(latestQR, { type: 'svg' });
  r.type('image/svg+xml').send(svg);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HTTP on', PORT));

/* ===== הפעלת הבוט ===== */
client.initialize();
