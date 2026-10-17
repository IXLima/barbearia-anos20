const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');

const pastaTemporaria = fs.mkdtempSync(
  path.join(os.tmpdir(), 'barbearia-nogueira-test-')
);

process.env.DATA_DIR = pastaTemporaria;
process.env.SESSION_SECRET = 'segredo-exclusivo-para-teste';
process.env.ADMIN_NAME = 'Admin Teste';
process.env.ADMIN_EMAIL = 'admin@teste.local';
process.env.ADMIN_PASSWORD = 'senha-segura-123';

// Dados no formato antigo: role em vez de papel, aceito/recusado em vez de confirmado/cancelado.
fs.writeFileSync(path.join(pastaTemporaria, 'users.json'), JSON.stringify([{
  id: 'legado_1',
  nome: 'Admin Antigo',
  email: 'antigo@teste.local',
  senhaHash: bcrypt.hashSync('senha-antiga-1', 4),
  tipo: 'local',
  role: 'admin'
}]));
fs.writeFileSync(path.join(pastaTemporaria, 'agendamentos.json'), JSON.stringify([
  { id: 'a1', nome: 'Aceito', telefone: '19999990001', servico: 'corte', data: '2031-03-10', horario: '09:00', status: 'aceito' },
  { id: 'a2', nome: 'Recusado', telefone: '19999990002', servico: 'barba', data: '2031-03-10', horario: '10:00', status: 'recusado' }
]));

const { app } = require('../server');

