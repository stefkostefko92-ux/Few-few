import React from "react";
import { createRoot } from "react-dom/client";
import AdminApp from "./AdminPanel.jsx";

// /admin/ — самостоятелна страница със собствен малък бъндъл (React + панела), без кода на сайта.
createRoot(document.getElementById("admin-root")).render(<AdminApp />);
