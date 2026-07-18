import * as LegacyFileSystem from "expo-file-system/legacy";
import { clearSentLinks } from "@/src/links/sent-links-store";
import { clearAttachmentCache, type FileSystemLike } from "@/src/reader/attachment-cache";

// Pure orchestrator for the "Clear local history" action (Privacy Settings). Clears the two
// local-history domains: opened-message attachment cache + locally-tracked sent links. Does NOT
// touch contacts, settings, identity, or the DEK — those belong to the wipe-this-device's-identity path.

export interface ClearLocalHistoryDeps {
  clearSentLinks: () => Promise<void>;
  clearAttachmentCache: () => Promise<void>;
}

const productionDeps: ClearLocalHistoryDeps = {
  clearSentLinks,
  clearAttachmentCache: () =>
    clearAttachmentCache({ FileSystem: LegacyFileSystem as unknown as FileSystemLike }),
};

/** Clear the two local-history domains (opened-message cache + cached links). Best-effort: both are
 *  attempted even if one fails, mirroring the cache's swallow-individual-failures ethos. */
export async function clearLocalHistory(
  deps: ClearLocalHistoryDeps = productionDeps,
): Promise<void> {
  await Promise.allSettled([deps.clearSentLinks(), deps.clearAttachmentCache()]);
}
