import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BouncerScreen } from "@/src/bouncer/BouncerScreen";

describe("<BouncerScreen />", () => {
  it("renders an 'Open in app' anchor with the aesmsg:// deep link for a valid id", () => {
    const id = "abcdefghijkl0123";
    render(<BouncerScreen id={id} />);

    const openLink = screen.getByRole("link", { name: /open in app/i });
    expect(openLink).toHaveAttribute("href", `aesmsg://l/${id}`);
  });

  it("renders an 'Open in browser' anchor to app.aesmsg.com/l/<id> for a valid id", () => {
    const id = "abcdefghijkl0123";
    render(<BouncerScreen id={id} />);

    const browserLink = screen.getByRole("link", { name: /open in browser/i });
    expect(browserLink).toHaveAttribute("href", `https://app.aesmsg.com/l/${id}`);
  });

  it("renders no 'Open in app' or 'Open in browser' anchor for an invalid id but still shows store links + heading", () => {
    render(<BouncerScreen id="nope" />);

    expect(screen.queryByRole("link", { name: /open in app/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /open in browser/i })).toBeNull();
    expect(screen.getByRole("link", { name: /download for ios/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download for android/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /open this secure link in aesmsg/i }),
    ).toBeInTheDocument();
  });

  it("performs zero network requests on mount while still offering the browser link (§10)", async () => {
    const id = "abcdefghijkl0123";

    // Instrument every exfil channel BEFORE render. The bouncer's only mount side effect assigns
    // window.location.href to the aesmsg:// custom scheme — a scheme navigation, not a network call —
    // so none of these spies should fire.
    const fetchSpy = vi.fn();
    const xhrOpenSpy = vi.fn();
    const xhrSendSpy = vi.fn();
    const beaconSpy = vi.fn();
    // Image + EventSource are silent exfil channels a preview bot could abuse; instrument them too so
    // this test's zero-network guarantee matches the webapp reader test's coverage.
    const imageCtor = vi.fn();
    const eventSourceCtor = vi.fn();

    const originalFetch = window.fetch;
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;
    const originalBeacon = navigator.sendBeacon;
    const originalImage = window.Image;
    const originalEventSource = window.EventSource;

    window.fetch = fetchSpy as unknown as typeof window.fetch;
    XMLHttpRequest.prototype.open = xhrOpenSpy as unknown as typeof XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.send = xhrSendSpy as unknown as typeof XMLHttpRequest.prototype.send;
    navigator.sendBeacon = beaconSpy as unknown as typeof navigator.sendBeacon;
    window.Image = imageCtor as unknown as typeof window.Image;
    window.EventSource = eventSourceCtor as unknown as typeof window.EventSource;

    try {
      render(<BouncerScreen id={id} />);
      // Let mount effects settle before asserting zero network.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(xhrOpenSpy).not.toHaveBeenCalled();
      expect(xhrSendSpy).not.toHaveBeenCalled();
      expect(beaconSpy).not.toHaveBeenCalled();
      expect(imageCtor).not.toHaveBeenCalled();
      expect(eventSourceCtor).not.toHaveBeenCalled();

      const browserLink = screen.getByRole("link", { name: /open in browser/i });
      expect(browserLink).toHaveAttribute("href", `https://app.aesmsg.com/l/${id}`);
    } finally {
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalXhrOpen;
      XMLHttpRequest.prototype.send = originalXhrSend;
      navigator.sendBeacon = originalBeacon;
      window.Image = originalImage;
      window.EventSource = originalEventSource;
    }
  });
});
