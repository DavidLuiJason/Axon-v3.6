import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Download,
  Share2,
  Maximize2,
  Check,
  ChevronRight,
  Sparkles,
  Layers,
  FileText,
  FileImage,
  RefreshCw,
  Eye,
  AlertCircle,
  Copy,
  CheckSquare,
  Square,
  Search,
  ExternalLink,
  CheckCircle2,
  FolderDown,
  Trash2,
  Play,
  Pause,
  XCircle,
  Activity,
  Gauge,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ScreenId } from '../../types';
import {
  discoverAvailableInterfaces,
  getAllInterfaces,
  InterfaceMetadata,
  getInterfaceById,
  getSafeInterfaceFileName,
} from '../../lib/interfaceRegistry';
import {
  captureLiveCurrentInterface,
  captureInterfaceById,
  captureLiveInterfaceWithPanels,
  captureInterfaceByIdWithPanels,
  captureAllInterfaces,
  captureMultipleInterfaces,
  stitchCanvasesVertically,
  exportCapturesToPdf,
  triggerCaptureDownload,
  CapturedInterfaceResult,
  MultiCaptureReport,
  GeneratedResultFile,
  buildResultFileFromCapture,
  buildResultFileFromPdf,
  buildResultFileFromStitched,
  buildFailureResultFile,
} from '../../lib/interfaceCaptureEngine';
import { captureJobManager } from '../../lib/interfaceCaptureJobManager';
import { CaptureJob } from '../../lib/captureTypes';

