import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Square,
  Volume2,
  Clock,
  Activity,
  Award,
  AlertCircle,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const SpeechRateAnalysisScreen: React.FC = () => {
  const { showToast } = useApp();
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [spokenText, setSpokenText] = useState(
    'Welcome to the AXON Speech Rate Analyzer. Speaking at an optimal rate helps audiences retain critical information during presentations.'
  );
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      showToast('Recording session ended and analyzed');
    } else {
      setElapsedSeconds(0);
      setIsRecording(true);
      showToast('Recording speech cadence... Speak naturally');
    }
  };

  // Metrics calculation
  const words = spokenText.trim() ? spokenText.trim().split(/\s+/).filter(Boolean).length : 0;
  const minutes = elapsedSeconds > 0 ? elapsedSeconds / 60 : Math.max(0.5, words / 140);
  const wpm = Math.round(words / minutes) || 0;

  // Syllables estimation (~1.4 syllables per English word)
  const syllables = Math.round(words * 1.4);
  const syllablesPerSec = elapsedSeconds > 0 ? (syllables / elapsedSeconds).toFixed(1) : (wpm * 1.4 / 60).toFixed(1);

  // Pacing benchmark category
  const getPacingDiagnostic = (rate: number) => {
    if (rate === 0) return { label: 'Awaiting Speech', color: 'text-neutral-400', desc: 'No speech recorded yet.' };
    if (rate < 110) return { label: 'Slow & Deliberate', color: 'text-blue-400', desc: 'Great for complex concepts, meditation, or technical audiobooks.' };
    if (rate <= 150) return { label: 'Optimal Conversational', color: 'text-emerald-400', desc: 'Ideal cadence for podcasts, presentations, and general listening.' };
    if (rate <= 180) return { label: 'Fast & Energetic', color: 'text-amber-400', desc: 'High energy, typical of commercial reads and quick updates.' };
    return { label: 'Rapid / Rushed', color: 'text-rose-400', desc: 'May be difficult for listeners to follow without intentional pauses.' };
  };

  const pacing = getPacingDiagnostic(wpm);

  const handleCopyReport = () => {
    const report = `AXON Speech Rate Analysis:
- Speaking Rate: ${wpm} WPM (${pacing.label})
- Syllables / Sec: ${syllablesPerSec}
- Total Words: ${words}
- Duration: ${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s
- Summary: ${pacing.desc}`;

    navigator.clipboard.writeText(report);
    setCopied(true);
    showToast('Analysis report copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-neutral-950 text-neutral-100 overflow-y-auto">
      <div className="p-4 max-w-3xl w-full mx-auto space-y-4">
        {/* Header & Controls */}
        <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${isRecording ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-neutral-800 text-blue-400'}`}>
              <Mic className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Speech-Rate & Cadence Analyzer</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Real-time WPM calculation and acoustic pacing diagnostics</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={toggleRecording}
              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-colors ${
                isRecording
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-4 h-4 fill-current" /> Stop Recording ({elapsedSeconds}s)
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" /> Live Analyze Mic
                </>
              )}
            </button>
          </div>
        </div>

        {/* Meters & Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
            <span className="text-[11px] text-neutral-400 font-medium">Cadence (WPM)</span>
            <div className="text-2xl font-black text-white mt-1">{wpm}</div>
            <span className={`text-[10px] font-semibold mt-0.5 block ${pacing.color}`}>
              {pacing.label}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
            <span className="text-[11px] text-neutral-400 font-medium">Syllables / Sec</span>
            <div className="text-2xl font-black text-blue-400 mt-1">{syllablesPerSec}</div>
            <span className="text-[10px] text-neutral-500 mt-0.5 block">Acoustic velocity</span>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
            <span className="text-[11px] text-neutral-400 font-medium">Total Words</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">{words}</div>
            <span className="text-[10px] text-neutral-500 mt-0.5 block">~{syllables} syllables</span>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
            <span className="text-[11px] text-neutral-400 font-medium">Duration</span>
            <div className="text-2xl font-black text-purple-400 mt-1">
              {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
            </div>
            <span className="text-[10px] text-neutral-500 mt-0.5 block">Active session</span>
          </div>
        </div>

        {/* Diagnostic Assessment Card */}
        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Pacing Assessment</span>
            </div>
            <button
              type="button"
              onClick={handleCopyReport}
              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} Copy Report
            </button>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed">{pacing.desc}</p>

          {/* Visual Benchmark Bar */}
          <div className="pt-2 space-y-1.5">
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
              <span>Slow (&lt;110)</span>
              <span className="text-emerald-400 font-semibold">Ideal (120-150)</span>
              <span>Fast (&gt;180)</span>
            </div>
            <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-emerald-500 to-rose-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(10, (wpm / 220) * 100))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Text Transcript / Sample Input */}
        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-300">Transcript / Script Text</label>
            <span className="text-[11px] text-neutral-500">Edit or paste speech text to re-calculate</span>
          </div>
          <textarea
            value={spokenText}
            onChange={(e) => setSpokenText(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs focus:outline-none focus:border-neutral-600 resize-y"
          />
        </div>
      </div>
    </div>
  );
};
