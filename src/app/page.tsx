import SmoothScrollProvider from "@/components/providers/SmoothScrollProvider";
import Hero from "@/components/sections/Hero";
import Work from "@/components/sections/Work";
import Contact from "@/components/sections/Contact";
import DeepLink from "@/lib/useDeepLink";

export default function Home() {
  return (
    <main>
      <SmoothScrollProvider>
        <Hero />
        <Work />
        <Contact />
      </SmoothScrollProvider>
      {/* Hash deep links: inbound #<bay-id> jump + outbound focused-bay hash.
          Renders nothing; sits after the provider so its effects run once the
          scroll engine is wired. */}
      <DeepLink />
    </main>
  );
}
