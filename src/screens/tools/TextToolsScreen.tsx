import React, { useState, useMemo } from 'react';
import {
  Type,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Scissors,
  FileText,
  AlignLeft,
  ArrowRightLeft,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface TextToolsScreenProps {
  initialTab?: 'counter' | 'case' | 'fonts' | 'dedup';
}

export const TextToolsScreen: React.FC<TextToolsScreenProps> = ({ initialTab }) => {
  const { showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'counter' | 'case' | 'fonts' | 'dedup'>(initialTab || 'counter');
  const [text, setText] = useState<string>(
    'AXON provides high-performance offline tools for writing, coding, and productivity.'
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    showToast('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // 1. Text Counter Metrics
  const stats = useMemo(() => {
    const trimmed = text.trim();
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, '').length;
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const lines = text ? text.split('\n').length : 0;
    const sentences = trimmed ? trimmed.split(/[.!?]+/).filter(Boolean).length : 0;
    const readingTimeMin = Math.ceil(words / 200);

    return {
      characters,
      charactersNoSpaces,
      words,
      lines,
      sentences,
      readingTimeMin,
    };
  }, [text]);

  // 2. Case Conversions
  const caseConversions = useMemo(() => {
    const raw = text;
    const upper = raw.toUpperCase();
    const lower = raw.toLowerCase();

    // Title Case
    const title = raw.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

    // Sentence Case
    const sentence = raw.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase());

    // camelCase
    const words = raw.replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const camel = words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');

    // snake_case
    const snake = words.map((w) => w.toLowerCase()).join('_');

    // kebab-case
    const kebab = words.map((w) => w.toLowerCase()).join('-');

    return [
      { id: 'upper', name: 'UPPERCASE', value: upper },
      { id: 'lower', name: 'lowercase', value: lower },
      { id: 'title', name: 'Title Case', value: title },
      { id: 'sentence', name: 'Sentence case', value: sentence },
      { id: 'camel', name: 'camelCase', value: camel },
      { id: 'snake', name: 'snake_case', value: snake },
      { id: 'kebab', name: 'kebab-case', value: kebab },
    ];
  }, [text]);

  // 3. Stylish / Unicode Fonts
  const stylishFonts = useMemo(() => {
    const convertChar = (c: string, offsets: { upper: number; lower: number; digit?: number }): string => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(offsets.upper + (code - 65));
      if (code >= 97 && code <= 122) return String.fromCodePoint(offsets.lower + (code - 97));
      if (offsets.digit && code >= 48 && code <= 57) return String.fromCodePoint(offsets.digit + (code - 48));
      return c;
    };

    const applyStyle = (str: string, offsets: { upper: number; lower: number; digit?: number }): string => {
      return Array.from(str).map((c) => convertChar(c, offsets)).join('');
    };

    const bold = applyStyle(text, { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce });
    const italic = applyStyle(text, { upper: 0x1d434, lower: 0x1d44e });
    const mono = applyStyle(text, { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 });
    const script = applyStyle(text, { upper: 0x1d49c, lower: 0x1d4b6 });
    const doubleStruck = applyStyle(text, { upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8 });

    return [
      { id: 'bold', name: 'Bold Serif (Unicode)', value: bold },
      { id: 'italic', name: 'Italic Serif', value: italic },
      { id: 'mono', name: 'Monospace Code', value: mono },
      { id: 'script', name: 'Mathematical Script', value: script },
      { id: 'doublestruck', name: 'Double-Struck / Blackboard', value: doubleStruck },
    ];
  }, [text]);

  // 4. Deduplication
  const deduplicateLines = () => {
    const lines = text.split('\n');
    const seen = new Set<string>();
    const uniqueLines = lines.filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
    setText(uniqueLines.join('\n'));
    showToast(`Removed ${lines.length - uniqueLines.length} duplicate lines`);
  };

  const deduplicateWords = () => {
    const words = text.split(/\s+/).filter(Boolean);
    const seen = new Set<string>();
    const uniqueWords = words.filter((w) => {
      const lower = w.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
    setText(uniqueWords.join(' '));
    showToast(`Removed ${words.length - uniqueWords.length} duplicate words`);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-neutral-950 text-neutral-100 overflow-y-auto">
      {/* Tab Navigation Buttons */}
      <div className="p-3 border-b border-neutral-800 bg-neutral-900/60 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex rounded-xl bg-neutral-900 p-1 border border-neutral-800 max-w-3xl mx-auto">
          {[
            { id: 'counter', label: 'Counter & Stats' },
            { id: 'case', label: 'Case Formatter' },
            { id: 'fonts', label: 'Stylish Fonts' },
            { id: 'dedup', label: 'Deduplicator' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors truncate ${
                activeTab === tab.id
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 max-w-3xl w-full mx-auto space-y-4">
        {/* Shared Text Input Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-blue-400" />
              Source Text
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setText('')}
                className="text-[11px] text-neutral-400 hover:text-red-400 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
              <button
                type="button"
                onClick={() => handleCopy(text, 'source')}
                className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                {copiedKey === 'source' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Copy
              </button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Type or paste text here to inspect and transform..."
            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-100 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600 resize-y"
          />
        </div>

        {/* Tab 1: Counter & Stats */}
        {activeTab === 'counter' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col">
              <span className="text-[11px] text-neutral-400 font-medium">Words</span>
              <span className="text-2xl font-bold text-white mt-1">{stats.words}</span>
            </div>
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col">
              <span className="text-[11px] text-neutral-400 font-medium">Characters</span>
              <span className="text-2xl font-bold text-blue-400 mt-1">{stats.characters}</span>
              <span className="text-[10px] text-neutral-500 mt-0.5">{stats.charactersNoSpaces} without spaces</span>
            </div>
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col">
              <span className="text-[11px] text-neutral-400 font-medium">Lines</span>
              <span className="text-2xl font-bold text-emerald-400 mt-1">{stats.lines}</span>
            </div>
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col">
              <span className="text-[11px] text-neutral-400 font-medium">Sentences</span>
              <span className="text-2xl font-bold text-amber-400 mt-1">{stats.sentences}</span>
            </div>
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col col-span-2 sm:col-span-2">
              <span className="text-[11px] text-neutral-400 font-medium">Est. Reading Time</span>
              <span className="text-2xl font-bold text-purple-400 mt-1">~{stats.readingTimeMin} min</span>
              <span className="text-[10px] text-neutral-500 mt-0.5">Based on standard 200 WPM reading velocity</span>
            </div>
          </div>
        )}

        {/* Tab 2: Case Formatter */}
        {activeTab === 'case' && (
          <div className="space-y-2">
            {caseConversions.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between gap-3 hover:border-neutral-700 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-neutral-400">{item.name}</div>
                  <div className="text-sm font-mono text-neutral-200 truncate mt-0.5 select-all">
                    {item.value || <span className="text-neutral-600 italic">Empty</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setText(item.value)}
                    title="Apply to main input"
                    className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(item.value, item.id)}
                    className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1"
                  >
                    {copiedKey === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Stylish Fonts */}
        {activeTab === 'fonts' && (
          <div className="space-y-2">
            {stylishFonts.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between gap-3 hover:border-neutral-700 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-neutral-400">{item.name}</div>
                  <div className="text-sm text-neutral-100 truncate mt-0.5 select-all font-medium">
                    {item.value || <span className="text-neutral-600 italic">Empty</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(item.value, item.id)}
                  className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs shrink-0 flex items-center gap-1.5 font-medium"
                >
                  {copiedKey === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Deduplicator */}
        {activeTab === 'dedup' && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Scissors className="w-4 h-4 text-amber-400" />
                Deduplication Utilities
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Clean and filter redundant lines or repeated words in your list, script, or prompt.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={deduplicateLines}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <AlignLeft className="w-3.5 h-3.5" /> Remove Duplicate Lines
                </button>
                <button
                  type="button"
                  onClick={deduplicateWords}
                  className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" /> Remove Duplicate Words
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
