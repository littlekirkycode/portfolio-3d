"use client";

import ReactDOM from "react-dom";
import { withBase } from "@/lib/asset";

/**
 * Head preload hints for the assets that gate the very first visible frame
 * (p=0): the kit shell's wall/floor GLBs and their shared colormap texture.
 * Without these the models chain behind HTML → head JS → hydration → scene
 * chunk before a single byte moves.
 *
 * ReactDOM.preload() is the sanctioned App Router way to emit
 * <link rel="preload"> (see node_modules/next/dist/docs/.../generate-metadata.md
 * "Resource hints" — the Metadata API doesn't support preload directly).
 * Client components are still SSR'd on initial load, so these land in the
 * exported static <head>.
 *
 * crossOrigin "anonymous" on all three matches three.js' CORS fetch mode
 * (FileLoader / ImageBitmapLoader default to anonymous credentials) — without
 * it the browser treats the preloaded response as a different cache entry and
 * downloads twice.
 *
 * All three are as:"fetch" — INCLUDING colormap.png (R15). GLTFLoader loads
 * external GLB textures through THREE.ImageBitmapLoader on Chromium/modern
 * Firefox, which is a plain fetch() (request destination "", credentials
 * same-origin) — an as:"image" preload registers destination "image" and can
 * NEVER match it, so the texture downloaded twice and the console warned
 * 'preloaded but not used'. (Safari falls back to TextureLoader/<img> and
 * won't consume this preload — acceptable: the majority path is warm.)
 */
export default function PreloadResources() {
  ReactDOM.preload(withBase("/models/kit-wall.glb"), {
    as: "fetch",
    crossOrigin: "anonymous",
  });
  ReactDOM.preload(withBase("/models/kit-floor.glb"), {
    as: "fetch",
    crossOrigin: "anonymous",
  });
  ReactDOM.preload(withBase("/models/Textures/colormap.png"), {
    as: "fetch",
    crossOrigin: "anonymous",
  });
  return null;
}
