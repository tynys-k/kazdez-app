import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Метка сборки. Нужна, чтобы по экрану было видно, какой именно код открыт
// у человека: иначе невозможно отличить «не работает» от «браузер держит
// старую версию из кэша», и починка уходит в гадание.
function buildStamp() {
  try {
    const sha = execSync("git rev-parse --short HEAD").toString().trim();
    return `${sha} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  } catch {
    return new Date().toISOString().slice(0, 16).replace("T", " ");
  }
}

export default defineConfig({
  plugins: [react()],
  // Индексируем только настоящую точку входа: не даём сканеру зависимостей
  // цепляться за graphify-out/graph.html и прочие сгенерированные HTML.
  optimizeDeps: { entries: ["index.html"] },
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp()) },
});
