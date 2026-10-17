require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const {
  DURACAO_PADRAO,
  paraHorario,
  paraMinutos,
  dataLocalIso,
  funcionamentoDoDia,
  encontrarConflito,
  descreverConflito,
  horariosDisponiveis
} = require('./services/agendaService');
const {
  gerarMensagemConfirmacao,
  gerarMensagemRemarcacao,
  gerarLinkWhatsApp
} = require('./services/whatsappService');

const app = express();
const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, 'users.json');
const APPOINTMENTS_FILE = path.join(__dirname, 'agendamentos.json');
const BLOCKS_FILE = path.join(__dirname, 'bloqueios.json');

const SERVICOS = {
  corte: { nome: 'Corte Clássico', preco: 45, duracao: 30 },
  barba: { nome: 'Barba Completa', preco: 35, duracao: 30 },
  combo: { nome: 'Corte + Barba', preco: 70, duracao: 30 },
  relaxamento: { nome: 'Relaxamento', preco: 55, duracao: 30 },
  pigmentacao: { nome: 'Pigmentação', preco: 120, duracao: 30 },
  vip: { nome: 'Pacote VIP', preco: 150, duracao: 30 }
};

const STATUS_PERMITIDOS = [
  'pendente',
  'confirmado',
  'concluido',
  'cancelado',
  'nao_compareceu',
  'remarcacao_solicitada'
];

const STATUS_EM_ABERTO = ['pendente', 'confirmado', 'remarcacao_solicitada'];

const DIAS_NA_LIXEIRA = 30;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

