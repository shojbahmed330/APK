
import React, { useState, useMemo } from 'react';
import { FileCode, ChevronDown, ChevronUp, Split, FileDiff } from 'lucide-react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

interface CodeChangeBlockProps {
  files: Record<string, string>;
  originalFiles?: Record<string, string>;
}

const CodeChangeBlock: React.FC<CodeChangeBlockProps> = ({ files, originalFiles = {} }) => {
  const [isOpen, setIsOpen] = useState(false);
  const filePaths = Object.keys(files);
  const [selectedFile, setSelectedFile] = useState<string | null>(filePaths[0] || null);
  const [splitView, setSplitView] = useState(true);

  if (filePaths.length === 0) return null;

  const oldCode = useMemo(() => selectedFile ? originalFiles[selectedFile] || '' : '', [selectedFile, originalFiles]);
  const newCode = useMemo(() => selectedFile ? files[selectedFile] || '' : '', [selectedFile, files]);

  const diffStyles = {
    variables: {
      dark: {
        diffViewerBackground: '#0d0d0f',
        diffViewerColor: '#FFF',
        addedBackground: '#044B53',
        addedColor: 'white',
        removedBackground: '#632F34',
        removedColor: 'white',
        wordAddedBackground: '#055d67',
        wordRemovedBackground: '#7d383f',
        addedGutterBackground: '#034148',
        removedGutterBackground: '#632b30',
        gutterBackground: '#0d0d0f',
        gutterBackgroundDark: '#0d0d0f',
        highlightBackground: '#2a3942',
        highlightGutterBackground: '#2a3942',
        codeFoldGutterBackground: '#21232b',
        codeFoldBackground: '#262831',
        emptyLineBackground: '#0d0d0f',
        gutterColor: '#464c67',
        addedGutterColor: '#8c8c8c',
        removedGutterColor: '#8c8c8c',
        codeFoldContentColor: '#555a7b',
        diffViewerTitleBackground: '#2f323e',
        diffViewerTitleColor: '#555a7b',
        diffViewerTitleBorderColor: '#353846',
      }
    },
    line: {
      padding: '10px 2px',
      '&:hover': {
        background: '#161618',
      },
    },
    content: {
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: '12px',
    },
    gutter: {
      minWidth: '30px',
      padding: '0 5px',
    }
  };

  return (
    <div className="my-6 bg-[#0d0d0f] rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-left-4 duration-700 w-full">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 cursor-pointer hover:bg-white/5 transition-all group"
      >
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2 bg-pink-500/20 rounded-xl text-pink-500 group-hover:scale-110 transition-transform">
            <FileCode size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-pink-500/80">Code Changes</span>
            <span className="text-[10px] md:text-[11px] font-bold text-white mt-0.5">
              Modified {filePaths.length} file{filePaths.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="px-2 py-1 bg-white/5 rounded-md border border-white/10">
            <span className="text-[8px] md:text-[9px] font-black uppercase text-zinc-400">{isOpen ? 'Close' : 'Review'}</span>
          </div>
          {isOpen ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
        </div>
      </div>
      
      {isOpen && (
        <div className="border-t border-white/5 flex flex-col h-[600px]">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/5">
            <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar no-scrollbar max-w-[70%]">
              {filePaths.map((path) => (
                <button
                  key={path}
                  onClick={() => setSelectedFile(path)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap flex items-center gap-2 ${selectedFile === path ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                >
                  <FileDiff size={12} />
                  {path.split('/').pop()}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setSplitView(!splitView)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all text-[10px] font-bold uppercase tracking-wider border border-white/5"
            >
              <Split size={12} />
              {splitView ? 'Unified' : 'Split'}
            </button>
          </div>

          {/* Diff Viewer Container */}
          <div className="flex-1 overflow-auto custom-scrollbar bg-[#0d0d0f] relative">
            {selectedFile ? (
               <ReactDiffViewer
                 oldValue={oldCode}
                 newValue={newCode}
                 splitView={splitView}
                 useDarkTheme={true}
                 styles={diffStyles}
                 leftTitle="Original"
                 rightTitle="Modified"
                 compareMethod={DiffMethod.WORDS}
               />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-3">
                <FileCode size={32} strokeWidth={1} className="opacity-50" />
                <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest text-center">Select a file to review changes</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {!isOpen && (
        <div className="px-5 py-3 bg-black/20 border-t border-white/5 flex items-center gap-2 overflow-x-auto custom-scrollbar no-scrollbar">
          {filePaths.map(path => (
            <div key={path} className="px-2 py-1 bg-white/5 rounded-md border border-white/5 flex items-center gap-2 shrink-0">
              <span className="text-[9px] font-bold text-zinc-500">{path.split('/').pop()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CodeChangeBlock;
