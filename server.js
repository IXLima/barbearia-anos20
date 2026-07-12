require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, 'users.json');
const APPOINTMENTS_FILE = path.join(__dirname, 'agendamentos.json');

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

app.post('/api/agendamentos', exigeLogin, (req, res) => {
  const nome = textoSeguro(req.body.nome, 100);
  const telefone = textoSeguro(req.body.telefone, 30);
  const servico = textoSeguro(req.body.servico, 80);
  const data = textoSeguro(req.body.data, 10);
  const horario = textoSeguro(req.body.horario, 5);
  const observacoes = textoSeguro(req.body.observacoes || req.body.obs, 500);

  if (!nome || !telefone || !servico || !data || !horario) {
    return res.status(400).json({
      erro: 'Preencha nome, telefone, serviço, data e horário.'
    });
  }

  if (!telefoneValido(telefone)) {
    return res.status(400).json({ erro: 'Telefone inválido.' });
  }

  if (!dataIsoValida(data) || !horarioValido(horario)) {
    return res.status(400).json({ erro: 'Data ou horário inválido.' });
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataSolicitada = new Date(`${data}T00:00:00`);

  if (Number.isNaN(dataSolicitada.getTime()) || dataSolicitada < hoje) {
    return res.status(400).json({ erro: 'Escolha uma data futura ou de hoje.' });
  }

  const agendamentos = lerAgendamentos();

  const conflito = agendamentos.some((item) =>
    item.data === data &&
    item.horario === horario &&
    !['cancelado'].includes(item.status)
  );

  if (conflito) {
    return res.status(409).json({
      erro: 'Este horário já está ocupado. Escolha outro horário.'
    });
  }

  const agendamento = {
    id: `ag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    usuarioId: req.user.id,
    nome,
    telefone,
    servico,
    data,
    horario,
    observacoes,
    status: 'pendente',
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };

  agendamentos.push(agendamento);
  salvarAgendamentos(agendamentos);

  return res.status(201).json({
    mensagem: 'Agendamento recebido.',
    agendamento
  });
});

app.get('/api/admin/agendamentos', exigeAdmin, (req, res) => {
  const data = textoSeguro(req.query.data, 10);
  const inicio = textoSeguro(req.query.inicio, 10);
  const fim = textoSeguro(req.query.fim, 10);
  const status = textoSeguro(req.query.status, 20);

  let agendamentos = lerAgendamentos();

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

  return res.json({ agendamentos });
});

app.patch('/api/admin/agendamentos/:id/status', exigeAdmin, (req, res) => {
  const statusPermitidos = [
    'pendente',
    'confirmado',
    'concluido',
    'cancelado',
    'nao_compareceu'
  ];

  const novoStatus = textoSeguro(req.body.status, 30);

  if (!statusPermitidos.includes(novoStatus)) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }

  const agendamentos = lerAgendamentos();
  const agendamento = agendamentos.find((item) => item.id === req.params.id);

  if (!agendamento) {
    return res.status(404).json({ erro: 'Agendamento não encontrado.' });
  }

  agendamento.status = novoStatus;
  agendamento.atualizadoEm = new Date().toISOString();

  salvarAgendamentos(agendamentos);

  return res.json({ mensagem: 'Status atualizado.', agendamento });
});

app.delete('/api/admin/agendamentos/:id', exigeAdmin, (req, res) => {
  const agendamentos = lerAgendamentos();
  const restantes = agendamentos.filter((item) => item.id !== req.params.id);

  if (restantes.length === agendamentos.length) {
    return res.status(404).json({ erro: 'Agendamento não encontrado.' });
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
