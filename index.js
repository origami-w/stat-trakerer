const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const WebSocket = require('ws');

const config = require('./config.json');

const WEBSOCKET_URL_REGEX = /^wss?:\/\//;
const WEBHOOK_URL_REGEX = /(?<url>^https:\/\/(?:(?:canary|ptb).)?discord(?:app)?.com\/api(?:\/v\d+)?\/webhooks\/(?<id>\d+)\/(?<token>[\w-]+)\/?$)/;

const EMBED_BATCH_SIZE = 10;
const FLUSH_DELAY_MILLIS = 30_000;

const websocketUrl = config.websocket?.url;

if (!websocketUrl || !WEBSOCKET_URL_REGEX.test(websocketUrl)) {
  console.error(`Invalid WebSocket URL: ${websocketUrl}`);
  process.exit(1);
}

const wehooks = (config.webhooks || []).filter((webhook) => webhook.active);

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

const rest = new REST({ version: '10' });

let webhookEmbedBuffer = [];
let flushTimer = null;

// Concurrency-safe flush mechanism to prevent Discord rate limits (429s)
const flush = async () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (webhookEmbedBuffer.length === 0) return;

  while (webhookEmbedBuffer.length > 0) {
    const webhookEmbedBatch = webhookEmbedBuffer.splice(0, EMBED_BATCH_SIZE);

    // Processing sequentially avoids spamming Discord and handles rate-limits smoothly
    for (const webhook of wehooks) {
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
        console.error(`Failed to send batch embed to webhook ${webhook.id}:`, error.message);
      }
    }
  }
};

const enqueue = (embed) => {
  webhookEmbedBuffer.push(embed);

  if (webhookEmbedBuffer.length >= EMBED_BATCH_SIZE) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_DELAY_MILLIS);
  }
};

// --- Helper Utilities ---

function toEdenFont(text) {
  const map = {
    a:"𝙰", b:"𝙱", c:"𝙲", d:"𝙳", e:"𝙴", f:"𝙵", g:"𝙶", h:"𝙷", i:"𝙸", j:"𝙹",
    k:"𝙺", l:"𝙻", m:"𝙼", n:"𝙽", o:"𝙾", p:"𝙿", q:"𝚀", r:"𝚁", s
