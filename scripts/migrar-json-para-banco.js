// Copia users.json, agendamentos.json e bloqueios.json para o Postgres (DATABASE_URL).
// Apaga o conteúdo atual das tabelas antes de copiar. Rode uma vez: npm run migrar-banco
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..');

function lerLista(nomeArquivo) {
  const caminho = path.join(DATA_DIR, nomeArquivo);
  if (!fs.existsSync(caminho)) return [];

  const conteudo = fs.readFileSync(caminho, 'utf-8').trim();
  return conteudo ? JSON.parse(conteudo) : [];
}

async function migrar() {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL no .env antes de migrar.');

  const usuarios = lerLista('users.json');
  const agendamentos = lerLista('agendamentos.json');
  const bloqueios = lerLista('bloqueios.json');

  const banco = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const cliente = await banco.connect();

  try {
    await cliente.query('begin');
    await cliente.query('delete from usuarios');
    await cliente.query('delete from agendamentos');
    await cliente.query('delete from bloqueios');

    for (const usuario of usuarios) {
      await cliente.query('insert into usuarios (id, email, dados) values ($1, $2, $3)', [usuario.id, usuario.email || null, usuario]);
    }
    for (const agendamento of agendamentos) {
      await cliente.query('insert into agendamentos (id, data, status, dados) values ($1, $2, $3, $4)', [agendamento.id, agendamento.data, agendamento.status, agendamento]);
    }
    for (const bloqueio of bloqueios) {
      await cliente.query('insert into bloqueios (dados) values ($1)', [bloqueio]);
    }

    await cliente.query('commit');
    console.log(`Copiados: ${usuarios.length} usuários, ${agendamentos.length} agendamentos, ${bloqueios.length} bloqueios.`);
  } catch (erro) {
    await cliente.query('rollback');
    throw erro;
  } finally {
    cliente.release();
    await banco.end();
  }
}

migrar().catch((erro) => {
  console.error('Migração falhou:', erro.message);
  process.exit(1);
});
