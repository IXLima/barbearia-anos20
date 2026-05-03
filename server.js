require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const passport   = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy  = require('passport-local').Strategy;
const bcrypt     = require('bcryptjs');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// BANCO DE DADOS SIMPLES — arquivo JSON
// ============================================================
// Em vez de MySQL/PostgreSQL, usamos um arquivo JSON local.
// Simples, sem configuração, perfeito para começar!
// ============================================================

const USERS_FILE = path.join(__dirname, 'users.json');

function lerUsuarios() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}

function salvarUsuarios(usuarios) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(usuarios, null, 2));
}

function encontrarPorId(id) {
  return lerUsuarios().find(u => u.id === id);
}

function encontrarPorEmail(email) {
  return lerUsuarios().find(u => u.email === email);
}

// ============================================================
// MIDDLEWARES
// ============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'chave-temporaria-mude-no-env',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
}));

app.use(passport.initialize());
app.use(passport.session());

// ============================================================
// PASSPORT — Serialização
// ============================================================
// Salva apenas o ID na sessão; recupera o usuário a cada request

passport.serializeUser((usuario, done) => done(null, usuario.id));

passport.deserializeUser((id, done) => {
  const usuario = encontrarPorId(id);
  done(null, usuario || false);
});

// ============================================================
// ESTRATÉGIA GOOGLE OAUTH
// ============================================================

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
},
(accessToken, refreshToken, profile, done) => {
  const usuarios = lerUsuarios();
  let usuario = usuarios.find(u => u.googleId === profile.id);

  if (!usuario) {
    usuario = {
      id:       `google_${profile.id}`,
      googleId: profile.id,
      nome:     profile.displayName,
      email:    profile.emails?.[0]?.value || '',
      foto:     profile.photos?.[0]?.value || '',
      tipo:     'google',
      criadoEm: new Date().toISOString()
    };
    usuarios.push(usuario);
    salvarUsuarios(usuarios);
    console.log(`Novo usuario Google: ${usuario.nome}`);
  }
  return done(null, usuario);
}));

// ============================================================
// ESTRATÉGIA LOCAL (email + senha)
// ============================================================

passport.use(new LocalStrategy({ usernameField: 'email' },
(email, senha, done) => {
  const usuario = encontrarPorEmail(email.toLowerCase());
  if (!usuario) return done(null, false, { message: 'Email nao encontrado.' });
  if (usuario.tipo === 'google') return done(null, false, { message: 'Use o botao Google.' });
  const ok = bcrypt.compareSync(senha, usuario.senhaHash);
  if (!ok) return done(null, false, { message: 'Senha incorreta.' });
  return done(null, usuario);
}));

// ============================================================
// MIDDLEWARE DE PROTEÇÃO
// ============================================================

function exigeLogin(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login?aviso=entre-para-agendar');
}

// ============================================================
// ROTAS — GOOGLE AUTH
// ============================================================

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login?erro=google',
    successRedirect: '/agenda'
  })
);

// ============================================================
// ROTAS — LOCAL AUTH
// ============================================================

app.post('/auth/local',
  passport.authenticate('local', {
    failureRedirect: '/login?erro=credenciais',
    successRedirect: '/agenda'
  })
);

app.post('/auth/registro', async (req, res) => {
  const { nome, email, senha, confirmarSenha } = req.body;

  if (!nome || !email || !senha)
    return res.redirect('/registro?erro=campos-obrigatorios');

  if (senha !== confirmarSenha)
    return res.redirect('/registro?erro=senhas-diferentes');

  if (senha.length < 6)
    return res.redirect('/registro?erro=senha-curta');

  if (encontrarPorEmail(email.toLowerCase()))
    return res.redirect('/registro?erro=email-em-uso');

  const senhaHash = bcrypt.hashSync(senha, 10);

  const novoUsuario = {
    id:        `local_${Date.now()}`,
    nome:      nome.trim(),
    email:     email.toLowerCase().trim(),
    senhaHash,
    foto:      '',
    tipo:      'local',
    criadoEm:  new Date().toISOString()
  };

  const usuarios = lerUsuarios();
  usuarios.push(novoUsuario);
  salvarUsuarios(usuarios);
  console.log(`Novo usuario registrado: ${novoUsuario.nome}`);

  req.login(novoUsuario, (err) => {
    if (err) return res.redirect('/login?erro=generico');
    res.redirect('/agenda');
  });
});

app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) console.error('Erro logout:', err);
    req.session.destroy();
    res.redirect('/login?aviso=desconectado');
  });
});

// ============================================================
// ROTAS — PÁGINAS
// ============================================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/agenda');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/registro', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/agenda');
  res.sendFile(path.join(__dirname, 'public', 'registro.html'));
});

app.get('/agenda', exigeLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agenda.html'));
});

// ============================================================
// API — Dados do usuário logado (para o JS do frontend usar)
// ============================================================

app.get('/api/usuario', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ logado: false });
  const { senhaHash, ...seguro } = req.user;
  res.json({ logado: true, usuario: seguro });
});

// ============================================================
// INICIAR
// ============================================================

app.listen(PORT, () => {
  console.log('');
  console.log('  ✂  Barbearia — servidor iniciado!');
  console.log(`  →  http://localhost:${PORT}`);
  console.log(`  →  Login:    http://localhost:${PORT}/login`);
  console.log(`  →  Registro: http://localhost:${PORT}/registro`);
  console.log(`  →  Agenda:   http://localhost:${PORT}/agenda`);
  console.log('');
});
