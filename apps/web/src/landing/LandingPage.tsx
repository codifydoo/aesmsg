"use client";

import { Bento } from "./Bento";
import { ClosingCTA } from "./ClosingCTA";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { Process } from "./Process";
import { Trust } from "./Trust";

export function LandingPage() {
  return (
    <div className="landing-root min-h-dvh">
      <Header />
      <main>
        <Hero />
        <Process />
        <Bento />
        <Trust />
        <ClosingCTA />
      </main>
      <Footer />
    </div>
  );
}