export const InterfaceCaptureScreen: React.FC = () => {
  const { currentScreen, showToast, requestConfirmation, previousScreen } = useApp();

  // Capture Configuration State
  const [captureScope, setCaptureScope] = useState<'current' | 'specific' | 'multiple' | 'all'>('current');
  const [selectedInterfaceId, setSelectedInterfaceId] = useState<string>('settings');
  const [selectedMultipleIds, setSelectedMultipleIds] = useState<string[]>(['axon', 'settings', 'tools']);
  const [captureType, setCaptureType] = useState<'visible' | 'full'>('full');
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'long_image' | 'pdf'>('png');
  const [forceRecapture, setForceRecapture] = useState<boolean>(false);

  // Execution & Progress State
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [activeJob, setActiveJob] = useState<CaptureJob | null>(() => captureJobManager.getActiveJob());
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number; interfaceName: string; percent: number } | null>(null);
  const [capturedResults, setCapturedResults] = useState<CapturedInterfaceResult[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedResultFile[]>([]);
  const [activePreviewFile, setActivePreviewFile] = useState<GeneratedResultFile | null>(null);
  const [multiReport, setMultiReport] = useState<MultiCaptureReport | null>(null);
  const [previewResult, setPreviewResult] = useState<CapturedInterfaceResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const resultsSectionRef = useRef<HTMLDivElement>(null);

  // Dynamic interface discovery
  const [availableInterfaces, setAvailableInterfaces] = useState<InterfaceMetadata[]>(() => getAllInterfaces());

  useEffect(() => {
    setAvailableInterfaces(discoverAvailableInterfaces());
  }, []);

  // Subscribe to background job manager so state survives navigation across screens
  useEffect(() => {
    const unsubscribe = captureJobManager.subscribe((job) => {
      setActiveJob({ ...job });
      setIsCapturing(job.status === 'running');

      const exportable = captureJobManager.getExportableCaptureResults();
      if (exportable.length > 0) {
        setCapturedResults(exportable);
        const files: GeneratedResultFile[] = [];
        for (const exp of exportable) {
          files.push(buildResultFileFromCapture(exp, exportFormat === 'jpeg' ? 'jpg' : 'png'));
          if (exp.panelResults && exp.panelResults.length > 0) {
            for (const panel of exp.panelResults) {
              files.push(buildResultFileFromCapture(panel, exportFormat === 'jpeg' ? 'jpg' : 'png'));
            }
          }
        }
        setGeneratedFiles(files);
      }
    });
    return () => unsubscribe();
  }, [exportFormat]);

  // Determine current screen name
  const currentMeta = getInterfaceById(previousScreen && previousScreen !== 'tool_interface_capture' ? previousScreen : currentScreen) || availableInterfaces[0];

  const handleToggleMultipleId = (id: string) => {
    setSelectedMultipleIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllMultiple = () => {
    if (selectedMultipleIds.length === availableInterfaces.length) {
      setSelectedMultipleIds([]);
    } else {
      setSelectedMultipleIds(availableInterfaces.map((i) => i.id));
    }
  };

  const handleExecuteCapture = async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    const isFull = captureType === 'full';
    const imgFormat = exportFormat === 'jpeg' ? 'jpeg' : 'png';

    try {
      let targetIds: string[] | undefined = undefined;
      if (captureScope === 'current') {
        const targetRoute = previousScreen && previousScreen !== 'tool_interface_capture' ? previousScreen : currentScreen;
        targetIds = [targetRoute];
      } else if (captureScope === 'specific') {
        targetIds = [selectedInterfaceId];
      } else if (captureScope === 'multiple') {
        if (selectedMultipleIds.length === 0) {
          showToast('Please select at least one interface to capture.');
          setIsCapturing(false);
          return;
        }
        targetIds = selectedMultipleIds;
      } else if (captureScope === 'all') {
        targetIds = undefined;
      }

      showToast(
        targetIds
          ? `Starting background capture for ${targetIds.length} interface${targetIds.length > 1 ? 's' : ''}...`
          : 'Starting full system interface capture in background...'
      );

      await captureJobManager.startJob(targetIds, {
        forceRecapture,
        fullHeight: isFull,
        format: imgFormat,
      });

      setTimeout(() => resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    } catch (err: any) {
      console.error('Capture execution failure:', err);
      showToast(err?.message || 'Capture failed');
      setIsCapturing(false);
    }
  };

  const handleRetrySingle = async (interfaceIdOrRoute: string, name: string) => {
    try {
      showToast(`Retrying capture for "${name}"...`);
      await captureJobManager.retrySingleItem(interfaceIdOrRoute, {
        fullHeight: captureType === 'full',
        format: exportFormat === 'jpeg' ? 'jpeg' : 'png',
      });
      showToast(`Retry scheduled for "${name}"`);
    } catch (err: any) {
      showToast(`Retry failed for "${name}": ${err?.message || 'Error'}`);
    }
  };

  const handleExportResultFile = (file: GeneratedResultFile) => {
    if (!file.dataUrl) return;
    triggerCaptureDownload(file.dataUrl, file.fileName);
    showToast(`Downloaded ${file.fileName}`);
  };

  const handleDownloadAllFiles = async () => {
    const downloadable = generatedFiles.filter((f) => f.status === 'success' && f.dataUrl);
    if (downloadable.length === 0) return;
    showToast(`Downloading ${downloadable.length} files...`);
    for (let i = 0; i < downloadable.length; i++) {
      const f = downloadable[i];
      triggerCaptureDownload(f.dataUrl!, f.fileName);
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const handleDownloadSingle = (result: CapturedInterfaceResult, formatOverride?: 'png' | 'jpg') => {
    const ext = formatOverride || (result.format === 'jpeg' ? 'jpg' : 'png');
    const filename = getSafeInterfaceFileName(result.name, ext);
    triggerCaptureDownload(result.dataUrl, filename);
    showToast(`Downloaded ${filename}`);
  };

  const handleExportCombinedLongImage = async () => {
    if (capturedResults.length === 0) return;
    try {
      const longImg = await stitchCanvasesVertically(capturedResults);
      triggerCaptureDownload(longImg.dataUrl, longImg.filename);
      showToast('Downloaded Long Image');
    } catch (err: any) {
      showToast(err?.message || 'Failed to stitch images');
    }
  };

  const handleExportCombinedPdf = async () => {
    if (capturedResults.length === 0) return;
    try {
      const pdfDoc = await exportCapturesToPdf(capturedResults);
      triggerCaptureDownload(pdfDoc.dataUrl, pdfDoc.filename);
      showToast('Downloaded PDF document');
    } catch (err: any) {
      showToast(err?.message || 'Failed to generate PDF');
    }
  };

  const handleShareResult = async (result: CapturedInterfaceResult) => {
    if (navigator.share && typeof navigator.share === 'function') {
      try {
        const response = await fetch(result.dataUrl);
        const blob = await response.blob();
        const file = new File([blob], getSafeInterfaceFileName(result.name, 'png'), { type: 'image/png' });
        await navigator.share({
          title: `AXON Interface Capture - ${result.name}`,
          files: [file],
        });
        showToast('Shared interface image');
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(result.dataUrl);
      setCopiedId(result.id);
      showToast('Image DataURL copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast('Unable to share or copy image');
    }
  };

  const filteredInterfaces = availableInterfaces.filter((i) => {
    const q = searchFilter.toLowerCase().trim();
    if (!q) return true;
    return (
      i.name.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.keywords.some((k) => k.includes(q))
    );
  });

  return (
    <div
      id="interface-capture-screen"
      className="flex-1 min-h-0 overflow-y-auto p-4 bg-black text-white select-none"
    >
      <div className="max-w-md mx-auto space-y-4 pb-12">
        {/* Header Title Section */}
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-bold">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Interface Capture</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Pixel-accurate visual capture & documentation engine
              </p>
            </div>
          </div>
        </div>

        {/* 1. Capture Scope Selection */}
        <div className="space-y-2 p-3.5 rounded-2xl bg-neutral-900/90 border border-neutral-800">
          <label className="text-xs font-semibold text-neutral-300 block">Capture Scope</label>
          <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-neutral-950 border border-neutral-800">
            {[
              { id: 'current', label: 'Current' },
              { id: 'specific', label: 'Specific' },
              { id: 'multiple', label: 'Multiple' },
              { id: 'all', label: 'All UI' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCaptureScope(tab.id as any)}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center truncate ${
                  captureScope === tab.id
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Scope details / Target pickers */}
          {captureScope === 'current' && (
            <div className="mt-2 p-2.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80 text-xs text-neutral-300 flex items-center justify-between">
              <div className="truncate">
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-mono">Target View</span>
                <span className="font-semibold text-white truncate">{currentMeta.name}</span>
                <span className="text-[11px] text-neutral-400 ml-1.5">({currentMeta.category})</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-[10px] text-neutral-300 font-mono">
                Live DOM
              </span>
            </div>
          )}

          {captureScope === 'specific' && (
            <div className="mt-2 space-y-1.5">
              <label className="text-[11px] text-neutral-400">Select Interface to Render & Capture:</label>
              <select
                value={selectedInterfaceId}
                onChange={(e) => setSelectedInterfaceId(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
              >
                {availableInterfaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{item.category}] {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {captureScope === 'multiple' && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-400">
                  {selectedMultipleIds.length} of {availableInterfaces.length} interfaces selected
                </span>
                <button
                  type="button"
                  onClick={handleSelectAllMultiple}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-medium"
                >
                  {selectedMultipleIds.length === availableInterfaces.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1 p-1.5 rounded-xl bg-neutral-950 border border-neutral-800">
                {availableInterfaces.map((item) => {
                  const isChecked = selectedMultipleIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggleMultipleId(item.id)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-900 cursor-pointer text-xs"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-white shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-neutral-600 shrink-0" />
                      )}
                      <span className={isChecked ? 'text-white font-medium' : 'text-neutral-400'}>
                        {item.name}
                      </span>
                      <span className="text-[10px] text-neutral-500 ml-auto font-mono">
                        {item.category}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {captureScope === 'all' && (
            <div className="mt-2 p-2.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80 text-xs text-neutral-300">
              <div className="flex items-center justify-between font-semibold text-white">
                <span>Capture All {availableInterfaces.length} Interfaces</span>
                <span className="text-[10px] font-mono text-neutral-400">Full System Pass</span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                Iterates through every real screen in AXON's navigation hierarchy, captures each rendered DOM view, and packages individual images, long stitch, or multi-page PDF.
              </p>
            </div>
          )}
        </div>

        {/* 2. Capture Type & Output Format */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Capture Type */}
          <div className="p-3 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-2">
            <label className="text-xs font-semibold text-neutral-300 block">Capture Mode</label>
            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-neutral-950 border border-neutral-800">
              <button
                type="button"
                onClick={() => setCaptureType('visible')}
                className={`py-1 px-1 rounded-lg text-[11px] font-medium transition-all text-center truncate ${
                  captureType === 'visible'
                    ? 'bg-white text-black font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Visible
              </button>
              <button
                type="button"
                onClick={() => setCaptureType('full')}
                className={`py-1 px-1 rounded-lg text-[11px] font-medium transition-all text-center truncate ${
                  captureType === 'full'
                    ? 'bg-white text-black font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Full Page
              </button>
            </div>
            <p className="text-[10px] text-neutral-400 leading-tight">
              {captureType === 'full' ? 'Full interface + independent panel breakdown & full scroll' : 'Captures exact viewport dimensions'}
            </p>
          </div>

          {/* Export Output */}
          <div className="p-3 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-2">
            <label className="text-xs font-semibold text-neutral-300 block">Export Format</label>
            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-neutral-950 border border-neutral-800">
              {[
                { id: 'png', label: 'PNG' },
                { id: 'jpeg', label: 'JPG' },
                { id: 'long_image', label: 'Long Img' },
                { id: 'pdf', label: 'PDF' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setExportFormat(f.id as any)}
                  className={`py-1 px-1 rounded-lg text-[10px] font-medium transition-all text-center truncate ${
                    exportFormat === f.id
                      ? 'bg-white text-black font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-400 leading-tight truncate">
              {exportFormat === 'pdf' ? 'Multi-page document' : exportFormat === 'long_image' ? 'Vertical stitched image' : 'Individual images'}
            </p>
          </div>
        </div>

        {/* Force Recapture Cache Option */}
        <div className="flex items-center justify-between px-1 text-[11px] text-neutral-400">
          <label htmlFor="force-recapture-checkbox" className="flex items-center gap-1.5 cursor-pointer">
            <input
              id="force-recapture-checkbox"
              type="checkbox"
              checked={forceRecapture}
              onChange={(e) => setForceRecapture(e.target.checked)}
              className="w-3.5 h-3.5 rounded bg-neutral-900 border-neutral-700 text-white focus:ring-0 cursor-pointer"
            />
            <span>Bypass cache (Force full recapture)</span>
          </label>
        </div>

        {/* 3. Primary Action Button */}
        <div>
          <button
            id="start-interface-capture-btn"
            type="button"
            disabled={isCapturing}
            onClick={handleExecuteCapture}
            className="w-full py-3 px-4 rounded-2xl bg-white text-black hover:bg-neutral-200 active:scale-[0.99] font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isCapturing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-black" />
                <span>Capturing AXON Interface...</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 text-black" />
                <span>
                  Capture {captureScope === 'all' ? 'All Interfaces' : captureScope === 'multiple' ? `${selectedMultipleIds.length} Selected` : 'Interface'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* 4. Persistent Background Job Monitor (Requirements 14, 15, 16) */}
        {activeJob && (activeJob.status === 'running' || activeJob.status === 'paused' || activeJob.status === 'interrupted' || activeJob.status === 'completed') && (
          <div className="p-3.5 rounded-2xl bg-neutral-900/95 border border-neutral-800 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    activeJob.status === 'running'
                      ? 'bg-emerald-400 animate-pulse'
                      : activeJob.status === 'paused'
                      ? 'bg-amber-400'
                      : activeJob.status === 'completed'
                      ? 'bg-blue-400'
                      : 'bg-rose-400'
                  }`}
                />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Capture Pipeline
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
                    activeJob.status === 'running'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : activeJob.status === 'paused'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : activeJob.status === 'completed'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {activeJob.status}
                </span>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-1.5">
                {activeJob.status === 'running' && (
                  <button
                    type="button"
                    onClick={() => captureJobManager.pauseJob()}
                    className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] text-amber-300 flex items-center gap-1 font-medium transition-all"
                  >
                    <Pause className="w-3 h-3" />
                    <span>Pause</span>
                  </button>
                )}
                {(activeJob.status === 'paused' || activeJob.status === 'interrupted') && (
                  <button
                    type="button"
                    onClick={() =>
                      captureJobManager.resumeJob({
                        forceRecapture,
                        fullHeight: captureType === 'full',
                        format: exportFormat === 'jpeg' ? 'jpeg' : 'png',
                      })
                    }
                    className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[10px] text-white flex items-center gap-1 font-medium transition-all"
                  >
                    <Play className="w-3 h-3" />
                    <span>Resume</span>
                  </button>
                )}
                {activeJob.status !== 'completed' && (
                  <button
                    type="button"
                    onClick={() => captureJobManager.cancelJob()}
                    className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-rose-900/40 text-[10px] text-neutral-400 hover:text-rose-300 flex items-center gap-1 transition-all"
                  >
                    <XCircle className="w-3 h-3" />
                    <span>Cancel</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className={`px-2 py-1 rounded-lg text-[10px] flex items-center gap-1 transition-all ${
                    showDiagnostics
                      ? 'bg-neutral-700 text-white font-medium'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                  title="Toggle Diagnostics"
                >
                  <Activity className="w-3 h-3" />
                  <span>Metrics</span>
                </button>
              </div>
            </div>

            {/* Stage Progress Bar */}
            <div className="space-y-1">
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-200 rounded-full"
                  style={{ width: `${activeJob.progress.percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-neutral-400">
                <span className="truncate">
                  Current: <strong className="text-white">{activeJob.progress.currentInterfaceName || 'Idle'}</strong>
                  {activeJob.progress.currentStage && activeJob.status === 'running' && (
                    <span className="ml-1.5 text-[10px] text-sky-400 font-mono">
                      [{activeJob.progress.currentStage}]
                    </span>
                  )}
                </span>
                <span className="font-mono text-white font-bold">{activeJob.progress.percent}%</span>
              </div>
            </div>

            {/* Requirement 14 Persistent Status Matrix */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 pt-1 text-center font-mono">
              <div className="p-1 rounded-xl bg-neutral-950/80 border border-neutral-800">
                <div className="text-[8px] text-neutral-500 uppercase">Discovered</div>
                <div className="text-xs font-bold text-white">{activeJob.progress.totalDiscovered}</div>
              </div>
              <div className="p-1 rounded-xl bg-neutral-950/80 border border-neutral-800">
                <div className="text-[8px] text-neutral-500 uppercase">Completed</div>
                <div className="text-xs font-bold text-emerald-400">{activeJob.progress.completed}</div>
              </div>
              <div className="p-1 rounded-xl bg-neutral-950/80 border border-neutral-800">
                <div className="text-[8px] text-neutral-500 uppercase">Processing</div>
                <div className="text-xs font-bold text-sky-400">
                  {activeJob.progress.capturing +
                    activeJob.progress.segmenting +
                    activeJob.progress.analyzing +
                    activeJob.progress.verifying}
                </div>
              </div>
              <div className="p-1 rounded-xl bg-neutral-950/80 border border-neutral-800">
                <div className="text-[8px] text-neutral-500 uppercase">Queued</div>
                <div className="text-xs font-bold text-neutral-300">{activeJob.progress.queued}</div>
              </div>
              <div className="p-1 rounded-xl bg-neutral-950/80 border border-neutral-800">
                <div className="text-[8px] text-neutral-500 uppercase">Retrying</div>
                <div className="text-xs font-bold text-amber-400">{activeJob.progress.retrying}</div>
              </div>
              <div className="p-1 rounded-xl bg-neutral-950/80 border border-neutral-800">
                <div className="text-[8px] text-neutral-500 uppercase">Failed</div>
                <div className="text-xs font-bold text-rose-400">{activeJob.progress.failed}</div>
              </div>
            </div>

            {/* Requirement 19: Performance Diagnostics Expanded View */}
            {showDiagnostics && (
              <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1.5 font-mono text-[10px] animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-neutral-400 border-b border-neutral-800/80 pb-1">
                  <span className="font-bold text-white flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-sky-400" />
                    Stage Latency Breakdown
                  </span>
                  <span className="text-[9px] text-neutral-500">
                    Avg {activeJob.diagnostics.avgTimePerItemMs}ms/item • Peak {activeJob.diagnostics.peakConcurrency} slots
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-neutral-300 pt-0.5">
                  <div className="flex flex-col">
                    <span className="text-[8px] text-neutral-500 uppercase">Discovery</span>
                    <span className="font-bold">{activeJob.diagnostics.stageAverages.discoveryMs} ms</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-neutral-500 uppercase">Rendering</span>
                    <span className="font-bold text-sky-400">{activeJob.diagnostics.stageAverages.renderingMs} ms</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-neutral-500 uppercase">Screenshot</span>
                    <span className="font-bold text-indigo-400">{activeJob.diagnostics.stageAverages.screenshotMs} ms</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-neutral-500 uppercase">Segmentation</span>
                    <span className="font-bold text-purple-400">{activeJob.diagnostics.stageAverages.segmentationMs} ms</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-neutral-500 uppercase">Analysis (2-Pass)</span>
                    <span className="font-bold text-amber-400">{activeJob.diagnostics.stageAverages.analysisMs} ms</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-neutral-500 uppercase">Verification</span>
                    <span className="font-bold text-emerald-400">{activeJob.diagnostics.stageAverages.verificationMs} ms</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-neutral-500 uppercase">Storage</span>
                    <span className="font-bold text-neutral-400">{activeJob.diagnostics.stageAverages.storageMs} ms</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-neutral-500 uppercase">Cache Hits</span>
                    <span className="font-bold text-emerald-300">{activeJob.diagnostics.cacheHitCount} items</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Failure / Completion Report Callout with Performance Metrics */}
        {multiReport && (
          <div className="p-3 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-400" />
                Capture Run Completed
              </span>
              <span className="text-[11px] text-neutral-400 font-mono">
                {multiReport.successfulCount} captured
                {multiReport.totalDurationMs > 0 && ` in ${(multiReport.totalDurationMs / 1000).toFixed(1)}s`}
              </span>
            </div>

            {/* Performance Diagnostics Grid */}
            {multiReport.metrics && (
              <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-neutral-800/80 text-center font-mono">
                <div className="p-1.5 rounded-lg bg-neutral-950/60 border border-neutral-800">
                  <div className="text-[9px] text-neutral-500 uppercase">Avg / Item</div>
                  <div className="text-[11px] font-bold text-emerald-400">
                    {multiReport.metrics.averageCaptureMs}ms
                  </div>
                </div>
                <div className="p-1.5 rounded-lg bg-neutral-950/60 border border-neutral-800">
                  <div className="text-[9px] text-neutral-500 uppercase">Workers</div>
                  <div className="text-[11px] font-bold text-blue-400">
                    {multiReport.metrics.peakConcurrency} slots
                  </div>
                </div>
                <div className="p-1.5 rounded-lg bg-neutral-950/60 border border-neutral-800">
                  <div className="text-[9px] text-neutral-500 uppercase">Reused</div>
                  <div className="text-[11px] font-bold text-purple-400">
                    {multiReport.metrics.skippedOrReused}
                  </div>
                </div>
              </div>
            )}

            {multiReport.failedCount > 0 && (
              <div className="text-[11px] text-amber-400 pt-1 border-t border-neutral-800">
                <p className="font-medium">
                  {multiReport.failedCount} interface{multiReport.failedCount > 1 ? 's' : ''} failed:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-neutral-400 mt-1">
                  {multiReport.failures.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <strong className="text-neutral-300">{f.name}</strong>: {f.error}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRetrySingle(f.route, f.name)}
                        className="text-[10px] text-amber-300 underline shrink-0 hover:text-amber-200"
                      >
                        Retry
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 6. Generated Result Files (Comprehensive Results Presentation) */}
        {generatedFiles.length > 0 && (
          <div ref={resultsSectionRef} className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Generated Result Files ({generatedFiles.length})</span>
                </h3>
                <p className="text-[11px] text-neutral-400">
                  All capture outputs ready for immediate inspection and export
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {generatedFiles.filter((f) => f.status === 'success' && f.dataUrl).length > 1 && (
                  <button
                    type="button"
                    onClick={handleDownloadAllFiles}
                    className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[11px] text-white font-medium flex items-center gap-1"
                  >
                    <FolderDown className="w-3 h-3 text-neutral-300" />
                    <span>Download All</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setGeneratedFiles([]);
                    setCapturedResults([]);
                    setMultiReport(null);
                  }}
                  className="p-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white text-[11px]"
                  title="Clear Results"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Individual Result File Cards */}
            <div className="space-y-2">
              {generatedFiles.map((file) => (
                <div
                  key={file.id}
                  className={`p-3 rounded-2xl border transition-all ${
                    file.status === 'success'
                      ? 'bg-neutral-900/90 border-neutral-800 hover:border-neutral-700'
                      : 'bg-rose-950/20 border-rose-900/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      {/* Format icon or mini thumbnail */}
                      {file.dataUrl && file.fileFormat !== 'PDF' ? (
                        <div
                          onClick={() => setActivePreviewFile(file)}
                          className="w-12 h-16 rounded-lg bg-black border border-neutral-800 overflow-hidden shrink-0 cursor-pointer relative group"
                        >
                          <img
                            src={file.dataUrl}
                            alt={file.interfaceName}
                            className="w-full h-full object-cover object-top"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-12 h-16 rounded-lg bg-neutral-800/80 border border-neutral-700 flex flex-col items-center justify-center shrink-0">
                          {file.fileFormat === 'PDF' ? (
                            <FileText className="w-5 h-5 text-rose-400" />
                          ) : file.status === 'failed' ? (
                            <AlertCircle className="w-5 h-5 text-rose-400" />
                          ) : (
                            <FileImage className="w-5 h-5 text-blue-400" />
                          )}
                          <span className="text-[9px] font-mono font-bold mt-1 text-neutral-300">
                            {file.fileFormat}
                          </span>
                        </div>
                      )}

                      {/* Interface & File Metadata */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-white truncate">
                            {file.interfaceName}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 font-mono">
                            {file.category}
                          </span>
                          {file.status === 'success' ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Capture Succeeded</span>
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                              <AlertCircle className="w-2.5 h-2.5" />
                              <span>Capture Failed</span>
                            </span>
                          )}
                        </div>

                        <div className="font-mono text-[11px] text-neutral-300 flex items-center gap-1.5">
                          <span className="text-white font-medium truncate">{file.fileName}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                            {file.fileType}
                          </span>
                        </div>

                        <div className="text-[10px] text-neutral-400 font-mono flex items-center gap-2">
                          {file.dimensions && <span>{file.dimensions}</span>}
                          <span>•</span>
                          <span>{file.fileSize}</span>
                          <span>•</span>
                          <span>{file.capturedAt}</span>
                        </div>

                        {file.errorMessage && (
                          <p className="text-[11px] text-rose-400 font-mono pt-0.5">
                            {file.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Individual Action Buttons */}
                    {file.status === 'success' && file.dataUrl && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActivePreviewFile(file)}
                          className="py-1 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-[11px] font-medium text-white flex items-center justify-center gap-1.5"
                        >
                          <Eye className="w-3 h-3 text-neutral-300" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportResultFile(file)}
                          className="py-1 px-2.5 rounded-lg bg-white hover:bg-neutral-200 text-black active:scale-95 text-[11px] font-bold flex items-center justify-center gap-1.5"
                        >
                          <Download className="w-3 h-3 text-black" />
                          <span>Save</span>
                        </button>
                      </div>
                    )}
                    {file.status === 'failed' && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRetrySingle(file.route, file.interfaceName)}
                          className="py-1 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 active:scale-95 text-[11px] font-medium flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw className="w-3 h-3 text-amber-300" />
                          <span>Retry</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. Captured Results Gallery & Batch Actions */}
        {capturedResults.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Captured Outputs ({capturedResults.length})
              </h3>
              <div className="flex items-center gap-1.5">
                {capturedResults.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handleExportCombinedLongImage}
                      className="px-2 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] text-neutral-200 hover:text-white flex items-center gap-1"
                    >
                      <Layers className="w-3 h-3" />
                      <span>Long Image</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCombinedPdf}
                      className="px-2 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] text-neutral-200 hover:text-white flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      <span>PDF</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {capturedResults.map((res) => (
                <div
                  key={res.id}
                  className="rounded-2xl bg-neutral-900/90 border border-neutral-800 overflow-hidden flex flex-col group hover:border-neutral-700 transition-all"
                >
                  {/* Thumbnail */}
                  <div
                    onClick={() => setPreviewResult(res)}
                    className="relative aspect-9/16 bg-neutral-950 cursor-pointer overflow-hidden flex items-center justify-center"
                  >
                    <img
                      src={res.dataUrl}
                      alt={res.name}
                      className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <span className="p-1.5 rounded-lg bg-white/20 backdrop-blur-md text-white">
                        <Maximize2 className="w-4 h-4" />
                      </span>
                    </div>
                  </div>

                  {/* Card Info & Actions */}
                  <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white truncate">{res.name}</h4>
                      <p className="text-[10px] text-neutral-400 font-mono flex items-center justify-between mt-0.5">
                        <span>{res.width}x{res.height}px</span>
                        <span>{res.formattedSize}</span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-1 pt-1 border-t border-neutral-800/80">
                      <button
                        type="button"
                        onClick={() => handleDownloadSingle(res)}
                        className="py-1 px-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-[10px] font-medium text-white flex items-center justify-center gap-1"
                        title="Download PNG"
                      >
                        <Download className="w-3 h-3" />
                        <span>PNG</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareResult(res)}
                        className="py-1 px-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-[10px] font-medium text-neutral-300 hover:text-white flex items-center justify-center gap-1"
                        title="Share / Copy DataURL"
                      >
                        {copiedId === res.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Share2 className="w-3 h-3" />
                        )}
                        <span>Share</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. Registered AXON Interfaces Directory */}
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Registered Interfaces ({availableInterfaces.length})
            </h3>
            <span className="text-[10px] text-neutral-500 font-mono">100% Real DOM</span>
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search interfaces..."
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
            />
          </div>

          {/* Interfaces List */}
          <div className="space-y-1.5">
            {filteredInterfaces.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-900 transition-all flex items-center justify-between gap-2"
              >
                <div className="truncate flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white truncate">{item.name}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-neutral-800 text-neutral-400 font-mono">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 truncate mt-0.5">{item.description}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setIsCapturing(true);
                      const itemResults = await captureInterfaceByIdWithPanels(item.id, { fullHeight: captureType === 'full' });
                      setCapturedResults((prev) => [...itemResults, ...prev]);
                      const newFiles = itemResults.map((r) => buildResultFileFromCapture(r));
                      setGeneratedFiles((prev) => [...newFiles, ...prev]);
                      showToast(
                        itemResults.length > 1
                          ? `Captured "${item.name}" + ${itemResults.length - 1} panels`
                          : `Captured "${item.name}"`
                      );
                      setTimeout(() => resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                    } catch (err: any) {
                      const failFile = buildFailureResultFile(item.name, item.id, err?.message || 'Capture failed', item.category);
                      setGeneratedFiles((prev) => [failFile, ...prev]);
                      showToast(err?.message || 'Capture failed');
                    } finally {
                      setIsCapturing(false);
                    }
                  }}
                  disabled={isCapturing}
                  className="px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 active:scale-95 text-[11px] font-medium shrink-0 flex items-center gap-1"
                >
                  <Camera className="w-3 h-3" />
                  <span>Capture</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fullscreen Preview Modal for Active Generated Result File */}
      {activePreviewFile && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md p-4 flex flex-col items-center justify-center"
          onClick={() => setActivePreviewFile(null)}
        >
          <div
            className="max-w-xl w-full max-h-[90vh] bg-neutral-950 border border-neutral-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Bar */}
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between shrink-0">
              <div className="min-w-0 flex-1 mr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white truncate">
                    {activePreviewFile.interfaceName}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono">
                    {activePreviewFile.fileFormat}
                  </span>
                  {activePreviewFile.status === 'success' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Capture Succeeded
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-neutral-400 font-mono mt-0.5 truncate">
                  {activePreviewFile.fileName} • {activePreviewFile.dimensions} • {activePreviewFile.fileSize}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {activePreviewFile.dataUrl && (
                  <button
                    type="button"
                    onClick={() => handleExportResultFile(activePreviewFile)}
                    className="px-3 py-1 rounded-lg bg-white text-black font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save / Export</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActivePreviewFile(null)}
                  className="px-2.5 py-1 rounded-lg bg-neutral-800 text-neutral-300 hover:text-white text-xs"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Preview Container */}
            <div className="flex-1 min-h-0 overflow-auto p-4 flex items-center justify-center bg-black">
              {activePreviewFile.fileFormat === 'PDF' && activePreviewFile.dataUrl ? (
                <iframe
                  src={activePreviewFile.dataUrl}
                  title={activePreviewFile.fileName}
                  className="w-full h-full min-h-[500px] rounded-xl border border-neutral-800 bg-white"
                />
              ) : activePreviewFile.dataUrl ? (
                <img
                  src={activePreviewFile.dataUrl}
                  alt={activePreviewFile.interfaceName}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-lg border border-neutral-800"
                />
              ) : (
                <div className="text-center p-8 text-neutral-400">
                  <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                  <p className="text-xs">{activePreviewFile.errorMessage || 'Preview unavailable'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Zoom Modal for Preview Thumbnail (Requirement 13) */}
      {previewResult && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md p-4 flex flex-col items-center justify-center"
          onClick={() => setPreviewResult(null)}
        >
          <div
            className="max-w-xl w-full max-h-[90vh] bg-neutral-950 border border-neutral-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Bar */}
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-white">{previewResult.name}</h3>
                <p className="text-[10px] text-neutral-400 font-mono">
                  {previewResult.width}x{previewResult.height}px • {previewResult.formattedSize}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSingle(previewResult, 'png')}
                  className="px-2.5 py-1 rounded-lg bg-white text-black font-semibold text-xs flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  <span>PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewResult(null)}
                  className="px-2.5 py-1 rounded-lg bg-neutral-800 text-neutral-300 hover:text-white text-xs"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Image Preview Container */}
            <div className="flex-1 min-h-0 overflow-auto p-4 flex items-center justify-center bg-black">
              <img
                src={previewResult.dataUrl}
                alt={previewResult.name}
                className="max-w-full max-h-full object-contain rounded-xl shadow-lg border border-neutral-800"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
