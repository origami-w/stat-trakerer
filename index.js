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
    k:"𝙺", l:"𝙻", m:"𝙼", n:"𝙽", o:"𝙾", p:"𝙿", q:"𝚀", r:"𝚁", s:"𝚂", t:"𝚃",
    u:"𝚄", v:"𝚅", w:"𝚆", x:"𝚇", y:"𝚈", z:"𝚉"
  };

  // Converts letters and adds clean spacing after every character cleanly
  return text
    .split("")
    .map(char => {
      const lower = char.toLowerCase();
      const transformed = map[lower] ? map[lower] : char;
      return transformed + " ";
    })
    .join("")
    .replace(/\s+([.?!,])/g, "$1") // Cleans spaces right before punctuation
    .trim();
}

const messages = [
  "Another one.", "Again?", "Still alive?", "Not even close.", "Below expectations.",
  "Pathetic.", "That's no fun.", "Interesting.", "This again.", "Another target.",
  "Let's finish this quickly.", "Nowhere to run.", "You survived.", "Barely worth noticing.",
  "Lucky.", "Try harder.", "Unexpected.", "That's that.", "How annoying.", "Another feast.",
  "FEED ME.", "I NEED MORE.", "NOWHERE TO HIDE.", "VANISH.", "MAY YOUR LUCK BE CURSED.",
  "ANOTHER FEAST.", "BEGONE."
];

const allowedUsers = [
  "jamal_1282", "nooboogami", "mainaccountgetban", "friedchicken0808", "akdjsdjksk",
  "anantaytid", "bluwtues", "alhasbi_17", "strawzheas", "maxamgaming1207", "cmk5xz", "miyamii0"
];

// --- WebSocket Connection ---

let ws;
const initialDelay = config.websocket?.initialReconnectDelayMillis ?? 5000;
const maxDelay = config.websocket?.maxReconnectDelayMillis ?? 60000;
let reconnectDelayMillis = initialDelay;

const connect = () => {
  ws = new WebSocket(websocketUrl);

  ws.on('open', () => {
    console.log(`Connected to WebSocket: ${websocketUrl}`);
    reconnectDelayMillis = initialDelay; // Reset backoff timer on successful link
  });

  ws.on('message', async (data) => {
    try {
      const embed = JSON.parse(data.toString());
      const fullName = embed.author?.name;

      if (!fullName || typeof fullName !== 'string') return;

      let usernameMatch = fullName.match(/\(@?([^)]+)\)/);

      if (!usernameMatch) {
        usernameMatch = fullName.match(/^@?(.+)$/);
      }

      const username = usernameMatch
        ? usernameMatch[1].trim().toLowerCase()
        : null;

      // Filter out unrecognized players
      if (!username || !allowedUsers.includes(username)) return;

      // 70% chance to send character dialogue
      if (Math.random() <= 0.70) {
        const finalMessage = messages[Math.floor(Math.random() * messages.length)];
        const styledMessage = toEdenFont(finalMessage);

        for (const webhook of wehooks) {
          try {
            await rest.post(
              Routes.webhook(webhook.id, webhook.token),
              {
                body: {
                  content: styledMessage,
                  allowed_mentions: { parse: [] }
                },
                auth: false
              }
            );
          } catch (error) {
            console.error(`Failed to send flavor text to webhook ${webhook.id}:`, error.message);
          }
        }
      }

      // Enqueue the original global broadcast embed safely
      enqueue(embed);

    } catch (error) {
      console.error('Failed to process incoming event data:', error.message);
    }
  });

  ws.on('error', (error) => console.error('WebSocket connection error:', error.message));

  ws.on('close', (code, reason) => {
    console.log(`Closed WebSocket (${code}): ${reason || 'No reason provided'}`);
    console.log(`Reconnecting WebSocket in ${reconnectDelayMillis / 1000} seconds...`);

    setTimeout(connect, reconnectDelayMillis);
    reconnectDelayMillis = Math.min(reconnectDelayMillis * 2, maxDelay); // Exponential backoff
  });
};

connect();
