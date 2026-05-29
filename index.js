const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const WebSocket = require('ws');

const config = require('./config.json');

const WEBSOCKET_URL_REGEX = /^wss?:\/\//;
const WEBHOOK_URL_REGEX = /(?<url>^https:\/\/(?:(?:canary|ptb).)?discord(?:app)?.com\/api(?:\/v\d+)?\/webhooks\/(?<id>\d+)\/(?<token>[\w-]+)\/?$)/;

// Discord has a maximum of 10 embeds per message
const EMBED_BATCH_SIZE = 10;
const FLUSH_DELAY_MILLIS = 30_000;

const websocketUrl = config.websocket.url;

if (!WEBSOCKET_URL_REGEX.test(websocketUrl)) {
  console.error(`Invalid WebSocket URL: ${websocketUrl}`);
  process.exit(1);
}

const wehooks = config.webhooks.filter((webhook) => webhook.active);

if (wehooks.length === 0) {
  console.error('No active webhooks found.');
  process.exit(1);
}

wehooks.forEach((webhook) => {
  const match = WEBHOOK_URL_REGEX.exec(webhook.url);

  if (!match) {
    console.error(`Invalid webhook URL: ${webhook.url}`);
    process.exit(1);
  }

  webhook.id = match.groups.id;
  webhook.token = match.groups.token;
});

const rest = new REST();

let webhookEmbedBuffer = [];
let flushTimer = null;

const flush = () => {
  clearTimeout(flushTimer);
  flushTimer = null;

  if (webhookEmbedBuffer.length === 0) return;

  do {
    const webhookEmbedBatch = webhookEmbedBuffer.splice(
      0,
      EMBED_BATCH_SIZE
    );

    wehooks.forEach(async (webhook) => {
      try {
        await rest.post(
          Routes.webhook(webhook.id, webhook.token),
          {
            body: {
              embeds: webhookEmbedBatch,
              allowed_mentions: { parse: [] }
            },
            auth: false
          }
        );
      } catch (error) {
        console.error(
          'Failed to send webhook:',
          error.message
        );
      }
    });
  } while (
    webhookEmbedBuffer.length >= EMBED_BATCH_SIZE
  );
};

const enqueue = (embed) => {
  webhookEmbedBuffer.push(embed);

  if (
    webhookEmbedBuffer.length >= EMBED_BATCH_SIZE
  ) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(
      flush,
      FLUSH_DELAY_MILLIS
    );
  }
};

let ws;
let reconnectDelayMillis =
  config.websocket.initialReconnectDelayMillis;

const connect = () => {
  ws = new WebSocket(config.websocket.url);

  ws.on('open', () => {
    console.log(
      `Connected to WebSocket: ${config.websocket.url}`
    );

    reconnectDelayMillis =
      config.websocket.initialReconnectDelayMillis;
  });

  ws.on('message', async (data) => {
    try {
      const embed = JSON.parse(data.toString());

      const fullName = embed.author?.name;

      // try format: DisplayName(@Username)
      let usernameMatch =
        fullName?.match(/\(@?([^)]+)\)/);

      // fallback format: @Username
      if (!usernameMatch) {
        usernameMatch =
          fullName?.match(/^@?(.+)$/);
      }

      const username = usernameMatch
        ? usernameMatch[1]
            .trim()
            .toLowerCase()
        : null;

      // allowed users
      const allowedUsers = [
        "jamal_1282",
        "nooboogami",
        "mainaccountgetban",
        "friedchicken0808",
        "akdjsdjksk",
        "anantaytid",
        "bluwtues",
        "alhasbi_17",
        "strawzheas",
        "maxamgaming1207",
        "cmk5xz",
        "miyamii0"
      ];

      // block if not allowed
      if (
        !username ||
        !allowedUsers.includes(username)
      ) return;

      // eden font converter
      function toEdenFont(text) {
        const map = {
          A:"𝙰", B:"𝙱", C:"𝙲", D:"𝙳", E:"𝙴",
          F:"𝙵", G:"𝙶", H:"𝙷", I:"𝙸", J:"𝙹",
          K:"𝙺", L:"𝙻", M:"𝙼", N:"𝙽", O:"𝙾",
          P:"𝙿", Q:"𝚀", R:"𝚁", S:"𝚂", T:"𝚃",
          U:"𝚄", V:"𝚅", W:"𝚆", X:"𝚇", Y:"𝚈",
          Z:"𝚉"
        };

        return text.split("").map(char => {
          if (map[char]) {
            return map[char] + " ";
          }

          return char;
        }).join("").replace(/\s([.?!,])/g, "$1");
      }

      // eden messages
      const messages = [
        "Another one.",
        "Again?",
        "Still alive?",
        "Not even close.",
        "Below expectations.",
        "Pathetic.",
        "That's no fun.",
        "Interesting.",
        "This again.",
        "Another target.",
        "Let's finish this quickly.",
        "Nowhere to run.",
        "You survived.",
        "Barely worth noticing.",
        "Lucky.",
        "Try harder.",
        "Unexpected.",
        "That's that.",
        "How annoying.",
        "Another feast.",
        "FEED ME.",
        "I NEED MORE.",
        "NOWHERE TO HIDE.",
        "VANISH.",
        "MAY YOUR LUCK BE CURSED.",
        "ANOTHER FEAST.",
        "BEGONE."
      ];

      // 70% chance to speak
      const shouldSpeak =
        Math.random() < 0.7;

      if (!shouldSpeak) {
        enqueue(embed);
        return;
      }

      const finalMessage =
        messages[
          Math.floor(
            Math.random() * messages.length
          )
        ];

      const isAllCaps =
        /[A-Z]/.test(finalMessage) &&
        finalMessage === finalMessage.toUpperCase();

      const styledMessage = isAllCaps
        ? toEdenFont(finalMessage)
        : finalMessage;

      // send reaction message first
      for (const webhook of wehooks) {
        try {
          await rest.post(
            Routes.webhook(
              webhook.id,
              webhook.token
            ),
            {
              body: {
                content: styledMessage,
                allowed_mentions: {
                  parse: []
                }
              },
              auth: false
            }
          );
        } catch (error) {
          console.error(
            'Failed to send reaction message:',
            error.message
          );
        }
      }

      // send original embed normally
      enqueue(embed);

    } catch (error) {
      console.error(
        'Failed to parse message:',
        error.message
      );
    }
  });

  ws.on('error', (error) =>
    console.error(
      'WebSocket error:',
      error.message
    )
  );

  ws.on('close', (code, reason) => {
    console.log(
      `Closed WebSocket (${code}): ${reason}`
    );

    console.log(
      `Reconnecting WebSocket in ${
        reconnectDelayMillis / 1000
      } seconds...`
    );

    setTimeout(
      connect,
      reconnectDelayMillis
    );

    reconnectDelayMillis = Math.min(
      reconnectDelayMillis * 2,
      config.websocket.maxReconnectDelayMillis
    );
  });
};

connect();