function readJsonFile(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.error(`Erro ao ler ${path.basename(filePath)}:`, error.message);
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  const temporaryFile = `${filePath}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(temporaryFile, filePath);
}

function lerUsuarios() {
  return readJsonFile(USERS_FILE);
}

function salvarUsuarios(usuarios) {
  writeJsonFile(USERS_FILE, usuarios);
}

function lerAgendamentos() {
  return readJsonFile(APPOINTMENTS_FILE);
}

function salvarAgendamentos(agendamentos) {
  writeJsonFile(APPOINTMENTS_FILE, agendamentos);
}

// Faixas em que o cliente não pode agendar: [{ data, inicio, fim, motivo }]. Arquivo opcional.
function lerBloqueios() {
  return readJsonFile(BLOCKS_FILE);
}

// Leitura, checagem e gravação acontecem no mesmo trecho síncrono: o Node não atende outra
// requisição no meio, então duas reservas simultâneas nunca passam juntas pela checagem.
// Não coloque await dentro de operacao(). Com mais de um processo, use banco com restrição única.
function transacaoAgendamentos(operacao) {
  const agendamentos = lerAgendamentos();
  const resultado = operacao(agendamentos);

  if (!resultado.erro) {
    salvarAgendamentos(agendamentos);
  }

  return resultado;
}

function registrarHistorico(agendamento, evento) {
  agendamento.historico = [
    ...(agendamento.historico || []),
    { ...evento, alteradoEm: new Date().toISOString() }
  ];
}

function encontrarPorId(id) {
  return lerUsuarios().find((usuario) => usuario.id === id);
}

function encontrarPorEmail(email) {
  const emailNormalizado = String(email || '').toLowerCase().trim();
  return lerUsuarios().find((usuario) => usuario.email === emailNormalizado);
}

function textoSeguro(value, maxLength = 300) {
  return String(value || '').trim().slice(0, maxLength);
}

function telefoneValido(telefone) {
  const numeros = String(telefone || '').replace(/\D/g, '');
  return numeros.length >= 10 && numeros.length <= 13;
}

function dataIsoValida(data) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(data || ''));
}

function horarioValido(horario) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(horario || ''));
}

function dataReal(data) {
  const [ano, mes, dia] = data.split('-').map(Number);
  const date = new Date(ano, mes - 1, dia);
  return (
    date.getFullYear() === ano &&
    date.getMonth() === mes - 1 &&
    date.getDate() === dia
  );
}

function servicoExiste(servico) {
  return Object.hasOwn(SERVICOS, servico);
}

function precoDoServico(servico) {
  return servicoExiste(servico) ? SERVICOS[servico].preco : 0;
}

function duracaoDoServico(servico) {
  return servicoExiste(servico) ? SERVICOS[servico].duracao : DURACAO_PADRAO;
}

function linksWhatsApp(agendamento) {
  if (agendamento.excluidoEm || !STATUS_EM_ABERTO.includes(agendamento.status)) {
    return { confirmacao: null, remarcacao: null };
  }

  const ultimaRemarcacao = [...(agendamento.historico || [])]
    .reverse()
    .find((evento) => evento.tipo === 'remarcacao');

  return {
    confirmacao: gerarLinkWhatsApp(
      agendamento.telefone,
      gerarMensagemConfirmacao(agendamento)
    ),
    remarcacao: ultimaRemarcacao
      ? gerarLinkWhatsApp(
        agendamento.telefone,
        gerarMensagemRemarcacao(agendamento, {
          data: ultimaRemarcacao.dataAnterior,
          horario: ultimaRemarcacao.horarioAnterior
        })
      )
      : null
  };
}

function comValores(agendamento) {
  const completo = {
    ...agendamento,
    servicoNome: servicoExiste(agendamento.servico)
      ? SERVICOS[agendamento.servico].nome
      : agendamento.servico,
    preco: precoDoServico(agendamento.servico),
    duracao: agendamento.duracao || DURACAO_PADRAO
  };

  return {
    ...completo,
    horarioFim: paraHorario(paraMinutos(completo.horario) + completo.duracao),
    links: linksWhatsApp(completo)
  };
}

function erroDeConflito(conflito) {
  const { id, nome, inicio, fim } = descreverConflito(conflito);

  return {
    status: 409,
    erro: `Este horário entra em conflito com o atendimento de ${nome}, das ${inicio} às ${fim}.`,
    conflito: { id, nome, inicio, fim }
  };
}

function validarAgendamento(body, { permitirPassado = false } = {}) {
  const dados = {
    nome: textoSeguro(body.nome, 100),
    telefone: textoSeguro(body.telefone, 30),
    servico: textoSeguro(body.servico, 80),
    data: textoSeguro(body.data, 10),
    horario: textoSeguro(body.horario, 5),
    observacoes: textoSeguro(body.observacoes || body.obs, 500)
  };

  dados.duracao = duracaoDoServico(dados.servico);

  if (!dados.nome || !dados.telefone || !dados.servico || !dados.data || !dados.horario) {
    return { erro: 'Preencha nome, telefone, serviço, data e horário.' };
  }

  if (!telefoneValido(dados.telefone)) {
    return { erro: 'Telefone inválido.' };
  }

  if (!servicoExiste(dados.servico)) {
    return { erro: 'Serviço inválido.' };
  }

  if (!dataIsoValida(dados.data) || !dataReal(dados.data) || !horarioValido(dados.horario)) {
    return { erro: 'Data ou horário inválido.' };
  }

  if (!permitirPassado) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (new Date(`${dados.data}T00:00:00`) < hoje) {
      return { erro: 'Escolha uma data futura ou de hoje.' };
    }
  }

  return { dados };
}

function criarAgendamento(dados, extras) {
  const agora = new Date().toISOString();

  return {
    id: `ag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ...dados,
    ...extras,
    criadoEm: agora,
    atualizadoEm: agora
  };
}

function removerLixeiraExpirada() {
  const agendamentos = lerAgendamentos();
  const limite = Date.now() - DIAS_NA_LIXEIRA * UM_DIA_MS;
  const restantes = agendamentos.filter((item) =>
    !item.excluidoEm || new Date(item.excluidoEm).getTime() > limite
  );

  if (restantes.length !== agendamentos.length) {
    salvarAgendamentos(restantes);
  }

  return restantes;
}

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'somente-desenvolvimento-troque-no-env',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((usuario, done) => done(null, usuario.id));

