import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Database,
  RotateCcw,
  Send,
  Sparkles,
} from 'lucide-react';
import { askInventoryAssistant } from '../services/aiService';
import { AiChatMessage, Product, StockTransaction } from '../types/inventory';
import { buildInventoryContext } from '../utils/analytics';

interface AiAssistantViewProps {
  userName: string;
  products: Product[];
  transactions: StockTransaction[];
}

const SUGGESTED_PROMPTS = [
  'Which items are low on stock?',
  'What should I reorder this week?',
  "Which products haven't moved in 30 days?",
  'What is my total stock value by category?',
];

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  userName,
  products,
  transactions,
}) => {
  const context = useMemo(
    () => buildInventoryContext(products, transactions),
    [products, transactions],
  );

  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const healthyCount = Math.max(
    0,
    context.summary.totalProducts -
      context.summary.lowStockCount -
      context.summary.outOfStockCount,
  );
  const healthyPct =
    context.summary.totalProducts > 0
      ? Math.round((healthyCount / context.summary.totalProducts) * 100)
      : 100;

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;

    setErrorMsg(null);
    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const replyText = await askInventoryAssistant(
        nextMessages.map((m) => ({ role: m.role, text: m.text })),
        products,
        transactions,
      );

      const aiMsg: AiChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: replyText,
        timestamp: new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setTimeout(() => {
        scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to reach Gemini Assistant.',
      );
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendPrompt(input);
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-teal-700" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              AI Inventory Assistant
            </h1>
            <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-semibold">
              Gemini Grounded
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Ask questions about stock levels, reorder priorities, and 30-day movement using your live Cloud Firestore data
          </p>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setErrorMsg(null);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Conversation</span>
          </button>
        )}
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Chat Column (2/3) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl flex flex-col min-h-[600px] overflow-hidden">
          {/* Suggested Inquiries */}
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
            <div className="text-[11px] font-semibold text-slate-500 mb-2">
              Suggested Inquiries
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending}
                  onClick={() => void sendPrompt(q)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-teal-500 hover:text-teal-800 text-xs font-medium text-slate-700 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[480px]">
            {/* Initial Grounded Briefing */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#0F2942] text-[#2DD4BF] flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    SmartStock Assistant
                  </span>
                  <span className="text-[11px] text-slate-400">Live Context</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  Hello {userName}. I am connected to your live Cloud Firestore database with{' '}
                  <strong>{context.summary.totalProducts} active SKUs</strong> and{' '}
                  <strong>{transactions.length} recorded stock transactions</strong>. Every answer I provide is grounded strictly in your real inventory records.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <div className="text-[11px] font-semibold text-amber-700">
                      Low Stock
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 tabular-nums">
                      {context.summary.lowStockCount} products below threshold
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <div className="text-[11px] font-semibold text-red-700">
                      Out of Stock
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 tabular-nums">
                      {context.summary.outOfStockCount} critical depletions
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-700">
                      Idle 30 Days
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 tabular-nums">
                      {context.summary.noMovement30DaysCount} SKUs with no movement
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[82%] rounded-xl bg-[#0F2942] text-white px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-4 text-[10px] text-teal-200">
                      <span>{userName}</span>
                      <span>{msg.timestamp}</span>
                    </div>
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#0F2942] text-[#2DD4BF] flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        SmartStock Assistant
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {msg.timestamp}
                      </span>
                    </div>
                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </div>
                  </div>
                </div>
              ),
            )}

            {sending && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0F2942] text-[#2DD4BF] flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 animate-pulse" />
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                  Analyzing live Firestore inventory records...
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-slate-200 bg-slate-50/70 space-y-2"
          >
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-teal-700" />
              <span>
                Context scope: {context.summary.totalProducts} SKUs &amp;{' '}
                {transactions.length} stock movements (strictly grounded)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask SmartStock AI anything about your inventory..."
                disabled={sending}
                className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#047857] hover:bg-[#065F46] text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <span>Ask AI</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>

        {/* Right Context Sidebar (1/3) */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Live Database Context
              </h2>
              <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-semibold text-slate-700">
                Firestore
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-semibold text-slate-500">
                  Total Valuation
                </div>
                <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
                  {context.summary.totalRetailValue.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                  })}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-semibold text-slate-500">
                  Active SKUs
                </div>
                <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
                  {context.summary.totalProducts}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-semibold text-slate-500">
                  Low &amp; Out Alerts
                </div>
                <div className="text-base font-bold text-amber-700 tabular-nums mt-0.5">
                  {context.summary.lowStockCount + context.summary.outOfStockCount} SKUs
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-semibold text-slate-500">
                  Healthy Stock
                </div>
                <div className="text-base font-bold text-emerald-700 tabular-nums mt-0.5">
                  {healthyPct}%
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Stock Health Distribution</span>
                <span className="tabular-nums">{healthyCount} healthy</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden flex">
                {context.summary.totalProducts > 0 && (
                  <>
                    <div
                      style={{
                        width: `${(healthyCount / context.summary.totalProducts) * 100}%`,
                      }}
                      className="bg-[#047857] h-full"
                    />
                    <div
                      style={{
                        width: `${(context.summary.lowStockCount / context.summary.totalProducts) * 100}%`,
                      }}
                      className="bg-amber-500 h-full"
                    />
                    <div
                      style={{
                        width: `${(context.summary.outOfStockCount / context.summary.totalProducts) * 100}%`,
                      }}
                      className="bg-red-600 h-full"
                    />
                  </>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                <span>Healthy: {healthyCount}</span>
                <span>Low: {context.summary.lowStockCount}</span>
                <span>Out: {context.summary.outOfStockCount}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              The Gemini model runs on the server and receives a live snapshot of your products and 30-day transaction history. If an answer isn&apos;t present in your records, it will tell you instead of guessing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
