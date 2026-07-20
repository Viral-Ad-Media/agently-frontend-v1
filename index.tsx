import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const directPath = window.location.pathname.replace(/\/+$/, "") || "/";
if (
  !window.location.hash &&
  (directPath === "/admin" ||
    directPath === "/blog" ||
    directPath.startsWith("/blog/"))
) {
  const next = `${window.location.origin}${window.location.pathname === "/" ? "" : "/"}#${directPath}${window.location.search || ""}`;
  window.location.replace(next);
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
