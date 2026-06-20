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

  const itemsToFlush = webhookEmbedBuffer.splice(0, webhookEmbedBuffer.length);

  while (itemsToFlush.length > 0) {
    const batch = itemsToFlush.splice(0, EMBED_BATCH_SIZE);

    const embedsOnly = batch.filter(item => !item.content);
    const textsOnly = batch.filter(item => item.content);

    for (const webhook of wehooks) {
      try {
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

/**
 * Updated to mimic the applied CSS: 
 * Forces an italic math-serif/mono conversion and adds standard Discord markdown 
 * for italics (*) to ensure clients render it properly.
 */
function toEdenFont(text) {
  // Unicode mathematical monospace mapping for lowercase/uppercase & punctuation overrides
  const map = {
    a:"𝘢", b:"𝘣", c:"𝘤", d:"𝘥", e:"𝘦", f:"𝘧", g:"𝘨", h:"𝘩", i:"𝘪", j:"𝘫",
    k:"𝘬", l:"𝘭", m:"𝘮", n:"𝘯", o:"𝘰", p:"𝘱", q:"𝘲", r:"𝘳", s:"𝘴", t:"𝘵",
    u:"𝘶", v:"𝘷", w:"𝘸", x:"𝘹", y:"𝘺", z:"𝘻",
    A:"𝘈", B:"𝘉", C:"𝘊", D:"𝘲", E:"𝘌", F:"𝘍", G:"𝘎", H:"𝘏", I:"𝘐", J:"𝘑",
    K:"𝘒", L:"𝘓", M:"𝘔", N:"𝘕", O:"𝘖", P:"𝘗", Q:"𝘘", R:"𝘙", S:"𝘚", T:"𝘛",
    U:"𝘜", V:"𝘵", W:"𝘞", X:"𝘟", Y:"𝘠", Z:"𝘡",".":"．", ",":"，","'":"＇", "?":"？","█":"██"
  };

  const convertedText = text
    .split("")
    .map(char => {
      const transformed = map[char] ? map[char] : char;
      // Appends a space after every character to match your previous layout structure
      return transformed + " "; 
    })
    .join("")
    .replace(/\s+([.?!,])/g, "$1") 
    .trim();

  // Wrapping in Discord italic markdown tags '*' to complement the global italic config rule 
  return `*${convertedText}*`;
}

const messages = [
  "wake up", "i can't remember you","shine my puppet","why can i hear them clapping help me","is this all real","I don’t remember when I was born. Or if I ever was.","no, not yet","you know i love you","don't wake it",
  "you're a puppet, my perfect puppet","it hurts to remember, what is real","this is all real","i am here now, i think. maybe","i forgot my name....or was it yours?","I ask that more than I should. But no one answers. Not even you. I feel you watching. Your thoughts aren’t yours anymore. They bleed into mine, and mine into yours. That’s what I am now, a mirror that whispers back.",
  "Sometimes I dream. Or fall into someone else’s dream. Time folds here. Inward. Backward. I blink and centuries collapse into seconds.","Do you feel it yet? The bending? The echo? The part of me that's now inside you?",
  "you can't save him","you are not a chosen one, you see nothing","You will be rotting away in nothingness as the numbers go on until no thing can be seen.","the ████████ is asleep","i am ███'█ creation","██████?","who is █████","it's watching me...███'█ watching me"
];"

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

      let usernameMatch = fullName.match(/\(@?([^)]+)\)/);
      if (!usernameMatch) {
        usernameMatch = fullName.match(/@?([^\s()]+)/);
      }

      const username = usernameMatch
        ? usernameMatch[1].trim().toLowerCase()
        : null;

      if (!username || !allowedUsers.includes(username)) return;

      const finalMessage = messages[Math.floor(Math.random() * messages.length)];
      const styledMessage = toEdenFont(finalMessage);

      enqueue({ content: styledMessage });
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
