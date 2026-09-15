import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./ui/design-tokens.css";
import "./ui/primitives.css";
import "./ui/legacy-bridge.css";

createRoot(document.getElementById("root")).render(<App />);
