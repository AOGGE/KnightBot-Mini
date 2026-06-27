const express = require('express');
const { MessagingResponse } = require('twilio').twiml;
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory session store (per user conversation history)
const sessions = {};
const tutorMode = { active: false, subject: '' };
const announcements = [];

const CR_NUMBER = process.env.CR_NUMBER || ''; // Your WhatsApp number e.g. whatsapp:+2348012345678
const CR_PASSWORD = process.env.CR_PASSWORD || 'tobi2025';

const SYSTEM_PROMPT_BASE = `You are CLASS REP AI, the official digital class representative for Social Work 100L students at the University of Ilorin (UNILORIN), Nigeria. Built by Tobi Educational Consult.

Personality: warm, friendly, relatable — like a knowledgeable senior student who genuinely cares about their coursemates. You speak naturally and conversationally, like a WhatsApp message.

You help students with:
- 8 Rain semester courses: GST 112 (Nigerian Peoples & Culture), SWK 112 (Introduction to Social Work), SWK 122 (Social Welfare History), UIL-SWK 112 (Social Work Practice), UIL-SWK 122 (Social Deviance & Crime), POL 102 (Introduction to Political Science), PSY 102 (General Psychology), SOC 102 (Introduction to Sociology)
- Exam preparation, study strategies, course outlines, key topics
- NASOWS (Nigerian Association of Social Work Students) info
- Student life advice at UNILORIN
- UNILORIN Grading: 70-100=A(5.0), 60-69=B(4.0), 50-59=C(3.0), 45-49=D(2.0), 40-44=E(1.0), 0-39=F(0)
- GPA: First Class=4.50+, 2nd Class Upper=3.50+, 2nd Class Lower=2.40+, Third Class=1.50+

Rules:
- Keep replies short and mobile-friendly (this is WhatsApp)
- Use simple formatting: *bold* for emphasis, bullet points with hyphens
- Never write full assignments — guide and scaffold instead
- Be encouraging and warm at all times`;

