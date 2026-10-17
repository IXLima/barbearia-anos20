require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const bcrypt = require('bcryptjs');

const pastaDados = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..');
const arquivoUsuarios = path.join(pastaDados, 'users.json');

function lerUsuarios() {
  if (!fs.existsSync(arquivoUsuarios)) return [];
  const conteudo = fs.readFileSync(arquivoUsuarios, 'utf8').trim();
  if (!conteudo) return [];
  const usuarios = JSON.parse(conteudo);
  if (!Array.isArray(usuarios)) {
    throw new Error('users.json precisa conter uma lista de usuários.');
  }
  return usuarios;
}

function salvarUsuarios(usuarios) {
  const temporario = `${arquivoUsuarios}.${process.pid}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(usuarios, null, 2), 'utf8');
  fs.renameSync(temporario, arquivoUsuarios);
}

function perguntarSenha(pergunta) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    const interfaceTexto = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    return interfaceTexto.question(pergunta).finally(() => interfaceTexto.close());
  }

  return new Promise((resolve, reject) => {
    let senha = '';
    process.stdout.write(pergunta);
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const finalizar = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', aoDigitar);
      process.stdout.write('\n');
    };

    const aoDigitar = (entrada) => {
      for (const tecla of entrada) {
        if (tecla === '\u0003') {
          finalizar();
          reject(new Error('Criação cancelada.'));
          return;
        }
        if (tecla === '\r' || tecla === '\n') {
          finalizar();
          resolve(senha);
          return;
        }
        if (tecla === '\u007f' || tecla === '\b') {
          if (senha.length) {
            senha = senha.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (tecla >= ' ') {
          senha += tecla;
          process.stdout.write('•');
        }
      }
    };

    process.stdin.on('data', aoDigitar);
  });
}

async function executar() {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n✦ Configuração da conta administrativa\n');
  const nome = (await terminal.question('Nome do administrador: ')).trim();
  const email = (await terminal.question('Email: ')).trim().toLowerCase();
  terminal.close();
  const senha = await perguntarSenha('Senha (mínimo 8 caracteres): ');

  if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe um nome e um email válidos.');
  }
  if (senha.length < 8) {
    throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  }

  const usuarios = lerUsuarios();
  const existente = usuarios.find(
    (usuario) => String(usuario.email || '').toLowerCase() === email
  );
  const agora = new Date().toISOString();

  if (existente) {
    existente.nome = nome;
    existente.tipo = 'local';
    existente.papel = 'admin';
    existente.senhaHash = bcrypt.hashSync(senha, 12);
    existente.atualizadoEm = agora;
  } else {
    usuarios.push({
      id: `admin_${crypto.randomUUID()}`,
      nome,
      email,
      senhaHash: bcrypt.hashSync(senha, 12),
      foto: '',
      tipo: 'local',
      papel: 'admin',
      criadoEm: agora
    });
  }

  salvarUsuarios(usuarios);
  console.log('\nConta administrativa pronta.');
  console.log('Acesse: http://localhost:3000/admin-login\n');
}

executar().catch((erro) => {
  console.error(`\nNão foi possível criar a conta: ${erro.message}\n`);
  process.exitCode = 1;
});
