import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    // split big vendor libs into their own cached chunks (the app bundle was a single ~1 MB file)
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          charts: ["recharts"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
