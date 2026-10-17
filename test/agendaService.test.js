const test = require('node:test');
const assert = require('node:assert');

const {
  encontrarConflito,
  descreverConflito,
  gerarGrade,
  horariosDisponiveis,
  agoraEmSaoPaulo
} = require('../services/agendaService');

// 2031-03-10 é segunda-feira, 2031-03-15 sábado e 2031-03-16 domingo.
const SEGUNDA = '2031-03-10';
const SABADO = '2031-03-15';
const DOMINGO = '2031-03-16';
const ANTES = { data: '2031-01-01', minutos: 8 * 60 };

const agendamento = (extra) => ({
  id: 'a1',
  nome: 'João',
  data: SEGUNDA,
  horario: '14:30',
  status: 'confirmado',
  ...extra
});

test('grade de segunda vai de 09:00 a 19:30 em passos de 30 minutos', () => {
  const grade = gerarGrade(SEGUNDA);

  assert.strictEqual(grade[0], '09:00');
  assert.strictEqual(grade[1], '09:30');
  assert.strictEqual(grade.at(-1), '19:30');
  assert.strictEqual(grade.length, 22);
});

test('grade de sábado termina às 17:30 e domingo é fechado', () => {
  assert.strictEqual(gerarGrade(SABADO).at(-1), '17:30');
  assert.deepStrictEqual(gerarGrade(DOMINGO), []);
});

test('atendimento mais longo não pode terminar depois do fechamento', () => {
  assert.strictEqual(gerarGrade(SEGUNDA, 60).at(-1), '19:00');
});

test('agendamento das 14:30 tira 14:30 mas mantém 14:00 e 15:00', () => {
  const livres = horariosDisponiveis({
    data: SEGUNDA,
    agendamentos: [agendamento()],
    agora: ANTES
  });

  assert.ok(!livres.includes('14:30'));
  assert.ok(livres.includes('14:00'));
  assert.ok(livres.includes('15:00'));
});

test('agendamento cancelado ou na lixeira não ocupa horário', () => {
  const livres = horariosDisponiveis({
    data: SEGUNDA,
    agendamentos: [
      agendamento({ id: 'a1', horario: '10:00', status: 'cancelado' }),
      agendamento({ id: 'a2', horario: '11:00', excluidoEm: '2031-03-01T00:00:00Z' })
    ],
    agora: ANTES
  });

  assert.ok(livres.includes('10:00'));
  assert.ok(livres.includes('11:00'));
});

test('horário quebrado do admin (14:45) bloqueia 14:30 e 15:00 mas não 14:00 nem 15:30', () => {
  const livres = horariosDisponiveis({
    data: SEGUNDA,
    agendamentos: [agendamento({ horario: '14:45' })],
    agora: ANTES
  });

  assert.ok(!livres.includes('14:30'));
  assert.ok(!livres.includes('15:00'));
  assert.ok(livres.includes('14:00'));
  assert.ok(livres.includes('15:30'));
});

test('bloqueios removem a faixa informada', () => {
  const livres = horariosDisponiveis({
    data: SEGUNDA,
    agendamentos: [],
    bloqueios: [{ data: SEGUNDA, inicio: '12:00', fim: '13:00' }],
    agora: ANTES
  });

  assert.ok(!livres.includes('12:00'));
  assert.ok(!livres.includes('12:30'));
  assert.ok(livres.includes('11:30'));
  assert.ok(livres.includes('13:00'));
});

test('no dia de hoje os horários que já passaram saem da lista', () => {
  const livres = horariosDisponiveis({
    data: SEGUNDA,
    agendamentos: [],
    agora: { data: SEGUNDA, minutos: 14 * 60 + 10 }
  });

  assert.strictEqual(livres[0], '14:30');
});

test('datas passadas e domingos não têm horários', () => {
  assert.deepStrictEqual(
    horariosDisponiveis({ data: '2020-01-06', agendamentos: [], agora: ANTES }),
    []
  );
  assert.deepStrictEqual(
    horariosDisponiveis({ data: DOMINGO, agendamentos: [], agora: ANTES }),
    []
  );
});

test('conflito compara intervalos e não só horários iguais', () => {
  const existente = [agendamento()]; // 14:30 -> 15:00

  assert.ok(encontrarConflito(existente, { data: SEGUNDA, horario: '14:45' }));
  assert.ok(encontrarConflito(existente, { data: SEGUNDA, horario: '14:10' }));
  assert.ok(encontrarConflito(existente, { data: SEGUNDA, horario: '14:30' }));
  assert.strictEqual(encontrarConflito(existente, { data: SEGUNDA, horario: '15:00' }), null);
  assert.strictEqual(encontrarConflito(existente, { data: SEGUNDA, horario: '14:00' }), null);
  assert.strictEqual(encontrarConflito(existente, { data: '2031-03-11', horario: '14:30' }), null);
});

test('conflito respeita a duração do novo atendimento e ignora o próprio id', () => {
  const existente = [agendamento()];

  assert.ok(encontrarConflito(existente, { data: SEGUNDA, horario: '14:00', duracao: 60 }));
  assert.strictEqual(
    encontrarConflito(existente, { data: SEGUNDA, horario: '14:30', ignorarId: 'a1' }),
    null
  );
});

test('descrição do conflito traz nome e faixa de horário', () => {
  assert.deepStrictEqual(descreverConflito(agendamento()), {
    id: 'a1',
    nome: 'João',
    inicio: '14:30',
    fim: '15:00'
  });
});

test('agoraEmSaoPaulo usa o fuso da barbearia, não o do servidor', () => {
  // 02:30 UTC de 11/03 ainda é 23:30 de 10/03 em São Paulo (UTC-3)
  assert.deepStrictEqual(
    agoraEmSaoPaulo(new Date('2031-03-11T02:30:00Z')),
    { data: '2031-03-10', minutos: 23 * 60 + 30 }
  );
  assert.deepStrictEqual(
    agoraEmSaoPaulo(new Date('2031-03-11T03:00:00Z')),
    { data: '2031-03-11', minutos: 0 }
  );
});
