This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Analytics (PostHog — off by default)

Analytics compile to a no-op unless a key is present at build time:
`src/lib/analytics.ts` only loads `posthog-js` (dynamic import — the chunk is
never fetched otherwise) when `NEXT_PUBLIC_POSTHOG_KEY` is non-empty, and
never for visitors with Do Not Track enabled. With no key set — the default —
there are zero analytics network calls.

To enable:

1. Create a [PostHog](https://posthog.com) project and copy its API key.
2. Add the key as a repository secret (e.g. `POSTHOG_KEY`), then pass it to the
   build job in `.github/workflows/deploy.yml`:

   ```yaml
   jobs:
     build:
       env:
         NEXT_PUBLIC_BASE_PATH: /portfolio-3d
         NEXT_PUBLIC_POSTHOG_KEY: ${{ secrets.POSTHOG_KEY }}
         # optional — defaults to https://us.i.posthog.com
         # NEXT_PUBLIC_POSTHOG_HOST: https://eu.i.posthog.com
   ```

   (Locally: `NEXT_PUBLIC_POSTHOG_KEY=phc_... npm run dev`.)

Tracked events: `bay_focused` (room id + dwell ms, on leaving a bay),
`max_progress` (furthest corridor progress, beaconed on page hide),
`project_link_clicked`, `dossier_opened`, plus `depart_pressed` /
`sound_toggled` / `drone_poked` via the exported `track()` API.

## Asset credits

- Corridor kit + props: [Kenney](https://kenney.nl) (CC0) and [Quaternius](https://quaternius.com) (CC0), incl. the UNIT-07 escort bot ("Robot Enemy Flying", Ultimate Space Kit).
- Round-two signature props (radar, crown, spaceship, mainframe, arrow sign): Quaternius (CC0), via [poly.pizza](https://poly.pizza).
- Gym fit-out set (CC-BY 3.0, via poly.pizza): ["Punching bag"](https://poly.pizza/m/aODw_lbKxQP) by Poly by Google, ["Exercise Bike"](https://poly.pizza/m/9DwoznfSPHY) by Dave Edwards, ["Barbell"](https://poly.pizza/m/AX5jGlJZlk) and ["Bench"](https://poly.pizza/m/BpjfpavGY8) by Zsky.
- Spacewalking pilot: ["Astronaut" by PW Wu](https://poly.pizza/m/erlAEWfFKH3) (CC-BY 3.0), via poly.pizza.
