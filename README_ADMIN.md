# Painel administrativo — Barbearia Nogueira

Acesso em `/admin-login`. O painel fica em `/admin`.

## Conta do administrador

Uma destas opções, no `.env`:

- `ADMIN_EMAIL` + `ADMIN_PASSWORD` (mínimo 8 caracteres): a conta é criada ou atualizada ao iniciar o servidor.
- Só `ADMIN_EMAIL`: apenas uma conta **Google** com esse e-mail vira administradora.
- `npm run criar-admin`: assistente que pede nome, e-mail e senha.

O papel fica no campo `papel` (`admin` ou `cliente`) de `users.json`. Contas antigas com `role` são convertidas automaticamente na leitura.

## Horários

- **Cliente:** só escolhe entre horários livres de 30 em 30 minutos. A lista vem de `GET /api/agendamentos/horarios?data=AAAA-MM-DD` e o servidor valida de novo ao reservar.
- **Expediente:** Seg–Sex 09:00–20:00, Sábado 09:00–18:00, domingo fechado (`services/agendaService.js`).
- **Admin:** pode usar qualquer horário (ex.: 14:45), mas nunca sobrepor outro atendimento. O conflito compara intervalos (`novoInicio < fimExistente` e `novoFim > inicioExistente`) e informa com quem conflita.
- Cancelados e itens na lixeira não ocupam horário.
- Bloqueios opcionais em `bloqueios.json`: `[{ "data": "2026-12-24", "inicio": "12:00", "fim": "14:00", "motivo": "almoço" }]`. Valem só para o cliente.
- A reserva é atômica dentro de um processo Node. Com mais de um processo, migre para um banco com restrição de unicidade.

## Status

`pendente`, `confirmado`, `concluido`, `cancelado`, `nao_compareceu` e `remarcacao_solicitada` (reservado para o futuro webhook do WhatsApp).

Ao remarcar, o status volta para `pendente`, a menos que o admin marque que o cliente já concordou (e o agendamento já estivesse `confirmado`). Cada remarcação grava um evento em `historico`.

Dados antigos `aceito` e `recusado` são lidos como `confirmado` e `cancelado`.

## Ações do painel

Confirmar, concluir, remarcar (data e horário), cancelar, reativar, excluir (lixeira de 30 dias, com restauração e realocação), agendamento manual, "Enviar confirmação" e "Avisar cliente sobre alteração" (WhatsApp), fechamento do dia, ganhos do mês, potencial da semana e resumo do mês por serviço.

Fechamento do dia: o valor realizado soma só `concluido`. O dia só é considerado encerrado quando não restar nenhum `pendente`, `confirmado` ou `remarcacao_solicitada`.

## API administrativa (exige papel `admin`)

| Método e rota | Função |
|---|---|
| `GET /api/admin/agendamentos?data=&inicio=&fim=&status=` | Lista agendamentos |
| `POST /api/admin/agendamentos` | Agendamento manual |
| `PATCH /api/admin/agendamentos/:id/remarcar` | Nova data e horário (`manterConfirmado` opcional) |
| `PATCH /api/admin/agendamentos/:id/status` | Muda o status |
| `DELETE /api/admin/agendamentos/:id` | Move para a lixeira |
| `GET /api/admin/lixeira` | Itens da lixeira |
| `POST /api/admin/lixeira/:id/restaurar` | Restaura (data e horário opcionais) |
| `DELETE /api/admin/lixeira/:id` | Apaga definitivamente |
| `GET /api/admin/resumo?referencia=` | Métricas, ganhos e resumo por serviço |
| `GET /api/admin/fechamento?data=` | Fechamento do dia |

## WhatsApp

Hoje as mensagens viram links `wa.me` montados em `services/whatsappService.js`, sem acoplar texto ao HTML. Para usar a API oficial (WhatsApp Cloud API), acrescente `enviarMensagemWhatsApp(numero, template, parametros)` nesse arquivo. Não use automação via WhatsApp Web nem bibliotecas não oficiais.

## Dados e segurança

`users.json`, `agendamentos.json` e `bloqueios.json` ficam fora do git. A pasta pode ser trocada com `DATA_DIR`. Um arquivo JSON corrompido faz o servidor responder erro em vez de apagar os dados.

## Testes

```bash
npm test
```

Roda os testes unitários de `test/` e o `scripts/smoke-test.js` (login, papéis, grade, conflitos, status e migração de dados), usando uma pasta temporária.
