import { defineConfig } from "vite"

export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["@realiz3r/react-phaser"],
  },
  server: {
    host: true,
    port: 5174,
  },
})