passport.deserializeUser((id, done) => {
  const usuario = encontrarPorId(id);
  done(null, usuario || false);
});

const googleConfigurado =
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET);

if (googleConfigurado) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:
      process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:3000/auth/google/callback'
  }, (accessToken, refreshToken, profile, done) => {
    const usuarios = lerUsuarios();
    let usuario = usuarios.find((item) => item.googleId === profile.id);

    if (!usuario) {
      usuario = {
        id: `google_${profile.id}`,
        googleId: profile.id,
        nome: profile.displayName,
        email: profile.emails?.[0]?.value?.toLowerCase() || '',
        foto: profile.photos?.[0]?.value || '',
        tipo: 'google',
        role: 'cliente',
        criadoEm: new Date().toISOString()
      };

      usuarios.push(usuario);
      salvarUsuarios(usuarios);
    }

    return done(null, usuario);
  }));
} else {
  console.warn(
    'Google OAuth desativado: GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET ausente.'
  );
}

passport.use(new LocalStrategy(
  { usernameField: 'email', passwordField: 'senha' },
  (email, senha, done) => {
    const usuario = encontrarPorEmail(email);

    if (!usuario) {
      return done(null, false, { message: 'E-mail não encontrado.' });
    }

    if (usuario.tipo === 'google') {
      return done(null, false, { message: 'Use o botão Google.' });
    }

    const senhaCorreta = bcrypt.compareSync(senha, usuario.senhaHash);

    if (!senhaCorreta) {
      return done(null, false, { message: 'Senha incorreta.' });
    }

    return done(null, usuario);
  }
));

function exigeLogin(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect('/login?aviso=entre-para-agendar');
}

function exigeLoginApi(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ erro: 'Entre na sua conta para continuar.' });
}

function enviarErro(res, resultado) {
  const { status = 400, ...corpo } = resultado;
  return res.status(status).json(corpo);
}

function usuarioEhAdmin(usuario) {
  if (!usuario) return false;
  if (usuario.role === 'admin') return true;

  const adminEmail = String(process.env.ADMIN_EMAIL || '')
    .toLowerCase()
    .trim();

  return Boolean(adminEmail) && usuario.email === adminEmail;
}

function exigeAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/login?aviso=acesso-administrativo');
  }

  if (!usuarioEhAdmin(req.user)) {
    return res.status(403).send('Acesso negado: usuário sem permissão administrativa.');
  }

  return next();
}

app.get('/auth/google', (req, res, next) => {
  if (!googleConfigurado) {
    return res.status(503).send(
      'Login Google não configurado. Preencha as variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.'
    );
  }

  return passport.authenticate('google', {
    scope: ['profile', 'email']
  })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
  if (!googleConfigurado) {
    return res.redirect('/login?erro=google-nao-configurado');
  }

  return passport.authenticate('google', {
    failureRedirect: '/login?erro=google',
    successRedirect: '/agenda'
  })(req, res, next);
});

app.post('/auth/local', passport.authenticate('local', {
  failureRedirect: '/login?erro=credenciais',
  successRedirect: '/agenda'
}));

app.post('/auth/registro', (req, res) => {
  const nome = textoSeguro(req.body.nome, 100);
  const email = textoSeguro(req.body.email, 150).toLowerCase();
  const senha = String(req.body.senha || '');
  const confirmarSenha = String(req.body.confirmarSenha || '');

  if (!nome || !email || !senha) {
    return res.redirect('/registro?erro=campos-obrigatorios');
  }

  if (senha !== confirmarSenha) {
    return res.redirect('/registro?erro=senhas-diferentes');
  }

  if (senha.length < 8) {
    return res.redirect('/registro?erro=senha-curta');
  }

  if (encontrarPorEmail(email)) {
    return res.redirect('/registro?erro=email-em-uso');
  }

  const novoUsuario = {
    id: `local_${Date.now()}`,
    nome,
    email,
    senhaHash: bcrypt.hashSync(senha, 12),
    foto: '',
    tipo: 'local',
    role: 'cliente',
    criadoEm: new Date().toISOString()
  };

  const usuarios = lerUsuarios();
  usuarios.push(novoUsuario);
  salvarUsuarios(usuarios);

  req.login(novoUsuario, (error) => {
    if (error) return res.redirect('/login?erro=generico');
    return res.redirect('/agenda');
  });
});

