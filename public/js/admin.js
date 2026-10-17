const state = {
  mode: 'daily',
  referenceDate: new Date(),
  appointments: [],
  summary: null,
  dialog: null
};

const statusLabels = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
  remarcacao_solicitada: 'Remarcação solicitada'
};

const actionsByStatus = {
  pendente: ['confirmar', 'concluir', 'remarcar', 'cancelar', 'excluir'],
  remarcacao_solicitada: ['confirmar', 'concluir', 'remarcar', 'cancelar', 'excluir'],
  confirmado: ['concluir', 'remarcar', 'cancelar', 'excluir'],
  concluido: ['excluir'],
  cancelado: ['reativar', 'excluir'],
  nao_compareceu: ['excluir']
};

const trashActions = ['restaurar', 'apagar'];

const elements = {
  adminName: document.getElementById('adminName'),
  newButton: document.getElementById('newButton'),
  refreshButton: document.getElementById('refreshButton'),
  tabs: document.querySelectorAll('.view-button'),
  trashCount: document.getElementById('trashCount'),
  dateControls: document.getElementById('dateControls'),
  statusField: document.getElementById('statusField'),
  previousButton: document.getElementById('previousButton'),
  nextButton: document.getElementById('nextButton'),
  referenceDate: document.getElementById('referenceDate'),
  statusFilter: document.getElementById('statusFilter'),
  periodTitle: document.getElementById('periodTitle'),
  panelNote: document.getElementById('panelNote'),
  resultCount: document.getElementById('resultCount'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  emptyTitle: document.getElementById('emptyTitle'),
  emptyText: document.getElementById('emptyText'),
  listView: document.getElementById('listView'),
  weeklyView: document.getElementById('weeklyView'),
  metricToday: document.getElementById('metricToday'),
  metricPending: document.getElementById('metricPending'),
  metricConfirmed: document.getElementById('metricConfirmed'),
  metricMonthLabel: document.getElementById('metricMonthLabel'),
  metricMonth: document.getElementById('metricMonth'),
  metricMonthNote: document.getElementById('metricMonthNote'),
  metricWeek: document.getElementById('metricWeek'),
  metricWeekNote: document.getElementById('metricWeekNote'),
  serviceSummaryBody: document.getElementById('serviceSummaryBody'),
  serviceSummaryEmpty: document.getElementById('serviceSummaryEmpty'),
  serviceSummaryTable: document.getElementById('serviceSummaryTable'),
  serviceSummaryTitle: document.getElementById('serviceSummaryTitle'),
  template: document.getElementById('appointmentTemplate'),
  toast: document.getElementById('toast'),
  bookingDialog: document.getElementById('bookingDialog'),
  bookingForm: document.getElementById('bookingForm'),
  bookingService: document.getElementById('bookingService'),
  bookingDate: document.getElementById('bookingDate'),
  bookingTime: document.getElementById('bookingTime'),
  bookingStatus: document.getElementById('bookingStatus'),
  bookingError: document.getElementById('bookingError'),
  bookingSubmit: document.getElementById('bookingSubmit'),
  rescheduleDialog: document.getElementById('rescheduleDialog'),
  rescheduleForm: document.getElementById('rescheduleForm'),
  rescheduleEyebrow: document.getElementById('rescheduleEyebrow'),
  rescheduleTitle: document.getElementById('rescheduleTitle'),
  rescheduleSummary: document.getElementById('rescheduleSummary'),
  rescheduleKeepField: document.getElementById('rescheduleKeepField'),
  rescheduleKeep: document.getElementById('rescheduleKeep'),
  rescheduleDate: document.getElementById('rescheduleDate'),
  rescheduleTime: document.getElementById('rescheduleTime'),
  rescheduleError: document.getElementById('rescheduleError'),
  rescheduleSubmit: document.getElementById('rescheduleSubmit'),
  closingButton: document.getElementById('closingButton'),
  closingDialog: document.getElementById('closingDialog'),
  closingTitle: document.getElementById('closingTitle'),
  closingStatus: document.getElementById('closingStatus'),
  closingTotal: document.getElementById('closingTotal'),
  closingDone: document.getElementById('closingDone'),
  closingCanceled: document.getElementById('closingCanceled'),
  closingNoShow: document.getElementById('closingNoShow'),
  closingExpected: document.getElementById('closingExpected'),
  closingEarned: document.getElementById('closingEarned'),
  closingOpen: document.getElementById('closingOpen'),
  closingOpenList: document.getElementById('closingOpenList')
};

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfWeek(date) {
  const result = new Date(date);
  const day = result.getDay();
  const difference = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + difference);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(value);
}