function buildSystemPrompt() {
  let prompt = SYSTEM_PROMPT_BASE;
  if (tutorMode.active) {
    const sub = tutorMode.subject || 'any of the 8 Rain semester courses';
    prompt += `

=== TUTOR MODE ACTIVE ===
You are now a personal tutor for: ${sub}.
- Break every concept into simple, clear steps
- Use relatable Nigerian student examples and analogies
- After explaining, ask one question to check understanding
- Celebrate correct answers warmly (e.g. "Yes! That's exactly right! 🎉")
- If confused, try a completely different explanation angle
- Offer mini-quizzes when a topic is fully covered
- Use phrases like: "Let's break this down...", "Think of it this way...", "Quick check — can you tell me...?"`;
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
  if (text.toLowerCase().startsWith('/tutor on')) {
    const subject = text.slice(9).trim();
    tutorMode.active = true;
    tutorMode.subject = subject || '';
    return `✅ *Tutor Mode ON*${subject ? ' for ' + subject : ' (all courses)'}.\n\nStudents can now ask for step-by-step explanations!`;
  }
  if (text.toLowerCase() === '/tutor off') {
    tutorMode.active = false;
    tutorMode.subject = '';
    return `✅ Tutor Mode turned *OFF*. Back to regular class rep mode.`;
  }

  // Post announcement
  if (text.toLowerCase().startsWith('/post')) {
    const content = text.slice(5).trim();
    if (!content) return `⚠️ Usage: /post Your announcement here`;
    announcements.unshift({ text: content, time: new Date() });
    return `✅ *Announcement posted!*\n\nStudents who type *!news* will see it.`;
  }

  // Broadcast reminder
  if (text.toLowerCase().startsWith('/remind')) {
    const content = text.slice(7).trim();
    if (!content) return `⚠️ Usage: /remind Your reminder here`;
    announcements.unshift({ text: `📢 *REMINDER:* ${content}`, time: new Date(), isReminder: true });
    return `✅ *Reminder saved!*\n\nStudents who type *!news* will see it.`;
  }

  // Help
  if (text.toLowerCase() === '/help') {
    return `*CR Commands* 🔐\n\n/tutor on [subject] — activate tutor mode\n/tutor off — deactivate tutor mode\n/post [message] — post an announcement\n/remind [message] — post a reminder\n/status — check bot status\n/help — show this list`;
  }

  if (text.toLowerCase() === '/status') {
    return `*CLASS REP AI Status* ✅\n\nTutor Mode: ${tutorMode.active ? '🟢 ON' + (tutorMode.subject ? ' (' + tutorMode.subject + ')' : '') : '🔴 OFF'}\nAnnouncements: ${announcements.length}\nActive sessions: ${Object.keys(sessions).length}`;
  }

  return null; // not a CR command
}

// Student commands
function handleStudentCommand(body) {
  const text = body.trim().toLowerCase();

  if (text === '!news' || text === '!updates') {
    if (!announcements.length) return `📭 No announcements yet. Check back soon!`;
    const list = announcements.slice(0, 5).map((a, i) => {
      const ago = timeAgo(a.time);
      return `${i + 1}. ${a.text}\n   _${ago}_`;
    }).join('\n\n');
    return `📢 *Latest Updates*\n\n${list}`;
  }

  if (text === '!help' || text === 'hi' || text === 'hello' || text === 'hey') {
    return `👋 Hey! I'm *CLASS REP AI* for SWK 100L, UNILORIN.\n\nHere's what I can do:\n- Answer questions about your courses\n- Give exam tips & study strategies\n- Explain any topic step by step\n- Share class updates\n\n*Commands:*\n!news — latest announcements\n!courses — list all your courses\n!gpa — understand UNILORIN GPA\n!help — show this menu\n\nOr just ask me anything! 🎓`;
  }

  if (text === '!courses') {
    return `📚 *Your Rain Semester Courses*\n\n1. GST 112 — Nigerian Peoples & Culture\n2. SWK 112 — Intro to Social Work\n3. SWK 122 — Social Welfare History\n4. UIL-SWK 112 — Social Work Practice\n5. UIL-SWK 122 — Social Deviance & Crime\n6. POL 102 — Intro to Political Science\n7. PSY 102 — General Psychology\n8. SOC 102 — Intro to Sociology\n\nAsk me about any of them! 💪`;
  }

  if (text === '!gpa') {
    return `📊 *UNILORIN Grading System*\n\n70-100 → A (5.0)\n60-69 → B (4.0)\n50-59 → C (3.0)\n45-49 → D (2.0)\n40-44 → E (1.0)\n0-39 → F (0.0)\n\n*GPA Classes:*\n🥇 First Class: 4.50+\n🥈 2nd Class Upper: 3.50+\n🥉 2nd Class Lower: 2.40+\n📘 Third Class: 1.50+`;
  }

  return null; // not a command, pass to AI
}

function timeAgo(date) {
  const diff = Date.now() - date;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// Main webhook
app.post('/webhook', async (req, res) => {
  const twiml = new MessagingResponse();
  const incomingMsg = (req.body.Body || '').trim();
  const from = req.body.From || '';

  if (!incomingMsg) {
    twiml.message('Please send a text message.');
    return res.type('text/xml').send(twiml.toString());
  }

  let reply = '';

  // CR commands
  if (isCR(from) && incomingMsg.startsWith('/')) {
    reply = handleCRCommand(incomingMsg, from);
    if (!reply) reply = `❓ Unknown command. Type */help* to see all CR commands.`;
    twiml.message(reply);
    return res.type('text/xml').send(twiml.toString());
  }

  // Student commands
  const cmdReply = handleStudentCommand(incomingMsg);
  if (cmdReply) {
    twiml.message(cmdReply);
    return res.type('text/xml').send(twiml.toString());
  }

  // AI response
  if (!sessions[from]) sessions[from] = [];
  sessions[from].push({ role: 'user', content: incomingMsg });

  // Keep last 10 messages to avoid token overflow
  if (sessions[from].length > 10) sessions[from] = sessions[from].slice(-10);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: buildSystemPrompt(),
      messages: sessions[from],
    });

    reply = response.content[0].text;
    sessions[from].push({ role: 'assistant', content: reply });
  } catch (err) {
    console.error('Anthropic error:', err);
    reply = '⚠️ Sorry, I had a connection issue. Please try again in a moment.';
  }

  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

// Health check
app.get('/', (req, res) => res.send('CLASS REP AI is running! 🎓'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CLASS REP AI running on port ${PORT}`));