app.get('/auth/logout', (req, res) => {
  req.logout((error) => {
    if (error) console.error('Erro no logout:', error.message);

    req.session.destroy(() => {
      res.redirect('/login?aviso=desconectado');
    });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect(usuarioEhAdmin(req.user) ? '/admin' : '/agenda');
  }

  return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/registro', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect(usuarioEhAdmin(req.user) ? '/admin' : '/agenda');
  }

  return res.sendFile(path.join(__dirname, 'public', 'registro.html'));
});

app.get('/agenda', exigeLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agenda.html'));
});

app.get('/admin', exigeAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/usuario', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ logado: false });
  }

  const { senhaHash, ...usuarioSeguro } = req.user;

  return res.json({
    logado: true,
    admin: usuarioEhAdmin(req.user),
    usuario: usuarioSeguro
  });
});

app.get('/api/agendamentos/horarios', exigeLoginApi, (req, res) => {
  const data = textoSeguro(req.query.data, 10);

  if (!dataIsoValida(data) || !dataReal(data)) {
    return res.status(400).json({ erro: 'Data inválida.' });
  }

  const duracao = duracaoDoServico(textoSeguro(req.query.servico, 80));

  res.set('Cache-Control', 'no-store');

  return res.json({
    data,
    duracao,
    funcionaNoDia: Boolean(funcionamentoDoDia(data)),
    horarios: horariosDisponiveis({
      data,
      duracao,
      agendamentos: lerAgendamentos(),
      bloqueios: lerBloqueios()
    })
  });
});

app.post('/api/agendamentos', exigeLoginApi, (req, res) => {
  const { erro, dados } = validarAgendamento(req.body);

  if (erro) {
    return res.status(400).json({ erro });
  }

  const resultado = transacaoAgendamentos((agendamentos) => {
    const disponiveis = horariosDisponiveis({
      data: dados.data,
      duracao: dados.duracao,
      agendamentos,
      bloqueios: lerBloqueios()
    });

    if (!disponiveis.includes(dados.horario)) {
      return {
        status: 409,
        erro: 'Este horário não está disponível. Escolha um dos horários exibidos.'
      };
    }

    const agendamento = criarAgendamento(dados, {
      usuarioId: req.user.id,
      status: 'pendente'
    });

    agendamentos.push(agendamento);
    return { agendamento };
  });

  if (resultado.erro) {
    return enviarErro(res, resultado);
  }

  return res.status(201).json({
    mensagem: 'Agendamento recebido.',
    agendamento: resultado.agendamento
  });
});

app.get('/api/admin/agendamentos', exigeAdmin, (req, res) => {
  const data = textoSeguro(req.query.data, 10);
  const inicio = textoSeguro(req.query.inicio, 10);
  const fim = textoSeguro(req.query.fim, 10);
  const status = textoSeguro(req.query.status, 20);

  let agendamentos = removerLixeiraExpirada().filter((item) => !item.excluidoEm);

  if (dataIsoValida(data)) {
    agendamentos = agendamentos.filter((item) => item.data === data);
  }

  if (dataIsoValida(inicio)) {
    agendamentos = agendamentos.filter((item) => item.data >= inicio);
  }

  if (dataIsoValida(fim)) {
    agendamentos = agendamentos.filter((item) => item.data <= fim);
  }

  if (status) {
    agendamentos = agendamentos.filter((item) => item.status === status);
  }

  agendamentos.sort((a, b) =>
    `${a.data} ${a.horario}`.localeCompare(`${b.data} ${b.horario}`)
  );

  return res.json({ agendamentos: agendamentos.map(comValores) });
});

