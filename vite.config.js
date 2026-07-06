import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: './' uses relative asset paths so the build works whether it's
// served from a domain root (Vercel/Netlify) or a subpath
// (https://username.github.io/repo-name/) without extra configuration.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
