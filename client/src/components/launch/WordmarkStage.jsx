import React from "react";
import LaunchBrand from "./LaunchBrand";

export default function WordmarkStage({ zooming = false }) {
  return (
    <div className={`launch-stage launch-wordmark-stage${zooming ? " is-zooming" : ""}`}>
      <LaunchBrand zooming={zooming} />
    </div>
  );
}
