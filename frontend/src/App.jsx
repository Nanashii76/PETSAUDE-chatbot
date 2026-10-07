import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import TelaIdentificacao from './TelaIdentificacao.jsx';
import Painel from './Painel.jsx';
import RevisarTexto from './RevisarTexto.jsx';
import './App.css';

// 1. Atualize a variável de ambiente para apontar para o seu backend Express
// Ex: VITE_API_WEBHOOK_URL=http://localhost:3000/api/webhook
const API_WEBHOOK_URL = import.meta.env.VITE_API_WEBHOOK_URL || 'http://localhost:3000/api/webhook';
const API_BASE_URL = API_WEBHOOK_URL.replace(/\/webhook\/?$/, '');

export default function ChatBot() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [perfil, setPerfil] = useState(undefined); // undefined = ainda carregando do localStorage
  const [tela, setTela] = useState('chat'); // 'chat' | 'painel'
  const [revisando, setRevisando] = useState(null); // mensagem FINALIZADA aberta no comparador, ou null

  const messagesEndRef = useRef(null);

  // Gera ou recupera ID de sessão do localStorage
  useEffect(() => {
    let storedId = localStorage.getItem("chat_user_id");
    if (!storedId) {
      storedId = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("chat_user_id", storedId);
    }
    setUserId(storedId);

    try {
      const salvo = JSON.parse(localStorage.getItem("perfil") || "null");
      setPerfil(salvo);
    } catch {
      setPerfil(null);
    }
  }, []);

  async function confirmarIdentificacao({ nome, unidade }) {
    await fetch(`${API_BASE_URL}/identificacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: userId, nome, unidade_cnes: unidade.cnes }),
    });
    const novoPerfil = { nome, unidadeCnes: unidade.cnes, unidadeRotulo: unidade.rotulo };
    localStorage.setItem("perfil", JSON.stringify(novoPerfil));
    setPerfil(novoPerfil);
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Enviar Mensagem
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    // Adiciona mensagem do usuário na tela
    const userMessage = {
      id: Date.now(),
      text: inputText,
      sender: "me",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    
    const contentToSend = inputText;
    setInputText(""); 
    setIsLoading(true);

    // 2. Novo Payload: Mapeado exatamente para o que o webhook.ts espera
    const payload = {
      remetente_id: userId,
      mensagem: contentToSend,
      origem: "web_frontend"
    };

    console.log("[Frontend] Enviando payload:", payload);

    try {
      const response = await fetch(API_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log("[Frontend] Resposta da API:", data);

      const botResponse = {
        id: Date.now() + 1,
        // 3. Nova chave de resposta: o backend envia "reply" e não mais "output"
        text: data.reply || "Recebido (sem conteúdo).",
        sender: "them",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        // Só vêm preenchidos quando o caso fecha (status FINALIZADO) — habilitam o botão
        // "Revisar e confirmar" com o comparador relato x texto gerado, e o selo de risco.
        status: data.status,
        corRisco: data.cor_risco,
        relatoProfissional: data.relato_profissional
      };
      
      setMessages((prev) => [...prev, botResponse]);

    } catch (error) {
      console.error("Erro na requisição:", error);
      const errorResponse = {
        id: Date.now() + 2,
        text: "Erro de conexão com o servidor da Regulação.",
        sender: "system",
        time: ""
      };
      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  if (perfil === undefined) {
    return <div className="app-container" />;
  }

  if (!perfil) {
    return <TelaIdentificacao apiBaseUrl={API_BASE_URL} onConfirmar={confirmarIdentificacao} />;
  }

  return (
    <div className="app-container">

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 12h4l2-7 4 14 2-7h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h1>Regulação SUS</h1>
              <span className="brand-subtitle">SES-DF · Apoio Clínico</span>
            </div>
          </div>
        </div>
        <div className="chat-list">
          <p className="chat-list-label">Conversas</p>
          <button type="button" className={`chat-item ${tela === 'chat' ? 'active' : ''}`} onClick={() => setTela('chat')}>
            <img src="https://api.dicebear.com/7.x/bottts/svg?seed=SUSBot" alt="" className="avatar" />
            <div className="chat-info">
              <div className="chat-info-top">
                <h3>Triagem Clínica</h3>
              </div>
              <p>Conectado à API SUS</p>
            </div>
          </button>
          <button type="button" className={`chat-item ${tela === 'painel' ? 'active' : ''}`} onClick={() => setTela('painel')}>
            <div className="avatar chat-item-icone" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 19V10M10 19V5M16 19v-7M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="chat-info">
              <div className="chat-info-top">
                <h3>Painel de uso</h3>
              </div>
              <p>Contagens e métricas</p>
            </div>
          </button>
        </div>
        <div className="sidebar-perfil">
          <p className="sidebar-perfil-nome">{perfil.nome}</p>
          <p className="sidebar-perfil-unidade">{perfil.unidadeRotulo}</p>
          <button
            type="button"
            className="sidebar-perfil-trocar"
            onClick={() => { localStorage.removeItem("perfil"); setPerfil(null); }}
          >
            Trocar
          </button>
        </div>
      </aside>

      {/* CHAT WINDOW */}
      {tela === 'painel' ? (
        <Painel apiBaseUrl={API_BASE_URL} onFechar={() => setTela('chat')} />
      ) : (
      <main className="chat-window">
        <header className="chat-header">
          <div className="user-profile">
            <div className="avatar-ring">
              <img src="https://api.dicebear.com/7.x/bottts/svg?seed=SUSBot" alt="" className="avatar big" />
            </div>
            <div>
              <h3>Auditor de Regulação IA</h3>
              <span className="status"><span className="status-dot"></span>Online</span>
            </div>
          </div>
        </header>

        <div className="messages-area">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 9h8M8 13h5M6 20l3.5-3H18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2v2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2>Olá, prezado(a) profissional de saúde</h2>
              <p>Descreva o quadro clínico do paciente para iniciarmos a regulação.</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.sender}`}>
              {msg.sender === 'them' && (
                <img src="https://api.dicebear.com/7.x/bottts/svg?seed=SUSBot" alt="" className="avatar small" />
              )}
              {msg.sender === 'system' && (
                <div className="avatar small avatar-alert" aria-hidden="true">!</div>
              )}

              <div className="message-bubble">
                <div className="markdown-content">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
                {msg.status === 'FINALIZADO' && (
                  <div className="mensagem-acoes-finalizado">
                    {msg.corRisco && (
                      <span className={`selo-risco selo-risco-${msg.corRisco.toLowerCase()}`}>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <circle cx="12" cy="12" r="12" />
                        </svg>
                        Risco: {msg.corRisco}
                      </span>
                    )}
                    <button type="button" className="botao-revisar" onClick={() => setRevisando(msg)}>
                      Revisar e confirmar
                    </button>
                  </div>
                )}
                {msg.time && <span className="message-time">{msg.time}</span>}
              </div>

              {msg.sender === 'me' && (
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`} alt="" className="avatar small" />
              )}
            </div>
          ))}

          {isLoading && (
            <div className="message-row them">
              <img src="https://api.dicebear.com/7.x/bottts/svg?seed=SUSBot" alt="" className="avatar small" />
              <div className="message-bubble typing-bubble">
                <span>Gerando resposta</span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <form onSubmit={handleSendMessage}>
            <input
              type="text"
              placeholder="Descreva o quadro do paciente..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !inputText.trim()} aria-label="Enviar mensagem">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="21" y1="3" x2="10.5" y2="13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M21 3L14 21l-3.5-7.5L3 10l18-7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </button>
          </form>
        </div>
      </main>
      )}

      {revisando && (
        <RevisarTexto
          relato={revisando.relatoProfissional}
          textoFinal={revisando.text}
          onFechar={() => setRevisando(null)}
        />
      )}
    </div>
  );
}