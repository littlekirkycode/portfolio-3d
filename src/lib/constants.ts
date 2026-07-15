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

/** Case-study narrative for the DOM dossier overlay (finding 43). */
export type ProjectDossier = {
  /** What was broken / why the product needed to exist. */
  problem: string;
  /** What was engineered — architecture, stack, the hard parts. */
  build: string;
  /** What happened — traction, metrics, lessons. */
  outcome: string;
  /** Overlay screenshots; defaults to [image, ...gallery] when omitted. */
  shots?: string[];
};

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
  /** Problem / build / outcome case study — powers the "OPEN DOSSIER" overlay. */
  dossier?: ProjectDossier;
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
    // DRAFT copy — James to review/rewrite
    dossier: {
      problem:
        "Most fitness apps assume you're already motivated — they track workouts but do nothing to make you want the next one, so people quit the gym and the app in the same week.",
      build:
        "Solo-built end to end: a Flutter client with a full game layer (quests, XP, levels, streaks) over the workout tracker, backed by a C#/.NET API on Azure. Designed the progression economy, the content pipeline, and the growth loop — 72K TikTok followers drove install spikes the backend had to absorb.",
      outcome:
        "1.3M+ downloads and 100K daily active users, bootstrapped with zero paid acquisition, featured by TechTudo. The game layer is the retention engine: the workout became the thing users log in to finish.",
    },
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
    // DRAFT copy — James to review/rewrite
    dossier: {
      problem:
        "AI assistants forget you between sessions. A life OS only works if the assistant actually knows your life — goals, habits, history — and can act on it, not just chat about it.",
      build:
        "React Native app around an agentic AI core: retrieval-augmented memory over the user's own data in Supabase, OpenAI models orchestrated with tool-calling, and token-level streaming so the concierge answers in real time instead of in paragraphs-later.",
      outcome:
        "A working agentic life OS — the assistant plans, remembers, and follows up across sessions. The RAG-memory + streaming architecture became the template reused for Nuremi's mapped concierge.",
    },
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
    // DRAFT copy — James to review/rewrite
    dossier: {
      problem:
        "Breaking a habit fails in private: willpower apps relapse with the user because nothing outside the phone holds them accountable — and most quietly assume a permanent network connection.",
      build:
        "Native SwiftUI app, offline-first by design: local persistence is the source of truth, syncing to Supabase when a connection returns. Social accountability is the core mechanic — group challenges, shared streaks, and check-ins with the people who keep you honest.",
      outcome:
        "Shipped on iOS as the third product in the Self platform. The offline-first sync model means a moment of weakness is always captured — a log never waits on a network.",
    },
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
    // DRAFT copy — James to review/rewrite (no screenshots yet — poster project)
    dossier: {
      problem:
        "Recommendation apps answer \"what's good?\" with a list. The real question is spatial: what's good near me, right now, for what I'm actually trying to do?",
      build:
        "As lead engineer & consultant: a React Native concierge fusing an AI assistant with a live interactive map — Supabase geo queries feeding an agentic layer that turns \"find me a quiet café for a meeting\" into pins on the world around you.",
      outcome:
        "Delivered as a consulting engagement (2025–2026). Proved the SelfAware memory/streaming stack out in a second product, this time anchored to place instead of habit.",
    },
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
    // DRAFT copy — James to review/rewrite (no screenshots yet — poster project)
    dossier: {
      problem:
        "Jewellery sells on feel, and most storefront templates bury it under clutter. The brief: an editorial storefront that loads fast and lets the pieces breathe.",
      build:
        "A concept storefront for the web — editorial layout, restrained type, and a performance budget that keeps the imagery the star. Built plain and fast, deployed on Vercel.",
      outcome:
        "Live at xuabelle.vercel.app — the range proof: the same engineer who ships consumer mobile apps at scale can deliver polished, editorial web.",
    },
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
  { role: "Founders University", org: "Accelerator · $25K offer", dates: "2024 — 2025" },
  { role: "Full-Stack Engineer", org: "Siemens", dates: "2022 — 2024" },
  { role: "Apprentice Engineer", org: "J2 Innovations", dates: "2021 — 2022" },
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
