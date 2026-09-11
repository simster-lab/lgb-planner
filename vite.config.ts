import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function buildStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildStamp()),
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/mqtt": { target: "http://127.0.0.1:8080", ws: true },
    },
  },
});
