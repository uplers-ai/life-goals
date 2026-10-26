# Life Goals 2026

The team board for the Marketing life-goals challenge, 2 Nov to 31 Dec 2026.

- `index.html` is the whole board. GitHub Pages serves it.
- Firebase stores the data: Firestore holds quests, logs, cheers, posts, likes, profiles and finishes, and Storage holds wall photos and videos.
- `functions/` posts activity to a Google Chat space: new quests, wall posts, finished quests, plus a digest every evening at 9 pm IST (with a weekly recap on Sundays).

Without `firebase-config.js` filled in, the board runs in preview mode and saves only on the device you're using.

## One-time setup

### 1. Firebase project

1. Create a project at https://console.firebase.google.com.
2. **Upgrade to Blaze (pay-as-you-go).** Cloud Functions and Storage both need it. For 14 people it should stay within the free quota. Set a budget alert (for example ₹500) under Google Cloud console → Billing → Budgets.
3. **Firestore Database** → Create database → production mode → location `asia-south1` (Mumbai).
4. **Storage** → Get started → same location.
5. **Project settings → Your apps → Web (`</>`)** → register an app, then copy the config values into `firebase-config.js`.

### 2. Google Chat webhook

In the Chat space: space name → **Apps & integrations → Webhooks → Add webhook**. Name it "Life Goals" and copy the URL. Keep the URL private, because anyone who has it can post to the space.

### 3. Deploy rules and functions

```sh
npm install -g firebase-tools
firebase login
firebase use --add                              # pick the project
firebase functions:secrets:set CHAT_WEBHOOK_URL # paste the webhook URL
firebase deploy --only firestore:rules,storage,functions
```

### 4. GitHub Pages

```sh
git push origin main   # Pages redeploys on every push to main
```

The board is live at https://uplers-ai.github.io/life-goals/ (repo: https://github.com/uplers-ai/life-goals). Share that link in the Chat space. Each tab has its own link too, for example `…/#wall` or `…/#rules`.

The repo is public, so the code and the team roster are visible. The data stays in Firebase.

## Things to know

- **No sign-in.** People pick their name, and anyone with the link can read and write. Keep the link inside the team.
- **The roster and season dates** are at the top of the script in `index.html` (`ROSTER`, `SEASON_START`, `SEASON_END`). The season dates are repeated in `functions/index.js`, so change both together.
- **Finishes** are written once, the first time a quest reaches 100%, and that write is what sends the Chat message. Firestore rules stop them from being edited or deleted, so each finished quest posts only once.
- **Weekly quests** finish at target in 7 of the 8 weeks. `FINISH_WEEKS` in `index.html` sets this.
- **Logs and errors** for the functions are in Firebase console → Functions → Logs.
