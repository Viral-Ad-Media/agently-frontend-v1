import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/*
 * The /admin and /blog path-to-fragment redirect that used to sit here is
 * gone: those are ordinary paths now that the app routes on real URLs.
 *
 * Legacy /#/… links from older emails and bookmarks are rewritten by the
 * deep-link-normalize script in index.html, which runs synchronously during
 * parsing — earlier than this module, and covered by test/deepLink.test.ts.
 */

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
