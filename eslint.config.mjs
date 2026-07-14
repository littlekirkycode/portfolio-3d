import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // src/components/canvas is the react-three-fiber render layer: refs here
    // hold plain THREE.js objects (Object3D, Material, Texture, drei's
    // `actions` from useAnimations, canvas 2D contexts) that are deliberately
    // mutated every frame inside useFrame — the standard, correct way to
    // drive an R3F scene without funnelling 60fps updates through React
    // state/reconciliation. eslint-plugin-react-hooks@7's `immutability` rule
    // is a React Compiler safety check: it assumes anything reachable from a
    // hook return value is React-owned and should never be mutated post
    // render, which is categorically false for this imperative rendering
    // pattern and fires on essentially every useFrame/useMemo callback in
    // this directory. Scoped off here only; left ON everywhere else (e.g.
    // src/components/ui) where a flagged ref mutation is plain React and the
    // rule is catching a real smell.
    files: ["src/components/canvas/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/immutability": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
