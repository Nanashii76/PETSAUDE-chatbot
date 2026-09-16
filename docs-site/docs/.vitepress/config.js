import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(defineConfig({
  base: '/PETSAUDE-chatbot/',
  title: "Regulação SUS",
  description: "Sistema Inteligente de Triagem e Regulação Médica",
  
  // Theme customization for a premium look
  themeConfig: {
    logo: '/logo.svg', // Assumindo que criaremos um logo ou usaremos o padrão
    siteTitle: 'Regulação IA',
    
    nav: [
      { text: 'Início', link: '/' },
      { text: 'Arquitetura', link: '/arquitetura' },
      { text: 'RAG', link: '/rag' },
      { text: 'Incidentes', link: '/incidentes' },
      { text: 'Legado (n8n)', link: '/legado-n8n/index' }
    ],

    sidebar: {
      '/': [
        {
          text: 'Sistema Atual',
          items: [
            { text: 'Visão Geral e Arquitetura', link: '/arquitetura' },
            { text: 'Busca Vetorial (RAG)', link: '/rag' },
            { text: 'Modelos de IA (Cascata)', link: '/modelos-ia' },
            { text: 'Banco de Dados', link: '/banco-de-dados' },
            { text: 'Integrações (WhatsApp e Frontend)', link: '/integracoes' },
            { text: 'Testes', link: '/testes' },
            { text: 'Infraestrutura', link: '/infraestrutura' },
            { text: 'Histórico de Incidentes', link: '/incidentes' },
            { text: 'Manutenção Futura', link: '/manutencao' },
            { text: 'FAQ', link: '/faq' },
          ]
        },
        {
          text: 'Histórico',
          collapsed: true,
          items: [
            { text: 'Versão Anterior (n8n)', link: '/legado-n8n/index' },
            { text: 'Fluxo Antigo', link: '/legado-n8n/fluxo-n8n' },
            { text: 'Manutenção Antiga', link: '/legado-n8n/manutencao' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Nanashii76/PETSAUDE-chatbot' }
    ],
    
    footer: {
      message: 'Sistema de Apoio à Regulação Clínica - SES-DF',
      copyright: 'Copyright © 2026 - SUS-DF'
    },
    
    search: {
      provider: 'local'
    }
  },

  // CSS and Head injection for beautiful modern aesthetics
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', rel: 'stylesheet' }]
  ]
}));
