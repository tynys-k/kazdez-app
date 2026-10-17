import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./ui/design-tokens.css";
import "./ui/primitives.css";
import "./ui/legacy-bridge.css";

// Поле даты открывает календарь по клику в любом месте, а не только по
// маленькой иконке справа: иначе его принимают за поле ручного ввода.
document.addEventListener("click", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.disabled || input.readOnly) return;
  if (!["date", "datetime-local", "month", "time"].includes(input.type)) return;
  try { input.showPicker?.(); } catch { /* браузер не разрешил — остаётся обычный ввод */ }
});

createRoot(document.getElementById("root")).render(<App />);