app.get('/api/admin/resumo', exigeAdmin, (req, res) => {
  const hoje = dataLocalIso(new Date());
  const pedida = textoSeguro(req.query.referencia, 10);
  const referencia = dataIsoValida(pedida) && dataReal(pedida) ? pedida : hoje;
  const [ano, mes, dia] = referencia.split('-').map(Number);

  const segunda = new Date(ano, mes - 1, dia);
  const diaDaSemana = segunda.getDay();
  segunda.setDate(segunda.getDate() + (diaDaSemana === 0 ? -6 : 1 - diaDaSemana));
  const domingo = new Date(segunda);
  domingo.setDate(domingo.getDate() + 6);

  const inicioSemana = dataLocalIso(segunda);
  const fimSemana = dataLocalIso(domingo);
  const prefixoMes = referencia.slice(0, 7);

  const todos = removerLixeiraExpirada();
  const ativos = todos.filter((item) => !item.excluidoEm);
  const somar = (lista) =>
    lista.reduce((total, item) => total + precoDoServico(item.servico), 0);

  const concluidosNoMes = ativos.filter((item) =>
    item.status === 'concluido' && String(item.data).startsWith(prefixoMes)
  );
  const daSemana = ativos.filter((item) =>
    item.data >= inicioSemana && item.data <= fimSemana
  );
  const realizadosNaSemana = daSemana.filter((item) => item.status === 'concluido');
  const aRealizarNaSemana = daSemana.filter((item) =>
    STATUS_EM_ABERTO.includes(item.status)
  );

  return res.json({
    referencia,
    mes: prefixoMes,
    inicioSemana,
    fimSemana,
    hoje: ativos.filter((item) =>
      item.data === hoje && [...STATUS_EM_ABERTO, 'concluido'].includes(item.status)
    ).length,
    pendentes: ativos.filter((item) => item.status === 'pendente').length,
    confirmadosNaSemana: daSemana.filter((item) => item.status === 'confirmado').length,
    ganhosMes: somar(concluidosNoMes),
    atendimentosConcluidosMes: concluidosNoMes.length,
    realizadoSemana: somar(realizadosNaSemana),
    aRealizarSemana: somar(aRealizarNaSemana),
    potencialSemana: somar(realizadosNaSemana) + somar(aRealizarNaSemana),
    naLixeira: todos.length - ativos.length,
    servicos: Object.entries(SERVICOS).map(([id, servico]) => ({ id, ...servico }))
  });
});

app.get('/api/admin/fechamento', exigeAdmin, (req, res) => {
  const pedida = textoSeguro(req.query.data, 10);
  const data = dataIsoValida(pedida) && dataReal(pedida) ? pedida : dataLocalIso(new Date());

  const doDia = removerLixeiraExpirada().filter((item) =>
    !item.excluidoEm && item.data === data
  );

  const comStatus = (...status) => doDia.filter((item) => status.includes(item.status));
  const somar = (lista) =>
    lista.reduce((total, item) => total + precoDoServico(item.servico), 0);

  const naoFinalizados = doDia
    .filter((item) => STATUS_EM_ABERTO.includes(item.status))
    .sort((a, b) => a.horario.localeCompare(b.horario))
    .map(({ id, nome, horario, status }) => ({ id, nome, horario, status }));

  return res.json({
    data,
    total: doDia.length,
    concluidos: comStatus('concluido').length,
    cancelados: comStatus('cancelado').length,
    naoCompareceu: comStatus('nao_compareceu').length,
    pendentes: comStatus('pendente').length,
    confirmados: comStatus('confirmado').length,
    remarcacaoSolicitada: comStatus('remarcacao_solicitada').length,
    valorPrevisto: somar(comStatus(...STATUS_EM_ABERTO, 'concluido')),
    valorRealizado: somar(comStatus('concluido')),
    encerrado: naoFinalizados.length === 0,
    aviso: naoFinalizados.length > 0
      ? 'Existem atendimentos ainda não finalizados neste dia.'
      : null,
    naoFinalizados
  });
});

