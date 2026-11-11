import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy — Gym Log",
  description: "What Gym Log stores, who processes it, and how to delete it.",
};

const css = `
.legal {
  max-width: 680px;
  margin: 0 auto;
  padding: 24px 18px;
  line-height: 1.6;
  min-height: 100vh;
  background: #ffffff;
  color: #262626;
  font-family: var(--font-figtree), system-ui, sans-serif;
}
.legal a { color: #1a1a1a; }
.legal h1 { font-size: 28px; margin: 8px 0 4px; }
.legal h2 { font-size: 18px; margin: 28px 0 8px; }
.legal p, .legal li { margin: 0 0 10px; }
.legal ul { padding-left: 20px; margin: 0 0 10px; }
.legal .back { display: inline-block; margin-bottom: 12px; font-size: 15px; }
.legal .muted { color: #6b6b6b; font-size: 14px; }
@media (prefers-color-scheme: dark) {
  .legal { background: #000000; color: #ededed; }
  .legal a { color: #f2f2f2; }
  .legal .muted { color: #8f8f8f; }
}
`;

export default function PrivacyPage() {
  return (
    <main className="legal">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <Link href="/" className="back">
        ← Back to Gym Log
      </Link>
      <h1>Privacy policy</h1>
      <p className="muted">Last updated 2026-11-11</p>

      <p>
        Gym Log is a personal workout logger with an optional AI coach. This page explains what the app stores, who
        processes it, and how to delete it. The app is not medical advice.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your email address, used to sign in.</li>
        <li>Your workout log: exercises, sets, weights and reps.</li>
        <li>Cardio sessions you log.</li>
        <li>Your profile, including any injuries or limitations you choose to list.</li>
        <li>Your chat with the coach.</li>
        <li>Your Notion connection, if you connect Notion to import workouts.</li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>
          <strong>Supabase</strong> stores your account and your data.
        </li>
        <li>
          <strong>Vercel</strong> hosts the app and its server code.
        </li>
        <li>
          <strong>Google Gemini</strong> receives data only when you allow the AI coach in the app. Until you allow it,
          nothing is sent to Gemini. When you allow it, the coach sends your training log, your profile (including
          injuries you list) and the chat to Google to write its answer.
        </li>
        <li>
          <strong>Notion</strong> is contacted only if you connect it. Your Notion connection is stored with your
          account and removed when you delete it.
        </li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not show ads.</li>
        <li>We do not use tracking for advertising.</li>
        <li>We do not sell your data.</li>
      </ul>

      <h2>Deleting your data</h2>
      <p>
        In the app, go to Settings and choose Delete account. This deletes your log, your coach chat, your profile and
        your account. It cannot be undone.
      </p>

      <h2>Medical advice</h2>
      <p>
        Gym Log and its AI coach do not give medical advice. If you have an injury or a health condition, talk to a
        doctor or a qualified professional before you train.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about this policy or your data, see the{" "}
        <Link href="/support">support page</Link>.
      </p>
    </main>
  );
}
