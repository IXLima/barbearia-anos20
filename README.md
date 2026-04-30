# ✂ Barbearia Template — Node.js

Template de site para barbearia com design preto e branco.

---

## 📁 Estrutura de arquivos

```
barbearia-template/
├── package.json          ← Configuração do projeto Node.js
├── server.js             ← Servidor Express (backend)
├── README.md             ← Este arquivo
└── public/               ← Tudo aqui é servido para o navegador
    ├── index.html        ← Estrutura da página
    ├── css/
    │   └── style.css     ← Todo o visual do site
    └── js/
        └── main.js       ← Interatividade e comportamentos
```

---

## 🚀 Como rodar

### 1. Pré-requisitos
Você precisa ter o **Node.js** instalado.
Baixe em: https://nodejs.org (versão LTS recomendada)

Para verificar se já está instalado, abra o terminal e digite:
```bash
node -v
npm -v
```

### 2. Instalar dependências
Na pasta do projeto, execute:
```bash
npm install
```
Isso lê o `package.json` e instala o Express (e o Nodemon).

### 3. Iniciar o servidor
```bash
npm start
```
Ou, para desenvolvimento (reinicia automaticamente ao salvar):
```bash
npm run dev
```

### 4. Acessar o site
Abra o navegador em: **http://localhost:3000**

---

## ✏️ Como personalizar

### Trocar o nome da barbearia
No `index.html`, procure por `CORTE & ARTE` e substitua pelo seu nome.

### Trocar imagens
- **Hero (capa):** Em `style.css`, procure por `background-image: url(...)` dentro de `#hero`
- **Sobre:** No `index.html`, procure pela tag `<img ... class="about-img">`
- **Galeria:** No `index.html`, procure pelas tags `<img>` dentro de `.gallery-grid`

Para usar imagens locais:
1. Coloque suas fotos em `public/imagens/`
2. No HTML/CSS, use o caminho: `imagens/sua-foto.jpg`

### Trocar cores
Em `style.css`, no topo do arquivo, encontre `:root { ... }`.
Todas as cores estão lá como variáveis CSS.

### Alterar preços e serviços
No `index.html`, procure pela seção `id="services"`.
Cada `<div class="service-card">` é um serviço — edite livremente.

---

## 📦 Dependências

| Pacote    | Para que serve                              |
|-----------|---------------------------------------------|
| express   | Framework para criar o servidor web         |
| nodemon   | Reinicia o servidor automaticamente (dev)   |
