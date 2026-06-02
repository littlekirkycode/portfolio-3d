import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Hanken_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import SceneCanvas from "@/components/canvas/SceneCanvas";
import Grain from "@/components/ui/Grain";
import Nav from "@/components/ui/Nav";
import ProgressBar from "@/components/ui/ProgressBar";
import ProjectLink from "@/components/ui/ProjectLink";
import Cursor from "@/components/ui/Cursor";
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

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.role}`,
  description: SITE.tagline,
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
        {/* Full 3D scrolling scene — fixed behind everything (desktop + mobile) */}
        <SceneCanvas />
        {children}
        <Nav />
        <ProgressBar />
        <ProjectLink />
        <Grain />
        <Cursor />
      </body>
    </html>
  );
}
