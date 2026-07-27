require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { Strategy: LocalStrategy } = require('passport-local');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : __dirname;
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const APPOINTMENTS_FILE = path.join(DATA_DIR, 'appointments.json');

const SERVICOS = Object.freeze({
  corte: { nome: 'Corte Clássico', valor: 45 },
  barba: { nome: 'Barba Completa', valor: 35 },
  combo: { nome: 'Corte + Barba', valor: 70 },
  relaxamento: { nome: 'Relaxamento', valor: 55 },
  pigmentacao: { nome: 'Pigmentação', valor: 120 },
  vip: { nome: 'Pacote VIP', valor: 150 }
});

const STATUS_VALIDOS = new Set([
  'pendente',
  'aceito',
  'recusado',
  'concluido'
]);

function lerJson(arquivo) {
  if (!fs.existsSync(arquivo)) return [];
  const conteudo = fs.readFileSync(arquivo, 'utf8').trim();
  if (!conteudo) return [];
  const dados = JSON.parse(conteudo);
  if (!Array.isArray(dados)) {
    throw new Error(`O arquivo ${path.basename(arquivo)} precisa conter uma lista.`);
  }
  return dados;
}

function salvarJson(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const temporario = `${arquivo}.${process.pid}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(temporario, arquivo);
}

function lerUsuarios() {
  return lerJson(USERS_FILE);
}

function salvarUsuarios(usuarios) {
  salvarJson(USERS_FILE, usuarios);
}

function lerAgendamentos() {
  return lerJson(APPOINTMENTS_FILE);
}

function salvarAgendamentos(agendamentos) {
  salvarJson(APPOINTMENTS_FILE, agendamentos);
}

function normalizarEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function papelDo(usuario) {
  return usuario?.papel === 'admin' ? 'admin' : 'cliente';
}

function encontrarPorId(id) {
  return lerUsuarios().find((usuario) => usuario.id === id);
}

function encontrarPorEmail(email) {
  const emailNormalizado = normalizarEmail(email);
  return lerUsuarios().find(
    (usuario) => normalizarEmail(usuario.email) === emailNormalizado
  );
}

function usuarioSeguro(usuario) {
  const { senhaHash, ...seguro } = usuario;
  return { ...seguro, papel: papelDo(usuario) };
}

function configurarAdministrador() {
  const nome = String(process.env.ADMIN_NAME || 'Administrador').trim();
  const email = normalizarEmail(process.env.ADMIN_EMAIL);
  const senha = String(process.env.ADMIN_PASSWORD || '');

  if (!email && !senha) return false;

  if (!email || senha.length < 8) {
    console.warn(
      'Conta administrativa não criada: informe ADMIN_EMAIL e uma ADMIN_PASSWORD com pelo menos 8 caracteres.'
    );
    return false;
  }

  const usuarios = lerUsuarios();
  const existente = usuarios.find(
    (usuario) => normalizarEmail(usuario.email) === email
  );

  if (existente) {
    existente.papel = 'admin';
    existente.nome = existente.nome || nome;
    if (existente.tipo !== 'google') {
      existente.tipo = 'local';
      existente.senhaHash = bcrypt.hashSync(senha, 12);
    }
    existente.atualizadoEm = new Date().toISOString();
  } else {
    usuarios.push({
      id: `admin_${crypto.randomUUID()}`,
      nome,
      email,
      senhaHash: bcrypt.hashSync(senha, 12),
      foto: '',
      tipo: 'local',
      papel: 'admin',
      criadoEm: new Date().toISOString()
    });
  }

  salvarUsuarios(usuarios);
  return true;
}

function hojeEmSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function dataUtc(dataIso) {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, 12));
}

function dataIso(data) {
  return data.toISOString().slice(0, 10);
}

function deslocarDias(data, quantidade) {
  const copia = new Date(data);
  copia.setUTCDate(copia.getUTCDate() + quantidade);
  return copia;
}

function periodoDaSemana(offset = 0) {
  const hoje = dataUtc(hojeEmSaoPaulo());
  const diaDaSemana = hoje.getUTCDay();
  const distanciaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
  const inicio = deslocarDias(hoje, distanciaSegunda + offset * 7);
  const fim = deslocarDias(inicio, 6);
  return { inicio: dataIso(inicio), fim: dataIso(fim) };
}

function periodoDoMesAtual() {
  const hoje = dataUtc(hojeEmSaoPaulo());
  const inicio = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1, 12)
  );
  const fim = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0, 12)
  );
  return { inicio: dataIso(inicio), fim: dataIso(fim) };
}

function estaNoPeriodo(agendamento, periodo) {
  return (
    agendamento.data >= periodo.inicio &&
    agendamento.data <= periodo.fim
  );
}

function somarValores(agendamentos, statuses) {
  return agendamentos
    .filter((item) => statuses.includes(item.status))
    .reduce((total, item) => total + Number(item.valor || 0), 0);
}

function ordenarAgendamentos(agendamentos) {
  return [...agendamentos].sort((a, b) => {
    const momentoA = `${a.data}T${a.horario || '23:59'}`;
    const momentoB = `${b.data}T${b.horario || '23:59'}`;
    return momentoA.localeCompare(momentoB);
  });
}

function resumoFinanceiro(agendamentos) {
  return Object.entries(SERVICOS).map(([id, servico]) => {
    const itens = agendamentos.filter((item) => item.servico === id);
    return {
      servico: id,
      nome: servico.nome,
      concluidos: itens.filter((item) => item.status === 'concluido').length,
      confirmados: itens.filter((item) => item.status === 'aceito').length,
      realizado: somarValores(itens, ['concluido']),
      previsto: somarValores(itens, ['aceito', 'concluido'])
    };
  }).filter((item) => item.concluidos || item.confirmados);
}

try {
  configurarAdministrador();
} catch (erro) {
  console.error('Não foi possível configurar a conta administrativa:', erro.message);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'chave-temporaria-mude-no-env',
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
  try {
    const usuario = encontrarPorId(id);
    done(null, usuario || false);
  } catch (erro) {
    done(erro);
  }
});

passport.use(new LocalStrategy(
  { usernameField: 'email', passwordField: 'senha' },
  (email, senha, done) => {
    try {
      const usuario = encontrarPorEmail(email);
      if (!usuario) {
        return done(null, false, { message: 'Email não encontrado.' });
      }
      if (usuario.tipo === 'google') {
        return done(null, false, { message: 'Use o acesso com Google.' });
      }
      if (!bcrypt.compareSync(senha, usuario.senhaHash || '')) {
        return done(null, false, { message: 'Senha incorreta.' });
      }
      return done(null, usuario);
    } catch (erro) {
      return done(erro);
    }
  }
));

const googleConfigurado = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

if (googleConfigurado) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:3000/auth/google/callback'
  }, (accessToken, refreshToken, profile, done) => {
    try {
      const usuarios = lerUsuarios();
      let usuario = usuarios.find((item) => item.googleId === profile.id);
      const emailGoogle = normalizarEmail(profile.emails?.[0]?.value);

      if (!usuario && emailGoogle) {
        usuario = usuarios.find(
          (item) => normalizarEmail(item.email) === emailGoogle
        );
      }

      if (!usuario) {
        usuario = {
          id: `google_${profile.id}`,
          googleId: profile.id,
          nome: profile.displayName,
          email: emailGoogle,
          foto: profile.photos?.[0]?.value || '',
          tipo: 'google',
          papel: 'cliente',
          criadoEm: new Date().toISOString()
        };
        usuarios.push(usuario);
      } else {
        usuario.googleId = profile.id;
        usuario.nome = usuario.nome || profile.displayName;
        usuario.foto = profile.photos?.[0]?.value || usuario.foto || '';
      }

      salvarUsuarios(usuarios);
      return done(null, usuario);
    } catch (erro) {
      return done(erro);
    }
  }));
}

function exigeLoginPagina(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect('/login?aviso=entre-para-agendar');
}

function exigeClientePagina(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/login?aviso=entre-para-agendar');
  }
  if (papelDo(req.user) === 'admin') return res.redirect('/admin');
  return next();
}

function exigeAdminPagina(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/admin-login?aviso=entre-como-admin');
  }
  if (papelDo(req.user) !== 'admin') {
    return res.redirect('/admin-login?erro=sem-permissao');
  }
  return next();
}

function exigeLoginApi(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({
    ok: false,
    mensagem: 'Entre na sua conta para continuar.'
  });
}

function exigeAdminApi(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({
      ok: false,
      mensagem: 'Entre como administrador para continuar.'
    });
  }
  if (papelDo(req.user) !== 'admin') {
    return res.status(403).json({
      ok: false,
      mensagem: 'Esta ação é exclusiva da administração.'
    });
  }
  return next();
}

function entrarUsuario(req, res, next, somenteAdmin = false) {
  passport.authenticate('local', (erro, usuario) => {
    if (erro) return next(erro);
    if (!usuario) {
      const rota = somenteAdmin ? '/admin-login' : '/login';
      return res.redirect(`${rota}?erro=credenciais`);
    }
    if (somenteAdmin && papelDo(usuario) !== 'admin') {
      return res.redirect('/admin-login?erro=sem-permissao');
    }
    return req.logIn(usuario, (erroLogin) => {
      if (erroLogin) return next(erroLogin);
      return res.redirect(
        papelDo(usuario) === 'admin' ? '/admin' : '/agenda'
      );
    });
  })(req, res, next);
}

app.use((req, res, next) => {
  if (req.path === '/admin.html') {
    return exigeAdminPagina(req, res, next);
  }
  if (req.path === '/agenda.html') {
    return exigeClientePagina(req, res, next);
  }
  return next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: false,
  index: false
}));

app.get('/auth/google', (req, res, next) => {
  if (!googleConfigurado) {
    return res.redirect('/login?erro=google-nao-configurado');
  }
  return passport.authenticate('google', {
    scope: ['profile', 'email']
  })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
  if (!googleConfigurado) return res.redirect('/login?erro=google');
  return passport.authenticate('google', (erro, usuario) => {
    if (erro || !usuario) return res.redirect('/login?erro=google');
    return req.logIn(usuario, (erroLogin) => {
      if (erroLogin) return next(erroLogin);
      return res.redirect(
        papelDo(usuario) === 'admin' ? '/admin' : '/agenda'
      );
    });
  })(req, res, next);
});

app.post('/auth/local', (req, res, next) => {
  entrarUsuario(req, res, next, false);
});

app.post('/auth/admin', (req, res, next) => {
  entrarUsuario(req, res, next, true);
});

app.post('/auth/registro', async (req, res, next) => {
  try {
    const nome = String(req.body.nome || '').trim();
    const email = normalizarEmail(req.body.email);
    const senha = String(req.body.senha || '');
    const confirmarSenha = String(req.body.confirmarSenha || '');

    if (!nome || !email || !senha) {
      return res.redirect('/registro?erro=campos-obrigatorios');
    }
    if (senha !== confirmarSenha) {
      return res.redirect('/registro?erro=senhas-diferentes');
    }
    if (senha.length < 6) {
      return res.redirect('/registro?erro=senha-curta');
    }
    if (encontrarPorEmail(email)) {
      return res.redirect('/registro?erro=email-em-uso');
    }

    const novoUsuario = {
      id: `local_${crypto.randomUUID()}`,
      nome: nome.slice(0, 100),
      email,
      senhaHash: bcrypt.hashSync(senha, 12),
      foto: '',
      tipo: 'local',
      papel: 'cliente',
      criadoEm: new Date().toISOString()
    };

    const usuarios = lerUsuarios();
    usuarios.push(novoUsuario);
    salvarUsuarios(usuarios);

    return req.logIn(novoUsuario, (erro) => {
      if (erro) return next(erro);
      return res.redirect('/agenda');
    });
  } catch (erro) {
    return next(erro);
  }
});

app.get('/auth/logout', (req, res, next) => {
  req.logout((erro) => {
    if (erro) return next(erro);
    return req.session.destroy(() => res.redirect('/login?aviso=desconectado'));
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect(papelDo(req.user) === 'admin' ? '/admin' : '/agenda');
  }
  return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/registro', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect(papelDo(req.user) === 'admin' ? '/admin' : '/agenda');
  }
  return res.sendFile(path.join(__dirname, 'public', 'registro.html'));
});

app.get('/admin-login', (req, res) => {
  if (req.isAuthenticated() && papelDo(req.user) === 'admin') {
    return res.redirect('/admin');
  }
  return res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/agenda', exigeClientePagina, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agenda.html'));
});

app.get('/admin', exigeAdminPagina, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/usuario', exigeLoginApi, (req, res) => {
  res.json({ logado: true, usuario: usuarioSeguro(req.user) });
});

app.get('/api/servicos', (req, res) => {
  const servicos = Object.entries(SERVICOS).map(([id, dados]) => ({
    id,
    ...dados
  }));
  res.json({ ok: true, servicos });
});

app.post('/api/agendamentos', exigeLoginApi, (req, res, next) => {
  try {
    if (papelDo(req.user) === 'admin') {
      return res.status(403).json({
        ok: false,
        mensagem: 'Use uma conta de cliente para fazer agendamentos.'
      });
    }

    const nome = String(req.body.nome || '').trim().slice(0, 100);
    const telefone = String(req.body.telefone || '').replace(/\D/g, '');
    const servicoId = String(req.body.servico || '');
    const data = String(req.body.data || '');
    const horario = String(req.body.horario || '');
    const observacoes = String(req.body.obs || '').trim().slice(0, 500);
    const servico = SERVICOS[servicoId];

    if (!nome || telefone.length < 10 || telefone.length > 13 || !servico) {
      return res.status(400).json({
        ok: false,
        mensagem: 'Revise o nome, o WhatsApp e o serviço escolhido.'
      });
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
      dataIso(dataUtc(data)) !== data ||
      data < hojeEmSaoPaulo()
    ) {
      return res.status(400).json({
        ok: false,
        mensagem: 'Escolha uma data válida que ainda não passou.'
      });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) {
      return res.status(400).json({
        ok: false,
        mensagem: 'Escolha um horário válido.'
      });
    }

    const diaDaSemana = dataUtc(data).getUTCDay();
    if (diaDaSemana === 0) {
      return res.status(400).json({
        ok: false,
        mensagem: 'A barbearia não atende aos domingos.'
      });
    }
    const ultimoHorario = diaDaSemana === 6 ? '18:00' : '20:00';
    if (horario < '09:00' || horario > ultimoHorario) {
      return res.status(400).json({
        ok: false,
        mensagem: diaDaSemana === 6
          ? 'Aos sábados, escolha um horário entre 09:00 e 18:00.'
          : 'Escolha um horário entre 09:00 e 20:00.'
      });
    }

    const agora = new Date().toISOString();
    const novoAgendamento = {
      id: `ag_${crypto.randomUUID()}`,
      usuarioId: req.user.id,
      nome,
      email: req.user.email || '',
      telefone,
      servico: servicoId,
      servicoNome: servico.nome,
      valor: servico.valor,
      data,
      horario,
      observacoes,
      status: 'pendente',
      criadoEm: agora,
      atualizadoEm: agora
    };

    const agendamentos = lerAgendamentos();
    agendamentos.push(novoAgendamento);
    salvarAgendamentos(agendamentos);

    return res.status(201).json({
      ok: true,
      mensagem: 'Agendamento enviado para confirmação.',
      agendamento: novoAgendamento
    });
  } catch (erro) {
    return next(erro);
  }
});

app.get('/api/agendamentos/me', exigeLoginApi, (req, res, next) => {
  try {
    const itens = ordenarAgendamentos(
      lerAgendamentos().filter((item) => item.usuarioId === req.user.id)
    );
    return res.json({ ok: true, agendamentos: itens });
  } catch (erro) {
    return next(erro);
  }
});

app.get('/api/admin/dashboard', exigeAdminApi, (req, res, next) => {
  try {
    const offsetInformado = Number.parseInt(req.query.semana, 10);
    const offset = Number.isFinite(offsetInformado)
      ? Math.max(-52, Math.min(52, offsetInformado))
      : 0;
    const semana = periodoDaSemana(offset);
    const mes = periodoDoMesAtual();
    const todos = lerAgendamentos();
    const daSemana = ordenarAgendamentos(
      todos.filter((item) => estaNoPeriodo(item, semana))
    );
    const doMes = todos.filter((item) => estaNoPeriodo(item, mes));

    return res.json({
      ok: true,
      administrador: usuarioSeguro(req.user),
      hoje: hojeEmSaoPaulo(),
      periodo: { semana, mes, offset },
      indicadores: {
        pendentesSemana: daSemana.filter(
          (item) => item.status === 'pendente'
        ).length,
        confirmadosSemana: daSemana.filter(
          (item) => ['aceito', 'concluido'].includes(item.status)
        ).length,
        totalSemana: daSemana.length
      },
      faturamento: {
        semana: {
          realizado: somarValores(daSemana, ['concluido']),
          previsto: somarValores(daSemana, ['aceito', 'concluido'])
        },
        mes: {
          realizado: somarValores(doMes, ['concluido']),
          previsto: somarValores(doMes, ['aceito', 'concluido'])
        }
      },
      resumoMes: resumoFinanceiro(doMes),
      agendamentos: daSemana
    });
  } catch (erro) {
    return next(erro);
  }
});

app.patch(
  '/api/admin/agendamentos/:id',
  exigeAdminApi,
  (req, res, next) => {
    try {
      const status = String(req.body.status || '');
      if (!STATUS_VALIDOS.has(status)) {
        return res.status(400).json({
          ok: false,
          mensagem: 'Status de agendamento inválido.'
        });
      }

      const agendamentos = lerAgendamentos();
      const indice = agendamentos.findIndex(
        (item) => item.id === req.params.id
      );
      if (indice < 0) {
        return res.status(404).json({
          ok: false,
          mensagem: 'Agendamento não encontrado.'
        });
      }

      const atual = agendamentos[indice];
      if (status === 'aceito') {
        const conflito = agendamentos.find((item) => (
          item.id !== atual.id &&
          item.data === atual.data &&
          item.horario === atual.horario &&
          ['aceito', 'concluido'].includes(item.status)
        ));
        if (conflito) {
          return res.status(409).json({
            ok: false,
            mensagem: `Já existe um atendimento confirmado às ${atual.horario}.`
          });
        }
      }

      agendamentos[indice] = {
        ...atual,
        status,
        atualizadoEm: new Date().toISOString()
      };
      salvarAgendamentos(agendamentos);

      return res.json({
        ok: true,
        mensagem: 'Agendamento atualizado.',
        agendamento: agendamentos[indice]
      });
    } catch (erro) {
      return next(erro);
    }
  }
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      ok: false,
      mensagem: 'Rota não encontrada.'
    });
  }
  return res.status(404).send('Página não encontrada.');
});

app.use((erro, req, res, next) => {
  console.error(erro);
  if (res.headersSent) return next(erro);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      ok: false,
      mensagem: 'Não foi possível concluir a operação. Tente novamente.'
    });
  }
  return res.status(500).send('Não foi possível carregar esta página.');
});

let servidor;

if (require.main === module) {
  servidor = app.listen(PORT, () => {
    console.log('');
    console.log('  ✂  Barbearia Nogueira — servidor iniciado!');
    console.log(`  →  Site:  http://localhost:${PORT}`);
    console.log(`  →  Agenda: http://localhost:${PORT}/agenda`);
    console.log(`  →  Admin:  http://localhost:${PORT}/admin-login`);
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      console.log('  →  Configure ADMIN_EMAIL e ADMIN_PASSWORD no arquivo .env.');
    }
    console.log('');
  });
}

module.exports = {
  app,
  SERVICOS,
  configurarAdministrador,
  periodoDaSemana,
  periodoDoMesAtual,
  servidor
};
