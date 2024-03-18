require("dotenv").config({ path: "./assets/.env" });
const winston = require("winston");
const { combine, timestamp, printf } = winston.format;
const { exec } = require('child_process');

const cron = require("node-cron");

const testMode = JSON.parse(process.env.TEST_MODE);

const adminChatId = Number(
  testMode ? process.env.TEST_ADMIN_CHAT_ID : process.env.ADMIN_CHAT_ID
);

let temp = {
  groups: [],
  handleFunction: null,
  eflood: false
};

const googleSheetsCredentials = require("./assets/data/the-tendril-409714-970a97e08f1c.json");

const TelegramBotApi = require("node-telegram-bot-api");
const bot = new TelegramBotApi(
  testMode ? process.env.TOKEN_TEST : process.env.TOKEN,
  { polling: true }
);

const fs = require("fs");

const errorLogger = winston.createLogger({
  level: "error",
  format: combine(
    timestamp(),
    printf((error) => `${error.timestamp} - ${error.message}`)
  ),
  transports: [
    new winston.transports.File({
      filename: "errors.log",
      dirname: "./assets/logs/",
    }),
  ],
});

try {
  const {
    sendLogs,
    changeSettings,
    setSheetsData,
    containsBadWords,
    filterReplacingCharacters,
    filteringRepeatedMessages,
    removeMessage,
    checkSimilarity,
    findNumber,
  } = require("./assets/modules/utils");
  const commands = JSON.parse(fs.readFileSync("./assets/data/commands.json"));

  bot.setMyCommands(commands);

  const changeMinLenFilter = (msg) => {
    if (msg.chat.type === "private") {
      const users = JSON.parse(fs.readFileSync("./assets/data/users.json"));
      const settings = JSON.parse(
        fs.readFileSync("./assets/data/settings.json")
      );
      let user = users.filter((x) => x.id === msg.from.id)[0];

      const text = msg.text;

      const minLen = Number(text);
      if (isNaN(minLen)) {
        bot.sendMessage(user.id, "Пожалуйста, введите корректное число.");
        return;
      }

      settings.minLen = minLen;

      fs.writeFileSync(
        "./assets/data/settings.json",
        JSON.stringify(settings, null, "\t")
      );

      bot.sendMessage(
        user.id,
        "Минимальное количиство символов для проверки успешно сохранены!"
      );

      bot.removeListener("message", changeMinLenFilter);
    }
  };

  const addAdmins = (msg) => {
    if (msg.chat.type === "private") {
      const users = JSON.parse(fs.readFileSync("./assets/data/users.json"));
      let user = users.filter((x) => x.id === msg.from.id)[0];

      const formatedUsernames = msg.text.split(", ");

      formatedUsernames.forEach((username) => {
        const userToAdd = users.find((user) => user?.nick === username);

        if (userToAdd) {
          userToAdd.isAdmin = true;
          bot.sendMessage(
            user.id,
            `Пользователь @${username} теперь является администратором.`
          );
        } else {
          bot.sendMessage(
            user.id,
            `Не удалось найти пользователя с username @${username}. Установка статуса админа не выполнена.`
          );
        }

        fs.writeFileSync(
          "./assets/data/users.json",
          JSON.stringify(users, null, "\t")
        );
      });

      bot.removeListener("message", addAdmins);
    }
  };

  const changeGroupToLogs = (msg) => {
    if (msg.chat.type === "private") {
      const users = JSON.parse(fs.readFileSync("./assets/data/users.json"));
      let user = users.filter((x) => x.id === msg.from.id)[0];

      user.temp.groupId = msg.text;
      changeSettings(user, "changeGroupToLogs");

      bot.sendMessage(user.id, "Группа успешно сохранена", {
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              {
                text: "Отменить",
                callback_data: `removeHandler:message`,
              },
            ],
          ],
        }),
      });
      bot.removeListener("message", changeGroupToLogs);
    }
  };

  const changeSubChannels = (msg) => {
    if (msg.chat.type === "private") {
      const users = JSON.parse(fs.readFileSync("./assets/data/users.json"));
      let user = users.filter((x) => x.id === msg.from.id)[0];

      const formatedArray = msg?.text?.replace(/\s/g, "").split(",");

      const result = formatedArray?.map((item) => {
        const formatedText = item.split("|");

        if (formatedText.length === 2) {
          const link = formatedText[0]?.trim();
          const id = formatedText[1]?.trim();

          if (link && id) {
            return { link, id };
          } else {
            bot.sendMessage(
              user.id,
              `Пустые или неопределенные значения в строке: ${item}`
            );
            return null;
          }
        } else {
          bot.sendMessage(user.id, `Ошибка в формате строки: ${item}`);
          return null;
        }
      });

      const validResult = result.filter((item) => item !== null);

      if (validResult.length === result.length) {
        user.temp.subChannels = validResult;
        changeSettings(user, "changeSubChannels");
        bot.sendMessage(user.id, "Каналы успешно сохранены");
      } else {
        bot.sendMessage(
          user.id,
          "Произошла ошибка в формате ваших данных. Пожалуйста, проверьте ввод."
        );
      }

      bot.removeListener("message", changeSubChannels);
    }
  };

  const changeTimeFilter = (msg) => {
    if (msg.chat.type === "private") {
      const users = JSON.parse(fs.readFileSync("./assets/data/users.json"));
      let user = users.filter((x) => x.id === msg.from.id)[0];
      const settings = JSON.parse(
        fs.readFileSync("./assets/data/settings.json")
      );

      const text = msg.text;

      const time = Number(text);
      if (isNaN(time)) {
        bot.sendMessage(user.id, "Пожалуйста, введите корректное число.");
        return;
      }

      settings.time = time;

      fs.writeFileSync(
        "./assets/data/settings.json",
        JSON.stringify(settings, null, "\t")
      );

      bot.sendMessage(user.id, "Время фильтра рассылки успешно сохранено!");
      bot.removeListener("message", changeTimeFilter);
    }
  };

  const changeSubText = (msg) => {
    if (msg.chat.type === "private") {
      const users = JSON.parse(fs.readFileSync("./assets/data/users.json"));
      let user = users.filter((x) => x.id === msg.from.id)[0];

      user.temp.subText = msg.text;
      changeSettings(user, "changeSubText");
      bot.sendMessage(user.id, "Текст успешно сохранен");
      bot.removeListener("message", changeSubText);
    }
  };

  const changeGoogleSheetsData = (msg) => {
    if (msg.chat.type === "private") {
      const users = JSON.parse(fs.readFileSync("./assets/data/users.json"));
      let user = users.filter((x) => x.id === msg.from.id)[0];

      user.temp.sheetId = msg.text;
      changeSettings(user, "changeGoogleSheetsData");

      bot.sendMessage(
        user.id,
        "ID Успешно сохранен\nНе забудьте добавить пользователя в доступы!"
      );
      bot.removeListener("message", changeGoogleSheetsData);
    }
  };

  async function filterMessages(messageType, msg) {
    const users = JSON.parse(fs.readFileSync("./assets/data/users.json"));
    const settings = JSON.parse(fs.readFileSync("./assets/data/settings.json"));
    let user = users.filter((x) => x.id === msg.from.id)[0];

    const username = user?.nick || user?.name;
    const isOwner = adminChatId === user.id;

    const command = msg?.text;

    const messageId = msg?.message_id || msg?.message.message_id;
    const query = msg?.data;

    if (!user) {
      console.error("ChatId not found");
      return;
    }

    if (user?.isAdmin) {
      if (messageType === "message") {
        if (command) {
          switch (command) {
            case "/stop":
              if (testMode) {

                bot.sendMessage(user.id, "Успешно остоновлено")
                exec(`pm2 stop test`, (error, stdout, stderr) => {
                  console.log(`Приложение успешно остановлено: ${stdout}`);
                });
              }
              break

            case "/start":
              const admins = users.filter((item) => item.isAdmin === true);
              const logChatInfo = await bot.getChat(settings.groupId);

              const groupSubInfoPromises = (settings?.subChannels || []).map(
                async (group) => {
                  const data = await bot.getChat(group?.id);
                  return { id: data?.id, username: data?.username };
                }
              );

              const groupSubInfo = await Promise.all(groupSubInfoPromises);
              const formattedInfo = groupSubInfo
                .map(
                  (info) =>
                    `<b>ID:</b> ${info.id}, <b>Username:</b> ${info.username}`
                )
                .join("\n");

              bot.sendMessage(
                user.id,
                `<b>Текущие настройки:</b>\n<b>ID спам базы:</b>\n${settings?.sheetSettings?.sheetId}\n\n<b>Количиство админов:</b> ${admins.length}\n\n<b>Чат для логов:</b>\n<b>username:</b> ${logChatInfo?.username}\n<b>id:</b> ${logChatInfo?.id}\n<b>title:</b> ${logChatInfo?.title}\n\n<b>Каналы для подписки:</b>\n${formattedInfo}\n\n<b>Сообщение о подписке:</b>\n${settings?.subText}\n\n`,
                {
                  parse_mode: "HTML",

                  reply_markup: JSON.stringify({
                    inline_keyboard: [
                      [
                        {
                          text: `Спам база ${settings?.banWords ? "✅" : "🚫"}`,
                          callback_data: `banWordsList`,
                        },
                        {
                          text: `Ссылки ${settings?.urlMessages ? "✅" : "🚫"}`,
                          callback_data: `urlMessages`,
                        },
                        {
                          text: `Рассылка ${settings?.newsletter ? "✅" : "🚫"
                            }`,
                          callback_data: `newsletter`,
                        },
                      ],
                      [
                        {
                          text: `Скрытые сообщения ${settings?.spoilerMessages ? "✅" : "🚫"
                            }`,
                          callback_data: `spoilerMessages`,
                        },
                      ],
                      [
                        {
                          text: `Номера телефонов ${settings?.phoneMessages ? "✅" : "🚫"
                            }`,
                          callback_data: `phoneMessages`,
                        },
                      ],

                      [
                        {
                          text: `Пересланные сообщения ${settings?.forwardMessages ? "✅" : "🚫"
                            }`,
                          callback_data: `forwardMessages`,
                        },
                      ],
                      [
                        {
                          text: `Тегания пользователей ${settings?.mentionMessages ? "✅" : "🚫"
                            }`,
                          callback_data: `mentionMessages`,
                        },
                      ],
                      [
                        {
                          text: `Просмотреть дневной спам блок`,
                          callback_data: `spamMessages`,
                        },
                      ],
                      // [
                      //   {
                      //     text: `Премиум стикеры ${
                      //       settings?.customEmojiMessages ? "✅" : "🚫"
                      //     }`,
                      //     callback_data: `customEmojiMessages`,
                      //   },
                      // ],
                      [
                        {
                          text: `Добавить админ(а)(ов)`,
                          callback_data: `addAdmins`,
                        },
                        {
                          text: `Удалить админ(а)(ов)`,
                          callback_data: `removeAdmins`,
                        },
                      ],
                      [
                        {
                          text: "Изминить чат для логов",
                          callback_data: `changeGroupToLogs`,
                        },
                      ],
                      [
                        {
                          text: `Сообщение о подписке ${settings?.subMessage ? "✅" : "🚫"
                            }`,
                          callback_data: `subMessage`,
                        },
                      ],
                      [
                        {
                          text: "Изминить каналы для подписки",
                          callback_data: `changeSubChannels`,
                        },
                        {
                          text: "Удалить каналы для подписки",
                          callback_data: `removeSubChannels`,
                        },
                      ],
                      [
                        {
                          text: `Изминить мин. кол-ов символов фильтра рассылки (${settings?.minLen})`,
                          callback_data: `changeMinLenFilter`,
                        },
                      ],
                      [
                        {
                          text: `Изминить время между сооб. фильтра рассылки (${settings?.time})`,
                          callback_data: `changeTimeFilter`,
                        },
                      ],
                      [
                        {
                          text: "Изминить сообщения о необходимости подписки",
                          callback_data: `changeSubText`,
                        },
                      ],
                      [
                        {
                          text: "Изминить URL google таблиц",
                          callback_data: `changeGoogleSheetsData`,
                        },
                      ],
                    ],
                  }),
                }
              );
              break;

            default:
              break;
          }
        } else {
          bot.sendMessage(user.id, "Command не найден");
        }
      } else if (messageType === "query") {
        if (query) {
          switch (query) {
            case "addAdmins":
              if (isOwner) {
                bot.sendMessage(
                  user.id,
                  "Отправьте username пользователей, которых хотите добавить в админы через запятую",
                  {
                    reply_markup: JSON.stringify({
                      inline_keyboard: [
                        [
                          {
                            text: "Отменить",
                            callback_data: `removeHandler:message`,
                          },
                        ],
                      ],
                    }),
                  }
                );

                temp.handleFunction = addAdmins;

                bot.on("message", addAdmins);
              } else {
                bot.sendMessage(user.id, "Вы не владелец");
              }
              break;
            case "removeAdmins":
              if (isOwner) {
                const admins = users?.filter((admin) => admin?.isAdmin);
                const adminsKeyboard = admins?.map((item) => [
                  {
                    text: item?.name,
                    callback_data: `removeAdmin:${item?.id}`,
                  },
                ]);

                bot.sendMessage(
                  user.id,
                  "Выберете пользователя которого хотите удалить",
                  {
                    reply_markup: JSON.stringify({
                      inline_keyboard: adminsKeyboard,
                    }),
                  }
                );
              } else {
                bot.sendMessage(user.id, "Вы не владелец");
              }
              break;

            case "changeGroupToLogs":
              bot.sendMessage(
                user.id,
                "Отправьте ID нужной группы получить его можно добавь этого бота в группу @GetMyChatID_Bot",
                {
                  reply_markup: JSON.stringify({
                    inline_keyboard: [
                      [
                        {
                          text: "Отменить",
                          callback_data: `removeHandler:message`,
                        },
                      ],
                    ],
                  }),
                }
              );

              temp.handleFunction = changeGroupToLogs;

              bot.on("message", changeGroupToLogs);

              break;
            case "changeSubChannels":
              bot.sendMessage(
                user.id,
                "Отправьте каналы в формате:\n\nСсылка|ID\nhttps://t.me/testChannel1231o2ek|-1002024007744\n\nЧто бы указать несколько каналов. Просто поставьте запятую и продолжайте ввод\nПример:\n\nhttps://t.me/testChannel1231o2ek|-1002024007744, https://t.me/testChannel1231o2ek|-1002024007744\n\n\nДля получения ID канала добавьте бота @GetMyChatID_Bot в админы на канале и напишите пост в канале /start",
                {
                  reply_markup: JSON.stringify({
                    inline_keyboard: [
                      [
                        {
                          text: "Отменить",
                          callback_data: `removeHandler:message`,
                        },
                      ],
                    ],
                  }),
                }
              );

              temp.handleFunction = changeSubChannels;

              bot.on("message", changeSubChannels);
              break;
            case "changeMinLenFilter":
              bot.sendMessage(
                user.id,
                "Отправьте минимальное количество символов для проверки",
                {
                  reply_markup: JSON.stringify({
                    inline_keyboard: [
                      [
                        {
                          text: "Отменить",
                          callback_data: `removeHandler:message,changeMinLenFilter`,
                        },
                      ],
                    ],
                  }),
                }
              );
              temp.handleFunction = changeMinLenFilter;

              bot.on("message", changeMinLenFilter);
              break;
            case "removeSubChannels":
              const channelsSubKeyboard = settings?.subChannels?.map((item) => [
                {
                  text: item?.link,
                  callback_data: `removeChannel:${item?.id}`,
                },
              ]);

              bot.sendMessage(
                user.id,
                "Выберете каналы которые хотите удалить",
                {
                  reply_markup: JSON.stringify({
                    inline_keyboard: channelsSubKeyboard,
                  }),
                }
              );

              break;

            case "changeTimeFilter":
              bot.sendMessage(
                user.id,
                "Отправьте время в формате минут\nПример: 120",
                {
                  reply_markup: JSON.stringify({
                    inline_keyboard: [
                      [
                        {
                          text: "Отменить",
                          callback_data: `removeHandler:message`,
                        },
                      ],
                    ],
                  }),
                }
              );
              temp.handleFunction = changeTimeFilter;

              bot.on("message", changeTimeFilter);
              break;
            case "changeSubText":
              bot.sendMessage(
                user.id,
                "Отправьте текст для сообщения о необходимости подписки в группах: ",
                {
                  reply_markup: JSON.stringify({
                    inline_keyboard: [
                      [
                        {
                          text: "Отменить",
                          callback_data: `removeHandler:message`,
                        },
                      ],
                    ],
                  }),
                }
              );
              temp.handleFunction = changeSubText;

              bot.on("message", changeSubText);
              break;
            case "changeGoogleSheetsData":
              bot.sendPhoto(
                user.id,
                "./assets/data/images/changeGoogleSheetsData.jpg",
                {
                  caption: `Отправьте мне ID google таблицы которую вы хотите добавить\nА так же добавьте в доступ этого пользователя ${googleSheetsCredentials.client_email}`,

                  reply_markup: JSON.stringify({
                    inline_keyboard: [
                      [
                        {
                          text: "Отменить",
                          callback_data: `removeHandler:message`,
                        },
                      ],
                    ],
                  }),
                }
              );

              temp.handleFunction = changeGoogleSheetsData;

              bot.on("message", changeGoogleSheetsData);
              break;
            case "banWordsList":
              bot.deleteMessage(user.id, messageId);

              settings.banWords = !settings.banWords;

              if (settings.banWords) {
                setSheetsData(bot);
              }

              fs.writeFileSync(
                "./assets/data/banwords.json",
                JSON.stringify([], null, "\t")
              );

              fs.writeFileSync(
                "./assets/data/settings.json",
                JSON.stringify(settings, null, "\t")
              );

              filterMessages("message", { ...msg, text: "/start" });

              break;
            case "forwardMessages":
              bot.deleteMessage(user.id, messageId);

              settings.forwardMessages = !settings.forwardMessages;

              fs.writeFileSync(
                "./assets/data/settings.json",
                JSON.stringify(settings, null, "\t")
              );

              filterMessages("message", { ...msg, text: "/start" });

              break;

            case "spoilerMessages":
              bot.deleteMessage(user.id, messageId);

              settings.spoilerMessages = !settings.spoilerMessages;

              fs.writeFileSync(
                "./assets/data/settings.json",
                JSON.stringify(settings, null, "\t")
              );

              filterMessages("message", { ...msg, text: "/start" });

              break;
            case "phoneMessages":
              bot.deleteMessage(user.id, messageId);

              settings.phoneMessages = !settings.phoneMessages;

              fs.writeFileSync(
                "./assets/data/settings.json",
                JSON.stringify(settings, null, "\t")
              );

              filterMessages("message", { ...msg, text: "/start" });

              break;
            case "mentionMessages":
              bot.deleteMessage(user.id, messageId);

              settings.mentionMessages = !settings.mentionMessages;

              fs.writeFileSync(
                "./assets/data/settings.json",
                JSON.stringify(settings, null, "\t")
              );

              filterMessages("message", { ...msg, text: "/start" });

              break;
            case "subMessage":
              bot.deleteMessage(user.id, messageId);

              settings.subMessage = !settings.subMessage;

              fs.writeFileSync(
                "./assets/data/settings.json",
                JSON.stringify(settings, null, "\t")
              );

              filterMessages("message", { ...msg, text: "/start" });

              break;
            case "spamMessages":
              const spamMessages = JSON.parse(
                fs.readFileSync("./assets/data/spamMessages.json")
              );

              const messages = spamMessages
                ?.map((message) => `${message?.message}`)
                .join("\n");

              fs.writeFileSync(
                "./assets/data/documents/spamMessages.txt",
                messages
              );

              bot.sendDocument(
                user?.id,
                "./assets/data/documents/spamMessages.txt"
              );

              break;
            case "urlMessages":
              bot.deleteMessage(user.id, messageId);

              settings.urlMessages = !settings.urlMessages;

              fs.writeFileSync(
                "./assets/data/settings.json",
                JSON.stringify(settings, null, "\t")
              );

              filterMessages("message", { ...msg, text: "/start" });

              break;
            case "newsletter":
              bot.deleteMessage(user.id, messageId);

              settings.newsletter = !settings.newsletter;

              fs.writeFileSync(
                "./assets/data/settings.json",
                JSON.stringify(settings, null, "\t")
              );

              filterMessages("message", { ...msg, text: "/start" });

              break;
            case "customEmojiMessages":
              bot.deleteMessage(user.id, messageId);

              settings.customEmojiMessages = !settings.customEmojiMessages;

              fs.writeFileSync(
                "./assets/data/settings.json",
                JSON.stringify(settings, null, "\t")
              );

              filterMessages("message", { ...msg, text: "/start" });

              break;

            default:
              if (query.includes("removeAdmin:")) {
                const adminId = query?.replace("removeAdmin:", "");

                const findAdmin = users?.find(
                  (item) => item?.id === Number(adminId)
                );

                if (findAdmin) {
                  findAdmin.isAdmin = false;

                  fs.writeFileSync(
                    "./assets/data/users.json",
                    JSON.stringify(users, null, "\t")
                  );

                  bot.sendMessage(user.id, "Админ удален!");
                } else {
                  bot.sendMessage(user.id, "Админ не найден!");
                }
              } else if (query.includes("removeChannel:")) {
                const channelId = query?.replace("removeChannel:", "");

                const findChannel = settings?.subChannels?.filter(
                  (item) => item?.id !== channelId
                );

                const updatedSettings = {
                  ...settings,
                  subChannels: findChannel,
                };

                fs.writeFileSync(
                  "./assets/data/settings.json",
                  JSON.stringify(updatedSettings, null, "\t")
                );

                bot.sendMessage(user.id, "Канал удален!");
              } else if (query.includes("removeHandler:")) {
                const handler = query?.replace("removeHandler:", "").split(",");

                bot.removeListener(handler[0], temp.handleFunction);
                bot.sendMessage(user.id, "Успешно отменено!");
              }

              break;
          }
        } else {
          bot.sendMessage(user.id, "Query не найден");
        }
      } else {
        bot.sendMessage(user.id, "Фильтр не нашел нужного типа.");
      }
    } else {
      bot.sendMessage(user.id, "Вы не админ!");
    }
  }

  async function checkAllSubscriptions(subChannels, userId) {
    for (const channel of subChannels) {
      const data = await bot.getChatMember(channel.id, userId);

      if (data.status === "left") {
        return false;
      }
    }

    return true;
  }

  async function getAdminByUsername(username, groupId) {
    const administrators = await bot.getChatAdministrators(groupId);
    const isAdmin = administrators.find(admin => admin.user?.username == username)

    return isAdmin
  }

  async function checkIfAdmin(user, groupId) {
    const administrators = await bot.getChatAdministrators(groupId);
    const findUser = administrators.find(
      (admin) => admin?.user?.id === user?.id
    );

    if (findUser) {
      return true;
    }

    return false;
  }

  async function filterGroup(messageType, msg) {
    const users = JSON.parse(fs.readFileSync("./assets/data/users.json"));
    const settings = JSON.parse(fs.readFileSync("./assets/data/settings.json"));
    const banWords = JSON.parse(fs.readFileSync("./assets/data/banwords.json"));
    const groups = JSON.parse(fs.readFileSync("./assets/data/groups.json"));
    const spamMessages = JSON.parse(
      fs.readFileSync("./assets/data/spamMessages.json")
    );

    const spamList = JSON.parse(fs.readFileSync("./assets/data/spamList.json"));

    const groupId = msg?.chat?.id || msg?.message?.chat?.id;
    let user = users.filter((x) => x.id === msg.from.id)[0];
    const isAdmin = await checkIfAdmin(user, groupId);

    if (!isAdmin) {
      if (!(await checkAllSubscriptions(settings?.subChannels, user.id))) {
        user.subscribed = false;
        fs.writeFileSync(
          "./assets/data/users.json",
          JSON.stringify(users, null, "\t")
        );
      } else {
        user.subscribed = true;
        fs.writeFileSync(
          "./assets/data/users.json",
          JSON.stringify(users, null, "\t")
        );
      }
    } else {
      user.subscribed = true;
      fs.writeFileSync(
        "./assets/data/users.json",
        JSON.stringify(users, null, "\t")
      );
    }

    const username = user?.nick || user?.name;

    const command = msg?.text || msg?.caption;
    const messageId = msg?.message_id;
    const forwardDate = msg?.forward_date;
    const chatName = msg?.chat?.title;
    const entities = msg?.entities || msg?.caption_entities;

    const findGroup = groups.find((item) => Number(item.id) === groupId);
    const currentTime = new Date();

    const getMentionUser = command.match(/@[\w-]+/)?.[0]?.replace("@", "")
    const isMentionUserAdmin = await getAdminByUsername(getMentionUser, groupId)

    const query = msg?.data;

    if (!user?.isAdmin && !isAdmin) {
      if (spamMessages?.length) {
        if (command) {
          if (user?.subscribed) {
            const spamMessage = spamMessages?.find(
              (message) => checkSimilarity(command, message?.message) >= 90
            );

            if (spamMessage) {
              bot.deleteMessage(groupId, messageId);

              sendLogs(bot, {
                userName: username,
                userId: user.id,
                groupNames: chatName,
                classText: "Рассылка",
                message: command,
              });

              return;
            }
          }
        }
      }
    }

    if (!user) {
      console.error("ChatId not found");
      return;
    }

    if (!findGroup) {
      if (user?.subscribed) {
        if (command) {
          groups.push({
            title: chatName,
            id: String(groupId),
            messages: [
              {
                messageId,
                message: command,
                uploadTime: currentTime,
              },
            ],
          });

          fs.writeFileSync(
            "./assets/data/groups.json",
            JSON.stringify(groups, null, "\t")
          );
        }
      }
    }



    if (findGroup) {
      if (command) {
        if (user?.subscribed) {
          findGroup?.messages.push({
            messageId,
            message: command,
            uploadTime: currentTime,
          });
          fs.writeFileSync(
            "./assets/data/groups.json",
            JSON.stringify(groups, null, "\t")
          );
        }
      }
    }

    // const banEntities = ["custom_emoji", "pre", "url", "text_mention", "code", "text_link", "spoiler", "mention"]
    const banEntities = ["pre", "url", "text_mention", "code", "text_link", "spoiler", "mention"]

    const findEntity = entities?.find(entity => banEntities?.includes(entity?.type));

    if (!user?.isAdmin && !isAdmin) {
      // if (findEntity?.type === "custom_emoji") {
      //   if (settings?.customEmojiMessages) {
      //     bot.deleteMessage(groupId, messageId);
      //     removeMessage(groupId, messageId);

      //     sendLogs(bot, {
      //       userName: username,
      //       userId: user.id,
      //       groupNames: chatName,
      //       classText: "Премиум емодзи",
      //       message: command,
      //     });

      //     return;
      //   }
      // }

      if (findEntity?.type === "url" || findEntity?.type === "text_mention" || findEntity?.type === "code") {
        if (settings?.urlMessages) {
          bot.deleteMessage(groupId, messageId);
          removeMessage(groupId, messageId);

          sendLogs(bot, {
            userName: username,
            userId: user.id,
            groupNames: chatName,
            classText: "URL в сообщении",
            message: command,
          });

          return;
        }
      }

      if (findEntity?.type === "text_link") {
        if (settings?.urlMessages) {
          bot.deleteMessage(groupId, messageId);
          removeMessage(groupId, messageId);

          sendLogs(bot, {
            userName: username,
            userId: user.id,
            groupNames: chatName,
            classText: "URL в тексте сообщения",
            message: command,
          });

          return;
        }
      }

      if (findEntity?.type === "spoiler") {
        if (settings?.spoilerMessages) {
          bot.deleteMessage(groupId, messageId);
          removeMessage(groupId, messageId);

          sendLogs(bot, {
            userName: username,
            userId: user.id,
            groupNames: chatName,
            classText: "Скрытые сообщения",
            message: command,
          });

          return;
        }
      }

      if (findEntity?.type === "mention") {
        if (settings?.mentionMessages) {
          if (!isMentionUserAdmin) {
            bot.deleteMessage(groupId, messageId);
            removeMessage(groupId, messageId);

            sendLogs(bot, {
              userName: username,
              userId: user.id,
              groupNames: chatName,
              classText: "Отметка людей",
              message: command,
            });

            return;
          }

        }
      }

      if (forwardDate) {
        if (settings?.forwardMessages) {
          bot.deleteMessage(groupId, messageId);
          removeMessage(groupId, messageId);

          sendLogs(bot, {
            userName: username,
            userId: user.id,
            groupNames: chatName,
            classText: "Пересланное сообщение",
            message: command,
          });

          return;
        }
      }
    }



    if (user?.subscribed) {
      if (messageType === "message") {
        if (command) {
          switch (command) {
            default:
              if (!user?.isAdmin && !isAdmin) {
                const hasReplacingCharacters =
                  filterReplacingCharacters(command, isMentionUserAdmin);
                const hasBadWords = containsBadWords(banWords, command);
                const hasPhoneNumber = findNumber(command);

                console.log(hasReplacingCharacters)

                if (hasPhoneNumber?.status && settings?.phoneMessages) {
                  bot.deleteMessage(groupId, messageId);
                  removeMessage(groupId, messageId);

                  sendLogs(bot, {
                    userName: username,
                    userId: user.id,
                    groupNames: chatName,
                    classText: "Номер телефона",
                    message: command,
                  });

                  return;
                }

                if (hasBadWords && settings?.banWords) {
                  bot.deleteMessage(groupId, messageId);
                  removeMessage(groupId, messageId);

                  sendLogs(bot, {
                    userName: username,
                    userId: user.id,
                    groupNames: chatName,
                    classText: "Спам база",
                    message: command,
                    options: {
                      banWord: hasBadWords
                    }
                  });

                  return;
                }

                if (hasReplacingCharacters?.status) {
                  bot.deleteMessage(groupId, messageId);
                  removeMessage(groupId, messageId);

                  sendLogs(bot, {
                    userName: username,
                    userId: user.id,
                    groupNames: chatName,
                    classText: `Замена символов. ${hasReplacingCharacters?.text}`,
                    message: command,
                  });

                  return;
                }

                if (settings?.newsletter) {
                  const messageStatus = filteringRepeatedMessages(
                    command,
                    chatName,
                    messageId
                  );

                  if (messageStatus?.status) {
                    const formattedText = command
                      .replace(/\s/g, "")
                      .toLowerCase();

                    if (formattedText.length <= settings.minLen) {
                      return;
                    }

                    const status = messageStatus?.results
                      ?.map((item) => {
                        const currentTime = new Date();
                        const uploadTime = new Date(item.uploadTime);
                        const timeDifference = Math.floor(
                          (currentTime - uploadTime) / (1000 * 60)
                        );

                        if (timeDifference >= settings.time) {
                          return null;
                        }

                        bot.deleteMessage(item.groupId, item.messageId);
                        sendLogs(bot, {
                          userName: username,
                          userId: user.id,
                          groupNames: [item?.groupNames],
                          classText: "Рассылка",
                          message: command,
                          options: {
                            messageId: item?.messageId,
                          }
                        });

                        spamMessages.push({
                          groupId: item.groupId,
                          messageId: item.messageId,
                          message: command,
                        });

                        spamList.push({
                          groupId: item.groupId,
                          messageId: item.messageId,
                          message: command,
                        });

                        fs.writeFileSync(
                          "./assets/data/spamMessages.json",
                          JSON.stringify(spamMessages, null, "\t")
                        );

                        fs.writeFileSync(
                          "./assets/data/spamList.json",
                          JSON.stringify(spamList, null, "\t")
                        );

                        return item;
                      })
                      .filter(Boolean);

                    if (status.length) {
                      bot.deleteMessage(groupId, messageId);
                      removeMessage(groupId, messageId);
                    }
                  }
                }

                break;
              }
          }
        } else {
          if (!msg?.photo) {
            bot.sendMessage(groupId, "Command не найден");
          }
        }
      } else if (messageType === "query") {
        if (query) {
          switch (query) {
            default:
              break;
          }
        } else {
          bot.sendMessage(groupId, "query не найден");
        }
      } else {
        bot.sendMessage(groupId, "Фильтр не нашел нужного типа.");
      }
    } else {
      if (!user?.isAdmin && !isAdmin && settings?.subMessage) {
        // if (query === "verifyChannelSub") {
        //   const status = await checkAllSubscriptions(
        //     settings?.subChannels,
        //     user.id
        //   );

        //   if (status) {
        //     user.subscribed = true;
        //     fs.writeFileSync(
        //       "./assets/data/users.json",
        //       JSON.stringify(users, null, "\t")
        //     );

        //     bot
        //       .sendMessage(groupId, "Проверка успешна!")
        //       .then(({ message_id }) => {
        //         setTimeout(() => {
        //           bot.deleteMessage(groupId, message_id);
        //         }, 5000);
        //       });
        //   } else {
        //     bot
        //       .sendMessage(groupId, "Вы не подписаны!")
        //       .then(({ message_id }) => {
        //         setTimeout(() => {
        //           bot.deleteMessage(groupId, message_id);
        //         }, 5000);
        //       });
        //   }

        //   return;
        // }

        let findTempGroupData = temp?.groups?.find(
          (group) => group?.id === groupId
        );

        if (!findTempGroupData) {
          temp.groups.push({ id: groupId, subMessageSended: false });
          findTempGroupData = { id: groupId, subMessageSended: false }
        }



        const subChannelsKeyboard = settings?.subChannels.map((item) => [
          {
            text: item.link,
            callback_data: `subChannelsKeyboard`,
            url: item.link,
          },
        ]);

        bot.deleteMessage(groupId, messageId);

        if (!findTempGroupData.subMessageSended) {
          bot
            .sendMessage(
              groupId,
              `Привет ${username} !\n${settings?.subText}`,
              {
                reply_markup: JSON.stringify({
                  inline_keyboard: [
                    ...subChannelsKeyboard,
                    // [
                    //   {
                    //     text: "Я подписался",
                    //     callback_data: "verifyChannelSub",
                    //   },
                    // ],
                  ],
                }),
              }
            )
            .then((message) => {
              findTempGroupData.subMessageSended = true;
              setTimeout(() => {
                findTempGroupData.subMessageSended = false;
                bot.deleteMessage(groupId, message?.message_id);
              }, 30000);
            });
        }
      }
    }
  }

  bot.on("edited_message", (msg) => {
    if(temp.eflood){
      return
    }


    if (msg.new_chat_members || msg.left_chat_member) {
      return;
    }

    const chatId = msg.from.id;
    const getUsers = JSON.parse(fs.readFileSync("./assets/data/users.json"));
    let user = getUsers.filter((x) => x.id === chatId)[0];

    if (!user) {
      console.log(chatId, adminChatId);
      const admin = chatId === adminChatId;
      const groupAnonymousBot = msg?.from?.username === "GroupAnonymousBot";

      getUsers.push({
        id: msg.from.id,
        nick: msg.from.username,
        name: msg.from.first_name,
        isAdmin: admin ? true : false || groupAnonymousBot ? true : false,
        subscribed: groupAnonymousBot ? true : false,
        temp: {},
      });

      user = getUsers.filter((x) => x.id === msg.from.id)[0];
      fs.writeFileSync(
        "./assets/data/users.json",
        JSON.stringify(getUsers, null, "\t")
      );
    }

    if (msg.chat.type === "private") {
      filterMessages("message", msg);
    } else if (msg.chat.type === "supergroup" || msg.chat.type === "group") {
      filterGroup("message", msg);
    }
  })

  bot.on("message", (msg) => {
    if(temp.eflood){
      return
    }


    if (msg.new_chat_members || msg.left_chat_member) {
      return;
    }

    const chatId = msg.from.id;
    const getUsers = JSON.parse(fs.readFileSync("./assets/data/users.json"));
    let user = getUsers.filter((x) => x.id === chatId)[0];

    if (!user) {
      console.log(chatId, adminChatId);
      const admin = chatId === adminChatId;
      const groupAnonymousBot = msg?.from?.username === "GroupAnonymousBot";

      getUsers.push({
        id: msg.from.id,
        nick: msg.from.username,
        name: msg.from.first_name,
        isAdmin: admin ? true : false || groupAnonymousBot ? true : false,
        subscribed: groupAnonymousBot ? true : false,
        temp: {},
      });

      user = getUsers.filter((x) => x.id === msg.from.id)[0];
      fs.writeFileSync(
        "./assets/data/users.json",
        JSON.stringify(getUsers, null, "\t")
      );
    }

    if (msg.chat.type === "private") {
      filterMessages("message", msg);
    } else if (msg.chat.type === "supergroup" || msg.chat.type === "group") {
      filterGroup("message", msg);
    }
  });


  bot.on("callback_query", (msg) => {
    if(temp.eflood){
      return
    }


    if (msg.message.chat.type === "private") {
      filterMessages("query", msg);
    } else if (
      msg.message.chat.type === "supergroup" ||
      msg.message.chat.type === "group"
    ) {
      filterGroup("query", msg);
    }
  });

  setInterval(() => {
    setSheetsData(bot);
  }, 60000);
} catch (error) {
  console.log("Have new error! Check in logs");
  errorLogger.error(error);
}

cron.schedule(
  "0 12 * * *",
  () => {
    fs.writeFileSync(
      "./assets/data/spamMessages.json",
      JSON.stringify([], null, "\t")
    );
  },
  {
    scheduled: true,
    timezone: "UTC",
  }
);

console.log("Bot started!");


bot.on('polling_error', (error) => {
  if (error.code === 'EFLOOD' ) {
    console.log('Превышен лимит запросов к API Telegram.');
    const retryAfterSeconds = error?.response?.body?.retry_after * 1000;

    temp.eflood = true

    bot.sendMessage(adminChatId, 'Превышен лимит запросов к API Telegram.');

    setTimeout(() => {
      temp.eflood = false
    }, retryAfterSeconds);

  } else {
    console.log('Ошибка во время опроса:', error);
  }
});
