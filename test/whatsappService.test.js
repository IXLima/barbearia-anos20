const test = require('node:test');
const assert = require('node:assert');

const {
  normalizarTelefone,
  gerarMensagemConfirmacao,
  gerarMensagemRemarcacao,
  gerarLinkWhatsApp
} = require('../services/whatsappService');

const agendamento = {
  nome: 'João da Silva',
  servicoNome: 'Corte + Barba',
  data: '2026-10-18',
  horario: '14:45',
  telefone: '(19) 99999-1111'
};

test('telefone brasileiro recebe o prefixo 55 uma única vez', () => {
  assert.strictEqual(normalizarTelefone('(19) 99999-1111'), '5519999991111');
  assert.strictEqual(normalizarTelefone('+55 19 99999-1111'), '5519999991111');
  assert.strictEqual(normalizarTelefone('(55) 99999-1111'), '5555999991111');
});

test('mensagem de confirmação traz serviço, data e horário', () => {
  const mensagem = gerarMensagemConfirmacao(agendamento);

  assert.match(mensagem, /^Olá, João! Aqui é da Barbearia Nogueira\./);
  assert.match(mensagem, /Serviço: Corte \+ Barba/);
  assert.match(mensagem, /Data: 18\/10\/2026/);
  assert.match(mensagem, /Horário: 14:45/);
  assert.match(mensagem, /confirmar sua presença/);
});

test('mensagem de remarcação traz horário anterior e novo', () => {
  const mensagem = gerarMensagemRemarcacao(agendamento, { data: '2026-10-18', horario: '14:30' });

  assert.match(mensagem, /Horário anterior:\n18\/10\/2026 às 14:30/);
  assert.match(mensagem, /Novo horário:\n18\/10\/2026 às 14:45/);
  assert.match(mensagem, /Serviço:\nCorte \+ Barba/);
  assert.match(mensagem, /confirme se o novo horário funciona/);
});

test('link wa.me codifica a mensagem', () => {
  const link = gerarLinkWhatsApp(agendamento.telefone, 'Olá & tudo bem?\nOk');

  assert.ok(link.startsWith('https://wa.me/5519999991111?text='));
  assert.ok(link.includes('Ol%C3%A1%20%26%20tudo%20bem%3F%0AOk'));
});
