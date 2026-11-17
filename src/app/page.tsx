"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Copy, FileImage, Film, GraduationCap, Image as ImageIcon,
  Layers3, Lightbulb, Menu, MessageCircle, MoreHorizontal, PanelLeftClose, Plus,
  Presentation, Search, Send, Settings2, Sparkles, WandSparkles, X, Zap
} from "lucide-react";
import { templates, type Template, type TemplateCategory } from "@/lib/templates";

type ModelOption = {
  id: string;
  name: string;
  contextLength: number | null;
  inputPrice: number;
  outputPrice: number;
  isFree: boolean;
};
type Usage = { inputTokens: number; outputTokens: number; totalTokens: number; apiCostUsd: number | null };
type QuizQuestion = { question: string; options: string[]; correctIndex: number; explanation: string };
type QuizData = { title: string; instructions: string; questions: QuizQuestion[] };
type Message = { id: string; role: "user" | "assistant"; content: string; usage?: Usage; quiz?: QuizData; model?: string };

const starterPrompts = [
  { icon: Lightbulb, title: "Explain a difficult topic", prompt: "Explain photosynthesis step by step for a beginner, using a simple analogy and a real-life example." },
  { icon: BookOpen, title: "Make a study plan", prompt: "Create a realistic 7-day study plan for my upcoming exams. Ask me for the subjects and available study hours if needed." },
  { icon: CircleHelp, title: "Test my knowledge", prompt: "Help me revise a topic by asking me one question at a time and giving feedback after each answer." },
  { icon: WandSparkles, title: "Create something", prompt: "Help me turn my idea into a polished presentation, video script, or visual concept." }
];

function QuizCard({ quiz }: { quiz: QuizData }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const score = quiz.questions.reduce((total, question, index) => total + (answers[index] === question.correctIndex ? 1 : 0), 0);
  return (
    <section className="quiz-card">
      <div className="quiz-card-head">
        <div className="quiz-icon"><GraduationCap size={19} /></div>
        <div><span className="eyebrow">QUICK KNOWLEDGE CHECK</span><h3>{quiz.title}</h3><p>{quiz.instructions}</p></div>
      </div>
      <div className="quiz-progress"><span>{Object.keys(answers).length} of {quiz.questions.length} answered</span><span>{quiz.questions.length} questions</span></div>
      {quiz.questions.map((question, index) => (
        <div className="quiz-question" key={index}>
          <div className="question-number">0{index + 1}</div>
          <div className="question-content">
            <h4>{question.question}</h4>
            <div className="quiz-options">
              {question.options.map((option, optionIndex) => {
                const isCorrect = submitted && optionIndex === question.correctIndex;
                const isWrong = submitted && answers[index] === optionIndex && optionIndex !== question.correctIndex;
                return (
                  <button type="button" key={optionIndex} disabled={submitted} className={"quiz-option" + (answers[index] === optionIndex ? " selected" : "") + (isCorrect ? " correct" : "") + (isWrong ? " incorrect" : "")} onClick={() => setAnswers((prev) => ({ ...prev, [index]: optionIndex }))}>
                    <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>{option}
                    {isCorrect && <Check size={15} />}
                    {isWrong && <X size={15} />}
                  </button>
                );
              })}
            </div>
            {submitted && <div className="quiz-explanation"><CheckCircle2 size={15} /><span>{question.explanation}</span></div>}
          </div>
        </div>
      ))}
      <div className="quiz-footer">
        {submitted ? <><strong className="quiz-score">Your score: {score}/{quiz.questions.length}</strong><button className="button secondary small" onClick={() => { setAnswers({}); setSubmitted(false); }}>Try again</button></> : <><span className="muted small-copy">You can review the explanations after submitting.</span><button className="button primary small" disabled={Object.keys(answers).length !== quiz.questions.length} onClick={() => setSubmitted(true)}>Check answers <ArrowRight size={15} /></button></>}
      </div>
    </section>
  );
}

