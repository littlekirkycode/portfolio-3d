/** Site-wide content + config. Single source of truth — swap freely. */

export const BREAKPOINT_MOBILE = 768;

/** Drives the nav + progress chapter rail. Order matches the DOM panels. */
export const SECTIONS = [
  { id: "hero", label: "Intro" },
  { id: "work", label: "The Work" },
  { id: "contact", label: "Contact" },
] as const;

export const SITE = {
  name: "James Kirkham",
  role: "Founder & Full-Stack Engineer",
  email: "james.kirkham00@gmail.com",
  location: "Consumer apps · 0→millions",
  tagline:
    "I build and scale consumer apps from zero to millions of users — solo-founded, solo-built.",
  /** Boot/manifest line shown above the hero kicker (spaceship framing). */
  manifest: "VESSEL — KIRKHAM·01   //   CREW: 1   //   STATUS: ONLINE",
  /** Rotating hero taglines. */
  taglines: [
    "Solo-founded. Solo-built.",
    "Zero → millions of users.",
    "5 products shipped. 1 engineer.",
    "Consumer apps that scale.",
  ],
  stats: [
    { to: 1_300_000, value: "1.3M+", label: "Downloads" },
    { to: 100_000, value: "100K", label: "Daily Users" },
    { to: 72_000, value: "72K", label: "TikTok Followers" },
  ],
  socials: [
    { label: "GitHub", href: "https://github.com/littlekirkycode" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/james-kirkham-a965831b9/" },
  ],
} as const;

/** Visual theme of a room — drives the props placed inside the alcove. */
export type RoomTheme =
  | "gym"
  | "lifeos"
  | "habit"
  | "map"
  | "jewellery"
  | "skills"
  | "experience"
  | "defence"
  | "trophy";

export type Project = {
  id: string;
  index: string;
  title: string;
  year: string;
  category: string;
  description: string;
  tech: string[];
  /** Hex accent for the room's glow / poster gradient. */
  accent: string;
  /** Up to 2 traction chips shown floating beside the device. */
  metrics?: { value: string; label: string }[];
  href: string;
  /** "screen" = real screenshot under the CRT shader; "poster" = typographic card. */
  kind: "screen" | "poster";
  theme: RoomTheme;
  image?: string;
  /** Extra screenshots — the screen cycles through these as a slideshow. */
  gallery?: string[];
};

export const PROJECTS: Project[] = [
  {
    id: "selfquest",
    index: "01",
    title: "SelfQuest",
    year: "2024",
    category: "Gamified Fitness",
    description:
      "A gamified fitness tracker that turns workouts into a game. Solo-founded and solo-built to 1.3M+ downloads and 100K daily active users.",
    tech: ["Flutter", "C#", "Azure"],
    accent: "#ff5c38",
    metrics: [
      { value: "1.3M+", label: "Downloads" },
      { value: "100K", label: "Daily Users" },
    ],
    href: "https://selfquest.net",
    kind: "screen",
    theme: "gym",
    image: "/images/projects/selfquest.jpg",
    gallery: [
      "/images/projects/selfquest/gallery-1.jpg",
      "/images/projects/selfquest/gallery-2.jpg",
      "/images/projects/selfquest/gallery-3.jpg",
      "/images/projects/selfquest/gallery-4.jpg",
    ],
  },
  {
    id: "selfaware",
    index: "02",
    title: "SelfAware",
    year: "2025",
    category: "AI Life OS",
    description:
      "An AI-first concierge and life OS — agentic AI, retrieval-augmented memory, and real-time streaming.",
    tech: ["React Native", "Supabase", "OpenAI"],
    accent: "#4d6cfa",
    metrics: [{ value: "Agentic", label: "AI Life OS" }],
    href: "#",
    kind: "screen",
    theme: "lifeos",
    image: "/images/projects/selfaware.jpg",
    gallery: [
      "/images/projects/selfaware/gallery-1.jpg",
      "/images/projects/selfaware/gallery-2.jpg",
      "/images/projects/selfaware/gallery-3.jpg",
      "/images/projects/selfaware/gallery-4.jpg",
      "/images/projects/selfaware/gallery-5.jpg",
    ],
  },
  {
    id: "selfgrow",
    index: "03",
    title: "SelfGrow",
    year: "2025",
    category: "Habit-Breaking iOS",
    description:
      "An offline-first habit-breaking app with social accountability and group challenges.",
    tech: ["SwiftUI", "Supabase"],
    accent: "#37c98a",
    metrics: [{ value: "iOS", label: "SwiftUI · Offline" }],
    href: "#",
    kind: "screen",
    theme: "habit",
    image: "/images/projects/selfgrow.jpg",
    gallery: [
      "/images/projects/selfgrow/gallery-1.jpg",
      "/images/projects/selfgrow/gallery-2.jpg",
      "/images/projects/selfgrow/gallery-3.jpg",
      "/images/projects/selfgrow/gallery-4.jpg",
      "/images/projects/selfgrow/gallery-5.jpg",
    ],
  },
  {
    id: "nuremi",
    index: "04",
    title: "Nuremi",
    year: "2025",
    category: "AI Concierge · Maps",
    description:
      "An AI-powered concierge with an interactive, mapped view of the world around you.",
    tech: ["React Native", "Supabase"],
    accent: "#9d6bff",
    href: "#",
    kind: "poster",
    theme: "map",
  },
  {
    id: "xuabelle",
    index: "05",
    title: "Xuabelle",
    year: "2024",
    category: "Web · Concept",
    description: "A concept jewellery storefront — refined, editorial, and fast.",
    tech: ["Web"],
    accent: "#c2402a",
    href: "https://xuabelle.vercel.app/",
    kind: "poster",
    theme: "jewellery",
  },
];

/** Tech stack — shown in the Capabilities room (mirrors the live portfolio). */
export const SKILLS: { group: string; items: string[] }[] = [
  { group: "Mobile", items: ["Flutter", "Swift", "React Native", "Dart", "Kotlin"] },
  { group: "Backend · Data", items: ["C#", ".NET", "Azure", "Supabase", "SQL", "Node", "Python"] },
  { group: "Web", items: ["React", "Next.js", "TypeScript", "JavaScript"] },
  { group: "Tools", items: ["Git", "Docker", "AWS", "Vercel", "Firebase", "PostHog"] },
];

/** Work history — shown in the Experience room (from the live portfolio). */
export const EXPERIENCE: { role: string; org: string; dates: string }[] = [
  { role: "Product Engineer", org: "Allied · Defence Mfg.", dates: "2026 — Now" },
  { role: "Founder & Lead Engineer", org: "Self Platform", dates: "2024 — Now" },
  { role: "Lead Engineer & Consultant", org: "Nuremi", dates: "2025 — 2026" },
  { role: "Full-Stack Engineer", org: "Siemens", dates: "2022 — 2024" },
  { role: "Apprentice Engineer", org: "J2 Innovations", dates: "2021 — 2022" },
  { role: "Founders University", org: "Accelerator · $25K offer", dates: "2024 — 2025" },
];

/** Milestones — shown in the Achievements room. Edit freely. */
export const ACHIEVEMENTS: string[] = [
  "1.3M+ downloads",
  "100K daily active users",
  "Featured — TechTudo",
  "Founders Uni — $25K offer (2.5%)",
  "Solo-founded · solo-built",
];

/** Special (non-project) rooms appended after the projects. */
export const CAPABILITIES_ROOM = {
  index: "06",
  title: "Capabilities",
  category: "What I build with",
  accent: "#9aa0b5",
  theme: "skills" as RoomTheme,
};

export const EXPERIENCE_ROOM = {
  index: "07",
  title: "Experience",
  category: "Where I've worked",
  accent: "#6fae8f",
  theme: "experience" as RoomTheme,
};

export const ALLIED_ROOM = {
  index: "08",
  title: "Allied",
  category: "Product Engineer · Defence",
  accent: "#c98a2b",
  theme: "defence" as RoomTheme,
  description:
    "Product Engineer in defence manufacturing — taking hardware from spec to production. Precision tolerances, ruggedised systems, and design-for-manufacture on real metal: where software discipline meets the factory floor.",
};

export const ACHIEVEMENTS_ROOM = {
  index: "09",
  title: "Milestones",
  category: "Selected wins",
  accent: "#e9b949",
  theme: "trophy" as RoomTheme,
};
