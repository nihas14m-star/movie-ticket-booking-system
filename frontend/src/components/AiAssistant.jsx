import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { useBodyLock, useEscape } from '../hooks/useAsync.js';

const GREETING = {
  role: 'assistant',
  content:
    'Hi! I am Cineverse Assist. Ask me what to watch tonight, what suits a family, or how booking works.',
  movies: [],
  notice: null,
  source: 'local',
};

/**
 * AI assistant.
 *
 * A thin client over POST /api/ai/assistant. The model behind it can suggest
 * films and explain the flow, but it has no ability to create, price or confirm a
 * booking — that always happens through the seat map, checkout and MySQL.
 */
export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const scrollRef = useRef(null);
  const location = useLocation();

  useBodyLock(false);
  useEscape(() => setOpen(false), open);

  useEffect(() => {
    api.aiStatus().then((response) => setStatus(response.data)).catch(() => setStatus(null));
  }, []);

  // Close the panel when the user navigates.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;

    const history = messages
      .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
      .slice(-6)
      .map((entry) => ({ role: entry.role, content: entry.content }));

    setMessages((current) => [...current, { role: 'user', content: message, movies: [] }]);
    setInput('');
    setBusy(true);

    try {
      const response = await api.aiAssistant({ message, history });
      const data = response.data;
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.reply,
          movies: data.movies ?? [],
          source: data.source,
          model: data.model,
          notice: data.notice,
          suggestions: data.suggestions,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `I could not reach the assistant right now (${error.message}). The booking flow works normally — you can browse and book without me.`,
          movies: [],
          tone: 'error',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const lastSuggestions = [...messages].reverse().find((entry) => entry.suggestions)?.suggestions ?? [
    'What should I watch tonight?',
    'Which movies suit a family?',
    'How do I book tickets?',
  ];

  return (
    <>
      {open ? (
        <section className="ai-panel" aria-label="Cineverse AI assistant">
          <header className="ai-panel-head">
            <span className="ai-avatar" aria-hidden="true">✨</span>
            <div className="grow">
              <strong style={{ fontSize: '0.92rem' }}>Cineverse Assist</strong>
              <div className="tiny dim">
                {status?.enabled
                  ? `AI live · ${status.model}`
                  : 'Offline mode · answers come from the built-in helper'}
              </div>
            </div>
            <button type="button" className="btn-icon btn btn-ghost" onClick={() => setOpen(false)} aria-label="Close assistant">
              ✕
            </button>
          </header>

          <div className="ai-scroll" ref={scrollRef}>
            {messages.map((entry, index) => (
              <div key={index}>
                <div className={`ai-msg ${entry.role === 'user' ? 'ai-msg-user' : 'ai-msg-bot'}`}>
                  {entry.content}
                  {entry.notice ? (
                    <p className="tiny" style={{ marginTop: 7, opacity: 0.75 }}>{entry.notice}</p>
                  ) : null}
                </div>

                {entry.movies?.length ? (
                  <div className="ai-mini-movies" style={{ marginTop: 9 }}>
                    {entry.movies.map((movie) => (
                      <Link key={movie.id} to={`/movies/${movie.slug}`} className="ai-mini-movie">
                        <img src={movie.posterUrl} alt="" loading="lazy" />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 650, fontSize: '0.82rem' }}>{movie.title}</span>
                          <span className="tiny dim">
                            {movie.genres?.slice(0, 2).map((genre) => genre.name).join(' · ')}
                            {movie.rating ? ` · ★ ${Number(movie.rating).toFixed(1)}` : ''}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {busy ? (
              <div className="ai-msg ai-msg-bot row gap-8">
                <span className="spinner" style={{ width: 14, height: 14 }} />
                <span className="dim">Thinking…</span>
              </div>
            ) : null}
          </div>

          <div className="ai-suggestions">
            {lastSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="ai-suggestion"
                onClick={() => send(suggestion)}
                disabled={busy}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form
            className="ai-compose"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              className="input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a movie or booking…"
              aria-label="Message the assistant"
            />
            <button type="submit" className="btn btn-accent" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="ai-fab"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        aria-expanded={open}
      >
        <span aria-hidden="true" style={{ fontSize: 22 }}>{open ? '✕' : '✨'}</span>
      </button>
    </>
  );
}