app.post('/api/admin/agendamentos', exigeAdmin, (req, res) => {
  const { erro, dados } = validarAgendamento(req.body, { permitirPassado: true });

  if (erro) {
    return res.status(400).json({ erro });
  }

  const status = textoSeguro(req.body.status || 'confirmado', 30);

  if (!STATUS_PERMITIDOS.includes(status)) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }

  const resultado = transacaoAgendamentos((agendamentos) => {
    if (status !== 'cancelado') {
      const conflito = encontrarConflito(agendamentos, {
        data: dados.data,
        horario: dados.horario,
        duracao: dados.duracao
      });

      if (conflito) return erroDeConflito(conflito);
    }

    const agendamento = criarAgendamento(dados, {
      usuarioId: req.user.id,
      origem: 'admin',
      status
    });

    agendamentos.push(agendamento);
    return { agendamento };
  });

  if (resultado.erro) {
    return enviarErro(res, resultado);
  }

  return res.status(201).json({
    mensagem: 'Agendamento criado.',
    agendamento: comValores(resultado.agendamento)
  });
});

app.patch('/api/admin/agendamentos/:id/remarcar', exigeAdmin, (req, res) => {
  const resultado = transacaoAgendamentos((agendamentos) => {
    const agendamento = agendamentos.find((item) =>
      item.id === req.params.id && !item.excluidoEm
    );

    if (!agendamento) {
      return { status: 404, erro: 'Agendamento não encontrado.' };
    }

    if (!STATUS_EM_ABERTO.includes(agendamento.status)) {
      return {
        status: 409,
        erro: 'Só é possível remarcar agendamentos pendentes, confirmados ou com remarcação solicitada.'
      };
    }

    const data = textoSeguro(req.body.data || agendamento.data, 10);
    const horario = textoSeguro(req.body.horario || agendamento.horario, 5);

    if (!dataIsoValida(data) || !dataReal(data) || !horarioValido(horario)) {
      return { status: 400, erro: 'Data ou horário inválido.' };
    }

    if (data === agendamento.data && horario === agendamento.horario) {
      return { status: 400, erro: 'Altere a data ou o horário.' };
    }

    const conflito = encontrarConflito(agendamentos, {
      data,
      horario,
      duracao: agendamento.duracao || DURACAO_PADRAO,
      ignorarId: agendamento.id
    });

    if (conflito) return erroDeConflito(conflito);

    registrarHistorico(agendamento, {
      tipo: 'remarcacao',
      dataAnterior: agendamento.data,
      horarioAnterior: agendamento.horario,
      dataNova: data,
      horarioNovo: horario
    });

    // Sem a confirmação do cliente para o novo horário, o atendimento volta a ficar pendente.
    const clienteJaConcordou =
      req.body.manterConfirmado === true && agendamento.status === 'confirmado';

    agendamento.data = data;
    agendamento.horario = horario;
    agendamento.status = clienteJaConcordou ? 'confirmado' : 'pendente';
    agendamento.atualizadoEm = new Date().toISOString();

    return { agendamento };
  });

  if (resultado.erro) {
    return enviarErro(res, resultado);
  }

  return res.json({
    mensagem: 'Agendamento remarcado.',
    agendamento: comValores(resultado.agendamento)
  });
});

app.patch('/api/admin/agendamentos/:id/status', exigeAdmin, (req, res) => {
  const novoStatus = textoSeguro(req.body.status, 30);

  if (!STATUS_PERMITIDOS.includes(novoStatus)) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }

  const resultado = transacaoAgendamentos((agendamentos) => {
    const agendamento = agendamentos.find((item) =>
      item.id === req.params.id && !item.excluidoEm
    );

    if (!agendamento) {
      return { status: 404, erro: 'Agendamento não encontrado.' };
    }

    const reativando = agendamento.status === 'cancelado' && novoStatus !== 'cancelado';

    if (reativando) {
      const conflito = encontrarConflito(agendamentos, {
        data: agendamento.data,
        horario: agendamento.horario,
        duracao: agendamento.duracao || DURACAO_PADRAO,
        ignorarId: agendamento.id
      });

      if (conflito) return erroDeConflito(conflito);
    }

    agendamento.status = novoStatus;
    agendamento.atualizadoEm = new Date().toISOString();

    return { agendamento };
  });

  if (resultado.erro) {
    return enviarErro(res, resultado);
  }

  return res.json({
    mensagem: 'Status atualizado.',
    agendamento: comValores(resultado.agendamento)
  });
});

