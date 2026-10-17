// Hoje as mensagens viram links wa.me. Para migrar para a WhatsApp Cloud API oficial,
// acrescente aqui enviarMensagemWhatsApp(numero, template, parametros) e mantenha
// as funções de texto: o restante do sistema não precisa mudar.

const NOME_DA_BARBEARIA = 'Barbearia Nogueira';

function formatarData(dataIso) {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || 'cliente';
}

function nomeDoServico(agendamento) {
  return agendamento.servicoNome || agendamento.servico;
}

function normalizarTelefone(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  return digitos.length >= 12 && digitos.startsWith('55') ? digitos : `55${digitos}`;
}

function gerarMensagemConfirmacao(agendamento) {
  return [
    `Olá, ${primeiroNome(agendamento.nome)}! Aqui é da ${NOME_DA_BARBEARIA}.`,
    '',
    'Seu horário está marcado para:',
    '',
    `Serviço: ${nomeDoServico(agendamento)}`,
    `Data: ${formatarData(agendamento.data)}`,
    `Horário: ${agendamento.horario}`,
    '',
    'Gostaríamos de confirmar sua presença.',
    '',
    'Caso precise alterar ou cancelar, fale conosco por aqui.'
  ].join('\n');
}

function gerarMensagemRemarcacao(agendamento, anterior) {
  return [
    `Olá, ${primeiroNome(agendamento.nome)}! Aqui é da ${NOME_DA_BARBEARIA}.`,
    '',
    'Precisamos realizar uma alteração no seu horário.',
    '',
    'Horário anterior:',
    `${formatarData(anterior.data)} às ${anterior.horario}`,
    '',
    'Novo horário:',
    `${formatarData(agendamento.data)} às ${agendamento.horario}`,
    '',
    'Serviço:',
    nomeDoServico(agendamento),
    '',
    'Pedimos que confirme se o novo horário funciona para você.',
    '',
    'Caso tenha algum problema, responda esta mensagem para ajustarmos.'
  ].join('\n');
}

function gerarLinkWhatsApp(numero, mensagem) {
  return `https://wa.me/${normalizarTelefone(numero)}?text=${encodeURIComponent(mensagem)}`;
}

module.exports = {
  normalizarTelefone,
  gerarMensagemConfirmacao,
  gerarMensagemRemarcacao,
  gerarLinkWhatsApp
};
