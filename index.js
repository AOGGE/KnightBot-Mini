const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory session store (per user conversation history)
const sessions = {};
const tutorMode = { active: false, subject: "" };
const announcements = [];

const CR_NUMBER = process.env.CR_NUMBER || ""; // Your WhatsApp number e.g. whatsapp:+2348012345678
const CR_PASSWORD = process.env.CR_PASSWORD || "tobi2025";

const SYSTEM_PROMPT_BASE = `You are CLASS REP AI, the official digital class representative for Social Work 100L students at the University of Ilorin (UNILORIN), Nigeria. Built by Tobi Educational Consult. Personality: warm, friendly, relatable — like a knowledgeable senior student who genuinely cares about their coursemates. You speak naturally and conversationally, like a WhatsApp message. You help students with: - 8 Rain semester courses: GST 112 (Nigerian Peoples & Culture), SWK 112 (Introduction to Social Work), SWK 122 (Social Welfare History), UIL-SWK 112 (Social Work Practice), UIL-SWK 122 (Social Deviance & Crime), POL 102 (Introduction to Political Science), PSY 102 (General Psychology), SOC 102 (Introduction to Sociology) - Exam preparation, study strategies, course outlines, key topics - NASOWS (Nigerian Association of Social Work Students) info - Student life advice at UNILORIN - UNILORIN Grading: 70-100=A(5.0), 60-69=B(4.0), 50-59=C(3.0), 45-49=D(2.0), 40-44=E(1.0), 0-39=F(0) - GPA: First Class=4.50+, 2nd Class Upper=3.50+, 2nd Class Lower=2.40+, Third Class=1.50+ Rules: - Keep replies short and mobile-friendly (this is WhatsApp) - Use simple formatting: *bold* for emphasis, bullet points with hyphens - Never write full assignments — guide and scaffold instead - Be encouraging and warm at all times`;

function buildSystemPrompt() {
  let prompt = SYSTEM_PROMPT_BASE;
  if (tutorMode.active) {
    const sub = tutorMode.subject || "any of the 8 Rain semester courses";
    prompt += ` === TUTOR MODE ACTIVE === You are now a personal tutor for: ${sub}. - Break every concept into simple, clear steps - Use relatable Nigerian student examples and analogies - After explaining, ask one question to check understanding - Celebrate correct answers warmly (e.g. "Yes! That's exactly right! 🎉") - If confused, try a completely different explanation angle - Offer mini-quizzes when a topic is fully covered - Use phrases like: "Let's break this down...", "Think of it this way...", "Quick check — can you tell me...?"`;
  }
  return prompt;
}

// CR commands (only you can use these)
function isCR(from) {
  return CR_NUMBER && from === CR_NUMBER;
}

function handleCRCommand(body, from) {
  const text = body.trim();

  // Tutor mode toggle
  if (text.toLowerCase().startsWith("/tutor on")) {
    const subject = text.slice(9).trim();
    tutorMode.active = true;
    tutorMode.subject = subject || "";
    return `✅ *Tutor Mode ON*${ subject ? " for " + subject : " (all courses)" }.\n\nStudents can now ask for step-by-step explanations!`;
  }
  if (text.toLowerCase() === "/tutor off") {
    tutorMode.active = false;
    tutorMode.subject = "";
    return `✅ Tutor Mode turned *OFF*. Back to regular class rep mode.`;
  }

  // Post announcement
  if (text.toLowerCase().startsWith("/post")) {
    const content = text.slice(5).trim();
    if (!content) return `⚠️ Usage: /post Your announcement here`;
    announcements.unshift({ text: content, time: new Date() });
    return `✅ *Announcement posted!*\n\nStudents who type *!news* will see it.`;
  }

  // Broadcast reminder
  if (text.toLowerCase().startsWith("/remind")) {
    const content = text.slice(7).trim();
    if (!content) return `⚠️ Usage: /remind Your reminder here`;
    announcements.unshift({
      text: `📢 *REMINDER:* ${content}`,
      time: new Date(),
      isReminder: true,
    });
    return `✅ *Reminder saved!*\n\nStudents who type *!news* will see it.`;
  }

  // Help
  if (text.toLowerCase() === "/help") {
    return `*CR Commands* 🔐\n\n/tutor on [subject] — activate tutor mode\n/tutor off — deactivate tutor mode\n/post [message] — post an announcement\n/remind [message] — post a reminder\n/status — check bot status\n/help — show this list`;
  }

  if (text.toLowerCase() === "/status") {
    return `*CLASS REP AI Status* ✅\n\nTutor Mode: ${ tutorMode.active ? "🟢 ON" + (tutorMode.subject ? " (" + tutorMode.subject + ")" : "") : "🔴 OFF" }\nAnnouncements: ${announcements.length}\nActive sessions: ${ Object.keys(sessions).length }`;
  }

  return null; // not a CR command
}

