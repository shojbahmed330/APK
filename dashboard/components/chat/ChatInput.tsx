import React, { useRef, useEffect, useState } from 'react';
import { Image as ImageIcon, Send, X, Loader2, Square, Command, FileCode, Wrench, TestTube, Map, Edit, FileText } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';

interface ChatInputProps {
  input: string;
  setInput: (s: string) => void;
  isGenerating: boolean;
  handleSend: () => void;
  handleStop?: () => void;
  selectedImage: { data: string; mimeType: string; preview: string } | null;
  setSelectedImage: (img: any) => void;
  handleImageSelect: (file: File) => void;
  executionQueue: string[];
  projectFiles?: Record<string, string>;
}

interface SuggestionItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  type: 'command' | 'file';
}

const COMMANDS: SuggestionItem[] = [
  { id: 'plan', label: '/plan', description: 'Create a development plan', icon: <Map size={14} />, type: 'command' },
  { id: 'edit', label: '/edit', description: 'Edit code files', icon: <Edit size={14} />, type: 'command' },
  { id: 'fix', label: '/fix', description: 'Fix bugs or errors', icon: <Wrench size={14} />, type: 'command' },
  { id: 'test', label: '/test', description: 'Run unit tests', icon: <TestTube size={14} />, type: 'command' },
];

const ChatInput: React.FC<ChatInputProps> = ({
  input, setInput, isGenerating, handleSend, handleStop, selectedImage, setSelectedImage, handleImageSelect, executionQueue, projectFiles
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useLanguage();

  // Suggestion State
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState<'/' | '@' | null>(null);
  const [filteredSuggestions, setFilteredSuggestions] = useState<SuggestionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);
    
    const cursor = e.target.selectionStart;
    setCursorPosition(cursor);

    // Detect triggers
    const textBeforeCursor = newValue.slice(0, cursor);
    const lastWord = textBeforeCursor.split(/\s+/).pop() || '';

    if (lastWord.startsWith('/')) {
      setSuggestionType('/');
      const query = lastWord.slice(1).toLowerCase();
      setFilteredSuggestions(COMMANDS.filter(c => c.label.toLowerCase().includes(query)));
      setShowSuggestions(true);
      setSelectedIndex(0);
    } else if (lastWord.startsWith('@')) {
      setSuggestionType('@');
      const query = lastWord.slice(1).toLowerCase();
      const files = projectFiles ? Object.keys(projectFiles) : [];
      const fileSuggestions: SuggestionItem[] = files
        .filter(f => f.toLowerCase().includes(query))
        .slice(0, 10) // Limit to 10
        .map(f => ({
          id: f,
          label: `@${f}`,
          description: 'Project File',
          icon: <FileCode size={14} />,
          type: 'file'
        }));
      setFilteredSuggestions(fileSuggestions);
      setShowSuggestions(fileSuggestions.length > 0);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionSelect = (item: SuggestionItem) => {
    const textBeforeCursor = input.slice(0, cursorPosition);
    const textAfterCursor = input.slice(cursorPosition);
    const lastWord = textBeforeCursor.split(/\s+/).pop() || '';
    
    const newTextBefore = textBeforeCursor.slice(0, -lastWord.length) + item.label + ' ';
    const newValue = newTextBefore + textAfterCursor;
    
    setInput(newValue);
    setShowSuggestions(false);
    
    // Focus back and set cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = newTextBefore.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSuggestionSelect(filteredSuggestions[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isQueued = executionQueue && executionQueue.length > 0;

  return (
    <div className="p-4 md:p-6 border-t border-white/5 bg-black/60 backdrop-blur-2xl relative z-20">
      {/* Suggestions Popover */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute bottom-full left-2 right-2 md:left-6 md:right-auto md:w-80 mb-2 bg-[#121214] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 z-50">
          <div className="px-3 py-2 bg-white/5 border-b border-white/5 text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
            {suggestionType === '/' ? 'Commands' : 'Files'}
          </div>
          <div className="max-h-48 md:max-h-60 overflow-y-auto custom-scrollbar p-1">
            {filteredSuggestions.map((item, idx) => (
              <button
                key={item.id}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents textarea from losing focus
                }}
                onClick={() => handleSuggestionSelect(item)}
                className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg text-left transition-colors ${idx === selectedIndex ? 'bg-pink-500/20 text-pink-400' : 'text-zinc-400 hover:bg-white/5'}`}
              >
                <div className={`p-1.5 rounded-md ${idx === selectedIndex ? 'bg-pink-500/20' : 'bg-white/5'}`}>
                  {item.icon}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[13px] md:text-[12px] font-bold truncate">{item.label}</span>
                  {item.description && <span className="text-[10px] md:text-[9px] opacity-60 truncate">{item.description}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedImage && (
        <div className="mb-4 relative w-20 h-20 rounded-xl overflow-hidden border border-pink-500/50 group animate-in zoom-in">
          <img src={selectedImage.preview} className="w-full h-full object-cover" alt="Selected" />
          <button onClick={() => setSelectedImage(null)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <X size={16} className="text-white"/>
          </button>
        </div>
      )}

      <div className={`
        flex items-end gap-3 md:gap-4 bg-white/5 border rounded-2xl p-1.5 md:p-2 transition-all
        ${isGenerating ? 'border-pink-500/40' : 'border-white/10 focus-within:border-pink-500/40'}
      `}>
         <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onFileChange} />
         <button 
           disabled={isGenerating}
           onClick={() => fileInputRef.current?.click()} 
           className="p-2.5 md:p-3 mb-0.5 text-zinc-500 hover:text-white transition-colors disabled:opacity-20"
         >
           <ImageIcon size={18}/>
         </button>

         <textarea 
           ref={textareaRef}
           disabled={isGenerating}
           value={input} 
           onChange={handleInputChange} 
           onKeyDown={handleKeyDown}
           placeholder={isGenerating ? "Neural Core is processing..." : (isQueued ? "Waiting for next step..." : t('chat.placeholder'))} 
           className="flex-1 bg-transparent py-3 text-[13px] md:text-sm outline-none text-white resize-none max-h-48 overflow-y-auto custom-scrollbar min-h-[44px]" 
           rows={1}
         />

         {isGenerating ? (
           <button 
             onClick={handleStop}
             className="p-3.5 md:p-4 bg-red-600 text-white rounded-xl active:scale-95 transition-all shadow-lg animate-in zoom-in mb-0.5"
             title="Stop Generation"
           >
             <Square size={16} fill="currentColor"/>
           </button>
         ) : (
           <button 
             onClick={handleSend} 
             disabled={!input.trim() && !selectedImage} 
             className="p-3.5 md:p-4 bg-pink-600 text-white rounded-xl active:scale-95 disabled:bg-zinc-800 disabled:text-zinc-600 transition-all shadow-lg mb-0.5"
           >
             <Send size={16}/>
           </button>
         )}
      </div>
    </div>
  );
};

export default ChatInput;
