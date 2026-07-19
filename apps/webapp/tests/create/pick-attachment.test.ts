import { describe, expect, it } from "vitest";
import {
  fileToAttachment,
  formatSize,
  MAX_ATTACHMENT_BYTES,
  validateAttachmentSize,
} from "@/src/create/pick-attachment";

describe("pick-attachment", () => {
  describe("validateAttachmentSize", () => {
    it("accepts a file at exactly the 10 MiB cap and rejects one byte over", () => {
      expect(validateAttachmentSize(MAX_ATTACHMENT_BYTES).ok).toBe(true);
      const over = validateAttachmentSize(MAX_ATTACHMENT_BYTES + 1);
      expect(over.ok).toBe(false);
      if (!over.ok) expect(over.size).toBe(MAX_ATTACHMENT_BYTES + 1);
    });
  });

  describe("formatSize", () => {
    it("renders MB at/above 1 MiB and KB below", () => {
      expect(formatSize(2 * 1024 * 1024)).toBe("2.0 MB");
      expect(formatSize(1536)).toBe("1.5 KB");
      expect(formatSize(1024 * 1024)).toBe("1.0 MB");
    });
  });

  describe("fileToAttachment", () => {
    it("maps a File to name/mime/bytes (basename only)", async () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const file = new File([bytes], "sub/dir/report.pdf", { type: "application/pdf" });
      const result = await fileToAttachment(file);
      expect(result.kind).toBe("picked");
      if (result.kind !== "picked") throw new Error("expected picked");
      expect(result.attachment.filename).toBe("report.pdf");
      expect(result.attachment.mimetype).toBe("application/pdf");
      expect(Array.from(result.attachment.bytes)).toEqual([1, 2, 3, 4, 5]);
      expect(result.attachment.size).toBe(5);
    });

    it("defaults a missing mimetype to application/octet-stream", async () => {
      const file = new File([new Uint8Array([9])], "blob", { type: "" });
      const result = await fileToAttachment(file);
      if (result.kind !== "picked") throw new Error("expected picked");
      expect(result.attachment.mimetype).toBe("application/octet-stream");
    });

    it("rejects an over-cap file via the metadata pre-check (never reads it) — too-large", async () => {
      // A tiny file whose reported size is overridden above a small injected cap.
      const file = new File([new Uint8Array([1, 2])], "huge.bin", { type: "text/plain" });
      const result = await fileToAttachment(file, 1);
      expect(result.kind).toBe("too-large");
      if (result.kind !== "too-large") throw new Error("expected too-large");
      expect(result.filename).toBe("huge.bin");
    });
  });
});
