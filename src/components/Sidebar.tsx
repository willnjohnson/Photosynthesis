import { X, FileText, Sparkles, Image as ImageIcon, Loader2, Upload, Search, Save } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { invoke } from "@tauri-apps/api/core";

interface PixabayImage {
  id: number;
  url: string;
  thumbnail: string;
  width: number;
  height: number;
  tags: string;
}

interface Video {
  video_id: string;
  title: string;
  author: string | null;
  handle: string | null;
  thumbnail: string;
  transcript: string | null;
  summary: string | null;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  video: Video | null;
  activeTab: "transcript" | "summary";
  onTabChange: (tab: "transcript" | "summary") => void;
  imagePrompt: string;
  onImagePromptChange: (val: string) => void;
  onGenerateImage: () => void;
  isGeneratingImage: boolean;
  generatedImage: string | null;
  onAddImageToContent: (type: "transcript" | "summary") => void;
  onSaveSummary: (newSummary: string) => void;
  onImageAddedToSummary?: () => void;
  onUpdateSummary: (newSummary: string) => void;
  youtubeUrl?: string;
}

export function Sidebar({
  isOpen,
  onClose,
  video,
  activeTab,
  onTabChange,
  imagePrompt,
  onImagePromptChange,
  onGenerateImage,
  isGeneratingImage,
  generatedImage,
  onAddImageToContent: _onAddImageToContent,
  onSaveSummary,
  onImageAddedToSummary,
  onUpdateSummary,
}: SidebarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [imageTab, setImageTab] = useState<"venice" | "pixabay">("venice");
  const [lexicaQuery, setLexicaQuery] = useState("");
  const [lexicaImages, setLexicaImages] = useState<PixabayImage[]>([]);
  const [isLexicaLoading, setIsLexicaLoading] = useState(false);
  const [lexicaError, setLexicaError] = useState<string | null>(null);
  const [pixabayApiKey, setPixabayApiKey] = useState("");
  const [pixabayApiKeySaved, setPixabayApiKeySaved] = useState(false);
  const [veniceApiKey, setVeniceApiKey] = useState("");
  const [veniceApiKeySaved, setVeniceApiKeySaved] = useState(false);
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(true);
  const [imageHover, setImageHover] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [promptSource, setPromptSource] = useState<"transcript" | "url">("transcript");

  useEffect(() => {
    if (contentRef.current && isOpen) {
      contentRef.current.scrollTop = 0;
    }
  }, [video?.video_id, isOpen]);

  const handleDeleteImage = (src: string) => {
    if (!video?.summary) return;
    console.log('Deleting image with src:', src);
    console.log('Current summary contains src:', video.summary.includes(src));
    
    const lines = video.summary.split('\n');
    const newLines = lines.filter(line => {
      return !line.includes(src);
    });
    const newSummary = newLines.join('\n').replace(/\n\n\n+/g, '\n\n').trim();
    
    console.log('Lines after filter:', newLines.length, 'New summary:', newSummary);
    onUpdateSummary(newSummary);
  };

  const handleEdit = () => {
    if (video?.summary) {
      setEditContent(video.summary);
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    onSaveSummary(editContent);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent("");
  };

  const handleTabChange = (tab: "transcript" | "summary") => {
    if (isEditing) {
      setIsEditing(false);
      setEditContent("");
    }
    onTabChange(tab);
  };

  const handlePixabaySearch = async () => {
    if (!lexicaQuery.trim()) return;
    setIsLexicaLoading(true);
    setLexicaImages([]);
    setLexicaError(null);
    try {
      const images = await invoke<PixabayImage[]>("search_pixabay", { query: lexicaQuery });
      setLexicaImages(images);
    } catch (err) {
      console.error("Failed to search Pixabay:", err);
      setLexicaError(String(err));
    } finally {
      setIsLexicaLoading(false);
    }
  };

  const handleAddPixabayImage = async (image: PixabayImage) => {
    if (!video?.summary) return;
    const tags = image.tags.split(", ").slice(0, 3).join(", ");
    const imageMarkdown = `![${tags}](${image.url} "${tags}")`;
    const newContent = `${imageMarkdown}\n\n${video.summary}`;
    onSaveSummary(newContent);
    onImageAddedToSummary?.();
  };

  const handleSavePixabayApiKey = async () => {
    if (!pixabayApiKey.trim()) return;
    try {
      await invoke("set_pixabay_api_key", { apiKey: pixabayApiKey });
      setPixabayApiKeySaved(true);
    } catch (err) {
      console.error("Failed to save API key:", err);
    }
  };

  const handleUpdatePixabayApiKey = () => {
    setPixabayApiKeySaved(false);
  };

  const handleCancelPixabayApiKey = () => {
    invoke<string | null>("get_pixabay_api_key").then(key => {
      if (key) {
        setPixabayApiKey(key);
        setPixabayApiKeySaved(true);
      }
    });
  };

  const handleSaveVeniceApiKey = async () => {
    if (!veniceApiKey.trim()) return;
    try {
      await invoke("set_venice_api_key", { apiKey: veniceApiKey });
      setVeniceApiKeySaved(true);
    } catch (err) {
      console.error("Failed to save Venice API key:", err);
    }
  };

  const handleUpdateVeniceApiKey = () => {
    setVeniceApiKeySaved(false);
  };

  const handleCancelVeniceApiKey = () => {
    invoke<string | null>("get_venice_api_key").then(key => {
      if (key) {
        setVeniceApiKey(key);
        setVeniceApiKeySaved(true);
      }
    });
  };

  useEffect(() => {
    const loadApiKeys = async () => {
      try {
        const pixabayKey = await invoke<string | null>("get_pixabay_api_key");
        if (pixabayKey) {
          setPixabayApiKey(pixabayKey);
          setPixabayApiKeySaved(true);
        }
        const veniceKey = await invoke<string | null>("get_venice_api_key");
        if (veniceKey) {
          setVeniceApiKey(veniceKey);
          setVeniceApiKeySaved(true);
        }
      } catch (err) {
        console.error("Failed to load API keys:", err);
      } finally {
        setIsLoadingApiKey(false);
      }
    };
    loadApiKeys();
  }, []);
  if (!video) return null;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 w-[1400px] max-w-full bg-[#0f0f0f] border-l border-[#303030] transform transition-transform duration-300 ease-in-out z-50 shadow-2xl ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-[#303030] flex justify-between items-start bg-white/5">
            <div className="flex gap-4 items-start">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-30 h-16 object-cover rounded-lg"
              />
              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#aaaaaa]">
                  Transcript
                </span>
                <h2 className="text-sm font-semibold text-white pr-8 line-clamp-2 leading-relaxed">
                  {video.title}
                </h2>
                {video.author && (
                  <span className="text-xs text-[#aaaaaa]">
                    {video.handle ? `@${video.handle.replace(/^@/, '')}` : video.author}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[#aaaaaa] hover:text-white transition-colors cursor-pointer p-1 flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Split Content: Left (Transcript/Summary) + Right (Image Tools) */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Side: Transcript / Summary */}
            <div ref={contentRef} className="flex-1 overflow-y-auto p-6 text-[#aaaaaa] text-sm leading-relaxed font-sans selection:bg-[#3f3f3f] bg-[#121212] custom-scrollbar border-r border-[#303030]">
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-3">
                  <button
                    onClick={() => handleTabChange("transcript")}
                    className={`flex items-center gap-2 text-sm font-semibold transition-colors cursor-pointer ${
                      activeTab === "transcript"
                        ? "text-white border-b-2 border-red-500 pb-1"
                        : "text-[#aaaaaa] hover:text-white border-b-2 border-transparent pb-1"
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    Transcript
                  </button>
                  <button
                    onClick={() => handleTabChange("summary")}
                    className={`flex items-center gap-2 text-sm font-semibold transition-colors cursor-pointer ${
                      activeTab === "summary"
                        ? "text-white border-b-2 border-red-500 pb-1"
                        : "text-[#aaaaaa] hover:text-white border-b-2 border-transparent pb-1"
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    AI Summary
                  </button>
                </div>
                {activeTab === "summary" && video?.summary && !isEditing && (
                  <button
                    onClick={handleEdit}
                    className="px-2 py-1 rounded-lg bg-[#222222] border border-[#383838] hover:bg-[#3f3f3f] cursor-pointer text-white text-xs font-semibold transition-colors"
                  >
                    Markdown Editor
                  </button>
                )}
                {isEditing && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCancel}
                      className="px-2 py-1 rounded-lg bg-[#222222] border border-[#383838] hover:bg-[#3f3f3f] cursor-pointer text-white text-xs font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-all text-xs font-bold cursor-pointer shadow-lg shadow-red-900/10"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>

              <div className="text-gray-300 whitespace-pre-wrap">
                {activeTab === "transcript" ? (
                  video.transcript ? (
                    video.transcript
                  ) : (
                    <p className="text-gray-600">No transcript available</p>
                  )
                ) : isEditing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-[400px] bg-[#1a1a1a] border border-[#383838] rounded-lg p-4 text-sm text-white placeholder-[#666666] focus:outline-none focus:border-red-500 font-mono resize-none"
                    placeholder="Edit summary..."
                  />
                ) : video.summary ? (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      img: ({ node, ...props }) => {
                        console.log('img props:', props);
                        const src = props.src || '';
                        const isHovered = imageHover === src;
                        return (
                          <div 
                            className="relative inline-block my-2"
                            onMouseEnter={() => setImageHover(src)}
                            onMouseLeave={() => setImageHover(null)}
                          >
                            <img 
                              {...props}
                              className="max-w-full h-auto rounded-lg"
                            />
                            {isHovered && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteImage(src);
                                }}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white hover:bg-red-500 shadow-lg z-10 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      }
                    }}
                  >
                    {video.summary}
                  </ReactMarkdown>
                ) : (
                  <p className="text-gray-600">No summary available</p>
                )}
              </div>
            </div>

            {/* Right Side: Image Generation / Search */}
            <div className="w-[450px] flex flex-col bg-[#141414]">
              {/* Tab Header */}
              <div className="px-4 py-3 border-b border-[#303030]">
                <div className="flex gap-2">
                  <button
                    onClick={() => setImageTab("venice")}
                    className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer px-3 py-1.5 rounded-lg ${
                      imageTab === "venice"
                        ? "bg-red-600 text-white"
                        : "bg-[#222222] text-[#888888] hover:text-white"
                    }`}
                  >
                    <ImageIcon className="w-3 h-3" />
                    Venice
                  </button>
                  <button
                    onClick={() => setImageTab("pixabay")}
                    className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer px-3 py-1.5 rounded-lg ${
                      imageTab === "pixabay"
                        ? "bg-blue-600 text-white"
                        : "bg-[#222222] text-[#888888] hover:text-white"
                    }`}
                  >
                    <Search className="w-3 h-3" />
                    Pixabay
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {!video?.summary ? (
                  <p className="text-xs text-gray-500 py-2">
                    Image features only available for AI Summary
                  </p>
                ) : imageTab === "venice" ? (
                  <div className="flex flex-col gap-3">
                    {isLoadingApiKey ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                      </div>
                    ) : !veniceApiKeySaved ? (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                          Venice API Key
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder="Venice API Key..."
                            value={veniceApiKey}
                            onChange={(e) => setVeniceApiKey(e.target.value)}
                            className="flex-1 bg-[#222222] border border-[#383838] rounded-lg px-4 py-2 text-sm text-white placeholder-[#666666] focus:outline-none focus:border-red-500"
                            onKeyDown={(e) => e.key === "Enter" && handleSaveVeniceApiKey()}
                          />
                          <button
                            onClick={handleSaveVeniceApiKey}
                            disabled={!veniceApiKey.trim()}
                            className="bg-green-600 hover:bg-green-500 disabled:opacity-30 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
                          >
                            <Save className="w-4 h-4" />
                            Save
                          </button>
                          <button
                            onClick={handleCancelVeniceApiKey}
                            className="bg-[#444] hover:bg-[#555] text-white px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                        Enter Image Prompt (Model: Nano Banana Pro)
                      </p>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-[#888888]">Use:</span>
                        <button
                          onClick={() => setPromptSource("transcript")}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            promptSource === "transcript"
                              ? "bg-red-600 text-white"
                              : "bg-[#222222] border border-[#383838] text-[#888888] hover:text-white"
                          }`}
                        >
                          Transcript
                        </button>
                        <button
                          onClick={() => setPromptSource("url")}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            promptSource === "url"
                              ? "bg-red-600 text-white"
                              : "bg-[#222222] border border-[#383838] text-[#888888] hover:text-white"
                          }`}
                        >
                          YouTube URL
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            const content = promptSource === "transcript" 
                              ? (video.transcript || "") 
                              : `https://www.youtube.com/watch?v=${video.video_id}`;
                            onImagePromptChange(`Infographic based on ${promptSource === "transcript" ? "this transcript" : "this video"}:\n\n${content}`);
                          }}
                          className="px-2 py-1 rounded-lg bg-[#222222] border border-[#383838] hover:bg-[#3f3f3f] cursor-pointer text-white text-xs font-semibold transition-colors"
                        >
                          Infographic
                        </button>
                        <button
                          onClick={() => {
                            const content = promptSource === "transcript" 
                              ? (video.transcript || "") 
                              : `https://www.youtube.com/watch?v=${video.video_id}`;
                            onImagePromptChange(`Visual Summary Poster based on ${promptSource === "transcript" ? "this transcript" : "this video"}:\n\n${content}`);
                          }}
                          className="px-2 py-1 rounded-lg bg-[#222222] border border-[#383838] hover:bg-[#3f3f3f] cursor-pointer text-white text-xs font-semibold transition-colors"
                        >
                          Visual Poster
                        </button>
                        <button
                          onClick={() => {
                            const content = promptSource === "transcript" 
                              ? (video.transcript || "") 
                              : `https://www.youtube.com/watch?v=${video.video_id}`;
                            onImagePromptChange(`Concept Art based on ${promptSource === "transcript" ? "this transcript" : "this video"}:\n\n${content}`);
                          }}
                          className="px-2 py-1 rounded-lg bg-[#222222] border border-[#383838] hover:bg-[#3f3f3f] cursor-pointer text-white text-xs font-semibold transition-colors"
                        >
                          Concept Art
                        </button>
                        <button
                          onClick={() => {
                            const content = promptSource === "transcript" 
                              ? (video.transcript || "") 
                              : `https://www.youtube.com/watch?v=${video.video_id}`;
                            onImagePromptChange(`Scene Illustration based on ${promptSource === "transcript" ? "this transcript" : "this video"}:\n\n${content}`);
                          }}
                          className="px-2 py-1 rounded-lg bg-[#222222] border border-[#383838] hover:bg-[#3f3f3f] cursor-pointer text-white text-xs font-semibold transition-colors"
                        >
                          Scene Illustration
                        </button>
                        <button
                          onClick={() => {
                            const content = promptSource === "transcript" 
                              ? (video.transcript || "") 
                              : `https://www.youtube.com/watch?v=${video.video_id}`;
                            onImagePromptChange(`Data Visualization based on ${promptSource === "transcript" ? "this transcript" : "this video"}:\n\n${content}`);
                          }}
                          className="px-2 py-1 rounded-lg bg-[#222222] border border-[#383838] hover:bg-[#3f3f3f] cursor-pointer text-white text-xs font-semibold transition-colors"
                        >
                          Data Viz
                        </button>
                        <button
                          onClick={() => {
                            const content = promptSource === "transcript" 
                              ? (video.transcript || "") 
                              : `https://www.youtube.com/watch?v=${video.video_id}`;
                            onImagePromptChange(`Flowchart based on ${promptSource === "transcript" ? "this transcript" : "this video"}:\n\n${content}`);
                          }}
                          className="px-2 py-1 rounded-lg bg-[#222222] border border-[#383838] hover:bg-[#3f3f3f] cursor-pointer text-white text-xs font-semibold transition-colors"
                        >
                          Flowchart
                        </button>
                        <button
                          onClick={() => {
                            const content = promptSource === "transcript" 
                              ? (video.transcript || "") 
                              : `https://www.youtube.com/watch?v=${video.video_id}`;
                            onImagePromptChange(`Whiteboard Illustration based on ${promptSource === "transcript" ? "this transcript" : "this video"}:\n\n${content}`);
                          }}
                          className="px-2 py-1 rounded-lg bg-[#222222] border border-[#383838] hover:bg-[#3f3f3f] cursor-pointer text-white text-xs font-semibold transition-colors"
                        >
                          Whiteboard
                        </button>
                      </div>
                        <textarea
                          placeholder="Enter image prompt..."
                          value={imagePrompt}
                          onChange={(e) => onImagePromptChange(e.target.value)}
                          rows={4}
                          className="w-full bg-[#222222] border border-[#383838] rounded-lg px-4 py-2 text-sm text-white placeholder-[#666666] focus:outline-none focus:border-red-500 resize-none"
                        />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={onGenerateImage}
                          disabled={!imagePrompt.trim() || isGeneratingImage}
                          className="bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
                        >
                          {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate"}
                        </button>
                        <button
                          onClick={handleUpdateVeniceApiKey}
                          className="bg-[#444] hover:bg-[#555] text-white px-3 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer"
                          title="Update API Key"
                        >
                          Edit Key
                        </button>
                      </div>

                      {generatedImage && (
                        <div className="flex flex-col gap-2">
                          {isUploadingImage ? (
                            <div className="flex items-center justify-center py-2">
                              <Loader2 className="w-4 h-4 animate-spin text-blue-500 mr-2" />
                              <span className="text-xs text-blue-500">Uploading to Imgur...</span>
                            </div>
                          ) : (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                                Generated Image
                              </p>
                              <button
                                onClick={async () => {
                                  if (!video?.summary) return;
                                  setIsUploadingImage(true);
                                  try {
                                    const imgurUrl = await invoke<string>("upload_to_imgur", { imageUrl: generatedImage });
                                    const imageMarkdown = `![Image](${imgurUrl} "Image")`;
                                    const newContent = `${imageMarkdown}\n\n${video.summary}`;
                                    onSaveSummary(newContent);
                                    onImageAddedToSummary?.();
                                  } catch (err) {
                                    console.error("Failed to upload image:", err);
                                  } finally {
                                    setIsUploadingImage(false);
                                  }
                                }}
                                className="relative group rounded-lg overflow-hidden cursor-pointer inline-block"
                              >
                                <img src={generatedImage} alt="Image" className="rounded-lg" />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Upload className="w-6 h-6 text-white" />
                                </div>
                              </button>
                              <p className="text-[10px] text-gray-500">Click image to upload to Imgur and add to summary</p>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : imageTab === "pixabay" && (
                  <div className="flex flex-col gap-3">
                    {isLoadingApiKey ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                      </div>
                    ) : !pixabayApiKeySaved ? (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                          Pixabay API Key
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder="Pixabay API Key..."
                            value={pixabayApiKey}
                            onChange={(e) => setPixabayApiKey(e.target.value)}
                            className="flex-1 bg-[#222222] border border-[#383838] rounded-lg px-4 py-2 text-sm text-white placeholder-[#666666] focus:outline-none focus:border-red-500"
                            onKeyDown={(e) => e.key === "Enter" && handleSavePixabayApiKey()}
                          />
                          <button
                            onClick={handleSavePixabayApiKey}
                            disabled={!pixabayApiKey.trim()}
                            className="bg-green-600 hover:bg-green-500 disabled:opacity-30 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
                          >
                            <Save className="w-4 h-4" />
                            Save
                          </button>
                          <button
                            onClick={handleCancelPixabayApiKey}
                            className="bg-[#444] hover:bg-[#555] text-white px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : null}

                  {pixabayApiKeySaved && (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                        Search Pixabay
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Search Pixabay..."
                          value={lexicaQuery}
                          onChange={(e) => setLexicaQuery(e.target.value)}
                          className="flex-1 bg-[#222222] border border-[#383838] rounded-lg px-4 py-2 text-sm text-white placeholder-[#666666] focus:outline-none focus:border-red-500"
                          onKeyDown={(e) => e.key === "Enter" && handlePixabaySearch()}
                          disabled={isLexicaLoading}
                        />
                        <button
                          onClick={handlePixabaySearch}
                          disabled={!lexicaQuery.trim() || isLexicaLoading}
                          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
                        >
                          {isLexicaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                        </button>
                        <button
                          onClick={handleUpdatePixabayApiKey}
                          className="bg-[#444] hover:bg-[#555] text-white px-3 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer"
                          title="Update API Key"
                        >
                          Edit Key
                        </button>
                      </div>
                    </>
                  )}

                    {lexicaError && (
                      <p className="text-xs text-amber-500 py-2">{lexicaError}</p>
                    )}

                    {isUploadingImage && (
                      <div className="flex items-center justify-center py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500 mr-2" />
                        <span className="text-xs text-blue-500">Uploading to Imgur...</span>
                      </div>
                    )}

                    {lexicaImages.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
                        {lexicaImages.slice(0, 20).map((image) => (
                          <button
                            key={image.id}
                            onClick={() => handleAddPixabayImage(image)}
                            disabled={isUploadingImage}
                            className="relative group rounded-lg overflow-hidden cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <img
                              src={image.thumbnail}
                              alt={image.tags}
                              className="w-full h-20 object-cover"
                            />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Upload className="w-4 h-4 text-white" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
