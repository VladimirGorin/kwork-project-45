const fs = require("fs");
const testMode = JSON.parse(process.env.TEST_MODE);
const adminChatId = Number(
  testMode ? process.env.TEST_ADMIN_CHAT_ID : process.env.ADMIN_CHAT_ID
);

const stringSimilarity = require("string-similarity");

const { google } = require("googleapis");
const googleSheetsCredentials = require("../data/the-tendril-409714-970a97e08f1c.json");

const LanguageDetect = require("languagedetect");
const langDetect = new LanguageDetect();

function sendLogs(
  bot,
  { userName, userId, groupNames, classText, message, options = {} }
) {
  const settings = JSON.parse(fs.readFileSync("./assets/data/settings.json"));
  const groupId = settings?.groupId;
  const text = `Тестовый режим: ${
    testMode ? "on" : "off"
  }\n➖➖➖➖➖➖➖➖➖➖➖\n${userId}\n➖➖➖➖➖➖➖➖➖➖➖\nКлассификация удаления: ${classText}\nОтправил пользователь: ${userName}\nОтправлено из чата: ${groupNames}\n➖➖➖➖➖➖➖➖➖➖➖
  ${options?.messageId ? `\nID сообщения: ${options?.messageId}\n` : ""}${
    options?.banWord ? `\nСлово бана: ${options?.banWord}\n` : ""
  }➖➖➖➖➖➖➖➖➖➖➖\n${message}`;

  bot.sendMessage(groupId, text);
}

function changeSettings(user, step) {
  const settings = JSON.parse(fs.readFileSync("./assets/data/settings.json"));

  switch (step) {
    case "changeGroupToLogs":
      settings.groupId = user.temp.groupId;

      fs.writeFileSync(
        "./assets/data/settings.json",
        JSON.stringify(settings, null, "\t")
      );
      break;
    case "changeSubChannels":
      settings.subChannels = user.temp.subChannels;

      fs.writeFileSync(
        "./assets/data/settings.json",
        JSON.stringify(settings, null, "\t")
      );
      break;
    case "changeSubText":
      settings.subText = user.temp.subText;

      fs.writeFileSync(
        "./assets/data/settings.json",
        JSON.stringify(settings, null, "\t")
      );
      break;
    case "changeGoogleSheetsData":
      settings.sheetSettings.sheetId = user.temp.sheetId;

      fs.writeFileSync(
        "./assets/data/settings.json",
        JSON.stringify(settings, null, "\t")
      );
      break;
    default:
      break;
  }
}

async function getSheetsData() {
  const settings = JSON.parse(fs.readFileSync("./assets/data/settings.json"));
  const sheetSettings = settings.sheetSettings;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: googleSheetsCredentials.client_email,
      private_key: googleSheetsCredentials.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetSettings.sheetId,
      range: "Лист1",
    });

    return response.data.values;
  } catch (error) {
    return false;
  }
}

async function setSheetsData(bot) {
  const googleSheetsResponse = await getSheetsData();

  if (googleSheetsResponse) {
    const settings = JSON.parse(fs.readFileSync("./assets/data/settings.json"));
    if (settings.banWords) {
      fs.writeFileSync(
        "./assets/data/banwords.json",
        JSON.stringify(googleSheetsResponse, null, "\t")
      );
    } else {
      fs.writeFileSync(
        "./assets/data/banwords.json",
        JSON.stringify([], null, "\t")
      );
    }
  } else {
    bot.sendMessage(
      adminChatId,
      "Ошибка при попытке экспорта данных из Google таблицы"
    );
  }
}

function containsBadWords(banWords, text) {
  const sanitizedText = text.toLowerCase().replace(/[,\.]/g, '');

  const words = sanitizedText.split(" ")

  for (const wordList of banWords) {
    for (const word of wordList) {
      const sanitizedWord = word.toLowerCase();
      const findBadWord = words.find(word => word.toLowerCase() === sanitizedWord)

      if (findBadWord) {

        return findBadWord;
      }
    }
  }

  return null;
}


function removeMessage(groupId, messageId) {
  let groups = JSON.parse(fs.readFileSync("./assets/data/groups.json"));

  groups.map((group) => {
    if (Number(group.id) === Number(groupId)) {
      group.messages = group.messages.filter(
        (msg) => msg.messageId !== messageId
      );
    }
    return group;
  });

  fs.writeFileSync(
    "./assets/data/groups.json",
    JSON.stringify(groups, null, 2)
  );
}

