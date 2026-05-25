const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const WebSocket = require('ws');

const config = require('./config.json');

const WEBSOCKET_URL_REGEX = /^wss?:\/\//;
const WEBHOOK_URL_REGEX = /(?<url>^https:\/\/(?:(?:canary|ptb).)?discord(?:app)?.com\/api(?:\/v\d+)?\/webhooks\/(?<id>\d+)\/(?<token>[\w-]+)\/?$)/;

// Discord has a maximum of 10 embeds per message, so we batch them to avoid hitting that limit.
// The buffer is flushed after a certain amount of time to ensure the messages can be sent even if the batch size isn't reached.
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

wehooks
  .forEach((webhook) => {
    const match = WEBHOOK_URL_REGEX.exec(webhook.url)

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
    const webhookEmbedBatch = webhookEmbedBuffer.splice(0, EMBED_BATCH_SIZE);

    wehooks.forEach(async (webhook) => {
      try {
        await rest.post(Routes.webhook(webhook.id, webhook.token), {
          body: { embeds: webhookEmbedBatch, allowed_mentions: { parse: [] } },
          auth: false
        });
      } catch (error) {
        console.error('Failed to send webhook:', error.message);
      }
    });
  } while (webhookEmbedBuffer.length >= EMBED_BATCH_SIZE);
};

const enqueue = (embed) => {
  webhookEmbedBuffer.push(embed);

  if (webhookEmbedBuffer.length >= EMBED_BATCH_SIZE) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_DELAY_MILLIS);
  }
};

let ws;
let reconnectDelayMillis = config.websocket.initialReconnectDelayMillis;

const connect = () => {
  ws = new WebSocket(config.websocket.url);

  ws.on('open', () => {
    console.log(`Connected to WebSocket: ${config.websocket.url}`);

    reconnectDelayMillis = config.websocket.initialReconnectDelayMillis;
  });

ws.on('message', async (data) => {
  try {
    const embed = JSON.parse(data.toString());

    const fullName = embed.author?.name;

    // try format: DisplayName(@Username)
    let usernameMatch = fullName?.match(/\(@?([^)]+)\)/);

    // fallback format: @Username
    if (!usernameMatch) {
      usernameMatch = fullName?.match(/^@?(.+)$/);
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
    if (!username || !allowedUsers.includes(username)) return;

    // cute font converter
  function toCuteFont(text) {
    const map = {
      a:"𝒂", b:"𝒃", c:"𝒄", d:"𝒅", e:"𝒆",
      f:"𝒇", g:"𝒈", h:"𝒉", i:"𝒊", j:"𝒋",
      k:"𝒌", l:"𝒍", m:"𝒎", n:"𝒏", o:"𝒐",
      p:"𝒑", q:"𝒒", r:"𝒓", s:"𝒔", t:"𝒕",
      u:"𝒖", v:"𝒗", w:"𝒘", x:"𝒙", y:"𝒚",
      z:"𝒛"
    };

  return text.replace(/[a-z]/gi, char => {
    const lower = char.toLowerCase();
    return map[lower] || char;
  });
}
    // random messages
    const messages = [
      "ehhh? another one already~?",
      "mouu... that's not fair...",
      "waa... your luck is scary...",
      "ehehe~ lucky again?",
      "you're making me jealous...",
      "ah— you actually got it...?!",
      "mhm~ luck likes you today.",
      "another global...? seriously~?",
      "uwaa... that's super rare...",
      "hehe... I knew you'd get one eventually.",
      "eh...? that's kinda insane...",
      "mm... you're unbelievable sometimes."
    ];

    const randomMessage =
      messages[Math.floor(Math.random() * messages.length)];

    const cuteMessage = toCuteFont(randomMessage);

    // send cute reaction message first
    for (const webhook of wehooks) {
      try {
        await rest.post(
          Routes.webhook(webhook.id, webhook.token),
          {
            body: {
              content: cuteMessage,
              allowed_mentions: { parse: [] }
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
    console.error('Failed to parse message:', error.message);
  }
});
  ws.on('error', (error) => console.error('WebSocket error:', error.message));

  ws.on('close', (code, reason) => {
    console.log(`Closed WebSocket (${code}): ${reason}`);
    console.log(`Reconnecting WebSocket in ${reconnectDelayMillis / 1000} seconds...`);

    setTimeout(connect, reconnectDelayMillis);
    reconnectDelayMillis = Math.min(reconnectDelayMillis * 2, config.websocket.maxReconnectDelayMillis);
  });
}

connect();
