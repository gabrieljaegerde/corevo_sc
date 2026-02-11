import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Hash-based routing for IPFS compatibility
  base: "./",
});