function TemplateCard({ item, onUse, onCopy }: { item: Template; onUse: (item: Template) => void; onCopy: (text: string) => void }) {
  const Icon = item.category === "Presentations" ? Presentation : item.category === "Videos" ? Film : ImageIcon;
  return (
    <article className="template-card">
      <div className={"template-art art-" + item.accent}>
        <div className="art-glow" />
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
        <div className="art-icon"><Icon size={25} strokeWidth={1.55} /></div>
        <span className="art-label">{item.category === "Presentations" ? "SLIDE DESIGN" : item.category === "Videos" ? "VIDEO STORY" : "VISUAL ASSET"}</span>
        <div className="art-lines"><i /><i /><i /></div>
      </div>
      <div className="template-card-body">
        <div className="template-meta"><span>{item.category}</span><span className="template-dot" />{item.label}</div>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <div className="template-actions">
          <button className="button secondary small" onClick={() => onCopy(item.coverPrompt)}><ImageIcon size={14} /> Cover prompt</button>
          <button className="button primary small" onClick={() => onUse(item)}>Use template <ArrowUpRight size={14} /></button>
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const [view, setView] = useState<"home" | "chat" | "templates" | "library">("home");
  const [role, setRole] = useState<"Student" | "Teacher">("Student");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [category, setCategory] = useState<"All" | TemplateCategory>("All");
  const [templateSearch, setTemplateSearch] = useState("");
  const [toast, setToast] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/models").then((res) => res.json()).then((data) => {
      const list: ModelOption[] = Array.isArray(data.models) ? data.models : [];
      setModels(list);
      if (list.length) setModel(list[0].id);
    }).catch(() => setModels([])).finally(() => setModelsLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const visibleTemplates = useMemo(() => templates.filter((item) => {
    const categoryMatch = category === "All" || item.category === category;
    const term = templateSearch.toLowerCase();
    return categoryMatch && (!term || (item.title + " " + item.description + " " + item.label).toLowerCase().includes(term));
  }), [category, templateSearch]);

  const selectedModel = models.find((item) => item.id === model);
  const canChat = !!model && !modelsLoading;

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast("Prompt copied to clipboard");
    } catch {
      setToast("Clipboard permission was blocked by your browser");
    }
  }

  async function requestAI(nextMessages: Message[], task: "chat" | "quiz" = "chat") {
    if (!model) {
      setToast("Choose a model first");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          task,
          messages: nextMessages.map((message) => ({ role: message.role, content: message.content }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI request failed");
      if (task === "quiz") {
        let quiz: QuizData;
        try {
          const clean = String(payload.content).replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
          const parsed = JSON.parse(clean);
          if (!parsed.title || !Array.isArray(parsed.questions) || !parsed.questions.length) throw new Error("Invalid quiz");
          quiz = { title: parsed.title, instructions: parsed.instructions || "Choose the best answer for each question.", questions: parsed.questions.slice(0, 10) };
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "I made a quick quiz from our conversation. Give it a try!", quiz, model: payload.model, usage: payload.usage }]);
        } catch {
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: payload.content, model: payload.model, usage: payload.usage }]);
          setToast("The model replied, but its quiz format could not be displayed as an interactive quiz.");
        }
      } else {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: payload.content, model: payload.model, usage: payload.usage }]);
      }
    } catch (error) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "I couldn't complete that request. " + (error instanceof Error ? error.message : "Please try again.") }]);
    } finally {
      setBusy(false);
      setView("chat");
    }
  }

  async function sendMessage(event?: FormEvent, value?: string) {
    event?.preventDefault();
    const content = (value ?? draft).trim();
    if (!content || busy) return;
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content };
    const next = [...messages, userMessage];
    setMessages(next);
    setDraft("");
    setView("chat");
    await requestAI(next);
  }

  async function createQuiz() {
    if (busy) return;
    if (!messages.some((message) => message.role === "user")) {
      setToast("Start a chat first so the quiz has a topic");
      return;
    }
    const quizRequest: Message = { id: crypto.randomUUID(), role: "user", content: "Create a 5-question multiple-choice quiz based on what we have discussed so far. Test understanding, not just memorisation." };
    const next = [...messages, quizRequest];
    setMessages(next);
    await requestAI(next, "quiz");
  }

  function useTemplate(item: Template) {
    setSelectedTemplate(item);
    setDraft(item.starterPrompt);
    setView("chat");
    window.setTimeout(() => textareaRef.current?.focus(), 80);
    setToast("Template added to your composer");
  }

  function newChat() {
    setMessages([]);
    setDraft("");
    setView("home");
    setSelectedTemplate(null);
  }

  return (
    <main className="app-frame">
      {sidebarOpen && <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 28.5V11.8c0-1.2 1.3-1.8 2.2-1l9.8 8.1 9.8-8.1c.9-.8 2.2-.2 2.2 1v16.7c0 1.1-1.3 1.7-2.2 1l-9.8-8-9.8 8c-.9.7-2.2.1-2.2-1Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M20 20v10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></div>
          <div className="brand-word">ilm<span>AI</span></div>
        </div>
        <button className="new-chat-button" onClick={newChat}><Plus size={17} /> New chat <span>⌘ K</span></button>
        <div className="side-section-label">WORKSPACE</div>
        <nav className="side-nav">
          <button className={view === "home" || view === "chat" ? "active" : ""} onClick={() => setView(messages.length ? "chat" : "home")}><MessageCircle size={17} /> AI Chat</button>
          <button className={view === "templates" ? "active" : ""} onClick={() => setView("templates")}><Layers3 size={17} /> Prompt templates <span className="nav-count">12</span></button>
          <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}><BookOpen size={17} /> My library</button>
        </nav>
        <div className="side-section-label recent-label">YOUR TOOLS</div>
        <div className="side-tools">
          <button onClick={() => { setCategory("Presentations"); setView("templates"); }}><Presentation size={16} /> Presentation studio</button>
          <button onClick={() => { setCategory("Videos"); setView("templates"); }}><Film size={16} /> Video studio</button>
          <button onClick={() => { setCategory("Images"); setView("templates"); }}><FileImage size={16} /> Image studio</button>
        </div>
        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-card-top"><span className="plan-spark"><Zap size={14} /></span><span>YOUR WORKSPACE</span><span className="plan-status">PREVIEW</span></div>
            <strong>Make room for big ideas.</strong>
            <p>Your creative learning space, all in one place.</p>
            <button onClick={() => setToast("Account and plans will be connected with your backend.")}>Explore plans <ArrowUpRight size={13} /></button>
          </div>
          <button className="profile-button"><div className="avatar">I</div><div className="profile-info"><strong>Ilm AI learner</strong><span>Personal workspace</span></div><MoreHorizontal size={18} /></button>
        </div>
      </aside>}

      <section className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button sidebar-toggle" aria-label="Toggle sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><PanelLeftClose size={18} /></button>
            <div className="breadcrumb"><span>Workspace</span><span className="crumb-divider">/</span><strong>{view === "templates" ? "Prompt templates" : view === "library" ? "My library" : view === "chat" ? "AI Chat" : "Overview"}</strong></div>
          </div>
          <div className="topbar-right">
            <div className="role-switch" aria-label="Choose workspace role"><button className={role === "Student" ? "selected" : ""} onClick={() => setRole("Student")}>Student</button><button className={role === "Teacher" ? "selected" : ""} onClick={() => setRole("Teacher")}>Teacher</button></div>
            <div className="topbar-divider" />
            <button className="usage-pill" onClick={() => setToast("Token-based wallet will be connected with your account backend.")}><Zap size={14} /><span>Usage</span><b>Preview</b></button>
            <button className="avatar small-avatar">I</button>
          </div>
        </header>

        {view === "templates" ? (
          <div className="content-scroll">
            <div className="page-heading templates-heading">
              <div><span className="eyebrow"><Sparkles size={13} /> THE PROMPT LIBRARY</span><h1>Start with a spark.<br /><span>Make it yours.</span></h1><p>Ready-made creative directions for presentations, videos, and visuals. Pick a template, personalise the prompt, and create with your favourite model.</p></div>
              <div className="heading-art"><div className="heading-art-orbit" /><div className="heading-art-core"><WandSparkles size={35} /></div><span className="floating-chip chip-a">Ideas</span><span className="floating-chip chip-b">Create</span></div>
            </div>
            <div className="template-toolbar">
              <div className="category-tabs">{(["All", "Presentations", "Videos", "Images"] as const).map((item) => <button key={item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item}<span>{item === "All" ? templates.length : templates.filter((template) => template.category === item).length}</span></button>)}</div>
              <label className="template-search"><Search size={16} /><input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="Find a template..." /></label>
            </div>
            <div className="template-grid">{visibleTemplates.map((item) => <TemplateCard key={item.id} item={item} onUse={useTemplate} onCopy={copyText} />)}</div>
            <div className="cover-prompt-note"><div className="note-icon"><ImageIcon size={18} /></div><div><strong>Make these templates truly yours</strong><p>Every card has its own cover-art prompt. Copy it, generate your image, and later replace the abstract art placeholder with your finished visual.</p></div><ArrowRight size={17} /></div>
          </div>
        ) : view === "library" ? (
          <div className="content-scroll">
            <div className="page-heading"><div><span className="eyebrow"><BookOpen size={13} /> YOUR CREATIVE SPACE</span><h1>Your library<span>.</span></h1><p>Your saved chats, quizzes, presentations, and generated visuals will live here.</p></div></div>
            <div className="library-empty"><div className="empty-illustration"><Layers3 size={34} /></div><h2>A little space for what you create.</h2><p>Start a conversation or use a template. Save your best work here when your account storage is connected.</p><button className="button primary" onClick={newChat}>Start a new chat <ArrowRight size={16} /></button></div>
          </div>
        ) : view === "home" ? (
          <div className="content-scroll home-content">
            <div className="welcome-row">
              <div><div className="welcome-kicker"><span className="live-dot" /> YOUR AI-POWERED CREATIVE SPACE</div><h1>{role === "Teacher" ? "Inspire minds." : "What will you"}<br /><span>{role === "Teacher" ? "Create something remarkable." : "discover today?"}</span></h1><p>{role === "Teacher" ? "Plan engaging lessons, build classroom resources, and make every idea easier to teach." : "Learn something new, bring your ideas to life, and make every study session count."}</p></div>
              <div className="welcome-visual"><div className="visual-halo" /><div className="visual-ring ring-one" /><div className="visual-ring ring-two" /><div className="visual-book"><div className="book-page page-left" /><div className="book-page page-right" /><Sparkles size={26} /></div><span className="visual-tag tag-top">Think freely</span><span className="visual-tag tag-bottom">Create boldly</span></div>
            </div>

            <div className="home-composer-wrap">
              <form className="home-composer" onSubmit={(event) => sendMessage(event)}>
                <div className="composer-topline"><span className="composer-spark"><Sparkles size={15} /></span><span>YOUR NEXT BIG IDEA STARTS HERE</span><span className="composer-shortcut">AI workspace</span></div>
                <textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={role === "Teacher" ? "Plan a lesson, create a worksheet, explain a concept..." : "Ask anything, explore an idea, or start creating..."} rows={2} />
                <div className="composer-bottom"><div className="composer-tools"><button type="button" onClick={() => setView("templates")}><Layers3 size={15} /> Templates</button><button type="button" onClick={createQuiz}><GraduationCap size={15} /> Make a quiz</button></div><button className="send-button" type="submit" disabled={!draft.trim() || busy || !canChat}><Send size={16} /><span>Send</span><ArrowUpRight size={14} /></button></div>
              </form>
              <div className="model-footnote"><span className="model-status" />{modelsLoading ? "Loading live AI models..." : selectedModel ? <><strong>{selectedModel.name}</strong>{selectedModel.isFree ? <span className="free-tag">FREE</span> : <span>via OpenRouter</span>}</> : "AI model connection needs setup"}<span className="model-footnote-spacer" /><span>Choose your model in the chat header</span></div>
            </div>

            <div className="section-heading"><div><span className="eyebrow">A GOOD PLACE TO BEGIN</span><h2>{role === "Teacher" ? "Make teaching feel effortless." : "A little inspiration goes a long way."}</h2></div><button className="text-link" onClick={() => setView("templates")}>Explore templates <ArrowRight size={15} /></button></div>
            <div className="starter-grid">{starterPrompts.map((item, index) => { const Icon = item.icon; return <button className="starter-card" key={item.title} onClick={() => void sendMessage(undefined, item.prompt)}><div className={"starter-icon starter-" + index}><Icon size={19} /></div><strong>{item.title}</strong><p>{item.prompt}</p><ArrowUpRight size={16} className="starter-arrow" /></button>; })}</div>

            <div className="section-heading tools-heading"><div><span className="eyebrow">BEYOND THE CHAT</span><h2>One space. So many ways to create.</h2></div></div>
            <div className="tool-grid">
              <button className="tool-card tool-present" onClick={() => { setCategory("Presentations"); setView("templates"); }}><div className="tool-card-icon"><Presentation size={21} /></div><div><strong>Presentation studio</strong><p>Turn an idea into a beautiful slide-by-slide story.</p></div><ArrowUpRight size={17} /></button>
              <button className="tool-card tool-video" onClick={() => { setCategory("Videos"); setView("templates"); }}><div className="tool-card-icon"><Film size={21} /></div><div><strong>Video studio</strong><p>Scripts, storyboards, hooks, and scene plans.</p></div><ArrowUpRight size={17} /></button>
              <button className="tool-card tool-images" onClick={() => { setCategory("Images"); setView("templates"); }}><div className="tool-card-icon"><ImageIcon size={21} /></div><div><strong>Visual studio</strong><p>Posters, visual explainers, and creative artwork.</p></div><ArrowUpRight size={17} /></button>
            </div>
            <footer className="home-footer"><span>ilm AI <span className="footer-dot">·</span> Think. Learn. Create.</span><span>Built for curious minds.</span></footer>
          </div>
        ) : (
          <div className="chat-layout">
            <div className="chat-main">
              <div className="chat-toolbar"><div className="chat-title"><div className="chat-title-icon"><Sparkles size={16} /></div><div><strong>New conversation</strong><span>{selectedModel ? selectedModel.name : "Choose an AI model"}</span></div></div><div className="chat-toolbar-actions"><button className="button secondary small" onClick={createQuiz} disabled={busy || !messages.length}><GraduationCap size={14} /> Make a quiz</button><button className="icon-button" onClick={newChat} aria-label="New conversation"><Plus size={17} /></button></div></div>
              <div className="messages-area">
                {messages.length === 0 ? <div className="chat-empty"><div className="chat-empty-icon"><MessageCircle size={24} /></div><span className="eyebrow">A FRESH PAGE</span><h2>Let's think this through.</h2><p>Ask a question, brainstorm a project, or use a template to get moving.</p><div className="chat-starters">{starterPrompts.slice(0, 3).map((item) => <button key={item.title} onClick={() => setDraft(item.prompt)}><span>{item.title}</span><ArrowUpRight size={14} /></button>)}</div></div> : messages.map((message) => <div className={"message-row " + message.role} key={message.id}><div className="message-avatar">{message.role === "assistant" ? <Sparkles size={15} /> : "I"}</div><div className="message-body"><div className="message-author">{message.role === "assistant" ? "Ilm AI" : "You"}{message.role === "assistant" && message.model && <span>{message.model.split("/").pop()}</span>}</div>{message.quiz ? <QuizCard quiz={message.quiz} /> : <div className="message-content">{message.content.split("\n").map((line, index) => <p key={index}>{line || <>&nbsp;</>}</p>)}</div>}{message.usage && <div className="message-usage"><Zap size={12} /> {message.usage.totalTokens.toLocaleString()} tokens used <span>·</span> {message.usage.inputTokens.toLocaleString()} in / {message.usage.outputTokens.toLocaleString()} out</div>}</div></div>)}
                {busy && <div className="message-row assistant"><div className="message-avatar"><Sparkles size={15} /></div><div className="message-body"><div className="message-author">Ilm AI <span>Thinking</span></div><div className="thinking-indicator"><i /><i /><i /><span>Putting the pieces together...</span></div></div></div>}
                <div ref={bottomRef} />
              </div>
              <div className="chat-input-dock">
                <form className="chat-composer" onSubmit={(event) => sendMessage(event)}>
                  <textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Message Ilm AI..." rows={2} />
                  <div className="chat-composer-bottom"><div className="composer-tools"><button type="button" onClick={() => setView("templates")}><Layers3 size={14} /> Templates</button><button type="button" onClick={createQuiz} disabled={busy || !messages.length}><GraduationCap size={14} /> Quiz from chat</button></div><button className="send-button" type="submit" disabled={!draft.trim() || busy || !canChat}><Send size={16} /></button></div>
                </form>
                <div className="chat-disclaimer">AI can make mistakes. Check important information from trusted sources.</div>
              </div>
            </div>
            <aside className="chat-side-panel">
              <div className="panel-heading"><div><span className="eyebrow">YOUR AI SETUP</span><h3>Make it yours</h3></div><Settings2 size={17} /></div>
              <label className="field-label" htmlFor="model-select">AI MODEL</label>
              <div className="select-wrap"><select id="model-select" value={model} onChange={(event) => setModel(event.target.value)} disabled={modelsLoading || !models.length}><option value="">{modelsLoading ? "Loading models..." : "Choose a model"}</option>{models.map((item) => <option value={item.id} key={item.id}>{item.name}{item.isFree ? " · Free" : ""}</option>)}</select><ChevronDown size={15} /></div>
              {selectedModel && <div className="model-detail"><div><span>Input / 1M tokens</span><strong>{selectedModel.inputPrice === 0 ? "Free" : "$" + (selectedModel.inputPrice * 1000000).toFixed(3)}</strong></div><div><span>Output / 1M tokens</span><strong>{selectedModel.outputPrice === 0 ? "Free" : "$" + (selectedModel.outputPrice * 1000000).toFixed(3)}</strong></div><div><span>Context window</span><strong>{selectedModel.contextLength ? selectedModel.contextLength.toLocaleString() : "Provider default"}</strong></div></div>}
              <div className="panel-divider" />
              <div className="panel-feature"><div className="panel-feature-icon mint"><GraduationCap size={17} /></div><div><strong>Quiz in the conversation</strong><p>Turn what you just discussed into a quick interactive test.</p><button onClick={createQuiz} disabled={!messages.length || busy}>Create from this chat <ArrowRight size={13} /></button></div></div>
              <div className="panel-feature"><div className="panel-feature-icon lilac"><Layers3 size={17} /></div><div><strong>Start from a template</strong><p>Use ready-made prompts for lessons, decks, videos, and visuals.</p><button onClick={() => setView("templates")}>Browse templates <ArrowRight size={13} /></button></div></div>
              <div className="panel-divider" />
              <div className="panel-note"><Sparkles size={15} /><p>Tip: Ask follow-up questions naturally. Ilm AI keeps the context of this conversation.</p></div>
            </aside>
          </div>
        )}
      </section>

      {toast && <div className="toast"><CheckCircle2 size={16} />{toast}</div>}
    </main>
  );
}