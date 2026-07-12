import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendUrl = process.env.VITE_BACKEND_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  base: process.env.VITE_STATIC_DEMO === "true" ? "/grant-dashboard/" : "/",
  plugins: [react()],
  server: {
    proxy: {
      "/api": backendUrl,
    },
  },
});
