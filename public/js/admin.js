const state = {
  mode: 'daily',
  referenceDate: new Date(),
  appointments: []
};

const servicePrices = {
  corte: 45,
  barba: 35,
  combo: 70,
  relaxamento: 55,
  pigmentacao: 120,
  vip: 150
};

const serviceLabels = {
  corte: 'Corte Clássico',
  barba: 'Barba Completa',
  combo: 'Corte + Barba',
  relaxamento: 'Relaxamento',
  pigmentacao: 'Pigmentação',
  vip: 'Pacote VIP'
};

const statusLabels = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu'
};

const elements = {
  adminName: document.getElementById('adminName'),
  refreshButton: document.getElementById('refreshButton'),
  dailyTab: document.getElementById('dailyTab'),
  weeklyTab: document.getElementById('weeklyTab'),
  previousButton: document.getElementById('previousButton'),
  nextButton: document.getElementById('nextButton'),
  referenceDate: document.getElementById('referenceDate'),
  statusFilter: document.getElementById('statusFilter'),
  periodTitle: document.getElementById('periodTitle'),
  resultCount: document.getElementById('resultCount'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  dailyView: document.getElementById('dailyView'),
  weeklyView: document.getElementById('weeklyView'),
  metricToday: document.getElementById('metricToday'),
  metricPending: document.getElementById('metricPending'),
  metricConfirmed: document.getElementById('metricConfirmed'),
  metricRevenue: document.getElementById('metricRevenue'),
  template: document.getElementById('appointmentTemplate')
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

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function whatsappUrl(appointment) {
  const message = [
    `Olá, ${appointment.nome}! Aqui é da Barbearia Nogueira.`,
    '',
    `Seu agendamento para ${serviceLabels[appointment.servico] || appointment.servico}`,
    `está marcado para ${formatShortDate(appointment.data)} às ${appointment.horario}.`,
    '',
    'Podemos confirmar?'
  ].join('\n');

  return `https://wa.me/${normalizePhone(appointment.telefone)}?text=${encodeURIComponent(message)}`;
}

async function loadAdminUser() {
  const response = await fetch('/api/usuario');

  if (!response.ok) {
    window.location.href = '/login';
    return;
  }

  const data = await response.json();

  if (!data.admin) {
    document.body.innerHTML =
      '<main class="state-message"><strong>Acesso negado.</strong><span>Esta conta não possui permissão administrativa.</span></main>';
    return;
  }

  elements.adminName.textContent =
    data.usuario.nome || data.usuario.email || 'Administrador';
}

function queryForCurrentPeriod() {
  const params = new URLSearchParams();
  const status = elements.statusFilter.value;

  if (state.mode === 'daily') {
    params.set('data', localDateString(state.referenceDate));
  } else {
    const start = startOfWeek(state.referenceDate);
    params.set('inicio', localDateString(start));
    params.set('fim', localDateString(addDays(start, 6)));
  }

  if (status) params.set('status', status);
  return params.toString();
}

async function loadAppointments() {
  elements.loadingState.classList.remove('hidden');
  elements.emptyState.classList.add('hidden');
  elements.dailyView.classList.add('hidden');
  elements.weeklyView.classList.add('hidden');

  try {
    const response = await fetch(`/api/admin/agendamentos?${queryForCurrentPeriod()}`);

    if (!response.ok) {
      throw new Error('Não foi possível carregar a agenda.');
    }

    const data = await response.json();
    state.appointments = data.agendamentos || [];
    render();
  } catch (error) {
    elements.loadingState.textContent = error.message;
  }
}

function updateMetrics() {
  const today = localDateString(new Date());
  const todayCount = state.appointments.filter((item) => item.data === today).length;
  const pending = state.appointments.filter((item) => item.status === 'pendente').length;
  const confirmed = state.appointments.filter((item) => item.status === 'confirmado').length;
  const revenue = state.appointments
    .filter((item) => !['cancelado', 'nao_compareceu'].includes(item.status))
    .reduce((total, item) => total + (servicePrices[item.servico] || 0), 0);

  elements.metricToday.textContent = todayCount;
  elements.metricPending.textContent = pending;
  elements.metricConfirmed.textContent = confirmed;
  elements.metricRevenue.textContent = formatCurrency(revenue);
}

function createAppointmentCard(appointment) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector('.appointment-card');

  fragment.querySelector('[data-field="horario"]').textContent = appointment.horario;
  fragment.querySelector('[data-field="dataCurta"]').textContent =
    formatShortDate(appointment.data);
  fragment.querySelector('[data-field="nome"]').textContent = appointment.nome;
  fragment.querySelector('[data-field="servico"]').textContent =
    serviceLabels[appointment.servico] || appointment.servico;

  const badge = fragment.querySelector('[data-field="statusLabel"]');
  badge.textContent = statusLabels[appointment.status] || appointment.status;
  badge.dataset.status = appointment.status;

  fragment.querySelector('[data-field="telefone"]').textContent = appointment.telefone;

  const phoneLink = fragment.querySelector('[data-field="telefoneLink"]');
  phoneLink.href = `tel:${appointment.telefone.replace(/\s/g, '')}`;

  fragment.querySelector('[data-field="observacoes"]').textContent =
    appointment.observacoes || 'Sem observações.';

  const whatsappButton = fragment.querySelector('[data-field="whatsappButton"]');
  whatsappButton.href = whatsappUrl(appointment);

  fragment.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () =>
      updateStatus(appointment.id, button.dataset.status)
    );
  });

  card.dataset.appointmentId = appointment.id;
  return fragment;
}

