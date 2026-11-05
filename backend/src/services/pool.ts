import 'dotenv/config';
import { Pool } from 'pg';
import { poolConfig } from '../database/poolConfig.js';

export const pool = new Pool(poolConfig());
// Erros em conexões ociosas não devem encerrar o processo por evento não tratado.
pool.on('error', () => console.error('[Banco] Conexão ociosa perdida; o pool abrirá outra conexão.'));
