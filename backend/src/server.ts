import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import webhookRoutes from './api/webhook.js';
import perfilRoutes from './api/perfil.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Middleware para transformar o corpo das requisições em objetos JavaScript
app.use(express.json());

// Rota de Health Check para monitoramento da infraestrutura
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    servico: 'API Regulação SUS'
  });
});

// Montagem do roteador de webhooks
app.use('/api/webhook', webhookRoutes);
app.use('/api', perfilRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🩺 Health check disponível em http://localhost:${PORT}/health`);
});