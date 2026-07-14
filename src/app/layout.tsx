import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Hanken_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import SceneCanvas from "@/components/canvas/SceneCanvas";
import Grain from "@/components/ui/Grain";
import Nav from "@/components/ui/Nav";
import ProgressBar from "@/components/ui/ProgressBar";
import ProjectLink from "@/components/ui/ProjectLink";
import MobileStops from "@/components/ui/MobileStops";
import Cursor from "@/components/ui/Cursor";
import PreloadResources from "./preload-resources";
import { SITE } from "@/lib/constants";

const display = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--ff-display",
  display: "swap",
});

const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--ff-body",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--ff-mono",
  display: "swap",
});

const TITLE = `${SITE.name} — ${SITE.role}`;

export const metadata: Metadata = {
  /**
   * Deployed under the GitHub Pages project subpath — metadataBase includes
   * /portfolio-3d/ so every relative URL field below composes against it
   * (supported per the shipped generate-metadata doc: "metadataBase can
   * contain a subdomain ... or base path").
   */
  metadataBase: new URL("https://littlekirkycode.github.io/portfolio-3d/"),
  title: TITLE,
  description: SITE.tagline,
  alternates: { canonical: "./" },
  openGraph: {
    title: TITLE,
    description: SITE.tagline,
    url: "./",
    siteName: SITE.name,
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: `${SITE.name} — 3D spaceship-corridor portfolio. Closed airlock with the KIRKHAM·01 stencil and hero name card.`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE.tagline,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07070a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="bg-bg text-ink font-body antialiased">
        {/* Head preload hints for the p=0-critical shell assets (SSR'd into <head>) */}
        <PreloadResources />
        {/* Full 3D scrolling scene — fixed behind everything (desktop + mobile) */}
        <SceneCanvas />
        {/* Nav precedes the content so keyboard tab order starts at the
            navigation (WCAG 2.4.3); it is position:fixed, so visual layout
            is unchanged. */}
        <Nav />
        {children}
        <ProgressBar />
        <ProjectLink />
        <MobileStops />
        <Grain />
        <Cursor />
      </body>
    </html>
  );
}