function renderDaily() {
  elements.dailyView.innerHTML = '';

  state.appointments.forEach((appointment) => {
    elements.dailyView.appendChild(createAppointmentCard(appointment));
  });

  elements.dailyView.classList.remove('hidden');
}

function renderWeekly() {
  elements.weeklyView.innerHTML = '';
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
    heading.innerHTML = `
      <strong>${date.toLocaleDateString('pt-BR', { weekday: 'short' })}</strong>
      <span>${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
    `;

    const list = document.createElement('div');
    list.className = 'week-day-list';

    if (dayAppointments.length === 0) {
      list.innerHTML = '<p class="week-empty">Livre</p>';
    } else {
      dayAppointments.forEach((appointment) => {
        const item = document.createElement('article');
        item.className = 'week-item';
        item.innerHTML = `
          <time>${appointment.horario}</time>
          <strong>${appointment.nome}</strong>
          <p>${serviceLabels[appointment.servico] || appointment.servico}</p>
        `;
        item.title = `${statusLabels[appointment.status]} — ${appointment.telefone}`;
        list.appendChild(item);
      });
    }

    column.append(heading, list);
    elements.weeklyView.appendChild(column);
  }

  elements.weeklyView.classList.remove('hidden');
}

function updatePeriodTitle() {
  if (state.mode === 'daily') {
    elements.periodTitle.textContent = formatLongDate(state.referenceDate);
  } else {
    const start = startOfWeek(state.referenceDate);
    const end = addDays(start, 6);
    elements.periodTitle.textContent =
      `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` +
      ` — ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }
}

function render() {
  elements.loadingState.classList.add('hidden');
  elements.resultCount.textContent =
    `${state.appointments.length} ${state.appointments.length === 1 ? 'registro' : 'registros'}`;

  updatePeriodTitle();
  updateMetrics();

  if (state.appointments.length === 0) {
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');

  if (state.mode === 'daily') {
    renderDaily();
  } else {
    renderWeekly();
  }
}

async function updateStatus(id, status) {
  const response = await fetch(`/api/admin/agendamentos/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    window.alert(data.erro || 'Não foi possível atualizar o agendamento.');
    return;
  }

  await loadAppointments();
}

function setMode(mode) {
  state.mode = mode;

  const daily = mode === 'daily';
  elements.dailyTab.classList.toggle('active', daily);
  elements.weeklyTab.classList.toggle('active', !daily);
  elements.dailyTab.setAttribute('aria-selected', String(daily));
  elements.weeklyTab.setAttribute('aria-selected', String(!daily));

  loadAppointments();
}

function movePeriod(direction) {
  const days = state.mode === 'daily' ? direction : direction * 7;
  state.referenceDate = addDays(state.referenceDate, days);
  elements.referenceDate.value = localDateString(state.referenceDate);
  loadAppointments();
}

elements.referenceDate.value = localDateString(state.referenceDate);

elements.dailyTab.addEventListener('click', () => setMode('daily'));
elements.weeklyTab.addEventListener('click', () => setMode('weekly'));
elements.previousButton.addEventListener('click', () => movePeriod(-1));
elements.nextButton.addEventListener('click', () => movePeriod(1));
elements.refreshButton.addEventListener('click', loadAppointments);
elements.statusFilter.addEventListener('change', loadAppointments);
elements.referenceDate.addEventListener('change', () => {
  state.referenceDate = parseLocalDate(elements.referenceDate.value);
  loadAppointments();
});

Promise.all([loadAdminUser(), loadAppointments()]);
