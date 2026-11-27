'use strict';
function processUsername(name) {
  if (!name) {
    return 'Press Эфыч'; // Если имя отсутствует
  }

  // Регулярное выражение для поиска запрещенных символов
  const forbiddenSymbolsRegex = /[\[\]<>@]/g;

  // Удаляем запрещенные символы из имени
  let cleanedName = name.replace(forbiddenSymbolsRegex, '');

  // Запрещенные слова и их производные (в разных регистрах)
  const forbiddenWords = [
    'слава украине',
    'украина',
    'ukraine',
    'україна',
    'slava ukraine',
    'героям слава',
    'glory to ukraine',
    'glory to heroes'
  ];

  // Преобразуем массив запрещенных слов в регулярное выражение (с учетом регистра)
  const forbiddenWordsRegex = new RegExp(
    forbiddenWords.map(word => word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|'),
    'gi'
  );

  // Удаляем запрещенные слова
  cleanedName = cleanedName.replace(forbiddenWordsRegex, '');

  // Регулярное выражение для поиска эмодзи флагов (региональные индикаторы)
  const flagEmojiRegex = /\p{RI}\p{RI}/gu;

  // Удаляем эмодзи флагов
  cleanedName = cleanedName.replace(flagEmojiRegex, '');

  // Ограничиваем длину до 16 символов (с сохранением эмодзи)
  return cleanedName.slice(0, 16).trim() || 'Press Эфыч';
}
module.exports={processUsername};