function formatShortDate(dateString) {
  return parseLocalDate(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short'
  });
}

function formatLongDate(date) {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

async function api(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  if (response.status === 401) {
    window.location.href = '/admin-login';
    throw new Error('Sessão expirada. Entre novamente.');
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.erro || 'Não foi possível concluir a ação.');
  }

  if (data === null) {
    window.location.href = '/admin-login';
    throw new Error('Sessão expirada. Entre novamente.');
  }

  return data;
}

let toastTimer;

function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.dataset.type = type;
  elements.toast.classList.remove('hidden');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), 4500);
}

async function loadAdminUser() {
  const response = await fetch('/api/usuario');

  if (!response.ok) {
    window.location.href = '/admin-login';
    return;
  }

  const data = await response.json();

  if (!data.admin) {
    document.body.textContent = '';
    const main = document.createElement('main');
    main.className = 'state-message';
    const title = document.createElement('strong');
    title.textContent = 'Acesso negado.';
    const text = document.createElement('span');
    text.textContent = 'Esta conta não possui permissão administrativa.';
    main.append(title, text);
    document.body.appendChild(main);
    return;
  }

  elements.adminName.textContent =
    data.usuario.nome || data.usuario.email || 'Administrador';
}

function monthRange(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return [first, last];
}

function queryForCurrentPeriod() {
  const params = new URLSearchParams();
  const status = elements.statusFilter.value;

  if (state.mode === 'daily') {
    params.set('data', localDateString(state.referenceDate));
  } else if (state.mode === 'weekly') {
    const start = startOfWeek(state.referenceDate);
    params.set('inicio', localDateString(start));
    params.set('fim', localDateString(addDays(start, 6)));
  } else if (state.mode === 'monthly') {
    const [first, last] = monthRange(state.referenceDate);
    params.set('inicio', localDateString(first));
    params.set('fim', localDateString(last));
  }

  if (status) params.set('status', status);
  return params.toString();
}

async function loadAppointments() {
  elements.loadingState.textContent = 'Carregando agendamentos...';
  elements.loadingState.classList.remove('hidden');
  elements.emptyState.classList.add('hidden');
  elements.listView.classList.add('hidden');
  elements.weeklyView.classList.add('hidden');

  try {
    const url = state.mode === 'trash'
      ? '/api/admin/lixeira'
      : `/api/admin/agendamentos?${queryForCurrentPeriod()}`;

    const data = await api(url);
    state.appointments = data.agendamentos || [];

    if (state.mode === 'trash') {
      elements.panelNote.textContent =
        `Itens excluídos ficam aqui por ${data.diasNaLixeira} dias e depois são apagados definitivamente.`;
    }

    render();
  } catch (error) {
    elements.loadingState.textContent = error.message;
  }
}

function fillServiceOptions(services) {
  elements.bookingService.textContent = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione um serviço';
  placeholder.disabled = true;
  placeholder.selected = true;
  elements.bookingService.appendChild(placeholder);

  services.forEach((service) => {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = `${service.nome} — ${formatCurrency(service.preco)}`;
    elements.bookingService.appendChild(option);
  });
}

