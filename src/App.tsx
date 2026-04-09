import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  FileText,
  Sparkles,
  Filter,
  Lightbulb,
  LayoutGrid,
  List,
  AtSign,
  Video,
} from "lucide-react";
import "./index.css";
import { Sidebar } from "./components/Sidebar";

interface Video {
  video_id: string;
  title: string;
  author: string | null;
  handle: string | null;
  length_seconds: number | null;
  transcript: string | null;
  summary: string | null;
  view_count: number | null;
  video_type: string | null;
  published_at: string | null;
  date_added: string | null;
  thumbnail: string;
  status: string | null;
  youtube_url: string | null;
}

interface DisplaySettings {
  resolution: String;
  fullscreen: boolean;
  theme: string;
  video_list_mode: string;
}

interface Facet {
  type: string;
  value: string;
}

const DEFAULT_FILTER_FACET = [{ type: 'title_search', value: '' }];

function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [facets, setFacets] = useState<Facet[]>(DEFAULT_FILTER_FACET);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [activeTab, setActiveTab] = useState<"transcript" | "summary">("transcript");
  const [imagePrompt, setImagePrompt] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoListMode, setVideoListMode] = useState<'grid' | 'compact'>('grid');
  const [summaryFilter, setSummaryFilter] = useState<'all' | 'with_summaries'>('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadVideos();
    loadDisplaySettings();
  }, []);

  const loadDisplaySettings = async () => {
    try {
      const settings = await invoke<DisplaySettings>("get_display_settings");
      document.documentElement.classList.toggle('dark', settings.theme === 'dark');
      setVideoListMode(settings.video_list_mode as 'grid' | 'compact');
    } catch (err) {
      console.error("Failed to load display settings:", err);
    }
  };

  const loadVideos = async () => {
    try {
      const result = await invoke<Video[]>("get_all_videos");
      setVideos(result);
    } catch (err) {
      console.error("Failed to load videos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInput = useCallback((val: string) => {
    const lowerVal = val.toLowerCase();

    for (const prefix of ['title_search:', 'transcript_search:', 'handle:', 'video:']) {
      if (lowerVal.includes(prefix)) {
        const afterFacet = val.toLowerCase().split(prefix)[1]?.trim() || "";
        setFacets([{ type: prefix === 'title_search:' ? 'title_search' : prefix === 'transcript_search:' ? 'transcript_search' : prefix === 'handle:' ? 'handle' : 'video', value: '' }]);
        setSearchQuery(afterFacet);
        return;
      }
    }

    const handle = val.startsWith('@') ? val.substring(1) : null;
    const videoId = val.startsWith('>') ? val.substring(1) : null;
    const urlMatch = val.match(/youtube\.com\/(?:c\/|channel\/|@|user\/)([^\/\s?]+)/i);
    const extractedHandle = urlMatch ? urlMatch[1] : null;
    const videoUrlMatch = val.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const extractedVideoId = videoUrlMatch ? videoUrlMatch[1] : null;

    if (handle || extractedHandle) {
      setFacets([{ type: 'handle', value: '' }]);
      setSearchQuery(handle || extractedHandle || "");
      return;
    }

    if (videoId || extractedVideoId) {
      setFacets([{ type: 'video', value: '' }]);
      setSearchQuery(videoId || extractedVideoId || "");
      return;
    }

    setSearchQuery(val);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && searchQuery === '' && facets.length > 0 && e.currentTarget.selectionStart === 0) {
      const lastFacet = facets[facets.length - 1];
      setFacets(facets.slice(0, -1));
      setSearchQuery(lastFacet.type + ':');
      e.preventDefault();
    }
  };

  const removeFacet = (index: number) => {
    setFacets(facets.filter((_, i) => i !== index));
    if (facets.length === 1) {
      setSearchQuery("");
    }
  };

  const getFacetIcon = (type: string) => {
    switch (type) {
      case 'handle': return <AtSign className="w-3 h-3" />;
      case 'video': return <span className="text-xs font-bold">{'>'}</span>;
      case 'transcript_search':
      case 'title_search': return <Filter className="w-3 h-3" />;
      default: return <Filter className="w-3 h-3" />;
    }
  };

  const formatViews = (views: number | null) => {
    if (!views) return "";
    if (views >= 1000000000) return (views / 1000000000).toFixed(1) + "B";
    if (views >= 1000000) return (views / 1000000).toFixed(1) + "M";
    if (views >= 1000) return (views / 1000).toFixed(0) + "K";
    return views.toString();
  };

  const filteredVideos = useMemo(() => {
    const q = (searchQuery || "").toLowerCase();
    const textParts = q.split(' ').filter(Boolean);
    
    return videos.filter(v => {
      // Summary filter
      if (summaryFilter === 'with_summaries' && !v.summary) return false;

      // Facet logic
      for (const f of facets) {
        if (f.type === 'handle') {
          const fv = (f.value || searchQuery).toLowerCase();
          if (fv === "") continue;
          if (!v.handle?.toLowerCase().includes(fv) && !v.author?.toLowerCase().includes(fv)) return false;
        } else if (f.type === 'title_search') {
          const fv = (f.value || searchQuery).toLowerCase();
          if (fv === "") continue;
          const terms = fv.split(' ').filter(Boolean);
          if (!terms.every(t => 
            v.title.toLowerCase().includes(t) || 
            v.author?.toLowerCase().includes(t) ||
            v.handle?.toLowerCase().includes(t)
          )) return false;
        } else if (f.type === 'transcript_search') {
          const fv = (f.value || searchQuery).toLowerCase();
          if (fv === "") continue;
          if (!v.transcript?.toLowerCase().includes(fv)) return false;
        } else if (f.type === 'video') {
          const fv = (f.value || searchQuery).toLowerCase();
          if (fv === "") continue;
          if (!v.video_id.toLowerCase().includes(fv)) return false;
        }
      }

      // If we have any facet that ISN'T a global search, don't do the fallback global search
      const hasFacet = facets.some(f => f.type !== '');
      if (!hasFacet && textParts.length > 0) {
        const searchTarget = `${v.title} ${v.author || ''} ${v.handle || ''} ${v.transcript || ''} ${v.summary || ''}`.toLowerCase();
        if (!textParts.every(t => searchTarget.includes(t))) return false;
      }

      return true;
    });
  }, [videos, searchQuery, facets, summaryFilter]);

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) return;
    setIsGeneratingImage(true);
    setGeneratedImage(null);
    try {
      const imageUrl = await invoke<string>("generate_image", { prompt: imagePrompt });
      setGeneratedImage(imageUrl);
    } catch (err) {
      console.error("Failed to generate image:", err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleAddImageToContent = async (type: "transcript" | "summary") => {
    if (!generatedImage || !selectedVideo) return;
    const imageMarkdown = `![Generated Image](${generatedImage})\n\n`;

    if (type === "transcript" && selectedVideo.transcript) {
      const newTranscript = imageMarkdown + selectedVideo.transcript;
      await invoke("update_transcript", { videoId: selectedVideo.video_id, newTranscript });
      setSelectedVideo({ ...selectedVideo, transcript: newTranscript });
      setVideos(videos.map(v => v.video_id === selectedVideo.video_id ? { ...v, transcript: newTranscript } : v));
    } else if (type === "summary" && selectedVideo.summary) {
      const newSummary = imageMarkdown + selectedVideo.summary;
      await invoke("update_summary", { videoId: selectedVideo.video_id, newSummary });
      setSelectedVideo({ ...selectedVideo, summary: newSummary });
      setVideos(videos.map(v => v.video_id === selectedVideo.video_id ? { ...v, summary: newSummary } : v));
    }

    setGeneratedImage(null);
    setImagePrompt("");
  };

  const handleSaveSummary = async (newSummary: string) => {
    if (!selectedVideo) return;
    try {
      await invoke("update_summary", { videoId: selectedVideo.video_id, newSummary });
      setSelectedVideo({ ...selectedVideo, summary: newSummary });
      setVideos(videos.map(v => v.video_id === selectedVideo.video_id ? { ...v, summary: newSummary } : v));
    } catch (err) {
      console.error("Failed to save summary:", err);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hours}:${remainMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white font-sans selection:bg-red-500/30 selection:text-white pb-20 select-none">
      <div className="container mx-auto px-4 pt-4">
        <header className="mb-10 relative z-10 transition-all">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-12 relative max-w-7xl mx-auto border-b border-[#272727] pb-6">
            <div className="flex items-center gap-3">
              <img src="/photosynthesis.png" alt="Photosynthesis" className="w-10 h-10" />
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold tracking-tighter text-white">
                  <span className="text-green-500">Photo</span>synthesis
                </h1>
                <span className="text-xs text-gray-500 -mt-0.5">Autotrophic Generator</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  const newMode = videoListMode === 'grid' ? 'compact' : 'grid';
                  setVideoListMode(newMode);
                  try {
                    const settings = await invoke<DisplaySettings>("get_display_settings");
                    await invoke("set_display_settings", {
                      settings: {
                        ...settings,
                        video_list_mode: newMode,
                      }
                    });
                  } catch (err) {
                    console.error("Failed to save video_list_mode:", err);
                  }
                }}
                className="p-2 text-gray-400 hover:text-white transition-all cursor-pointer bg-[#272727] rounded-lg"
                title={videoListMode === 'grid' ? "Switch to Compact View" : "Switch to Grid View"}
              >
                {videoListMode === 'grid' ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Search Bar - Kinesis Style */}
          <form onSubmit={(e) => e.preventDefault()} className="w-full max-w-2xl mx-auto">
            <div className="flex items-stretch justify-center">
              <div className="relative flex-1">
                <div className="flex flex-wrap items-center bg-[#121212] border border-[#303030] rounded-full focus-within:ring-1 focus-within:ring-red-500 transition-all min-h-11 py-1 px-3 gap-2">
                  {facets.map((f, i) => (
                    <div key={`${f.type}-${i}`} className="flex items-center gap-1.5 bg-[#272727] border border-[#444444] text-[#aaaaaa] rounded-full px-3 py-0.5 animate-in zoom-in-95 duration-200 shadow-sm shrink-0 select-none">
                      {getFacetIcon(f.type)}
                      <span className="text-[11px] font-bold uppercase tracking-wider">{f.type.replace(/_/g, ' ')}</span>
                      <button
                        type="button"
                        onClick={() => removeFacet(i)}
                        className="hover:text-red-500 transition-colors ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={searchQuery || facets.length > 0 ? "" : "Search your library"}
                    className="flex-1 min-w-[120px] bg-transparent text-white px-2 focus:outline-none placeholder-gray-500 text-[16px] h-full"
                  />
                    <div className="group/hint relative flex items-center pr-1">
                    <Lightbulb className="w-4 h-4 text-gray-500 hover:text-yellow-400 transition-colors cursor-help" />
                    <div className="absolute top-full right-0 mt-3 w-72 bg-[#1a1a1a] border border-[#333] rounded-xl p-4 shadow-2xl opacity-0 translate-y-2 pointer-events-none group-hover/hint:opacity-100 group-hover/hint:translate-y-0 transition-all duration-200 z-50">
                      <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3 border-b border-[#333] pb-2">Filter Tips</h4>
                      <div className="space-y-2 text-[11px]">
                        <code className="bg-black/40 px-2 py-1 rounded text-white block">
                          title_search: <span className="text-gray-500">Filter by title</span>
                        </code>
                        <code className="bg-black/40 px-2 py-1 rounded text-white block">
                          transcript_search: <span className="text-gray-500">Filter by transcript</span>
                        </code>
                        <code className="bg-black/40 px-2 py-1 rounded text-white block">
                          handle: <span className="text-gray-500">Filter by channel</span>
                        </code>
                        <code className="bg-black/40 px-2 py-1 rounded text-white block">
                          video: <span className="text-gray-500">{'>'} / ID / URL</span>
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </header>

{/* Content Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4 max-w-[1700px] mx-auto px-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-bold text-white">Videos</h3>
            <span className="text-[#aaaaaa] text-sm font-medium">
              ({filteredVideos.length} results)
            </span>
          </div>

          <div className="flex items-center bg-[#1a1a1a] p-1 rounded-xl border border-[#272727] gap-1 shadow-inner">
            <button
              onClick={() => setSummaryFilter(summaryFilter === 'all' ? 'with_summaries' : 'all')}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all cursor-pointer flex items-center gap-2 ${
                summaryFilter === 'with_summaries' 
                  ? 'bg-white text-black shadow-lg scale-[1.02]' 
                  : 'text-[#888888] hover:text-white hover:bg-white/5'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              {summaryFilter === 'all' ? 'All Videos' : 'With AI Summaries'}
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 space-y-4">
            <div className="w-8 h-8 border-4 border-[#303030] border-t-red-600 rounded-full animate-spin" />
            <p className="font-medium text-sm">Loading library...</p>
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="text-center text-gray-500 py-24">
            <p className="text-xl font-bold text-white mb-2">Build your library</p>
            <p className="text-sm">Find videos and save their transcripts here.</p>
          </div>
        ) : (
          <div className={`grid gap-x-4 gap-y-8 max-w-[1700px] mx-auto ${videoListMode === 'grid' ? 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8'}`}>
            {filteredVideos.map((video) => (
              <div
                key={video.video_id}
                onClick={() => {
                  setSelectedVideo(video);
                  setActiveTab(video.summary ? "summary" : "transcript");
                  setGeneratedImage(null);
                  setImagePrompt("");
                  setSidebarOpen(true);
                }}
                className="group flex flex-col gap-2 cursor-pointer transition-all"
              >
                <div className="aspect-video w-full rounded-lg overflow-hidden bg-[#272727] relative">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://via.placeholder.com/320x180?text=No+Thumbnail";
                    }}
                  />
                  {video.length_seconds && (
                    <span className="absolute bottom-2 right-2 bg-black text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      {formatDuration(video.length_seconds)}
                    </span>
                  )}
                </div>
                <div className="flex flex-col flex-1 overflow-hidden">
                  <h3 className={`font-bold text-white line-clamp-2 leading-tight group-hover:text-white ${videoListMode === 'compact' ? 'text-xs' : 'text-sm'}`}>
                    {video.title}
                  </h3>
                  <div className={`flex flex-col text-[#aaaaaa] mt-1 ${videoListMode === 'compact' ? 'text-[10px]' : 'text-[13px]'}`}>
                    <span className="truncate" title={video.handle ? `Handle: @${video.handle.replace(/^@/, '')}` : undefined}>
                      {video.author || "YouTube Creator"}
                    </span>
                    <div className="flex items-center gap-1">
                      {video.view_count && (
                        <span title={`Views: ${video.view_count.toLocaleString('en-US')}`}>
                          {formatViews(video.view_count)} views
                        </span>
                      )}
                      {video.view_count && video.date_added && <span className="text-[8px]">•</span>}
                      {video.date_added && (
                        <span title={`Timestamp: ${video.date_added}`}>
                          {formatDate(video.date_added)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {video.transcript && (
                      <div className="flex items-center gap-1 text-[10px] text-green-500/80 font-bold uppercase transition-colors">
                        <FileText className="w-3 h-3" />
                        Transcript
                      </div>
                    )}
                    {video.summary && (
                      <div className="flex items-center gap-1 text-[10px] text-purple-500/80 font-bold uppercase transition-colors">
                        <Sparkles className="w-3 h-3" />
                        AI Summary
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        video={selectedVideo}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        imagePrompt={imagePrompt}
        onImagePromptChange={setImagePrompt}
        onGenerateImage={handleGenerateImage}
        isGeneratingImage={isGeneratingImage}
        generatedImage={generatedImage}
        onAddImageToContent={handleAddImageToContent}
        onSaveSummary={handleSaveSummary}
        onImageAddedToSummary={() => setActiveTab("summary")}
        onUpdateSummary={handleSaveSummary}
        youtubeUrl={selectedVideo?.youtube_url || undefined}
      />
    </div>
  );
}

export default App;