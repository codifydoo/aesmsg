import { useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, Icon, PageDots } from "@/src/components";
import { colors, radii, space, type as typo } from "@/src/theme";
import {
  clampSlideIndex,
  isLastSlide,
  nextSlide,
  WELCOME_CHANNELS,
  WELCOME_SLIDES,
} from "./carousel";

// Screen 2 — Welcome Carousel (design: grp-onboarding.jsx S_Welcome).
//
// The design ships a single slide ("Share through any app" + the ciphertext-only body + channel
// chips + PageDots showing 3 dots). Per the build brief this becomes a 3-slide horizontal carousel
// (the framing slides live in ./carousel) with a Skip affordance. On the final slide the primary CTA
// fires onGetStarted (→ identity creation); "Restore from backup" fires onRestore from every slide.
//
// PRESENTATIONAL: it only drives local slide state + the two hand-off callbacks. No data, no nav dep.

export interface WelcomeCarouselScreenProps {
  /** Final-slide CTA → hand off to identity creation (Create Identity / GateScreens). */
  onGetStarted: () => void;
  /** "Restore from backup" link → Import Backup (screen 8). */
  onRestore: () => void;
  /** Optional Skip affordance → jump straight to identity creation. Falls back to onGetStarted. */
  onSkip?: () => void;
}

const COUNT = WELCOME_SLIDES.length;

export function WelcomeCarouselScreen({
  onGetStarted,
  onRestore,
  onSkip,
}: WelcomeCarouselScreenProps) {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const next = clampSlideIndex(e.nativeEvent.contentOffset.x / width, COUNT);
    setIndex(next);
  };

  const goTo = (i: number) => {
    const target = clampSlideIndex(i, COUNT);
    setIndex(target);
    scrollRef.current?.scrollTo({ x: target * width, animated: true });
  };

  const last = isLastSlide(index, COUNT);
  const onPrimary = () => {
    if (last) onGetStarted();
    else goTo(nextSlide(index, COUNT));
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onSkip ?? onGetStarted}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          hitSlop={10}
        >
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={onLayout}
        onMomentumScrollEnd={onMomentumEnd}
        style={styles.pager}
      >
        {WELCOME_SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, width > 0 && { width }]}>
            <View style={styles.illoWrap}>
              <View
                style={styles.illoTile}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                <Icon name={slide.icon} size={64} color={colors.primary} />
              </View>
            </View>

            <View style={styles.copy}>
              <Text style={styles.title} accessibilityRole="header">
                {slide.title}
              </Text>
              <Text style={styles.body}>{slide.body}</Text>

              <View style={styles.chips}>
                {WELCOME_CHANNELS.map((channel) => (
                  <View key={channel} style={styles.channelChip}>
                    <Text style={styles.channelText}>{channel}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        <PageDots count={COUNT} active={index} />
      </View>

      <View style={styles.footer}>
        <Button onPress={onPrimary}>{last ? "Get started" : "Next"}</Button>
        <Pressable
          onPress={onRestore}
          accessibilityRole="button"
          accessibilityLabel="Restore from backup"
          hitSlop={8}
        >
          <Text style={styles.restore}>Restore from backup</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Default export kept for parity with the single-screen flows (e.g. CreateFlow).
export default WelcomeCarouselScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingTop: 12 },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 22,
    paddingVertical: space.xs,
  },
  skip: { ...typo.body, color: colors.onSurfaceVariant },
  pager: { flex: 1 },
  slide: { flex: 1, paddingHorizontal: 22, justifyContent: "space-between" },
  illoWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  illoTile: {
    width: 150,
    height: 150,
    borderRadius: 32,
    backgroundColor: "rgba(207,188,255,0.10)",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { gap: 14, paddingBottom: 8 },
  title: { ...typo.h1, color: colors.onSurface },
  body: { ...typo.bodyLg, color: colors.onSurfaceVariant },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  channelChip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  channelText: { fontSize: 13, fontWeight: "500", color: colors.onSurface },
  dots: { alignItems: "center", marginVertical: 18 },
  footer: { paddingHorizontal: 22, paddingBottom: 8, gap: 14 },
  restore: { textAlign: "center", color: colors.primary, fontSize: 15, fontWeight: "500" },
});
