# Private Chat — GitHub Pages + Firebase

A minimal private chat for exactly two users.

## Features

- Email/password sign-in
- Live messages without refreshing
- Persistent Cloud Firestore history
- Pagination for older messages
- Access restricted to the two approved Firebase UIDs
- Responsive desktop/mobile layout
- Light and dark themes, remembered on each device
- Reply to a specific message
- No public registration

## Important update for v2

Reply messages add a `replyTo` object to Firestore documents. Because of that, you **must publish the updated `firestore.rules` file** before testing replies. Normal messages will continue to work with the old rules, but replies will be rejected until the new rules are published.

## Files

- `index.html` — user interface
- `styles.css` — light/dark styling and responsive layout
- `app.js` — authentication, realtime sync, history, theme and replies
- `firebase-config.js` — Firebase project configuration and the two allowed UIDs
- `firestore.rules` — Firestore security rules
- `.nojekyll` — direct GitHub Pages publishing

## Updating the existing GitHub Pages site

Upload/replace these files in the root of the existing `chatbaby` repository:

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`
- `firestore.rules`
- `README.md`

GitHub Pages will redeploy automatically after the commit.

## Publish the new Firestore rules

1. Open Firebase Console.
2. Go to **Firestore Database → Rules**.
3. Replace the current rules with the contents of `firestore.rules`.
4. Click **Publish**.

The rules still allow only the same two Firebase UIDs. They now also allow an optional, validated `replyTo` object when a message is created. Editing and deleting existing messages remain disabled.

## Reply behavior

Every message has a **Reply** action. Selecting it opens a reply preview above the composer. The sent message stores a small snapshot of the original message (`id`, `text`, and `senderId`), so the reply remains visible after reload and does not require another Firestore read.

Press **Escape** while composing to cancel the selected reply.

## Theme behavior

Use the **Light / Dark** switch on either the login screen or chat header. The selected theme is stored in `localStorage` on that device. If no preference has been saved yet, the site initially follows the device's system color scheme.

## Security notes

- The Firebase web configuration is client-side configuration, not a secret.
- Never place user passwords, service-account JSON files, or private keys in GitHub.
- Conversation access is enforced by Firebase Authentication and Firestore Security Rules.
- The repository can be public without making the Firestore conversation public, provided the security rules are correctly published.
