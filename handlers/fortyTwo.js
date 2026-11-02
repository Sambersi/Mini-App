// handlers/fortyTwo.js

const finalAsciiArtRaw = `
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⡀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣿⣿⠀⠀⠀⠀⠀⠀⣰⣾⢿⠯⠭⠟⠻⣷⣄⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⢽⣿⠀⠀⠀⠀⠠⠿⣷⠁⠀⠀⠀⠀⢻⣿⡄⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢠⣾⡻⠋⢸⣿⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⢀⣿⣿⠇⠀⠀⠀
⠀⠀⠀⠀⠀⣰⣿⡗⠁⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⠎⠀⠀⠀⠀
⠀⠀⠀⠀⣼⣿⣎⣀⣀⣀⣸⣿⣠⣀⣀⠀⠀⠀⠀⢀⣴⡿⣿⠟⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠿⠿⠿⠿⠿⠿⢿⣿⠻⠿⠿⠀⠀⢀⣴⣿⡯⠊⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⣰⣿⣯⣭⣤⣤⣤⣤⣤⣤⡄⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠀⠀⠀⠀⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠃⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeForPre(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeFrame({ icon, title, subtitle, blink }) {
  return [
    `${icon} <b>${title}${blink ? ' ▌' : ''}</b>`,
    '',
    `<i>${subtitle}</i>`,
    '',
    `<pre>${escapeForPre(finalAsciiArtRaw)}</pre>`,
    '',
    blink ? '🟣 🟢 🔵 <b>42</b> 🔵 🟢 🟣' : '✨ <b>42, братух</b> ✨',
  ].join('\n');
}

async function fortyTwoHandler(ctx) {
  try {
    if (ctx.chat.type !== 'private') return;

    const frames = [
      { icon: '🟣', title: '42, БРАТУХ', subtitle: 'ловим ответ на главненький вопрос', blink: true },
      { icon: '🟢', title: '42, БРАТУХ', subtitle: 'ловим ответ на главненький вопрос', blink: false },
      { icon: '🔵', title: '42, БРАТУХ', subtitle: 'ответ найден', blink: true },
      { icon: '🟡', title: '42, БРАТУХ', subtitle: 'вселенная одобряет', blink: false },
      { icon: '🔴', title: '42, БРАТУХ', subtitle: 'ответ найден. кайфуем.', blink: false },
    ];

    const message = await ctx.reply(makeFrame(frames[0]), { parse_mode: 'HTML' });

    for (const frame of frames.slice(1)) {
      await sleep(350);
      try {
        await ctx.telegram.editMessageText(
          message.chat.id,
          message.message_id,
          undefined,
          makeFrame(frame),
          { parse_mode: 'HTML' },
        );
      } catch (editError) {
        const description = editError.response?.description || '';
        if (!description.includes('message is not modified')) throw editError;
      }
    }
  } catch (error) {
    console.error('[42] Ошибка при выполнении команды "42":', error);
    try {
      await ctx.reply('❌ Не удалось показать ответ 42. Попробуйте ещё раз.');
    } catch (replyError) {
      console.error('[42] Ошибка при отправке сообщения об ошибке:', replyError);
    }
  }
}

module.exports = { fortyTwoHandler };
