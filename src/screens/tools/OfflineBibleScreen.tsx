import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Bookmark,
  BookmarkCheck,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Share2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface Verse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

const SAMPLE_SCRIPTURES: Verse[] = [
  { book: 'Genesis', chapter: 1, verse: 1, text: 'In the beginning God created the heavens and the earth.' },
  { book: 'Genesis', chapter: 1, verse: 3, text: 'And God said, "Let there be light," and there was light.' },
  { book: 'Psalms', chapter: 23, verse: 1, text: 'The LORD is my shepherd; I shall not want.' },
  { book: 'Psalms', chapter: 23, verse: 2, text: 'He makes me lie down in green pastures. He leads me beside still waters.' },
  { book: 'Psalms', chapter: 119, verse: 105, text: 'Your word is a lamp to my feet and a light to my path.' },
  { book: 'Proverbs', chapter: 3, verse: 5, text: 'Trust in the LORD with all your heart, and do not lean on your own understanding.' },
  { book: 'Proverbs', chapter: 3, verse: 6, text: 'In all your ways acknowledge him, and he will make straight your paths.' },
  { book: 'Isaiah', chapter: 40, verse: 31, text: 'But they who wait for the LORD shall renew their strength; they shall mount up with wings like eagles; they shall run and not be weary; they shall walk and not faint.' },
  { book: 'Matthew', chapter: 5, verse: 14, text: 'You are the light of the world. A city set on a hill cannot be hidden.' },
  { book: 'Matthew', chapter: 6, verse: 33, text: 'But seek first the kingdom of God and his righteousness, and all these things will be added to you.' },
  { book: 'John', chapter: 1, verse: 1, text: 'In the beginning was the Word, and the Word was with God, and the Word was God.' },
  { book: 'John', chapter: 3, verse: 16, text: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.' },
  { book: 'Romans', chapter: 8, verse: 28, text: 'And we know that for those who love God all things work together for good, for those who are called according to his purpose.' },
  { book: 'Philippians', chapter: 4, verse: 13, text: 'I can do all things through him who strengthens me.' },
];

export const OfflineBibleScreen: React.FC = () => {
  const { showToast } = useApp();
  const [selectedBook, setSelectedBook] = useState<string>('Psalms');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [fontSize, setFontSize] = useState<number>(15);
  const [bookmarkedKeys, setBookmarkedKeys] = useState<Set<string>>(new Set(['Psalms-23-1']));
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const books = useMemo(() => {
    return Array.from(new Set(SAMPLE_SCRIPTURES.map((v) => v.book)));
  }, []);

  const displayedVerses = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return SAMPLE_SCRIPTURES.filter(
        (v) =>
          v.text.toLowerCase().includes(q) ||
          v.book.toLowerCase().includes(q) ||
          `${v.book} ${v.chapter}:${v.verse}`.toLowerCase().includes(q)
      );
    }
    return SAMPLE_SCRIPTURES.filter((v) => v.book === selectedBook);
  }, [selectedBook, searchQuery]);

  const toggleBookmark = (key: string) => {
    setBookmarkedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        showToast('Bookmark removed');
      } else {
        next.add(key);
        showToast('Verse saved to study bookmarks');
      }
      return next;
    });
  };

  const handleCopy = (verse: Verse, key: string) => {
    const text = `"${verse.text}" — ${verse.book} ${verse.chapter}:${verse.verse}`;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Verse copied with reference');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-neutral-950 text-neutral-100 overflow-y-auto">
      {/* Search & Book Selector Header */}
      <div className="p-3 border-b border-neutral-800 bg-neutral-900/60 sticky top-0 z-10 backdrop-blur-md space-y-2">
        <div className="flex items-center justify-between gap-2 max-w-3xl mx-auto">
          {/* Instant Offline Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search scriptures, keywords, or references..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
            />
          </div>

          {/* Font Size Adjusters */}
          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => setFontSize((f) => Math.max(13, f - 1))}
              className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white"
              title="Decrease font size"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-1 text-neutral-300">{fontSize}px</span>
            <button
              type="button"
              onClick={() => setFontSize((f) => Math.min(22, f + 1))}
              className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white"
              title="Increase font size"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Book Selector Pills */}
        {!searchQuery && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-3xl mx-auto scrollbar-none">
            {books.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setSelectedBook(b)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedBook === b
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-white border border-neutral-800'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Verses Container */}
      <div className="p-4 max-w-3xl w-full mx-auto space-y-3">
        {displayedVerses.length === 0 ? (
          <div className="py-12 text-center text-neutral-500 space-y-2">
            <BookOpen className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-sm font-medium">No verses matched your search query</p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-blue-400 hover:underline"
            >
              Clear search filter
            </button>
          </div>
        ) : (
          displayedVerses.map((verse) => {
            const key = `${verse.book}-${verse.chapter}-${verse.verse}`;
            const isBookmarked = bookmarkedKeys.has(key);

            return (
              <div
                key={key}
                className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-750 transition-colors space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-400">
                    {verse.book} {verse.chapter}:{verse.verse}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleBookmark(key)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isBookmarked
                          ? 'text-amber-400 bg-amber-400/10'
                          : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                      }`}
                      title={isBookmarked ? 'Remove bookmark' : 'Save bookmark'}
                    >
                      {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(verse, key)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                      title="Copy verse"
                    >
                      {copiedKey === key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <p
                  className="text-neutral-200 leading-relaxed"
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {verse.text}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