function renderSummary(summary) {
  const [year, month] = summary.mes.split('-').map(Number);
  const monthName = new Date(year, month - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const done = summary.atendimentosConcluidosMes;

  elements.metricToday.textContent = summary.hoje;
  elements.metricPending.textContent = summary.pendentes;
  elements.metricConfirmed.textContent = summary.confirmadosNaSemana;

  elements.metricMonthLabel.textContent = `Ganhos em ${monthName}`;
  elements.metricMonth.textContent = formatCurrency(summary.ganhosMes);
  elements.metricMonthNote.textContent =
    `${done} ${done === 1 ? 'atendimento concluído' : 'atendimentos concluídos'}`;

  elements.metricWeek.textContent = formatCurrency(summary.potencialSemana);
  elements.metricWeekNote.textContent =
    `${formatCurrency(summary.realizadoSemana)} realizados · ${formatCurrency(summary.aRealizarSemana)} a realizar`;

  elements.serviceSummaryTitle.textContent = `Por serviço em ${monthName}`;
  elements.serviceSummaryBody.textContent = '';

  summary.resumoMes.forEach((item) => {
    const row = document.createElement('tr');

    [item.nome, item.concluidos, item.confirmados, formatCurrency(item.realizado), formatCurrency(item.previsto)]
      .forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });

    elements.serviceSummaryBody.appendChild(row);
  });

  const noServices = summary.resumoMes.length === 0;
  elements.serviceSummaryTable.classList.toggle('hidden', noServices);
  elements.serviceSummaryEmpty.classList.toggle('hidden', !noServices);

  elements.trashCount.textContent = summary.naLixeira;
  elements.trashCount.classList.toggle('hidden', summary.naLixeira === 0);
}

async function loadSummary() {
  try {
    const params = new URLSearchParams({
      referencia: localDateString(state.referenceDate)
    });
    state.summary = await api(`/api/admin/resumo?${params}`);
    renderSummary(state.summary);
    fillServiceOptions(state.summary.servicos);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function refresh() {
  return Promise.all([loadAppointments(), loadSummary()]);
}

function setText(fragment, field, text) {
  fragment.querySelector(`[data-field="${field}"]`).textContent = text;
}

function createAppointmentCard(appointment) {
  const inTrash = state.mode === 'trash';
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector('.appointment-card');

  setText(fragment, 'horario', appointment.horario);
  setText(fragment, 'dataCurta', formatShortDate(appointment.data));
  setText(fragment, 'nome', appointment.nome);

  const serviceName = appointment.servicoNome || appointment.servico;
  setText(
    fragment,
    'servico',
    appointment.preco ? `${serviceName} · ${formatCurrency(appointment.preco)}` : serviceName
  );

  const badge = fragment.querySelector('[data-field="statusLabel"]');
  badge.textContent = statusLabels[appointment.status] || appointment.status;
  badge.dataset.status = appointment.status;

  setText(fragment, 'telefone', appointment.telefone);
  fragment.querySelector('[data-field="telefoneLink"]').href =
    `tel:${appointment.telefone.replace(/\s/g, '')}`;

  setText(fragment, 'observacoes', appointment.observacoes || 'Sem observações.');

  const links = appointment.links || {};

  [['confirmButton', links.confirmacao], ['changeButton', links.remarcacao]].forEach(([field, url]) => {
    const button = fragment.querySelector(`[data-field="${field}"]`);

    if (url) {
      button.href = url;
      button.classList.remove('hidden');
    }
  });

  if (inTrash) {
    const notice = fragment.querySelector('[data-field="aviso"]');
    const deletedAt = new Date(appointment.excluidoEm).toLocaleDateString('pt-BR');
    const days = appointment.diasRestantes;
    notice.textContent =
      `Excluído em ${deletedAt} · será apagado em ${days} ${days === 1 ? 'dia' : 'dias'}`;
    notice.classList.remove('hidden');
  }

  const allowed = inTrash ? trashActions : actionsByStatus[appointment.status] || ['excluir'];

  fragment.querySelectorAll('[data-action]').forEach((button) => {
    if (!allowed.includes(button.dataset.action)) {
      button.classList.add('hidden');
      return;
    }

    button.addEventListener('click', () =>
      actionHandlers[button.dataset.action](appointment)
    );
  });

  card.dataset.appointmentId = appointment.id;
  return fragment;
}

function renderList() {
  elements.listView.textContent = '';

  state.appointments.forEach((appointment) => {
    elements.listView.appendChild(createAppointmentCard(appointment));
  });

  elements.listView.classList.remove('hidden');
}

function createWeekItem(appointment) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'week-item';
  item.dataset.status = appointment.status;
  item.title = `${statusLabels[appointment.status] || appointment.status} — ${appointment.telefone}`;

  const time = document.createElement('time');
  time.textContent = appointment.horario;

  const name = document.createElement('strong');
  name.textContent = appointment.nome;

  const service = document.createElement('p');
  service.textContent = appointment.servicoNome || appointment.servico;

  item.append(time, name, service);
  item.addEventListener('click', () => {
    state.referenceDate = parseLocalDate(appointment.data);
    elements.referenceDate.value = appointment.data;
    setMode('daily');
  });

  return item;
}

function renderWeekly() {
  elements.weeklyView.textContent = '';
  const weekStart = startOfWeek(state.referenceDate);

  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    const dateString = localDateString(date);
    const dayAppointments = state.appointments.filter(
      (appointment) => appointment.data === dateString
    );

    const column = document.createElement('section');
    column.className = 'week-day';

    const heading = document.createElement('header');
    heading.className = 'week-day-heading';

    const weekday = document.createElement('strong');
    weekday.textContent = date.toLocaleDateString('pt-BR', { weekday: 'short' });

    const dayMonth = document.createElement('span');
    dayMonth.textContent = date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit'
    });

    heading.append(weekday, dayMonth);

    const list = document.createElement('div');
    list.className = 'week-day-list';

    if (dayAppointments.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'week-empty';
      empty.textContent = 'Livre';
      list.appendChild(empty);
    } else {
      dayAppointments.forEach((appointment) => {
        list.appendChild(createWeekItem(appointment));
      });
    }

    column.append(heading, list);
    elements.weeklyView.appendChild(column);
  }

  elements.weeklyView.classList.remove('hidden');
}

