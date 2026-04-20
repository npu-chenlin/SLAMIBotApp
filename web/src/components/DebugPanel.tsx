import React from "react";
import "./DebugPanel.css";

interface DebugInfo {
  fps: number;
  pointCount: number;
  pointsLength: number;
  isWorkerSupported: boolean;
  isWorkerLoaded: boolean;
  decodedWith: string;
  cameraPosition: {
    x: number;
    y: number;
    z: number;
  };
  controlsTarget: {
    x: number;
    y: number;
    z: number;
  };
  pose: {
    x: number;
    y: number;
    z: number;
  };
}

interface DebugPanelProps {
  debugInfo: DebugInfo;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ debugInfo }) => {
  return (
    <div className="debug-panel">
      <h3>Debug Information</h3>
      <div className="debug-section">
        <h4>Performance</h4>
        <p>FPS: {debugInfo.fps.toFixed(1)}</p>
        <p>Points: {debugInfo.pointCount}</p>
        <p>validPointsLength: {debugInfo.pointsLength}</p>
        <p>isWorkerSupported: {debugInfo.isWorkerSupported ? "Yes" : "No"}</p>
        <p>isWorkerLoaded: {debugInfo.isWorkerLoaded ? "Yes" : "No"}</p>
        <p>decodedWith: {debugInfo.decodedWith}</p>
      </div>
      <div className="debug-section">
        <h4>Camera</h4>
        <p>Position:</p>
        <ul>
          <li>X: {debugInfo.cameraPosition.x.toFixed(2)}</li>
          <li>Y: {debugInfo.cameraPosition.y.toFixed(2)}</li>
          <li>Z: {debugInfo.cameraPosition.z.toFixed(2)}</li>
        </ul>
      </div>
      <div className="debug-section">
        <h4>Controls Target</h4>
        <ul>
          <li>X: {debugInfo.controlsTarget.x.toFixed(2)}</li>
          <li>Y: {debugInfo.controlsTarget.y.toFixed(2)}</li>
          <li>Z: {debugInfo.controlsTarget.z.toFixed(2)}</li>
        </ul>
      </div>
      <div className="debug-section">
        <h4>Pose</h4>
        <ul>
          <li>X: {debugInfo.pose.x.toFixed(2)}</li>
          <li>Y: {debugInfo.pose.y.toFixed(2)}</li>
          <li>Z: {debugInfo.pose.z.toFixed(2)}</li>
        </ul>
      </div>
    </div>
  );
};

export default DebugPanel;
