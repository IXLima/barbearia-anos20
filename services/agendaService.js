const DURACAO_PADRAO = 30;
const PASSO_DA_GRADE = 30;

// 0 = domingo ... 6 = sábado; null = fechado. Mesmo horário divulgado em agenda.html.
const FUNCIONAMENTO = {
  0: null,
  1: { abre: '09:00', fecha: '20:00' },
  2: { abre: '09:00', fecha: '20:00' },
  3: { abre: '09:00', fecha: '20:00' },
  4: { abre: '09:00', fecha: '20:00' },
  5: { abre: '09:00', fecha: '20:00' },
  6: { abre: '09:00', fecha: '18:00' }
};

function paraMinutos(horario) {
  const [horas, minutos] = horario.split(':').map(Number);
  return horas * 60 + minutos;
}

function paraHorario(minutos) {
  const horas = String(Math.floor(minutos / 60)).padStart(2, '0');
  const resto = String(minutos % 60).padStart(2, '0');
  return `${horas}:${resto}`;
}

function dataLocalIso(date) {
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mes}-${dia}`;
}

function funcionamentoDoDia(data) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return FUNCIONAMENTO[new Date(ano, mes - 1, dia).getDay()];
}

function intervalo(horario, duracao = DURACAO_PADRAO) {
  const inicio = paraMinutos(horario);
  return { inicio, fim: inicio + duracao };
}

function haSobreposicao(a, b) {
  return a.inicio < b.fim && a.fim > b.inicio;
}

function ocupaAgenda(agendamento) {
  return !agendamento.excluidoEm && agendamento.status !== 'cancelado';
}

function encontrarConflito(agendamentos, { data, horario, duracao = DURACAO_PADRAO, ignorarId }) {
  const novo = intervalo(horario, duracao);

  return agendamentos.find((item) =>
    item.id !== ignorarId &&
    item.data === data &&
    ocupaAgenda(item) &&
    haSobreposicao(novo, intervalo(item.horario, item.duracao || DURACAO_PADRAO))
  ) || null;
}

function descreverConflito(conflito) {
  const { inicio, fim } = intervalo(conflito.horario, conflito.duracao || DURACAO_PADRAO);

  return {
    id: conflito.id,
    nome: conflito.nome,
    inicio: paraHorario(inicio),
    fim: paraHorario(fim)
  };
}

function gerarGrade(data, duracao = DURACAO_PADRAO) {
  const regra = funcionamentoDoDia(data);
  if (!regra) return [];

  const grade = [];
  const fechamento = paraMinutos(regra.fecha);

  for (let inicio = paraMinutos(regra.abre); inicio + duracao <= fechamento; inicio += PASSO_DA_GRADE) {
    grade.push(paraHorario(inicio));
  }

  return grade;
}

function horariosDisponiveis({ data, agendamentos, bloqueios = [], duracao = DURACAO_PADRAO, agora = new Date() }) {
  const hoje = dataLocalIso(agora);
  if (data < hoje) return [];

  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  return gerarGrade(data, duracao).filter((horario) => {
    const candidato = intervalo(horario, duracao);

    if (data === hoje && candidato.inicio <= minutosAgora) return false;
    if (encontrarConflito(agendamentos, { data, horario, duracao })) return false;

    return !bloqueios.some((bloqueio) =>
      bloqueio.data === data &&
      haSobreposicao(candidato, {
        inicio: paraMinutos(bloqueio.inicio),
        fim: paraMinutos(bloqueio.fim)
      })
    );
  });
}

module.exports = {
  DURACAO_PADRAO,
  FUNCIONAMENTO,
  paraMinutos,
  paraHorario,
  dataLocalIso,
  funcionamentoDoDia,
  haSobreposicao,
  encontrarConflito,
  descreverConflito,
  gerarGrade,
  horariosDisponiveis
};
