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

ws.on('message', (data) => {
  try {
    const embed = JSON.parse(data.toString());

    const fullName = embed.author?.name;

    // extract username inside parentheses
    const match = fullName?.match(/\(([^)]+)\)/);

    // clean username
    const username = match
      ? match[1]
          .replace("@", "")
          .trim()
          .toLowerCase()
      : null;

    // allowed users list
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

    // only pass if in list
    if (!username || !allowedUsers.includes(username)) return;

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
