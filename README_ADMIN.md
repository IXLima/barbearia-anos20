# Painel administrativo — Barbearia Nogueira

Este pacote adiciona uma primeira versão funcional do painel do barbeiro.

## Arquivos

Copie para a raiz do projeto:

```text
server.js
.env.example
scripts/seed-agendamentos.js
public/admin.html
public/css/admin.css
public/js/admin.js
```

Adicione ao `.gitignore`:

```gitignore
agendamentos.json
```

## Configuração do administrador

No `.env`, acrescente:

```env
ADMIN_EMAIL=o-email-da-sua-conta@exemplo.com
```

Entre pelo login normal usando exatamente esse e-mail. O servidor concederá acesso ao painel `/admin`.

Também é possível colocar `"role": "admin"` diretamente no seu registro em `users.json`, mas usar `ADMIN_EMAIL` evita editar o arquivo manualmente em cada criação de conta.

## Comandos

Instale as dependências já existentes:

```bash
npm install
```

Crie agendamentos de teste:

```bash
node scripts/seed-agendamentos.js
```

Inicie o projeto:

```bash
npm run dev
```

Acesse:

```text
http://localhost:3000/admin
```

## Integração do formulário do cliente

A API pronta recebe:

```http
POST /api/agendamentos
Content-Type: application/json
```

Corpo:

```json
{
  "nome": "João da Silva",
  "telefone": "(19) 99999-9999",
  "servico": "corte",
  "data": "2026-07-15",
  "horario": "09:30",
  "observacoes": "Corte baixo nas laterais."
}
```

No `agenda.html`, adicione um campo de horário:

```html
<div class="campo">
  <label for="horario">Horário</label>
  <input type="time" id="horario" name="horario" required>
</div>
```

Substitua a simulação com `setTimeout` por:

```js
const response = await fetch('/api/agendamentos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nome: document.getElementById('nome').value,
    telefone: document.getElementById('telefone').value,
    servico: document.getElementById('servico').value,
    data: document.getElementById('data').value,
    horario: document.getElementById('horario').value,
    observacoes: document.getElementById('obs').value
  })
});

const result = await response.json();

if (!response.ok) {
  throw new Error(result.erro || 'Não foi possível criar o agendamento.');
}
```

## Por que JSON primeiro?

O painel e as APIs ficam prontos para validar o fluxo. `agendamentos.json` é provisório e adequado apenas ao desenvolvimento local.

Quando o fluxo estiver aprovado, migre para:

- SQLite, para uma aplicação pequena em um único servidor; ou
- PostgreSQL/Supabase, para hospedagem e acesso de múltiplos dispositivos.

A tela administrativa não precisará ser refeita. Somente as funções `lerAgendamentos` e `salvarAgendamentos` serão substituídas por consultas ao banco.
