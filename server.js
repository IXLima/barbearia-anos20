// ============================================================
// server.js — O coração do seu projeto Node.js
// ============================================================
//
// O que é Express?
//   Express é um "framework" (conjunto de ferramentas) para Node.js
//   que facilita criar servidores web. Sem ele, você teria que
//   escrever muito mais código para fazer a mesma coisa.
//
// O que este arquivo faz?
//   Ele inicia um servidor que "escuta" por conexões na porta 3000.
//   Quando alguém acessa http://localhost:3000 no navegador,
//   o servidor responde enviando os arquivos do site.
// ============================================================

// "require" é como o "import" do Python — estamos trazendo o Express
const express = require('express');

// Criamos a aplicação Express
const app = express();

// Definimos em qual porta o servidor vai rodar
// A porta 3000 é a mais comum para desenvolvimento local
// Se quiser mudar (ex: 8080), basta alterar este número
const PORT = 3000;

// ============================================================
// MIDDLEWARE: express.static()
// ============================================================
// "Middleware" é um código que roda entre a requisição do usuário
// e a resposta do servidor — como um filtro ou processador.
//
// express.static('public') diz ao servidor:
//   "Qualquer arquivo dentro da pasta /public, sirva direto para
//    o navegador sem precisar de nenhuma lógica especial."
//
// Ou seja: quando alguém pedir /css/style.css, o servidor vai
// automaticamente procurar em public/css/style.css e enviar.
// ============================================================
app.use(express.static('public'));

// ============================================================
// ROTA PRINCIPAL
// ============================================================
// Uma "rota" define o que acontece quando alguém acessa uma URL.
//
// app.get('/', ...) significa:
//   "Quando alguém acessar a raiz do site (/)..."
//
// req = request (requisição que o navegador enviou)
// res = response (resposta que vamos enviar de volta)
//
// res.sendFile() envia um arquivo HTML como resposta.
// __dirname é uma variável automática do Node.js que representa
// a pasta onde este arquivo (server.js) está localizado.
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// ============================================================
// INICIANDO O SERVIDOR
// ============================================================
// app.listen() coloca o servidor para "escutar" conexões.
// O callback (função de seta) roda assim que o servidor inicia,
// apenas para mostrar uma mensagem de confirmação no terminal.
// ============================================================
app.listen(PORT, () => {
  console.log('');
  console.log('  ✂  Barbearia Template rodando!');
  console.log(`  →  Acesse: http://localhost:${PORT}`);
  console.log('');
  console.log('  Para parar o servidor: pressione Ctrl + C');
  console.log('');
});