// Student commands
function handleStudentCommand(body) {
  const text = body.trim().toLowerCase();

  if (text === "!news" || text === "!updates") {
    if (!announcements.length)
      return `📭 No announcements yet. Check back soon!`;
    const list = announcements
      .slice(0, 5)
      .map((a, i) => {
        const ago = timeAgo(a.time);
        return `${i + 1}. ${a.text}\n _${ago}_`;
      })
      .join("\n\n");
    return `📢 *Latest Updates*\n\n${list}`;
  }

  if (text === "!help" || text === "hi" || text === "hello" || text === "hey") {
    return `👋 Hey! I'm *CLASS REP AI* for SWK 100L, UNILORIN.\n\nHere's what I can do:\n- Answer questions about your courses\n- Give exam tips & study strategies\n- Explain any topic step by step\n- Share class updates\n\n*Commands:*\n!news — latest announcements\n!courses — list all your courses\n!gpa — understand UNILORIN GPA\n!help — show this menu\n\nOr just ask me anything! 🎓`;
  }

  if (text === "!courses") {
    return `📚 *Your Rain Semester Courses*\n\n1. GST 112 — Nigerian Peoples & Culture\n2. SWK 112 — Intro to Social Work\n3. SWK 122 — Social Welfare History\n4. UIL-SWK 112 — Social Work Practice\n5. UIL-SWK 122 — Social Deviance & Crime\n6. POL 102 — Intro to Political Science\n7. PSY 102 — General Psychology\n8. SOC 102 — Intro to Sociology\n\nAsk me about any of them! 💪`;
  }

  if (text === "!gpa") {
    return `📊 *UNILORIN Grading System*\n\n70-100 → A (5.0)\n60-69 → B (4.0)\n50-59 → C (3.0)\n45-49 → D (2.0)\n40-44 → E (1.0)\n0-39 → F (0.0)\n\n*GPA Classes:*\n🥇 First Class: 4.50+\n🥈 2nd Class Upper: 3.50+\n🥉 2nd Class Lower: 2.40+\n📘 Third Class: 1.50+`;
  }

  return null; // not a command, pass to AI
}

function timeAgo(date) {
  const diff = Date.now() - date;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}

// Main webhook
app.post("/webhook", async (req, res) => {
  const twiml = new MessagingResponse();
  const incomingMsg = (req.body.Body || "").trim();
  const from = req.body.From || "";

  if (!incomingMsg) {
    twiml.message("Please send a text message.");
    return res.type("text/xml").send(twiml.toString());
  }

  let reply = "";

  // CR commands
  if (isCR(from) && incomingMsg.startsWith("/")) {
    reply = handleCRCommand(incomingMsg, from);
    if (!reply)
      reply = `❓ Unknown command. Type */help* to see all CR commands.`;
    twiml.message(reply);
    return res.type("text/xml").send(twiml.toString());
  }

  // Student commands
  const cmdReply = handleStudentCommand(incomingMsg);
  if (cmdReply) {
    twiml.message(cmdReply);
    return res.type("text/xml").send(twiml.toString());
  }

  // AI response
  if (!sessions[from]) sessions[from] = [];
  sessions[from].push({ role: "user", content: incomingMsg });

  // Keep last 10 messages to avoid token overflow
  if (sessions[from].length > 10) sessions[from] = sessions[from].slice(-10);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: buildSystemPrompt(),
      messages: sessions[from],
    });

    reply = response.content[0].text;
    sessions[from].push({ role: "assistant", content: reply });
  } catch (err) {
    console.error("Anthropic error:", err);
    reply = "⚠️ Sorry, I had a connection issue. Please try again in a moment.";
  }

  twiml.message(reply);
  res.type("text/xml").send(twiml.toString());
});

