import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Индексируем только настоящую точку входа: не даём сканеру зависимостей
  // цепляться за graphify-out/graph.html и прочие сгенерированные HTML.
  optimizeDeps: { entries: ["index.html"] },
});