app.delete('/api/admin/agendamentos/:id', exigeAdmin, (req, res) => {
  const agendamentos = lerAgendamentos();
  const agendamento = agendamentos.find((item) =>
    item.id === req.params.id && !item.excluidoEm
  );

  if (!agendamento) {
    return res.status(404).json({ erro: 'Agendamento não encontrado.' });
  }

  agendamento.excluidoEm = new Date().toISOString();
  agendamento.atualizadoEm = agendamento.excluidoEm;

  salvarAgendamentos(agendamentos);

  return res.json({
    mensagem: 'Agendamento movido para a lixeira.',
    agendamento: comValores(agendamento)
  });
});

app.get('/api/admin/lixeira', exigeAdmin, (req, res) => {
  const itens = removerLixeiraExpirada()
    .filter((item) => item.excluidoEm)
    .sort((a, b) => b.excluidoEm.localeCompare(a.excluidoEm))
    .map((item) => {
      const expiraEm = new Date(item.excluidoEm).getTime() + DIAS_NA_LIXEIRA * UM_DIA_MS;

      return {
        ...comValores(item),
        diasRestantes: Math.max(1, Math.ceil((expiraEm - Date.now()) / UM_DIA_MS))
      };
    });

  return res.json({ agendamentos: itens, diasNaLixeira: DIAS_NA_LIXEIRA });
});

app.post('/api/admin/lixeira/:id/restaurar', exigeAdmin, (req, res) => {
  const resultado = transacaoAgendamentos((agendamentos) => {
    const agendamento = agendamentos.find((item) =>
      item.id === req.params.id && item.excluidoEm
    );

    if (!agendamento) {
      return { status: 404, erro: 'Agendamento não encontrado na lixeira.' };
    }

    const data = textoSeguro(req.body.data || agendamento.data, 10);
    const horario = textoSeguro(req.body.horario || agendamento.horario, 5);

    if (!dataIsoValida(data) || !dataReal(data) || !horarioValido(horario)) {
      return { status: 400, erro: 'Data ou horário inválido.' };
    }

    if (agendamento.status !== 'cancelado') {
      const conflito = encontrarConflito(agendamentos, {
        data,
        horario,
        duracao: agendamento.duracao || DURACAO_PADRAO,
        ignorarId: agendamento.id
      });

      if (conflito) return erroDeConflito(conflito);
    }

    if (data !== agendamento.data || horario !== agendamento.horario) {
      registrarHistorico(agendamento, {
        tipo: 'remarcacao',
        dataAnterior: agendamento.data,
        horarioAnterior: agendamento.horario,
        dataNova: data,
        horarioNovo: horario
      });
    }

    agendamento.data = data;
    agendamento.horario = horario;
    delete agendamento.excluidoEm;
    agendamento.atualizadoEm = new Date().toISOString();

    return { agendamento };
  });

  if (resultado.erro) {
    return enviarErro(res, resultado);
  }

  return res.json({
    mensagem: 'Agendamento restaurado.',
    agendamento: comValores(resultado.agendamento)
  });
});

app.delete('/api/admin/lixeira/:id', exigeAdmin, (req, res) => {
  const agendamentos = lerAgendamentos();
  const restantes = agendamentos.filter((item) =>
    !(item.id === req.params.id && item.excluidoEm)
  );

  if (restantes.length === agendamentos.length) {
    return res.status(404).json({ erro: 'Agendamento não encontrado na lixeira.' });
  }

  salvarAgendamentos(restantes);
  return res.status(204).send();
});

app.use((error, req, res, next) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`Barbearia Nogueira iniciada em http://localhost:${PORT}`);
  console.log(`Painel administrativo: http://localhost:${PORT}/admin`);
});
