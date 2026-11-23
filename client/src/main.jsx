import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.css";
import "./launch.css";
import App from "./App";
import LaunchSequence from "./components/launch/LaunchSequence";

function Root() {
  const [showLaunch, setShowLaunch] = useState(true);
  const [appEntering, setAppEntering] = useState(false);

  // The entrance class is temporary: once the stagger has finished it is
  // removed so later navigation inside the app stays completely calm.
  useEffect(() => {
    if (!appEntering) return undefined;
    const timer = window.setTimeout(() => setAppEntering(false), 1800);
    return () => window.clearTimeout(timer);
  }, [appEntering]);

  return (
    <>
      <App entering={appEntering} />
      {showLaunch && (
        <LaunchSequence
          onExitStart={() => setAppEntering(true)}
          onComplete={() => setShowLaunch(false)}
        />
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
