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

// --- Concurrency-Safe Flush Mechanism ---
const flush = async () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (webhookEmbedBuffer.length === 0) return;

  // CRITICAL FIX: Immediately extract all items to prevent race conditions during awaits
  const itemsToFlush = webhookEmbedBuffer.splice(0, webhookEmbedBuffer.length);

  while (itemsToFlush.length > 0) {
    const batch = itemsToFlush.splice(0, EMBED_BATCH_SIZE);

    // Separate payloads out into text payloads and embed payloads
    const embedsOnly = batch.filter(item => !item.content);
    const textsOnly = batch.filter(item => item.content);

    for (const webhook of wehooks) {
      try {
        // 1. Process Embed Batches safely
        if (embedsOnly.length > 0) {
          await rest.post(
            Routes.webhook(webhook.id, webhook.token),
            {
              body: {
                embeds: embedsOnly,
                allowed_mentions: { parse: [] }
              },
              auth: false
            }
          );
        }

        // 2. Process Text Batches sequentially to avoid 429 spam
        for (const textItem of textsOnly) {
          await rest.post(
            Routes.webhook(webhook.id, webhook.token),
            {
              body: {
                content: textItem.content,
                allowed_mentions: { parse: [] }
              },
              auth: false
            }
          );
        }
      } catch (error) {
        console.error(`Failed to dispatch batch to webhook ${webhook.id}:`, error.message);
      }
    }
  }
};

const enqueue = (item) => {
  webhookEmbedBuffer.push(item);

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

  return text
    .split("")
    .map(char => {
      const lower = char.toLowerCase();
      const transformed = map[lower] ? map[lower] : char;
      return transformed + " ";
    })
    .join("")
    .replace(/\s+([.?!,])/g, "$1") 
    .trim();
}

const messages = [
  "Another fools.", "Again?", "Still trying?", "Not even close.", "Below expectations.",
  "Pathetic.", "Don't get so cocky.", "Interesting.", "This again? fools.", "Another trash.",
  "Let's finish this quickly.", "Not even worth it.", "You survived, but not for so long.", "Barely worth noticing.",
  "Lucky.", "Try harder.", "Expected, fools.", "That's that.", "How annoying.", "Another feast.",
  "FEED ME.", "I NEED MORE.", "Pathetic...as usual.", "VANISH.", "MAY YOUR LUCK BE CURSED.",
  "ANOTHER FEAST.", "BEGONE.", "The void don't feed me enough",
];

const allowedUsers = [
  "jamal_1282", "nooboogami", "mainaccountgetban", "friedchicken0808", "akdjsdjksk",
  "anantaytid", "bluwtues", "alhasbi_17", "strawzheas", "maxamgaming1207", "cmk5xz", "miyamii0", "adifaardani","solsaccount2382"
];

// --- WebSocket Connection & Recovery ---

let ws;
let heartbeatInterval;
const initialDelay = config.websocket?.initialReconnectDelayMillis ?? 5000;
const maxDelay = config.websocket?.maxReconnectDelayMillis ?? 60000;
let reconnectDelayMillis = initialDelay;

const connect = () => {
  ws = new WebSocket(websocketUrl);

  ws.on('open', () => {
    console.log(`Connected to WebSocket: ${websocketUrl}`);
    reconnectDelayMillis = initialDelay; 

    // FIX FOR RAILWAY: Ping the WebSocket host every 30 seconds to prevent silent timeout drops
    clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);
  });

  ws.on('message', async (data) => {
    try {
      const embed = JSON.parse(data.toString());
      const fullName = embed.author?.name;

      if (!fullName || typeof fullName !== 'string') return;

      // Cleaned up regex to accurately capture username fragments safely
      let usernameMatch = fullName.match(/\(@?([^)]+)\)/);
      if (!usernameMatch) {
        usernameMatch = fullName.match(/@?([^\s()]+)/);
      }

      const username = usernameMatch
        ? usernameMatch[1].trim().toLowerCase()
        : null;

      if (!username || !allowedUsers.includes(username)) return;

      // Handle custom flavor dialogue (Kept at 100% chance per your condition `Math.random() <= 1`)
      const finalMessage = messages[Math.floor(Math.random() * messages.length)];
      const styledMessage = toEdenFont(finalMessage);

      // FIX: Dialogue is passed through the enqueue mechanism to avoid unthrottled post spikes
      enqueue({ content: styledMessage });

      // Enqueue the original broadcast embed 
      enqueue(embed);

    } catch (error) {
      console.error('Failed to process incoming event data:', error.message);
    }
  });

  ws.on('error', (error) => console.error('WebSocket error:', error.message));

  ws.on('close', (code, reason) => {
    clearInterval(heartbeatInterval);
    console.log(`Closed WebSocket (${code}): ${reason || 'No reason provided'}`);
    console.log(`Reconnecting WebSocket in ${reconnectDelayMillis / 1000} seconds...`);

    setTimeout(connect, reconnectDelayMillis);
    reconnectDelayMillis = Math.min(reconnectDelayMillis * 2, maxDelay); 
  });
};

connect();
