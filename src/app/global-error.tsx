"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body style={{ padding: 32, fontFamily: "monospace", background: "#0a0a0f", color: "#eee" }}>
        <h1 style={{ color: "#ff4444" }}>DEBUG: Client Exception</h1>
        <p><b>Name:</b> {String(error?.name)}</p>
        <p><b>Message:</b> {String(error?.message)}</p>
        <pre style={{ color: "#aaa", fontSize: 12 }}>{String(error?.stack)}</pre>
        {error?.digest && <p><b>Digest:</b> {error.digest}</p>}
      </body>
    </html>
  );
}