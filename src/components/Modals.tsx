import React, { useEffect, useState } from 'react';
import { AutoDesignConfig, FtthProject, ProjectSettings } from '../types/ftth';
import { PdfPrintOptions } from '../utils/exportUtils';
import { Trash2, X } from 'lucide-react';

interface AutoDesignModalProps {
  open: boolean;
  darkMode: boolean;
  onClose: () => void;
  onGenerate: (config: AutoDesignConfig, replaceExisting: boolean) => void;
}

export const AutoDesignModal: React.FC<AutoDesignModalProps> = ({
  open,
  darkMode,
  onClose,
  onGenerate,
}) => {
  const [config, setConfig] = useState<AutoDesignConfig>({
    architecture: 'centralized',
    totalCustomers: 16,
    oltCount: 1,
    ponPortCount: 4,
    primarySplitterRatio: '1:8',
    secondarySplitterRatio: '1:4',
    feederCableCapacity: 48,
    distributionCableCapacity: 12,
    distributionPointsCount: 4,
    technology: 'GPON',
    avgFeederLengthM: 2200,
    avgDistributionLengthM: 450,
    avgDropLengthM: 120,
    includeCivilMarkers: true,
  });
  const [replaceExisting, setReplaceExisting] = useState(true);

  if (!open) return null;

  const modalBg = darkMode ? 'bg-[#121824] border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const inputCls = `w-full px-2.5 py-1.5 rounded border text-xs font-mono-tabular ${
    darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
  }`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className={`w-full max-w-xl rounded-lg border shadow-2xl ${modalBg}`}>
        <div className="px-4 py-3 border-b border-inherit flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Automatic FTTH Network Designer</h2>
            <p className="text-[11px] text-slate-400">
              Generate OLT, ODF, Feeder, Splitters, FAT/FDB, and Subscriber ONUs automatically
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800/40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Network Architecture</span>
              <select
                value={config.architecture}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    architecture: e.target.value as AutoDesignConfig['architecture'],
                  })
                }
                className={inputCls}
              >
                <option value="centralized">Centralized Splitting</option>
                <option value="distributed">Distributed Splitting</option>
                <option value="cascaded">Cascaded Splitting (2-Stage)</option>
                <option value="single_stage">Single-Stage Direct Splitting</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">PON Technology</span>
              <select
                value={config.technology}
                onChange={(e) =>
                  setConfig({ ...config, technology: e.target.value as 'GPON' | 'XGS-PON' })
                }
                className={inputCls}
              >
                <option value="GPON">GPON (1490/1310 nm)</option>
                <option value="XGS-PON">XGS-PON (1577/1270 nm)</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Total Customers</span>
              <input
                type="number"
                min={1}
                max={128}
                value={config.totalCustomers}
                onChange={(e) => setConfig({ ...config, totalCustomers: Number(e.target.value) || 1 })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Number of OLTs</span>
              <input
                type="number"
                min={1}
                max={4}
                value={config.oltCount}
                onChange={(e) => setConfig({ ...config, oltCount: Number(e.target.value) || 1 })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">PON Ports / OLT</span>
              <input
                type="number"
                min={1}
                max={16}
                value={config.ponPortCount}
                onChange={(e) => setConfig({ ...config, ponPortCount: Number(e.target.value) || 1 })}
                className={inputCls}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Primary Splitter</span>
              <select
                value={config.primarySplitterRatio}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    primarySplitterRatio: e.target.value as AutoDesignConfig['primarySplitterRatio'],
                  })
                }
                className={inputCls}
              >
                {(['1:2', '1:4', '1:8', '1:16', '1:32', '1:64'] as const).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">
                Secondary Splitter {config.architecture !== 'cascaded' && '(Cascaded)'}
              </span>
              <select
                disabled={config.architecture !== 'cascaded'}
                value={config.secondarySplitterRatio}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    secondarySplitterRatio: e.target.value as AutoDesignConfig['secondarySplitterRatio'],
                  })
                }
                className={inputCls}
              >
                {(['1:4', '1:8', '1:16'] as const).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Distribution Points (FAT)</span>
              <input
                type="number"
                min={1}
                max={32}
                value={config.distributionPointsCount}
                onChange={(e) =>
                  setConfig({ ...config, distributionPointsCount: Number(e.target.value) || 1 })
                }
                className={inputCls}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Feeder Cable Capacity</span>
              <select
                value={config.feederCableCapacity}
                onChange={(e) =>
                  setConfig({ ...config, feederCableCapacity: Number(e.target.value) })
                }
                className={inputCls}
              >
                {[12, 24, 48, 96, 144, 288].map((n) => (
                  <option key={n} value={n}>
                    {n} Fibers
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Distribution Capacity</span>
              <select
                value={config.distributionCableCapacity}
                onChange={(e) =>
                  setConfig({ ...config, distributionCableCapacity: Number(e.target.value) })
                }
                className={inputCls}
              >
                {[4, 6, 12, 24, 48].map((n) => (
                  <option key={n} value={n}>
                    {n} Fibers
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Avg Feeder (m)</span>
              <input
                type="number"
                min={10}
                value={config.avgFeederLengthM}
                onChange={(e) =>
                  setConfig({ ...config, avgFeederLengthM: Number(e.target.value) || 500 })
                }
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Avg Distribution (m)</span>
              <input
                type="number"
                min={10}
                value={config.avgDistributionLengthM}
                onChange={(e) =>
                  setConfig({ ...config, avgDistributionLengthM: Number(e.target.value) || 200 })
                }
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Avg Drop (m)</span>
              <input
                type="number"
                min={5}
                value={config.avgDropLengthM}
                onChange={(e) =>
                  setConfig({ ...config, avgDropLengthM: Number(e.target.value) || 80 })
                }
                className={inputCls}
              />
            </label>
          </div>

          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.includeCivilMarkers}
                onChange={(e) => setConfig({ ...config, includeCivilMarkers: e.target.checked })}
              />
              <span>Include Civil Markers (Manholes / Cabinets)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              <span>Replace current drawing</span>
            </label>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-inherit flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-600/50 text-xs hover:bg-slate-800/40"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onGenerate(config, replaceExisting);
              onClose();
            }}
            className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
          >
            Generate Network Diagram
          </button>
        </div>
      </div>
    </div>
  );
};

interface PdfExportModalProps {
  open: boolean;
  darkMode: boolean;
  onClose: () => void;
  onExportPdf: (opts: PdfPrintOptions) => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportDxf: () => void;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  open,
  darkMode,
  onClose,
  onExportPdf,
  onExportSvg,
  onExportPng,
  onExportDxf,
}) => {
  const [opts, setOpts] = useState<PdfPrintOptions>({
    pageSize: 'a3',
    orientation: 'landscape',
    includeLegend: true,
    includeTitleBlock: true,
    includeOpticalTable: true,
  });

  if (!open) return null;

  const modalBg = darkMode ? 'bg-[#121824] border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const inputCls = `w-full px-2.5 py-1.5 rounded border text-xs ${
    darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
  }`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className={`w-full max-w-md rounded-lg border shadow-2xl ${modalBg}`}>
        <div className="px-4 py-3 border-b border-inherit flex items-center justify-between">
          <h2 className="text-sm font-bold">Print Layout & CAD Export</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800/40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Page Size</span>
              <select
                value={opts.pageSize}
                onChange={(e) => setOpts({ ...opts, pageSize: e.target.value as PdfPrintOptions['pageSize'] })}
                className={inputCls}
              >
                <option value="a3">ISO A3 (Engineering)</option>
                <option value="a4">ISO A4</option>
                <option value="letter">ANSI Letter</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Orientation</span>
              <select
                value={opts.orientation}
                onChange={(e) =>
                  setOpts({ ...opts, orientation: e.target.value as PdfPrintOptions['orientation'] })
                }
                className={inputCls}
              >
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={opts.includeTitleBlock}
                onChange={(e) => setOpts({ ...opts, includeTitleBlock: e.target.checked })}
              />
              <span>Include Engineering Title Block & Scale</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={opts.includeLegend}
                onChange={(e) => setOpts({ ...opts, includeLegend: e.target.checked })}
              />
              <span>Include Fiber Cable Color Legend</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={opts.includeOpticalTable}
                onChange={(e) => setOpts({ ...opts, includeOpticalTable: e.target.checked })}
              />
              <span>Append Optical Budget &amp; Port Config Schedule</span>
            </label>
          </div>

          <div className="pt-2 border-t border-inherit">
            <div className="text-[11px] text-slate-400 mb-2">Other CAD Export Formats</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  onExportSvg();
                  onClose();
                }}
                className="py-1.5 px-2 rounded border border-slate-600/50 hover:bg-slate-800/40"
              >
                Export SVG
              </button>
              <button
                onClick={() => {
                  onExportPng();
                  onClose();
                }}
                className="py-1.5 px-2 rounded border border-slate-600/50 hover:bg-slate-800/40"
              >
                Export PNG
              </button>
              <button
                onClick={() => {
                  onExportDxf();
                  onClose();
                }}
                className="py-1.5 px-2 rounded border border-slate-600/50 hover:bg-slate-800/40"
              >
                AutoCAD DXF
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-inherit flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-600/50 text-xs"
          >
            Close
          </button>
          <button
            onClick={() => {
              onExportPdf(opts);
              onClose();
            }}
            className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
          >
            Download PDF Sheet
          </button>
        </div>
      </div>
    </div>
  );
};

interface ProjectSettingsModalProps {
  open: boolean;
  darkMode: boolean;
  settings: ProjectSettings;
  onClose: () => void;
  onSave: (patch: Partial<ProjectSettings>) => void;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  open,
  darkMode,
  settings,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<ProjectSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings, open]);

  if (!open) return null;

  const modalBg = darkMode ? 'bg-[#121824] border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const inputCls = `w-full px-2.5 py-1.5 rounded border text-xs ${
    darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
  }`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className={`w-full max-w-lg rounded-lg border shadow-2xl ${modalBg}`}>
        <div className="px-4 py-3 border-b border-inherit flex items-center justify-between">
          <h2 className="text-sm font-bold">Project, Scale & Optical Standards</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800/40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Project Name</span>
              <input
                type="text"
                value={draft.projectName}
                onChange={(e) => setDraft({ ...draft, projectName: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Drawing Code</span>
              <input
                type="text"
                value={draft.projectCode}
                onChange={(e) => setDraft({ ...draft, projectCode: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Lead Engineer</span>
              <input
                type="text"
                value={draft.engineerName}
                onChange={(e) => setDraft({ ...draft, engineerName: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Client / Operator</span>
              <input
                type="text"
                value={draft.clientName}
                onChange={(e) => setDraft({ ...draft, clientName: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-1">Site / Location</span>
            <input
              type="text"
              value={draft.locationName}
              onChange={(e) => setDraft({ ...draft, locationName: e.target.value })}
              className={inputCls}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">
                Drawing Scale (meters / pixel)
              </span>
              <input
                type="number"
                step={0.1}
                min={0.05}
                value={draft.metersPerPixel}
                onChange={(e) =>
                  setDraft({ ...draft, metersPerPixel: Math.max(0.05, Number(e.target.value)) })
                }
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Grid Size (px)</span>
              <input
                type="number"
                step={5}
                min={10}
                max={100}
                value={draft.gridSizePx}
                onChange={(e) =>
                  setDraft({ ...draft, gridSizePx: Math.max(10, Number(e.target.value)) })
                }
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">
                Low Optical Margin Warning (dB)
              </span>
              <input
                type="number"
                step={0.5}
                value={draft.lowMarginThresholdDb}
                onChange={(e) =>
                  setDraft({ ...draft, lowMarginThresholdDb: Number(e.target.value) })
                }
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">
                Max Link Loss Budget (dB)
              </span>
              <input
                type="number"
                step={0.5}
                value={draft.maxBudgetLossDb}
                onChange={(e) => setDraft({ ...draft, maxBudgetLossDb: Number(e.target.value) })}
                className={inputCls}
              />
            </label>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-inherit flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-600/50 text-xs"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
};

interface SavedProjectsModalProps {
  open: boolean;
  darkMode: boolean;
  projects: Array<{ id: string; name: string; code: string; updatedAt: string; nodeCount: number }>;
  loading: boolean;
  onClose: () => void;
  onLoadProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
}

export const SavedProjectsModal: React.FC<SavedProjectsModalProps> = ({
  open,
  darkMode,
  projects,
  loading,
  onClose,
  onLoadProject,
  onDeleteProject,
}) => {
  if (!open) return null;
  const modalBg = darkMode ? 'bg-[#121824] border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className={`w-full max-w-lg rounded-lg border shadow-2xl ${modalBg}`}>
        <div className="px-4 py-3 border-b border-inherit flex items-center justify-between">
          <h2 className="text-sm font-bold">Saved FTTH Projects</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800/40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2 text-xs">
          {loading ? (
            <div className="py-8 text-center text-slate-400">Loading workspace drawings...</div>
          ) : projects.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              No saved drawings yet. Click "Save" in the toolbar to store your current network drawing.
            </div>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between p-2.5 rounded border ${
                  darkMode ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-[11px] font-mono-tabular text-slate-400">
                    {p.code} · {p.nodeCount} components · {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      onLoadProject(p.id);
                      onClose();
                    }}
                    className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => onDeleteProject(p.id)}
                    className="p-1.5 rounded text-rose-400 hover:bg-rose-500/15"
                    title="Delete project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
