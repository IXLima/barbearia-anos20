require('dotenv').config();

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'agendamentos.json');

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const now = new Date();

const samples = [
  {
    nome: 'João da Silva',
    telefone: '(19) 99999-1111',
    servico: 'corte',
    data: localDateString(now),
    horario: '09:00',
    observacoes: 'Corte baixo nas laterais.',
    status: 'confirmado'
  },
  {
    nome: 'Carlos Henrique',
    telefone: '(19) 99999-2222',
    servico: 'combo',
    data: localDateString(now),
    horario: '10:30',
    observacoes: '',
    status: 'pendente'
  },
  {
    nome: 'Rafael Souza',
    telefone: '(19) 99999-3333',
    servico: 'barba',
    data: localDateString(addDays(now, 1)),
    horario: '14:00',
    observacoes: 'Preferência por toalha quente.',
    status: 'confirmado'
  },
  {
    nome: 'Marcos Lima',
    telefone: '(19) 99999-4444',
    servico: 'vip',
    data: localDateString(addDays(now, 3)),
    horario: '16:30',
    observacoes: 'Primeira visita.',
    status: 'pendente'
  }
].map((item, index) => ({
  id: `seed_${Date.now()}_${index}`,
  usuarioId: 'seed',
  ...item,
  criadoEm: new Date().toISOString(),
  atualizadoEm: new Date().toISOString()
}));

fs.writeFileSync(file, JSON.stringify(samples, null, 2), 'utf-8');
console.log(`${samples.length} agendamentos de teste criados em agendamentos.json.`);
