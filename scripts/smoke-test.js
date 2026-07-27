const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pastaTemporaria = fs.mkdtempSync(
  path.join(os.tmpdir(), 'barbearia-nogueira-test-')
);

process.env.DATA_DIR = pastaTemporaria;
process.env.SESSION_SECRET = 'segredo-exclusivo-para-teste';
process.env.ADMIN_NAME = 'Admin Teste';
process.env.ADMIN_EMAIL = 'admin@teste.local';
process.env.ADMIN_PASSWORD = 'senha-segura-123';

const { app } = require('../server');

function proximoDiaAberto() {
  const data = new Date();
  data.setDate(data.getDate() + 2);
  while (data.getDay() === 0) data.setDate(data.getDate() + 1);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

async function executar() {
  const servidor = await new Promise((resolve) => {
    const instancia = app.listen(0, () => resolve(instancia));
  });
  const porta = servidor.address().port;
  const origem = `http://127.0.0.1:${porta}`;

  async function requisitar(caminho, opcoes = {}, sessao = {}) {
    const cabecalhos = new Headers(opcoes.headers || {});
    if (sessao.cookie) cabecalhos.set('Cookie', sessao.cookie);
    const resposta = await fetch(`${origem}${caminho}`, {
      ...opcoes,
      headers: cabecalhos,
      redirect: 'manual'
    });
    const cookie = resposta.headers.get('set-cookie');
    if (cookie) sessao.cookie = cookie.split(';')[0];
    return resposta;
  }

  try {
    const visitante = {};
    const cliente = {};
    const admin = {};

    const adminProtegido = await requisitar('/admin', {}, visitante);
    assert.equal(adminProtegido.status, 302);
    assert.match(adminProtegido.headers.get('location'), /admin-login/);

    const arquivoAdminProtegido = await requisitar('/admin.html', {}, visitante);
    assert.equal(arquivoAdminProtegido.status, 302);
    assert.match(
      arquivoAdminProtegido.headers.get('location'),
      /admin-login/
    );

    const cadastro = await requisitar('/auth/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        nome: 'Cliente Teste',
        email: 'cliente@teste.local',
        senha: 'senha-cliente',
        confirmarSenha: 'senha-cliente'
      })
    }, cliente);
    assert.equal(cadastro.status, 302);
    assert.equal(cadastro.headers.get('location'), '/agenda');

    const paginaAgenda = await requisitar('/agenda', {}, cliente);
    assert.equal(paginaAgenda.status, 200);
    assert.match(await paginaAgenda.text(), /formAgenda/);

    const agendamento = await requisitar('/api/agendamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Cliente Teste',
        telefone: '19999998888',
        servico: 'corte',
        data: proximoDiaAberto(),
        horario: '10:00',
        obs: 'Corte social, por favor.'
      })
    }, cliente);
    assert.equal(agendamento.status, 201);
    const agendamentoCriado = await agendamento.json();
    assert.equal(agendamentoCriado.agendamento.status, 'pendente');

    const loginAdmin = await requisitar('/auth/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: process.env.ADMIN_EMAIL,
        senha: process.env.ADMIN_PASSWORD
      })
    }, admin);
    assert.equal(loginAdmin.status, 302);
    assert.equal(loginAdmin.headers.get('location'), '/admin');

    const paginaAdmin = await requisitar('/admin', {}, admin);
    assert.equal(paginaAdmin.status, 200);
    assert.match(await paginaAdmin.text(), /semanaGrid/);

    const clienteSemPermissao = await requisitar(
      '/api/admin/dashboard?semana=0',
      {},
      cliente
    );
    assert.equal(clienteSemPermissao.status, 403);

    const dashboardInicial = await requisitar(
      '/api/admin/dashboard?semana=0',
      {},
      admin
    );
    assert.equal(dashboardInicial.status, 200);

    const aceitar = await requisitar(
      `/api/admin/agendamentos/${agendamentoCriado.agendamento.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aceito' })
      },
      admin
    );
    assert.equal(aceitar.status, 200);

    const concluir = await requisitar(
      `/api/admin/agendamentos/${agendamentoCriado.agendamento.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'concluido' })
      },
      admin
    );
    assert.equal(concluir.status, 200);

    const meusAgendamentos = await requisitar('/api/agendamentos/me', {}, cliente);
    const meusDados = await meusAgendamentos.json();
    assert.equal(meusDados.agendamentos[0].status, 'concluido');

    console.log('✓ Login, proteção administrativa, agenda e status validados.');
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
    fs.rmSync(pastaTemporaria, { recursive: true, force: true });
  }
}

executar().catch((erro) => {
  console.error(erro);
  try {
    fs.rmSync(pastaTemporaria, { recursive: true, force: true });
  } catch {}
  process.exitCode = 1;
});
