import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bot, MessageCircle, Send, X, Trash2, Loader } from "lucide-react";
import { toast } from "react-hot-toast";
import api from "../../services/api";

const STORAGE_KEY = "ai-chat-position";

function getStoredPosition() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const { x, y } = JSON.parse(s);
      if (typeof x === "number" && typeof y === "number") return { x, y };
    }
  } catch (_) {}
  return null;
}

function clampToViewport(pos, margin = 8) {
  if (typeof window === "undefined") return pos;
  const maxX = Math.max(margin, window.innerWidth - 56 - margin);
  const maxY = Math.max(margin, window.innerHeight - 56 - margin);
  return {
    x: Math.min(Math.max(pos.x ?? margin, margin), maxX),
    y: Math.min(Math.max(pos.y ?? margin, margin), maxY),
  };
}

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}`);
  const containerRef = useRef(null);

  const defaultPos = { x: typeof window !== "undefined" ? window.innerWidth - 80 : 0, y: typeof window !== "undefined" ? window.innerHeight - 80 : 0 };
  const [position, setPosition] = useState(() => {
    const stored = getStoredPosition();
    return clampToViewport(stored || defaultPos);
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const didDragRef = useRef(false);

  const messagesEndRef = useRef(null);
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 640 : false;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // No persisted history; start fresh each time this page loads.
      setSessionId(`session-${Date.now()}`);
    }
  }, [isOpen]);

  // Click outside: collapse the chat but keep state so user can continue where they left off.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (e) => {
      const el = containerRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [isOpen]);

  // History is intentionally not loaded (no persistence).

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = {
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setLoading(true);

    try {
      const res = await api.post("/ai/chat/message", {
        sessionId,
        message: inputMessage,
      });

      if (res.data && res.data.success) {
        const aiMessage = {
          role: "assistant",
          content: res.data.data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
      } else {
        throw new Error(res.data.message || "Failed to get response");
      }
    } catch (err) {
      toast.error(err.message || "Failed to send message");
      const errorMessage = {
        role: "assistant",
        content:
          "Sorry, I'm having trouble connecting. Please try again later.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    try {
      await api.delete(`/ai/chat/clear/${sessionId}`);
      setMessages([]);
      const next = `session-${Date.now()}`;
      setSessionId(next);
      toast.success("Chat deleted");
    } catch (err) {
      toast.error("Failed to delete chat");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    if (e.button !== 0) return;
    didDragRef.current = false;
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: position.x, startTop: position.y };
  }, [position.x, position.y]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      const { startX, startY, startLeft, startTop } = dragRef.current;
      if (Math.abs(e.clientX - startX) > 2 || Math.abs(e.clientY - startY) > 2) didDragRef.current = true;
      const x = Math.max(0, Math.min(window.innerWidth - 56, startLeft + (e.clientX - startX)));
      const y = Math.max(0, Math.min(window.innerHeight - 56, startTop + (e.clientY - startY)));
      setPosition({ x, y });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!isDragging) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
      } catch (_) {}
    }
  }, [isDragging, position]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => {
      setPosition((prev) => clampToViewport(prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // When open: position window so it opens toward screen (e.g. bottom-right button → window opens left and upward)
  const CHAT_W = 384;
  const CHAT_H = 500;
  const GAP = 8;
  const getChatStyle = () => {
    if (typeof window === "undefined") return { left: position.x, top: position.y };
    if (window.innerWidth < 640) {
      return {
        left: 12,
        right: 12,
        top: Math.max(12, window.innerHeight * 0.08),
        bottom: 12,
      };
    }
    let left = position.x;
    let top = position.y;
    if (position.x + CHAT_W + GAP > window.innerWidth) left = Math.max(0, position.x - CHAT_W - GAP);
    if (position.y + CHAT_H + GAP > window.innerHeight) top = Math.max(0, position.y - CHAT_H - GAP);
    return { left, top };
  };
  const chatStyle = isOpen ? getChatStyle() : { left: position.x, top: position.y };

  return (
    <>
      {/* Draggable Floating Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => { if (!didDragRef.current) setIsOpen(true); didDragRef.current = false; }}
          onMouseDown={handleDragStart}
          className="fixed w-14 h-14 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-full shadow-lg hover:shadow-xl transition-shadow duration-200 flex items-center justify-center z-50 hover:scale-110 cursor-grab active:cursor-grabbing select-none"
          style={{ left: position.x, top: position.y }}
          title="Drag to move · Click to open"
        >
          <Bot className="w-6 h-6 pointer-events-none" />
        </button>
      )}

      {/* Chat Window (same position as button when opened) */}
      {isOpen && (
        <div
          ref={containerRef}
          className="fixed w-[calc(100vw-24px)] max-w-96 h-[min(78vh,500px)] sm:h-[500px] sm:max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-gray-200"
          style={chatStyle}
        >
          {/* Header - drag to move (buttons still clickable) */}
          <div
            className={`bg-gradient-to-r from-emerald-500 to-emerald-600 text-white p-4 rounded-t-2xl flex items-center justify-between select-none ${
              isMobile ? "" : "cursor-grab active:cursor-grabbing"
            }`}
            onMouseDown={(e) => {
              if (isMobile) return;
              if (!e.target.closest("button")) handleDragStart(e);
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">AI Assistant</h3>
                <p className="text-xs text-emerald-100">Always here to help</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearChat}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Delete chat"
                disabled={loading}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                <MessageCircle className="w-16 h-16 mb-3 text-gray-300" />
                <p className="text-sm">Start a conversation!</p>
                <p className="text-xs mt-1">
                  Ask me anything about your business
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                      msg.role === "user"
                        ? "bg-emerald-500 text-white"
                        : "bg-white text-gray-800 border border-gray-200"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.role === "user"
                          ? "text-emerald-100"
                          : "text-gray-400"
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 px-4 py-2 rounded-2xl flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin text-emerald-500" />
                  <span className="text-sm text-gray-600">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200 bg-white rounded-b-2xl">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm outline-none focus:border-emerald-500 disabled:bg-gray-100"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !inputMessage.trim()}
                className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