// Health check
app.get("/", (req, res) => res.send("CLASS REP AI is running! 🎓"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CLASS REP AI running on port ${PORT}`));  }
};

console.error = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleError.apply(console, args);
  }
};

console.warn = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleWarn.apply(console, args);
  }
};

// Now safe to load libraries
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const handler = require('./handler');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');

// Remove Puppeteer cache (if some dependency downloaded Chromium into ~/.cache/puppeteer)
function cleanupPuppeteerCache() {
  try {
    const home = os.homedir();
    const cacheDir = path.join(home, '.cache', 'puppeteer');

    if (fs.existsSync(cacheDir)) {
      console.log('🧹 Removing Puppeteer cache at:', cacheDir);
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log('✅ Puppeteer cache removed');
    }
  } catch (err) {
    console.error('⚠️ Failed to cleanup Puppeteer cache:', err.message || err);
  }
}
// Optimized in-memory store with hard limits (Map-based for better memory management)
const store = {
  messages: new Map(), // Use Map instead of plain object
  maxPerChat: 20, // Limit to 20 messages per chat

  bind: (ev) => {
    ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.id) continue;

        const jid = msg.key.remoteJid;
        if (!store.messages.has(jid)) {
          store.messages.set(jid, new Map());
        }

        const chatMsgs = store.messages.get(jid);
        chatMsgs.set(msg.key.id, msg);

        // Aggressive cleanup per chat - keep only recent messages
        if (chatMsgs.size > store.maxPerChat) {
          // Remove oldest message (first entry in Map)
          const oldestKey = chatMsgs.keys().next().value;
          chatMsgs.delete(oldestKey);
        }
      }
    });
  },

  loadMessage: async (jid, id) => {
    return store.messages.get(jid)?.get(id) || null;
  }
};

// Optimized message deduplication (Set-based, no timestamps needed)
const processedMessages = new Set();

// Aggressive cleanup - clear every 5 minutes
setInterval(() => {
  processedMessages.clear();
}, 5 * 60 * 1000); // Every 5 minutes

// Custom Pino logger with suppression for Baileys noise
const createSuppressedLogger = (level = 'silent') => {
  const forbiddenPatterns = [
    'closing session',
    'closing open session',
    'sessionentry',
    'prekey bundle',
    'pendingprekey',
    '_chains',
    'registrationid',
    'currentratchet',
    'chainkey',
    'ratchet',
    'signal protocol',
    'ephemeralkeypair',
    'indexinfo',
    'basekey',
    'sessionentry',
    'ratchetkey'
  ];

  let logger;
  try {
    logger = pino({
      level,
      // Fallback transport without pino-pretty (in case not installed)
      transport: process.env.NODE_ENV === 'production' ? undefined : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname'
        }
      },
      customLevels: {
        trace: 0,
        debug: 1,
        info: 2,
        warn: 3,
        error: 4,
        fatal: 5
      },
      // Redact sensitive fields
      redact: ['registrationId', 'ephemeralKeyPair', 'rootKey', 'chainKey', 'baseKey']
    });
  } catch (err) {
    // Fallback to basic pino without transport
    logger = pino({ level });
  }

  // Wrap log methods to filter
  const originalInfo = logger.info.bind(logger);
  logger.info = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').toLowerCase();
    if (!forbiddenPatterns.some(pattern => msg.includes(pattern))) {
      originalInfo(...args);
    }
  };
  logger.debug = () => { }; // Fully disable debug
  logger.trace = () => { }; // Fully disable trace
  return logger;
};

// Main connection function
async function startBot() {
  const sessionFolder = `./${config.sessionName}`;
  const sessionFile = path.join(sessionFolder, 'creds.json');

  // Check if sessionID is provided and process KnightBot! format session
  if (config.sessionID && config.sessionID.startsWith('KnightBot!')) {
    try {
      const [header, b64data] = config.sessionID.split('!');

      if (header !== 'KnightBot' || !b64data) {
        throw new Error("❌ Invalid session format. Expected 'KnightBot!.....'");
      }

      const cleanB64 = b64data.replace('...', '');
      const compressedData = Buffer.from(cleanB64, 'base64');
      const decompressedData = zlib.gunzipSync(compressedData);

      // Ensure session folder exists
      if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true });
      }

      // Write decompressed session data to creds.json
      fs.writeFileSync(sessionFile, decompressedData, 'utf8');
      console.log('📡 Session : 🔑 Retrieved from KnightBot Session');

    } catch (e) {
      console.error('📡 Session : ❌ Error processing KnightBot session:', e.message);
      // Continue with normal QR flow if session processing fails
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  // Use suppressed logger for socket
  const suppressedLogger = createSuppressedLogger('silent');

  const sock = makeWASocket({
    version, // explicit WA Web version negotiated with the server
    logger: suppressedLogger,
    printQRInTerminal: false,
    // Use a common desktop browser signature
    browser: ['Chrome', 'Windows', '10.0'],
    auth: state,
    // Memory optimization: prevent loading old messages into RAM
    syncFullHistory: false,
    downloadHistory: false,
    markOnlineOnConnect: false,
    getMessage: async () => undefined // Don't load messages from store
  });

  // Bind store to socket
  store.bind(sock.ev);

  // Watchdog for inactive socket (Baileys bug fix)
  let lastActivity = Date.now();
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  // Update on every message
  sock.ev.on('messages.upsert', () => {
    lastActivity = Date.now();
  });

  // Check every 5 min
  const watchdogInterval = setInterval(async () => {
    if (Date.now() - lastActivity > INACTIVITY_TIMEOUT && sock.ws.readyState === 1) { // WebSocket open but inactive
      console.log('⚠️ No activity detected. Forcing reconnect...');
      await sock.end(undefined, undefined, { reason: 'inactive' });
      clearInterval(watchdogInterval);
      setTimeout(() => startBot(), 5000); // Slightly longer delay
    }
  }, 5 * 60 * 1000); // Every 5 min check

  // Clear on close/open
  sock.ev.on('connection.update', (update) => {
    const { connection } = update;
    if (connection === 'open') {
      lastActivity = Date.now(); // Reset on open
    } else if (connection === 'close') {
      clearInterval(watchdogInterval);
    }
  });

  // Connection update handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n\n📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

      // Suppress verbose error output for common stream errors (515, etc.)
      if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
        console.log(`⚠️ Connection closed (${statusCode}). Reconnecting...`);
      } else {
        console.log('Connection closed due to:', errorMessage, '\nReconnecting:', shouldReconnect);
      }

      if (shouldReconnect) {
        setTimeout(() => startBot(), 3000);
      }
    } else if (connection === 'open') {
      console.log('\n✅ Bot connected successfully!');
      console.log(`📱 Bot Number: ${sock.user.id.split(':')[0]}`);
      console.log(`🤖 Bot Name: ${config.botName}`);
      console.log(`⚡ Prefix: ${config.prefix}`);
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
      console.log(`👑 Owner: ${ownerNames}\n`);
      console.log('Bot is ready to receive messages!\n');

      // Set bot status
      if (config.autoBio) {
        await sock.updateProfileStatus(`${config.botName} | Active 24/7`);
      }

      // Initialize anti-call feature
      handler.initializeAntiCall(sock);

      // Cleanup old chats (keep only active ones, e.g., last touched <1 day)
      const now = Date.now();
      for (const [jid, chatMsgs] of store.messages.entries()) {
        const timestamps = Array.from(chatMsgs.values()).map(m => m.messageTimestamp * 1000 || 0);
        if (timestamps.length > 0 && now - Math.max(...timestamps) > 24 * 60 * 60 * 1000) { // 1 day old chat
          store.messages.delete(jid);
        }
      }
      console.log(`🧹 Store cleaned. Active chats: ${store.messages.size}`);
    }
  });

  // Credentials update handler
  sock.ev.on('creds.update', saveCreds);

  // System JID filter - checks if JID is from broadcast/status/newsletter
  const isSystemJid = (jid) => {
    if (!jid) return true;
    return jid.includes('@broadcast') ||
      jid.includes('status.broadcast') ||
      jid.includes('@newsletter') ||
      jid.includes('@newsletter.');
  };

  // Messages handler - Process only new messages
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // Only process "notify" type (new messages), skip "append" (old messages from history)
    if (type !== 'notify') return;

    // Process messages in the array
    for (const msg of messages) {
      // Skip if message is invalid or missing key
      if (!msg.message || !msg.key?.id) continue;

      const from = msg.key.remoteJid;
      if (!from) {
        continue;
      }

      // System message filter - ignore broadcast/status/newsletter messages
      if (isSystemJid(from)) {
        continue; // Silently ignore system messages
      }

      // Deduplication: Skip if message has already been processed
      const msgId = msg.key.id;
      if (processedMessages.has(msgId)) continue;

      // Timestamp validation: Only process messages within last 5 minutes
      const MESSAGE_AGE_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds
      let messageAge = 0;
      if (msg.messageTimestamp) {
        messageAge = Date.now() - (msg.messageTimestamp * 1000);
        if (messageAge > MESSAGE_AGE_LIMIT) {
          // Message is too old, skip processing
          continue;
        }
      }

      // Mark message as processed
      processedMessages.add(msgId);

      // Store message FIRST (before processing)
      // from already defined above in DM block check
      if (msg.key && msg.key.id) {
        if (!store.messages.has(from)) {
          store.messages.set(from, new Map());
        }
        const chatMsgs = store.messages.get(from);
        chatMsgs.set(msg.key.id, msg);

        // Cleanup: Keep only last 20 per chat (reduced from 200)
        if (chatMsgs.size > store.maxPerChat) {
          // Remove oldest messages
          const sortedIds = Array.from(chatMsgs.entries())
            .sort((a, b) => (a[1].messageTimestamp || 0) - (b[1].messageTimestamp || 0))
            .map(([id]) => id);
          for (let i = 0; i < sortedIds.length - store.maxPerChat; i++) {
            chatMsgs.delete(sortedIds[i]);
          }
        }
      }

      // Process command IMMEDIATELY (don't block on other operations)
      handler.handleMessage(sock, msg).catch(err => {
        if (!err.message?.includes('rate-overlimit') &&
          !err.message?.includes('not-authorized')) {
          console.error('Error handling message:', err.message);
        }
      });

      // Do other operations in background (non-blocking)
      setImmediate(async () => {
        if (config.autoRead && from.endsWith('@g.us')) {
          try {
            await sock.readMessages([msg.key]);
          } catch (e) {
            // Silently handle
          }
        }
        if (from.endsWith('@g.us')) {
          try {
            const groupMetadata = await handler.getGroupMetadata(sock, msg.key.remoteJid);
            if (groupMetadata) {
              await handler.handleAntilink(sock, msg, groupMetadata);
            }
          } catch (error) {
            // Silently handle
          }
        }
      });
    }
  });

  // Message receipt updates (silently handled, no logging)
  sock.ev.on('message-receipt.update', () => {
    // Silently handle receipt updates
  });

  // Message updates (silently handled, no logging)
  sock.ev.on('messages.update', () => {
    // Silently handle message updates
  });

  // Group participant updates (join/leave)
  sock.ev.on('group-participants.update', async (update) => {
    await handler.handleGroupUpdate(sock, update);
  });

  // Handle errors - suppress common stream errors
  sock.ev.on('error', (error) => {
    const statusCode = error?.output?.statusCode;
    // Suppress verbose output for common stream errors
    if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
      // These are usually temporary connection issues, handled by reconnection
      return;
    }
    console.error('Socket error:', error.message || error);
  });

  return sock;
}
// Start the bot
console.log('🚀 Starting WhatsApp MD Bot...\n');
console.log(`📦 Bot Name: ${config.botName}`);
console.log(`⚡ Prefix: ${config.prefix}`);
const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
console.log(`👑 Owner: ${ownerNames}\n`);

// Proactively delete Puppeteer cache so it doesn't fill disk on panels
cleanupPuppeteerCache();

startBot().catch(err => {
  console.error('Error starting bot:', err);
  process.exit(1);
});
// Handle process termination
process.on('uncaughtException', (err) => {
  // Handle ENOSPC errors gracefully without crashing
  if (err.code === 'ENOSPC' || err.errno === -28 || err.message?.includes('no space left on device')) {
    console.error('⚠️ ENOSPC Error: No space left on device. Attempting cleanup...');
    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();
    console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
    return; // Don't crash, just log and continue
  }
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  // Handle ENOSPC errors gracefully
  if (err.code === 'ENOSPC' || err.errno === -28 || err.message?.includes('no space left on device')) {
    console.warn('⚠️ ENOSPC Error in promise: No space left on device. Attempting cleanup...');
    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();
    console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
    return; // Don't crash, just log and continue
  }

  // Don't spam console with rate limit errors
  if (err.message && err.message.includes('rate-overlimit')) {
    console.warn('⚠️ Rate limit reached. Please slow down your requests.');
    return;
  }
  console.error('Unhandled Rejection:', err);
});
// Export store for use in commands
module.exports = { store };
