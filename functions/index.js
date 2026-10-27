// Posts Life Goals board activity to a Google Chat space.
// New quests, wall posts and finished quests post as they happen; a digest posts every evening.

const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

setGlobalOptions({ region: "asia-south1", maxInstances: 2 });

const CHAT_WEBHOOK_URL = defineSecret("CHAT_WEBHOOK_URL");
const BOARD_URL = defineString("BOARD_URL");

// Keep in step with index.html.
const SEASON_START = "2026-11-02";
const SEASON_END = "2026-12-31";
const CATS = { health: "Health", exp: "Experience", learn: "Learn", stretch: "Stretch" };
const TZ = "Asia/Kolkata";

async function postToChat(message) {
  const res = await fetch(CHAT_WEBHOOK_URL.value(), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`Chat webhook returned ${res.status}: ${await res.text()}`);
}

function boardLink(tab, label) {
  return `<${BOARD_URL.value()}#${tab}|${label}>`;
}

function measure(q) {
  if (q.type === "weekly") return `${q.target} ${q.unit} a week`;
  if (q.type === "steps") return `${(q.steps || []).length}-step checklist`;
  return `${q.target} ${q.unit} by 31 Dec`;
}

function istDate(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

function istWeekday(d) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(d);
}

function esc(s) {
  return String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

// One line is picked at random for each new quest.
const PEP = [
  "Most people keep their goals in their head. You put yours on a board with your name on it.",
  "The hardest step is the first one, and you just took it.",
  "Sixty days from now you'll be glad you started today.",
  "Small steps, every week. That's the whole secret.",
  "You don't need to be great to start. You need to start to be great.",
  "Future you just said thank you.",
  "Motivation gets you started. Showing up every week keeps you going.",
  "Write it down, tell your people, show up. Two out of three done already.",
];

exports.chatNewQuest = onDocumentCreated(
  { document: "quests/{id}", secrets: [CHAT_WEBHOOK_URL] },
  async (event) => {
    const q = event.data.data();
    const cat = CATS[q.cat] ? q.cat : "health";
    const widgets = [
      { image: { imageUrl: `${BOARD_URL.value()}gifs/${cat}.gif`, altText: "Top 1%" } },
      { decoratedText: { topLabel: `${CATS[cat]} quest · ${measure(q)}`, text: `<b>${esc(q.title)}</b>`, wrapText: true } },
    ];
    if (q.why) widgets.push({ textParagraph: { text: `<i>“${esc(q.why)}”</i>` } });
    widgets.push({ textParagraph: { text: PEP[Math.floor(Math.random() * PEP.length)] } });
    widgets.push({ buttonList: { buttons: [{ text: `Cheer ${q.name.split(" ")[0]} on`, onClick: { openLink: { url: `${BOARD_URL.value()}#board` } } }] } });
    await postToChat({
      text: `🎉 Congratulations *${q.name}*, you're in the top 1%: the people who write their goals down and commit to them.`,
      cardsV2: [{ cardId: `quest-${event.params.id}`, card: { sections: [{ widgets }] } }],
    });
  }
);

exports.chatNewPost = onDocumentCreated(
  { document: "posts/{id}", secrets: [CHAT_WEBHOOK_URL] },
  async (event) => {
    const p = event.data.data();
    const widgets = [];
    if (p.kind === "image" && p.url) widgets.push({ image: { imageUrl: p.url, altText: `Photo from ${p.name}` } });
    if (p.caption) widgets.push({ textParagraph: { text: p.caption } });
    if (p.quest) {
      const q = await db.doc(`quests/${p.quest}`).get();
      if (q.exists) widgets.push({ decoratedText: { topLabel: CATS[q.get("cat")] || "Quest", text: q.get("title") } });
    }
    const buttons = [{ text: "Open the wall", onClick: { openLink: { url: `${BOARD_URL.value()}#wall` } } }];
    if (p.kind === "video" && p.url) buttons.unshift({ text: "Watch the video", onClick: { openLink: { url: p.url } } });
    widgets.push({ buttonList: { buttons } });
    await postToChat({
      text: `📸 *${p.name}* posted ${p.kind === "video" ? "a video" : "a photo"} to the wall`,
      cardsV2: [{ cardId: `post-${event.params.id}`, card: { sections: [{ widgets }] } }],
    });
  }
);

exports.chatQuestFinished = onDocumentCreated(
  { document: "finishes/{id}", secrets: [CHAT_WEBHOOK_URL] },
  async (event) => {
    const f = event.data.data();
    await postToChat({
      text: `🏁 *${f.name}* finished their ${CATS[f.cat] || ""} quest: *${f.title}*\n${boardLink("board", "Send a cheer")}`,
    });
  }
);

// Every evening during the season: who logged what today. Sundays add a weekly recap.
exports.chatDailyDigest = onSchedule(
  { schedule: "0 21 * * *", timeZone: TZ, secrets: [CHAT_WEBHOOK_URL] },
  async () => {
    const now = new Date();
    const today = istDate(now);
    if (today < SEASON_START || today > SEASON_END) return;
    const sunday = istWeekday(now) === "Sun";
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;

    const [logs, quests, finishes] = await Promise.all([
      db.collection("logs").where("at", ">=", sunday ? weekAgo : dayAgo).get(),
      db.collection("quests").get(),
      db.collection("finishes").get(),
    ]);
    const questById = {};
    quests.forEach((d) => { questById[d.id] = d.data(); });

    const todayByPerson = {};
    const weekPeople = new Set();
    let weekLogs = 0;
    logs.forEach((d) => {
      const l = d.data();
      const q = questById[l.quest];
      if (!q) return;
      weekLogs++;
      weekPeople.add(q.person);
      if (l.at < dayAgo) return;
      const what = l.step != null
        ? `ticked "${(q.steps || [])[l.step] || "a step"}" · ${q.title}`
        : `+${l.amount} ${q.unit} · ${q.title}`;
      (todayByPerson[q.name || q.person] = todayByPerson[q.name || q.person] || []).push(what);
    });

    const names = Object.keys(todayByPerson).sort();
    if (!names.length && !sunday) return;

    const start = Date.UTC(2026, 10, 2);
    const day = Math.floor((Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)) - start) / 86400000) + 1;
    const lines = [`📋 *Day ${day} of 60*`];
    if (names.length) {
      names.forEach((n) => lines.push(`• *${n}*: ${todayByPerson[n].join("; ")}`));
    } else {
      lines.push("Quiet day on the board.");
    }
    if (sunday) {
      lines.push("", `🗓️ *This week*: ${weekLogs} logs from ${weekPeople.size} people · ${quests.size} quests on the board · ${finishes.size} finished so far`);
    }
    lines.push(boardLink("board", "Open the board"));
    await postToChat({ text: lines.join("\n") });
  }
);
