const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), 'barbearia-permissoes-'));
process.env.DATA_DIR = pastaTemporaria;
process.env.DATABASE_URL = '';
process.env.SESSION_SECRET = 'segredo-exclusivo-para-permissoes';
process.env.ADMIN_EMAIL = 'dono@teste.com';
process.env.ADMIN_PASSWORD = 'senha-do-dono-123';

const { app } = require('../server');

let servidor;
let base;

test.before(() => new Promise((resolve) => {
  servidor = app.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${servidor.address().port}`;
    resolve();
  });
}));

test.after(() => {
  servidor.close();
  fs.rmSync(pastaTemporaria, { recursive: true, force: true });
});

async function entrar(email, senha) {
  const resposta = await fetch(`${base}/auth/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
    redirect: 'manual'
  });
  const cookie = resposta.headers.get('set-cookie');
  assert.ok(cookie, `login de ${email} deveria criar sessão`);
  return cookie.split(';')[0];
}

function pedir(cookie, metodo, caminho, corpo) {
  return fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
}

test('dono entra e gerencia a equipe', async () => {
  const dono = await entrar('dono@teste.com', 'senha-do-dono-123');

  const lista = await pedir(dono, 'GET', '/api/admin/equipe');
  assert.strictEqual(lista.status, 200);

  const criado = await pedir(dono, 'POST', '/api/admin/equipe', {
    email: 'agenda@teste.com', nome: 'Agenda', perfil: 'agendamentos', senha: 'senha-agenda-123'
  });
  assert.strictEqual(criado.status, 201);

  const criadoRel = await pedir(dono, 'POST', '/api/admin/equipe', {
    email: 'rel@teste.com', nome: 'Relatórios', perfil: 'relatorios', senha: 'senha-rel-12345'
  });
  assert.strictEqual(criadoRel.status, 201);
});

test('perfil agendamentos vê a agenda, mas não a equipe nem os relatórios', async () => {
  const agenda = await entrar('agenda@teste.com', 'senha-agenda-123');

  assert.strictEqual((await pedir(agenda, 'GET', '/api/admin/agendamentos?modo=todos')).status, 200);
  assert.strictEqual((await pedir(agenda, 'GET', '/api/admin/equipe')).status, 403);
  assert.strictEqual((await pedir(agenda, 'GET', '/api/admin/resumo')).status, 403);
});

test('perfil relatorios só lê relatórios', async () => {
  const relatorios = await entrar('rel@teste.com', 'senha-rel-12345');

  assert.strictEqual((await pedir(relatorios, 'GET', '/api/admin/resumo')).status, 200);
  assert.strictEqual((await pedir(relatorios, 'GET', '/api/admin/agendamentos')).status, 403);
  assert.strictEqual((await pedir(relatorios, 'POST', '/api/admin/equipe', {
    email: 'outro@teste.com', perfil: 'dono', senha: 'senha-outro-123'
  })).status, 403);
});

test('rebaixar um admin vale na hora, sem novo login', async () => {
  const dono = await entrar('dono@teste.com', 'senha-do-dono-123');
  const agenda = await entrar('agenda@teste.com', 'senha-agenda-123');

  const lista = await (await pedir(dono, 'GET', '/api/admin/equipe')).json();
  const alvo = lista.equipe.find((usuario) => usuario.email === 'agenda@teste.com');

  const trocado = await pedir(dono, 'PATCH', `/api/admin/equipe/${alvo.id}`, { perfil: 'relatorios' });
  assert.strictEqual(trocado.status, 200);

  assert.strictEqual((await pedir(agenda, 'GET', '/api/admin/agendamentos')).status, 403);
});

test('não deixa a equipe ficar sem dono nem o dono se remover', async () => {
  const dono = await entrar('dono@teste.com', 'senha-do-dono-123');
  const lista = await (await pedir(dono, 'GET', '/api/admin/equipe')).json();
  const eDono = lista.equipe.find((usuario) => usuario.email === 'dono@teste.com');

  const rebaixar = await pedir(dono, 'PATCH', `/api/admin/equipe/${eDono.id}`, { perfil: 'relatorios' });
  assert.strictEqual(rebaixar.status, 400);

  const remover = await pedir(dono, 'DELETE', `/api/admin/equipe/${eDono.id}`);
  assert.strictEqual(remover.status, 400);
});