function proximoDia(diaDaSemana) {
  const data = new Date();
  data.setDate(data.getDate() + 2);
  while (data.getDay() !== diaDaSemana) data.setDate(data.getDate() + 1);
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

async function executar() {
  const servidor = await new Promise((resolve) => {
    const instancia = app.listen(0, () => resolve(instancia));
  });
  const origem = `http://127.0.0.1:${servidor.address().port}`;

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

  const formulario = (dados) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(dados)
  });

  const json = (metodo, dados) => ({
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados)
  });

  try {
    const visitante = {};
    const cliente = {};
    const admin = {};
    const antigo = {};
    const terca = proximoDia(2);

    // Páginas e arquivos protegidos
    for (const pagina of ['/admin', '/admin.html']) {
      const resposta = await requisitar(pagina, {}, visitante);
      assert.equal(resposta.status, 302, `${pagina} deve exigir login`);
      assert.match(resposta.headers.get('location'), /admin-login/);
    }

    const agendaAnonima = await requisitar('/agenda.html', {}, visitante);
    assert.equal(agendaAnonima.status, 302);
    assert.match(agendaAnonima.headers.get('location'), /\/login/);

    const apiAnonima = await requisitar('/api/admin/resumo', {}, visitante);
    assert.equal(apiAnonima.status, 401);

    const rotaInexistente = await requisitar('/api/nao-existe', {}, visitante);
    assert.equal(rotaInexistente.status, 404);
    assert.equal((await rotaInexistente.json()).erro, 'Rota não encontrada.');

    // Cliente
    const cadastro = await requisitar('/auth/registro', formulario({
      nome: 'Cliente Teste',
      email: 'cliente@teste.local',
      senha: 'senha-cliente',
      confirmarSenha: 'senha-cliente'
    }), cliente);
    assert.equal(cadastro.status, 302);
    assert.equal(cadastro.headers.get('location'), '/agenda');

    const senhaCurta = await requisitar('/auth/registro', formulario({
      nome: 'Curta', email: 'curta@teste.local', senha: '123456', confirmarSenha: '123456'
    }), {});
    assert.match(senhaCurta.headers.get('location'), /senha-curta/);

    const emailDoAdmin = await requisitar('/auth/registro', formulario({
      nome: 'Intruso',
      email: process.env.ADMIN_EMAIL,
      senha: 'senha-intruso-1',
      confirmarSenha: 'senha-intruso-1'
    }), {});
    assert.match(emailDoAdmin.headers.get('location'), /email-em-uso/);

    const paginaAgenda = await requisitar('/agenda', {}, cliente);
    assert.equal(paginaAgenda.status, 200);
    assert.match(await paginaAgenda.text(), /formAgenda/);

    const horarios = await requisitar(`/api/agendamentos/horarios?data=${terca}`, {}, cliente);
    assert.equal(horarios.status, 200);
    const grade = (await horarios.json()).horarios;
    assert.ok(grade.includes('10:00') && grade.includes('10:30'));

    const horarioQuebrado = await requisitar('/api/agendamentos', json('POST', {
      nome: 'Cliente Teste', telefone: '19999998888', servico: 'corte', data: terca, horario: '10:10'
    }), cliente);
    assert.equal(horarioQuebrado.status, 409, 'cliente não pode usar horário fora da grade');

    const agendamento = await requisitar('/api/agendamentos', json('POST', {
      nome: 'Cliente Teste',
      telefone: '19999998888',
      servico: 'corte',
      data: terca,
      horario: '10:00',
      obs: 'Corte social, por favor.'
    }), cliente);
    assert.equal(agendamento.status, 201);
    const criado = (await agendamento.json()).agendamento;
    assert.equal(criado.status, 'pendente');
    assert.match(criado.id, /^ag_[0-9a-f-]{36}$/);

    const duplicado = await requisitar('/api/agendamentos', json('POST', {
      nome: 'Outro', telefone: '19999997777', servico: 'barba', data: terca, horario: '10:00'
    }), cliente);
    assert.equal(duplicado.status, 409, 'o mesmo horário não pode ser reservado duas vezes');

    // Administração
    const clienteNoLoginAdmin = await requisitar('/auth/admin', formulario({
      email: 'cliente@teste.local', senha: 'senha-cliente'
    }), {});
    assert.match(clienteNoLoginAdmin.headers.get('location'), /admin-login\?erro=sem-permissao/);

    const loginAdmin = await requisitar('/auth/admin', formulario({
      email: process.env.ADMIN_EMAIL, senha: process.env.ADMIN_PASSWORD
    }), admin);
    assert.equal(loginAdmin.status, 302);
    assert.equal(loginAdmin.headers.get('location'), '/admin');

    const paginaAdmin = await requisitar('/admin', {}, admin);
    assert.equal(paginaAdmin.status, 200);
    assert.match(await paginaAdmin.text(), /weeklyView/);

    const clienteSemPermissao = await requisitar('/api/admin/resumo', {}, cliente);
    assert.equal(clienteSemPermissao.status, 403);

    const conflito = await requisitar('/api/admin/agendamentos', json('POST', {
      nome: 'Pedro', telefone: '19999996666', servico: 'corte', data: terca, horario: '10:15'
    }), admin);
    assert.equal(conflito.status, 409, 'admin também não pode sobrepor atendimentos');
    assert.match((await conflito.json()).erro, /conflito com o atendimento de Cliente Teste, das 10:00 às 10:30/);

    const confirmar = await requisitar(
      `/api/admin/agendamentos/${criado.id}/status`, json('PATCH', { status: 'confirmado' }), admin
    );
    assert.equal(confirmar.status, 200);

    const concluir = await requisitar(
      `/api/admin/agendamentos/${criado.id}/status`, json('PATCH', { status: 'concluido' }), admin
    );
    assert.equal(concluir.status, 200);

    const resumo = await requisitar(`/api/admin/resumo?referencia=${terca}`, {}, admin);
    const dadosResumo = await resumo.json();
    assert.equal(dadosResumo.ganhosMes, 45);
    assert.deepStrictEqual(dadosResumo.resumoMes.map((item) => item.servico), ['corte']);

    // Dados no formato antigo continuam funcionando
    const loginAntigo = await requisitar('/auth/admin', formulario({
      email: 'antigo@teste.local', senha: 'senha-antiga-1'
    }), antigo);
    assert.equal(loginAntigo.headers.get('location'), '/admin', 'role: admin vira papel: admin');

    const lista = await requisitar('/api/admin/agendamentos?data=2031-03-10', {}, antigo);
    const statusPorId = Object.fromEntries(
      (await lista.json()).agendamentos.map((item) => [item.id, item.status])
    );
    assert.equal(statusPorId.a1, 'confirmado', 'aceito vira confirmado');
    assert.equal(statusPorId.a2, 'cancelado', 'recusado vira cancelado');

    console.log('✓ Login, papéis, proteção administrativa, grade, conflitos, status e migração de dados validados.');
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
