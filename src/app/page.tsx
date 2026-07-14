import SmoothScrollProvider from "@/components/providers/SmoothScrollProvider";
import Hero from "@/components/sections/Hero";
import Work from "@/components/sections/Work";
import Contact from "@/components/sections/Contact";

export default function Home() {
  return (
    <main>
      <SmoothScrollProvider>
        <Hero />
        <Work />
        <Contact />
      </SmoothScrollProvider>
    </main>
  );
}
