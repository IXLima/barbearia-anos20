const nomesPerfis = {
  dono: 'Dono',
  agendamentos: 'Agendamentos',
  relatorios: 'Relatórios'
};

const elementos = {
  adminName: document.getElementById('adminName'),
  form: document.getElementById('formEquipe'),
  email: document.getElementById('novoEmail'),
  nome: document.getElementById('novoNome'),
  perfil: document.getElementById('novoPerfil'),
  senha: document.getElementById('novaSenha'),
  mensagem: document.getElementById('equipeMensagem'),
  lista: document.getElementById('equipeLista')
};

function mostrarMensagem(texto, tipo = 'sucesso') {
  elementos.mensagem.textContent = texto;
  elementos.mensagem.dataset.type = tipo;
  elementos.mensagem.classList.remove('hidden');
}

async function api(url, { method = 'GET', body } = {}) {
  const resposta = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  if (resposta.status === 401) {
    window.location.href = '/admin-login';
    throw new Error('Sessão expirada. Entre novamente.');
  }

  if (resposta.status === 204) return null;

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível concluir a ação.');
  return dados;
}

function criarMembro(membro) {
  const item = document.createElement('article');
  item.className = 'team-member';

  const info = document.createElement('div');
  const nome = document.createElement('strong');
  nome.textContent = membro.nome || membro.email;
  const email = document.createElement('span');
  email.textContent = membro.email;
  const status = document.createElement('span');
  status.className = 'team-status';
  status.textContent = membro.tipo === 'convite' ? 'Aguardando primeiro login' : '';
  info.append(nome, email, status);

  const seletor = document.createElement('select');
  seletor.setAttribute('aria-label', `Perfil de ${membro.nome || membro.email}`);
  Object.entries(nomesPerfis).forEach(([valor, texto]) => {
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = texto;
    opcao.selected = membro.perfil === valor;
    seletor.appendChild(opcao);
  });
  seletor.addEventListener('change', async () => {
    try {
      await api(`/api/admin/equipe/${membro.id}`, { method: 'PATCH', body: { perfil: seletor.value } });
      mostrarMensagem('Perfil atualizado.');
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
      await carregarEquipe();
    }
  });

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'button button--ghost';
  remover.textContent = 'Remover';
  remover.addEventListener('click', async () => {
    if (!window.confirm(`Remover o acesso de ${membro.email}?`)) return;
    try {
      await api(`/api/admin/equipe/${membro.id}`, { method: 'DELETE' });
      mostrarMensagem('Acesso removido.');
      await carregarEquipe();
    } catch (erro) {
      mostrarMensagem(erro.message, 'erro');
    }
  });

  item.append(info, seletor, remover);
  return item;
}

async function carregarEquipe() {
  const { equipe } = await api('/api/admin/equipe');
  elementos.lista.textContent = '';
  equipe.forEach((membro) => elementos.lista.appendChild(criarMembro(membro)));
}

elementos.form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  try {
    await api('/api/admin/equipe', {
      method: 'POST',
      body: {
        email: elementos.email.value,
        nome: elementos.nome.value,
        perfil: elementos.perfil.value,
        senha: elementos.senha.value
      }
    });
    elementos.form.reset();
    mostrarMensagem('Administrador adicionado.');
    await carregarEquipe();
  } catch (erro) {
    mostrarMensagem(erro.message, 'erro');
  }
});

api('/api/usuario')
  .then((dados) => {
    elementos.adminName.textContent = dados.usuario.nome || dados.usuario.email;
    return carregarEquipe();
  })
  .catch((erro) => mostrarMensagem(erro.message, 'erro'));
