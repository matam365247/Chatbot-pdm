/**
 * התקנות:
 *   npm install whatsapp-web.js qrcode-terminal express qrcode
 */
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal         = require('qrcode-terminal');
const QRCode                 = require('qrcode');
const express                = require('express');

/* ── WhatsApp client ── */
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: 'sessions' }),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

/* chatId → { state, fullName, category, details, mutedUntil } */
const chats   = new Map();
let   latestQR = '';

/* ── QR למסוף + /qr ── */
client.on('qr', qr => {
  latestQR = qr;
  qrcodeTerminal.generate(qr, { small: false });
});
client.on('ready', () => console.log('✅ Bot is ready'));

/* ── Helper קטן לעיצוב שם: כל מילה אות גדולה ── */
function formatName(input) {
  return input
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/* ── Handler עיקרי ── */
client.on('message', async msg => {
  const chatId = msg.from;
  const text   = msg.body.trim();

  /* סינון קבוצות */
  if (msg.isGroupMsg || chatId.endsWith('@g.us')) return;

  /* 0 = פתיחת קריאה חדשה */
  if (text === '0' || text.toLowerCase() === 'start') {
    chats.set(chatId, { state: 'awaitingName' });
    await msg.reply(
`שלום וברוכים הבאים למוקד התמיכה של מדור מערכות מידע.
אנו מטפלים כעת בפניות קודמות ונשוב אליך בהקדם האפשרי.
לצורך המשך הטיפול, אנא כתוב/כתבי את שמך המלא.`);
    return;
  }

  /* יצירת סשן חדש אם אין */
  if (!chats.has(chatId)) {
    chats.set(chatId, { state: 'awaitingName' });
    await msg.reply(
`שלום וברוכים הבאים למוקד התמיכה של מדור מערכות מידע.
אנו מטפלים כעת בפניות קודמות ונשוב אליך בהקדם האפשרי.
לצורך המשך הטיפול, אנא כתוב/כתבי את שמך המלא.`);
    return;
  }

  const data = chats.get(chatId);

  /* ── mute (8️⃣) ── */
  if (data.state === 'muted' && Date.now() < data.mutedUntil) return;
  if (data.state === 'muted') data.state = 'closed';

  /* ── מצב closed ── */
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

  /* ── הוספת תוכן נוסף (9️⃣) ── */
  if (data.state === 'awaitingExtra') {
    data.details += `\n[השלמה] ${text}`;

    await msg.reply('התוכן התווסף בהצלחה.');

    await msg.reply(
`סיכום קריאה:
• שם: ${data.fullName}
• נושא: ${data.category}
• תיאור: ${data.details}

תודה! קריאתך התקבלה בהצלחה ונחזור אליך בהקדם.
0️⃣ – פתיחת קריאה חדשה
9️⃣ – הוספת תוכן לקריאה האחרונה`);
    data.state = 'closed';
    return;
  }

  /* ── קליטת שם מלא ── */
  if (data.state === 'awaitingName') {
    data.fullName = formatName(text);          // שומר את כל השם
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

  /* ── בחירת נושא ── */
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

    /* 8️⃣ – השתקה 120 דק׳ */
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
    data.state    = 'awaitingDetails';
    await msg.reply(`רשמנו “${data.category}”. נא פרט/י את הבעיה בקצרה:`);
    return;
  }

  /* ── קליטת תיאור ── */
  if (data.state === 'awaitingDetails') {
    data.details = text;
    await msg.reply(
`סיכום קריאה:
• שם: ${data.fullName}
• נושא: ${data.category}
• תיאור: ${data.details}

תודה! קריאתך התקבלה בהצלחה ונחזור אליך בהקדם.
0️⃣ – פתיחת קריאה חדשה
9️⃣ – הוספת תוכן לקריאה האחרונה`);
    data.state = 'closed';
    return;
  }
});

/* ── Express קטן ל־/qr ── */
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
