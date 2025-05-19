// התקנה: npm install whatsapp-web.js qrcode-terminal
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// שומר את הסשן בתיקייה "sessions"
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: 'sessions' }),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] } // חשוב ב-Render
});

// זיכרון-מצב זמני לכל צ’אט
const chats = new Map();   // chatId → { state, name, category }

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Bot is ready'));

client.on('message', async msg => {
  const chatId = msg.from;
  if (!chats.has(chatId)) {
    await msg.reply(
`שלום 
אב , אנו עושים את מרב המאמצים לטיפול בפניות קודמות,
מיד נתפנה אליך בהקדם.
נא לציין שם:`);
    chats.set(chatId, { state: 'awaitingName' });
    return;
  }

  const data = chats.get(chatId);

  if (data.state === 'awaitingName') {
    const name = msg.body.trim().split(/\s+/)[0];
    data.name = name;
    data.state = 'awaitingMenu';
    await msg.reply(
`תודה ${name}, אנא בחר/י באופציה המתאימה:
1️⃣ תקלת חומרה
2️⃣ בעיית תקשורת
3️⃣ בעיית הרשאות
4️⃣ אחר`);
    return;
  }

  if (data.state === 'awaitingMenu') {
    switch (msg.body.trim()) {
      case '1': data.category = 'תקלת חומרה';     break;
      case '2': data.category = 'בעיית תקשורת';   break;
      case '3': data.category = 'בעיית הרשאות';   break;
      case '4': data.category = 'אחר';             break;
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
    await msg.reply('קיבלנו. לפתיחת פנייה חדשה כתוב/י ‎!start‎.');
  }
});

client.initialize();
