import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCameraScanner } from "@/src/contacts/use-camera-scanner";
import { rasterizeValue } from "@/tests/helpers/rasterize";

const FIXTURE = "amk1:AQFUWXYVGB1oAIlDTPXjHe4bJbetS2ZM5OqCV_9MFdDhdg";

function Probe({ onResult }: { onResult: (p: string) => void }) {
  const { status, videoRef } = useCameraScanner({ onResult });
  return (
    <video ref={videoRef} data-testid="video" data-status={status}>
      <track kind="captions" />
    </video>
  );
}

// Ensure navigator.mediaDevices exists (secure-context localhost provides it) so we can spy on it.
function ensureMediaDevices() {
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {},
      configurable: true,
      writable: true,
    });
  }
}

describe("useCameraScanner", () => {
  let originalGetUserMedia: unknown;

  beforeEach(() => {
    ensureMediaDevices();
    originalGetUserMedia = (navigator.mediaDevices as { getUserMedia?: unknown }).getUserMedia;
  });

  afterEach(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: originalGetUserMedia,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it("reports 'unavailable' when getUserMedia is missing — never throws", async () => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    render(<Probe onResult={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId("video").getAttribute("data-status")).toBe("unavailable"),
    );
  });

  it("reports 'denied' when permission is refused", async () => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" })),
      configurable: true,
      writable: true,
    });
    render(<Probe onResult={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId("video").getAttribute("data-status")).toBe("denied"),
    );
  });

  it("stops every track and clears srcObject on unmount", async () => {
    const stopSpies = [vi.fn(), vi.fn()];
    const stream = new MediaStream();
    vi.spyOn(stream, "getTracks").mockReturnValue(
      stopSpies.map((stop) => ({ stop }) as unknown as MediaStreamTrack),
    );
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: vi.fn().mockResolvedValue(stream),
      configurable: true,
      writable: true,
    });

    const { unmount } = render(<Probe onResult={vi.fn()} />);
    const video = screen.getByTestId("video") as HTMLVideoElement;
    video.play = vi.fn().mockResolvedValue(undefined);
    await waitFor(() => expect(video.getAttribute("data-status")).toBe("scanning"));
    expect(video.srcObject).toBe(stream);

    unmount();
    for (const stop of stopSpies) expect(stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it("calls onResult exactly once with the trimmed key from a decoded frame", async () => {
    const raster = rasterizeValue(FIXTURE);
    const image = new ImageData(raster.data, raster.width, raster.height);

    // A real MediaStream so `video.srcObject = stream` is accepted by the browser.
    const stream = new MediaStream();
    vi.spyOn(stream, "getTracks").mockReturnValue([
      { stop: vi.fn() } as unknown as MediaStreamTrack,
    ]);
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: vi.fn().mockResolvedValue(stream),
      configurable: true,
      writable: true,
    });
    // The hook draws the <video> frame to an offscreen canvas; return the rasterized QR from it.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => image,
    } as unknown as CanvasRenderingContext2D);

    const onResult = vi.fn();
    render(<Probe onResult={onResult} />);
    const video = screen.getByTestId("video") as HTMLVideoElement;
    video.play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, "readyState", { configurable: true, get: () => 2 });
    Object.defineProperty(video, "videoWidth", { configurable: true, get: () => raster.width });
    Object.defineProperty(video, "videoHeight", { configurable: true, get: () => raster.height });

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(FIXTURE));
    // Give the RAF loop a chance to (not) fire again — it must be latched off.
    await new Promise((r) => setTimeout(r, 50));
    expect(onResult).toHaveBeenCalledTimes(1);
  });
});