function filterReplacingCharacters(text) {
  // Минимальное количиство символов для проверки

  if (text?.length <= 5) {
    return { status: false, text: "Меньше 5 символов" };
  }

  // Удаляем запрещеные символы

  const forbiddenSymbols = ["*", "@", "<", ">", "^", "|", "#", "&", "+"];
  const findForbiddenSymbol = forbiddenSymbols?.find((symbol) =>
    text.includes(symbol)
  );

  const enRegex = /[a-zA-Z]/;
  const enTest = enRegex.test(text);

  if (!isNaN(text)) {
    return { status: false };
  }

  // Проверка на плохие символы в предложении

  if (findForbiddenSymbol) {
    return {
      status: true,
      text: `Есть запрещенный символ ${findForbiddenSymbol}`,
    };
  }

  const regex = text?.match(
    /(?:^|\s)[а-яА-Яa-zA-Z]+\d+[а-яА-Яa-zA-Z]+(?:\s|$)/u
  );
  const result = !!regex;

  if (result) {
    return { status: true, text: "Цифры" };
  }

  const detectedLanguage = langDetect.detect(text);

  const totalWords = detectedLanguage.reduce((acc, cur) => acc + cur[1], 0);
  const languagePercentages = detectedLanguage.map((item) => [
    item[0],
    Number(((item[1] / totalWords) * 100).toFixed(1)),
  ]);

  const ua = languagePercentages.find((item) => item[0] === "ukrainian");
  const ru = languagePercentages.find((item) => item[0] === "russian");
  const en = languagePercentages.find((item) => item[0] === "english");

  console.log(text);
  console.log("\n");
  console.log(ua, ru, en);
  console.log("\n");



  // Проверка что в языке нет английского но есть УКР и РУ
  if (ru && ua && !en) {
    if (enTest) {
      return { status: true, text: "Есть EN буквы" };
    }
  } else if (ua && !en) {
    if (enTest) {
      return { status: true, text: "Есть EN буквы" };
    }
  } else if (ru && !en) {
    if (enTest) {
      return { status: true, text: "Есть EN буквы" };
    }
  }

  // Если не найден язык
  if (!ru && !en && !ua) {
    return { status: true, text: "Не найден язык" };
  }

  // Проверка если язык 100% не русский
  if (!ru && en) {
    return { status: false, text: "Язык не русский. АНГ" };
  }

  if (!ru && ua) {
    return { status: false, text: "Язык не русский. УКР" };
  }

  // Проверка что это укр
  if (ua && ru && ua[1] >= ru[1]) {
    return { status: false, text: "Проверка что УКР" };
  }

  // Проверка что он вообще есть
  if (!ru) {
    return { status: true, text: "Русского нету" };
  }

  // Проверка процентного соотнощения
  if (ua && ua[1] > ru[1]) {
    return { status: true, text: "Проверка процентного соотнощения с УКР" };
  }

  if (en && en[1] > ru[1]) {
    return { status: true, text: "Проверка процентного соотнощения с АНГ" };
  }


  // Проверяем если есть русский и АНГЛ то удаляем

  if (ru && en) {
    // Проверка что русский больше чем английский
    if (ru[1] < en[1]){
      return { status: true, text: `Есть Русский [${ru[1]}] и Англ [${en[1]}]` };
    }
  }

  return { status: false, text: "Успешно" };
}

function checkSimilarity(text, checkText) {
  const similarity = stringSimilarity.compareTwoStrings(text, checkText) * 100;

  return Number(similarity.toFixed(0));
}

function findNumber(text) {
  const test = /\+(?=\d)/.test(text);

  return { status: test };
}

function filteringRepeatedMessages(text, groupName, messageId) {
  const groups = JSON.parse(fs.readFileSync("./assets/data/groups.json"));
  const settings = JSON.parse(fs.readFileSync("./assets/data/settings.json"));

  const formattedText = text?.replace(/\s/g, "").toLowerCase();
  const results = [];

  groups.forEach((group, groupIndex) => {
    const matchingMessages = [];

    group.messages.forEach((message) => {
      const formattedGroupText = message?.message
        ?.replace(/\s/g, "")
        .toLowerCase();

      if (!message?.message) {
        return;
      }

      if (message?.messageId === messageId) {
        return;
      }

      const similarity = checkSimilarity(formattedText, formattedGroupText);
      if (similarity >= 70) {
        matchingMessages.push(message);
        results.push({
          status: true,
          messageId: message.messageId,
          groupId: Number(group.id),
          groupNames: [groupName, group?.title],
          message: message.message,
          uploadTime: message.uploadTime,
        });
      }
    });

    matchingMessages.forEach((matchingMessage) => {
      const messageIndex = group.messages.indexOf(matchingMessage);
      group.messages.splice(messageIndex, 1);
    });

    if (group.messages.length === 0) {
      groups.splice(groupIndex, 1);
    }
  });

  fs.writeFileSync(
    "./assets/data/groups.json",
    JSON.stringify(groups, null, 2)
  );

  return results.length > 0 ? { results, status: true } : { status: false };
}

module.exports = {
  sendLogs,
  changeSettings,
  getSheetsData,
  setSheetsData,
  containsBadWords,
  filterReplacingCharacters,
  filteringRepeatedMessages,
  removeMessage,
  checkSimilarity,
  findNumber,
};
