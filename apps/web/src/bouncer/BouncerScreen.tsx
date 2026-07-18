"use client";

import { useEffect } from "react";
import { APP_STORE_URL, PLAY_STORE_URL } from "../landing/app-store-links";
import { appDeepLink } from "./deep-link";

export function BouncerScreen({ id }: { id: string }) {
  const deepLink = appDeepLink(id);

  useEffect(() => {
    // Best-effort hand-off to the app if it is installed but the universal link did not intercept.
    // No network request is made — this only navigates to the custom scheme.
    if (deepLink) window.location.href = deepLink;
  }, [deepLink]);

  return (
    <main className="min-h-screen bg-surface text-on-surface flex flex-col items-center justify-center px-6 text-center">
      <span aria-hidden="true" className="material-symbols-outlined text-primary text-5xl mb-4">
        lock
      </span>
      <h1 className="font-display text-2xl mb-2">Open this secure link in aesmsg</h1>
      <p className="text-on-surface-variant max-w-md mb-8">
        Secure links can only be opened in the aesmsg app, where decryption happens on your device.
        Install the app, then tap the link again.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        {deepLink ? (
          <a
            href={deepLink}
            rel="noreferrer"
            className="bg-primary text-on-primary font-bold px-6 py-3 rounded-xl"
          >
            Open in app
          </a>
        ) : null}
        <a
          href={APP_STORE_URL}
          rel="noreferrer"
          className="border border-outline-variant px-6 py-3 rounded-xl"
        >
          Download for iOS
        </a>
        <a
          href={PLAY_STORE_URL}
          rel="noreferrer"
          className="border border-outline-variant px-6 py-3 rounded-xl"
        >
          Download for Android
        </a>
      </div>
    </main>
  );
}