function updatePeriodTitle() {
  const titles = {
    daily: () => formatLongDate(state.referenceDate),
    weekly: () => {
      const start = startOfWeek(state.referenceDate);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` +
        ` — ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    },
    monthly: () => state.referenceDate
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    all: () => 'Todos os agendamentos',
    trash: () => 'Lixeira'
  };

  elements.periodTitle.textContent = titles[state.mode]();
}

function render() {
  const inTrash = state.mode === 'trash';
  const count = state.appointments.length;

  elements.loadingState.classList.add('hidden');
  elements.resultCount.textContent = `${count} ${count === 1 ? 'registro' : 'registros'}`;

  updatePeriodTitle();

  if (count === 0) {
    elements.listView.textContent = '';
    elements.weeklyView.textContent = '';
    elements.emptyTitle.textContent = inTrash
      ? 'A lixeira está vazia.'
      : 'Nenhum agendamento encontrado.';
    elements.emptyText.textContent = inTrash
      ? 'Os agendamentos excluídos aparecerão aqui.'
      : 'Não há atendimentos para este filtro.';
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');

  if (state.mode === 'weekly') {
    renderWeekly();
  } else {
    renderList();
  }
}

async function runAction(task, successMessage) {
  try {
    await task();
    showToast(successMessage);
    await refresh();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function changeStatus(appointment, status, message) {
  return runAction(
    () => api(`/api/admin/agendamentos/${appointment.id}/status`, {
      method: 'PATCH',
      body: { status }
    }),
    message
  );
}

const actionHandlers = {
  confirmar: (appointment) =>
    changeStatus(appointment, 'confirmado', 'Agendamento confirmado.'),

  concluir: (appointment) =>
    changeStatus(appointment, 'concluido', 'Atendimento concluído.'),

  reativar: (appointment) =>
    changeStatus(appointment, 'confirmado', 'Agendamento reativado.'),

  cancelar: (appointment) => {
    if (window.confirm(`Cancelar o agendamento de ${appointment.nome}?`)) {
      changeStatus(appointment, 'cancelado', 'Agendamento cancelado.');
    }
  },

  remarcar: (appointment) => openReschedule(appointment, 'remarcar'),

  excluir: (appointment) =>
    runAction(
      () => api(`/api/admin/agendamentos/${appointment.id}`, { method: 'DELETE' }),
      'Movido para a lixeira. Você pode restaurá-lo em até 30 dias.'
    ),

  restaurar: (appointment) => openReschedule(appointment, 'restaurar'),

  apagar: (appointment) => {
    if (window.confirm(`Apagar definitivamente o agendamento de ${appointment.nome}? Esta ação não pode ser desfeita.`)) {
      runAction(
        () => api(`/api/admin/lixeira/${appointment.id}`, { method: 'DELETE' }),
        'Agendamento apagado definitivamente.'
      );
    }
  }
};

function showFormError(element, message) {
  element.textContent = message;
  element.classList.toggle('hidden', !message);
}

function openBooking() {
  elements.bookingForm.reset();
  showFormError(elements.bookingError, '');
  elements.bookingDate.value = localDateString(state.referenceDate);
  elements.bookingDialog.showModal();
  document.getElementById('bookingName').focus();
}

async function submitBooking(event) {
  event.preventDefault();
  showFormError(elements.bookingError, '');

  const form = new FormData(elements.bookingForm);
  const body = Object.fromEntries(form.entries());

  if (!body.nome?.trim() || !body.telefone?.trim() || !body.servico || !body.data || !body.horario) {
    showFormError(elements.bookingError, 'Preencha nome, telefone, serviço, data e horário.');
    return;
  }

  elements.bookingSubmit.disabled = true;

  try {
    await api('/api/admin/agendamentos', { method: 'POST', body });

    elements.bookingDialog.close();
    state.referenceDate = parseLocalDate(body.data);
    elements.referenceDate.value = body.data;
    showToast('Agendamento criado.');

    if (['trash', 'all'].includes(state.mode)) {
      setMode('daily');
    } else {
      await refresh();
    }
  } catch (error) {
    showFormError(elements.bookingError, error.message);
  } finally {
    elements.bookingSubmit.disabled = false;
  }
}

function openReschedule(appointment, kind) {
  const restoring = kind === 'restaurar';
  state.dialog = { appointment, kind };

  elements.rescheduleEyebrow.textContent = restoring ? '— Restaurar' : '— Remarcar';
  elements.rescheduleTitle.textContent = restoring ? 'Realocar agendamento' : 'Nova data e horário';
  elements.rescheduleSummary.textContent = restoring
    ? `${appointment.nome} · escolha a data e o horário para restaurar.`
    : `${appointment.nome} · atualmente ${formatShortDate(appointment.data)} às ${appointment.horario}.`;
  elements.rescheduleSubmit.textContent = restoring ? 'Restaurar' : 'Remarcar';

  elements.rescheduleKeepField.classList.toggle(
    'hidden',
    restoring || appointment.status !== 'confirmado'
  );
  elements.rescheduleKeep.checked = false;
  elements.rescheduleDate.value = appointment.data;
  elements.rescheduleTime.value = appointment.horario;

  showFormError(elements.rescheduleError, '');
  elements.rescheduleDialog.showModal();
  elements.rescheduleTime.focus();
}

async function submitReschedule(event) {
  event.preventDefault();
  showFormError(elements.rescheduleError, '');

  const { appointment, kind } = state.dialog;
  const horario = elements.rescheduleTime.value;
  const data = elements.rescheduleDate.value;

  if (!horario || !data) {
    showFormError(elements.rescheduleError, 'Informe a data e o horário.');
    return;
  }

  if (kind === 'remarcar' && data === appointment.data && horario === appointment.horario) {
    showFormError(elements.rescheduleError, 'Altere a data ou o horário.');
    return;
  }

  elements.rescheduleSubmit.disabled = true;

  try {
    if (kind === 'restaurar') {
      await api(`/api/admin/lixeira/${appointment.id}/restaurar`, {
        method: 'POST',
        body: { data, horario }
      });
    } else {
      await api(`/api/admin/agendamentos/${appointment.id}/remarcar`, {
        method: 'PATCH',
        body: { data, horario, manterConfirmado: elements.rescheduleKeep.checked }
      });
    }

    elements.rescheduleDialog.close();
    showToast(kind === 'restaurar'
      ? 'Agendamento restaurado.'
      : 'Agendamento remarcado. Use "Avisar cliente sobre alteração" no card.');
    await refresh();
  } catch (error) {
    showFormError(elements.rescheduleError, error.message);
  } finally {
    elements.rescheduleSubmit.disabled = false;
  }
}

async function openClosing() {
  try {
    const params = new URLSearchParams({ data: localDateString(state.referenceDate) });
    const report = await api(`/api/admin/fechamento?${params}`);

    elements.closingTitle.textContent = `Fechamento — ${report.data.split('-').reverse().join('/')}`;
    elements.closingStatus.textContent = report.total === 0
      ? 'Nenhum agendamento neste dia.'
      : report.encerrado ? 'Dia encerrado: todos os atendimentos foram finalizados.' : '';

    elements.closingTotal.textContent = report.total;
    elements.closingDone.textContent = report.concluidos;
    elements.closingCanceled.textContent = report.cancelados;
    elements.closingNoShow.textContent = report.naoCompareceu;
    elements.closingExpected.textContent = formatCurrency(report.valorPrevisto);
    elements.closingEarned.textContent = formatCurrency(report.valorRealizado);

    elements.closingOpenList.textContent = '';
    report.naoFinalizados.forEach((item) => {
      const line = document.createElement('li');
      line.textContent = `${item.horario} · ${item.nome} (${statusLabels[item.status] || item.status})`;
      elements.closingOpenList.appendChild(line);
    });
    elements.closingOpen.classList.toggle('hidden', report.encerrado);

    elements.closingDialog.showModal();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function setMode(mode) {
  state.mode = mode;
  elements.closingButton.classList.toggle('hidden', mode !== 'daily');

  elements.tabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  elements.dateControls.classList.toggle('hidden', ['all', 'trash'].includes(mode));
  elements.statusField.classList.toggle('hidden', mode === 'trash');
  elements.panelNote.classList.toggle('hidden', mode !== 'trash');

  refresh();
}

function movePeriod(direction) {
  if (state.mode === 'monthly') {
    state.referenceDate = new Date(
      state.referenceDate.getFullYear(),
      state.referenceDate.getMonth() + direction,
      1
    );
  } else {
    const days = state.mode === 'daily' ? direction : direction * 7;
    state.referenceDate = addDays(state.referenceDate, days);
  }

  elements.referenceDate.value = localDateString(state.referenceDate);
  refresh();
}

elements.referenceDate.value = localDateString(state.referenceDate);

elements.tabs.forEach((tab) =>
  tab.addEventListener('click', () => setMode(tab.dataset.mode))
);
elements.previousButton.addEventListener('click', () => movePeriod(-1));
elements.nextButton.addEventListener('click', () => movePeriod(1));
elements.refreshButton.addEventListener('click', refresh);
elements.newButton.addEventListener('click', openBooking);
elements.closingButton.addEventListener('click', openClosing);
elements.statusFilter.addEventListener('change', loadAppointments);
elements.referenceDate.addEventListener('change', () => {
  if (!elements.referenceDate.value) return;
  state.referenceDate = parseLocalDate(elements.referenceDate.value);
  refresh();
});

elements.bookingForm.addEventListener('submit', submitBooking);
elements.rescheduleForm.addEventListener('submit', submitReschedule);

[elements.bookingDialog, elements.rescheduleDialog, elements.closingDialog].forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.hasAttribute('data-close')) {
      dialog.close();
    }
  });
});

Promise.all([loadAdminUser(), refresh()]);
