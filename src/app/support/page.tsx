import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support — Gym Log",
  description: "Help with Gym Log: resetting your password, deleting your account, and contact.",
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
.legal ul, .legal ol { padding-left: 20px; margin: 0 0 10px; }
.legal .back { display: inline-block; margin-bottom: 12px; font-size: 15px; }
@media (prefers-color-scheme: dark) {
  .legal { background: #000000; color: #ededed; }
  .legal a { color: #f2f2f2; }
}
`;

export default function SupportPage() {
  return (
    <main className="legal">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <Link href="/" className="back">
        ← Back to Gym Log
      </Link>
      <h1>Support</h1>

      <p>
        Gym Log is a personal workout logger with an AI coach. It keeps your log in one place, lets you log cardio,
        and offers coaching when you turn it on.
      </p>

      <h2>Reset your password</h2>
      <ol>
        <li>On the sign-in screen, enter your email address.</li>
        <li>Tap Forgot password.</li>
        <li>Open the reset link in the email we send you, and choose a new password.</li>
        <li>On iPhone the link opens in Safari. Set the password there, then sign in to the app with it.</li>
      </ol>
      <p>If the email does not arrive within a few minutes, check your spam folder.</p>

      <h2>Delete your account</h2>
      <p>
        Go to Settings and choose Delete account, then tap again to confirm. This deletes your log, your coach chat,
        your profile and your account. It cannot be undone.
      </p>

      <h2>Contact</h2>
      <p>
        Report a problem or ask a question on GitHub:{" "}
        <a href="https://github.com/Christen1609/gym-log/issues">github.com/Christen1609/gym-log/issues</a>
      </p>
      <p>
        Read the <Link href="/privacy">privacy policy</Link> for what the app stores and who processes it.
      </p>
    </main>
  );
}
