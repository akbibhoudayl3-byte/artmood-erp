"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Can't import clientLogger here (outside root layout), use fetch directly
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "fatal",
        message: `Global error: ${error.message}`,
        source: "global-error-boundary",
        error: { name: error.name, message: error.message, stack: error.stack },
        meta: { digest: error.digest },
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html>
      <body
        style={{
          padding: 32,
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0f",
          color: "#eee",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            maxWidth: 500,
            padding: 32,
            borderRadius: 12,
            border: "1px solid #ff4444",
            background: "#1a0a0a",
          }}
        >
          <h1 style={{ color: "#ff4444", marginBottom: 8 }}>Application Error</h1>
          <p style={{ color: "#ccc", marginBottom: 16 }}>{error.message}</p>
          {error.digest && (
            <p style={{ color: "#888", fontSize: 12, marginBottom: 16 }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: "8px 20px",
              background: "#ff4444",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
