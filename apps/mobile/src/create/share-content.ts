// Pure logic: build the payload for the OS share sheet on the "Secure link created" screen.
//
// The thing being shared is a text LINK (a pointer to the ciphertext), not a file — so React
// Native's Share API (Share.share) is the correct primitive, NOT expo-sharing, which only shares
// local file URIs and throws when handed an https:// string. RN's Share carries the URL in the
// `message` field, which populates correctly on both iOS and Android. Extracting the payload keeps
// it unit-testable and guarantees the shared content is exactly the link URL — nothing more (no
// plaintext, no metadata).

export interface ShareContent {
  message: string;
}

/** The share-sheet content for a secure link: just the link URL. */
export function buildShareContent(url: string): ShareContent {
  return { message: url };
}
