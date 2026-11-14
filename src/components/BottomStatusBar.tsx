import React from 'react';
import { FiberConnection, FtthNode, OpticalPathResult, ProjectSettings, WorkspaceMode } from '../types/ftth';

interface BottomStatusBarProps {
  cursorCoords: { x: number; y: number };
  settings: ProjectSettings;
  zoom: number;
  workspaceMode: WorkspaceMode;
  selectedNodes: FtthNode[];
  selectedConnection: FiberConnection | null;
  highlightedPath: OpticalPathResult | null;
  darkMode: boolean;
}

export const BottomStatusBar: React.FC<BottomStatusBarProps> = ({
  cursorCoords,
  settings,
  zoom,
  workspaceMode,
  selectedNodes,
  selectedConnection,
  highlightedPath,
  darkMode,
}) => {
  const barCls = darkMode
    ? 'bg-[#0F141E] border-slate-800 text-slate-400'
    : 'bg-white border-slate-200 text-slate-600';
  const valCls = darkMode ? 'text-slate-200' : 'text-slate-900';

  const selectedLabel =
    selectedConnection
      ? `${selectedConnection.cableId} (${selectedConnection.cableType}, ${selectedConnection.coreCapacity}F)`
      : selectedNodes.length === 1
      ? `${selectedNodes[0].code} — ${selectedNodes[0].name}`
      : selectedNodes.length > 1
      ? `${selectedNodes.length} objects selected`
      : 'None';

  const connectionStatus = highlightedPath
    ? `${highlightedPath.targetCode}: ${highlightedPath.status.replace('_', ' ').toUpperCase()} (${
        highlightedPath.receivedPowerDownDbm > -90
          ? `${highlightedPath.receivedPowerDownDbm.toFixed(1)} dBm`
          : 'No OLT Path'
      })`
    : 'Ready';

  const statusColor = !highlightedPath
    ? valCls
    : highlightedPath.status === 'normal'
    ? 'text-emerald-400'
    : highlightedPath.status === 'low_margin'
    ? 'text-amber-400'
    : 'text-rose-400';

  return (
    <footer className={`h-7 shrink-0 border-t px-3 flex items-center justify-between text-[11px] font-mono-tabular select-none ${barCls}`}>
      <div className="flex items-center gap-4">
        <span>
          XY:{' '}
          <strong className={`font-medium ${valCls}`}>
            {cursorCoords.x}, {cursorCoords.y}
          </strong>{' '}
          ({Math.round(cursorCoords.x * settings.metersPerPixel)}m,{' '}
          {Math.round(cursorCoords.y * settings.metersPerPixel)}m)
        </span>
        <span className="hidden sm:inline">
          Scale: <strong className={`font-medium ${valCls}`}>1px = {settings.metersPerPixel}m</strong>
        </span>
        <span>
          Zoom:{' '}
          <strong className={`font-medium ${valCls}`}>
            {workspaceMode === 'gis' ? 'GIS' : `${Math.round(zoom * 100)}%`}
          </strong>
        </span>
      </div>

      <div className="flex items-center gap-4 min-w-0">
        <span className="truncate max-w-[260px]">
          Selected: <strong className={`font-medium ${valCls}`}>{selectedLabel}</strong>
        </span>
        <span className={`truncate max-w-[300px] font-semibold ${statusColor}`}>
          {connectionStatus}
        </span>
      </div>
    </footer>
  );
};
