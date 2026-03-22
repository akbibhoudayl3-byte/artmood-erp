"use client";

import { useEffect } from "react";
import { initGlobalErrorCapture } from "@/lib/client-logger";

/**
 * Drop this into the root layout to auto-capture all
 * unhandled errors and promise rejections on the client.
 */
export function LoggerProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initGlobalErrorCapture();
  }, []);

  return <>{children}</>;
}
