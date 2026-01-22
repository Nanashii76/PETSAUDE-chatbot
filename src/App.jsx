import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown'; // Importação essencial para formatar o texto
import './App.css';

// URL do Webhook carregada do arquivo .env
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;

export default function ChatBot() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState("");
  
  const messagesEndRef = useRef(null);

  // 1. Gera ou recupera ID de sessão
  useEffect(() => {
    let storedId = localStorage.getItem("chat_user_id");
    if (!storedId) {
      storedId = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("chat_user_id", storedId);
    }
    setUserId(storedId);
  }, []);

  // Rolagem automática
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 2. Detectar SO
  const getOperatingSystem = () => {
    const userAgent = window.navigator.userAgent;
    if (userAgent.indexOf("Win") !== -1) return "Windows";
    if (userAgent.indexOf("Mac") !== -1) return "MacOS";
    if (userAgent.indexOf("Linux") !== -1) return "Linux";
    if (userAgent.indexOf("Android") !== -1) return "Android";
    if (userAgent.indexOf("like Mac") !== -1) return "iOS";
    return "Desconhecido";
  };

  // 3. Enviar Mensagem
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    // Adiciona mensagem do usuário (Optimistic UI)
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

    const payload = {
      so: getOperatingSystem(),
      user: userId,
      content: contentToSend,
      timestamp: new Date().toISOString()
    };

    console.log("Enviando payload:", payload);

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log("Resposta n8n:", data);

      const botResponse = {
        id: Date.now() + 1,
        // Se vier vazio, avisa. Se vier texto formatado, o ReactMarkdown resolve.
        text: data.output || "Recebido (sem conteúdo no output).",
        sender: "them",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      setMessages((prev) => [...prev, botResponse]);

    } catch (error) {
      console.error("Erro:", error);
      const errorResponse = {
        id: Date.now() + 2,
        text: "Erro de conexão com o servidor.",
        sender: "system",
        time: ""
      };
      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Conversas</h2>
        </div>
        <div className="chat-list">
          <div className="chat-item active">
            <img src="https://api.dicebear.com/7.x/bottts/svg?seed=n8nBot" alt="Bot" className="avatar" />
            <div className="chat-info">
              <div className="chat-info-top">
                <h3>Chat Atual</h3>
              </div>
              <p>Conectado ao n8n</p>
            </div>
          </div>
        </div>
      </aside>

      {/* CHAT WINDOW */}
      <main className="chat-window">
        <header className="chat-header">
          <div className="user-profile">
            <img src="https://api.dicebear.com/7.x/bottts/svg?seed=n8nBot" alt="Bot" className="avatar big" />
            <div>
              <h3>Assistente Virtual</h3>
              <span className="status">Online</span>
            </div>
          </div>
        </header>

        <div className="messages-area">
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#6b7280', marginTop: '40px' }}>
              <p>Olá! Como posso ajudar você hoje?</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.sender}`}>
              
              {/* Avatar Bot */}
              {msg.sender === 'them' && (
                <img src="https://api.dicebear.com/7.x/bottts/svg?seed=n8nBot" alt="bot" className="avatar small" />
              )}
              {msg.sender === 'system' && (
                 <div className="avatar small" style={{background: 'red', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:'bold'}}>!</div>
              )}

              {/* Balão de Mensagem com Markdown */}
              <div className="message-bubble" style={msg.sender === 'system' ? {background: '#ef4444', color: 'white'} : {}}>
                
                <div className="markdown-content">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
                
                <span className="message-time">{msg.time}</span>
              </div>

              {/* Avatar User (Apenas visual, pois o layout já inverte) */}
              {msg.sender === 'me' && (
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`} alt="me" className="avatar small" />
              )}
            </div>
          ))}
          
          {isLoading && <div className="loading-indicator">Digitando...</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <form onSubmit={handleSendMessage}>
            <input 
              type="text" 
              placeholder="Digite aqui..." 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading}>Enviar</button>
          </form>
        </div>
      </main>
    </div>
  );
}