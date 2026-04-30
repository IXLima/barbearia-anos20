// ============================================================
// main.js — A interatividade do site
// ============================================================
//
// Este arquivo controla 4 comportamentos:
//
//  1. NAVBAR DINÂMICA  — Muda o visual da navbar ao rolar a página
//  2. MENU MOBILE      — Abre/fecha o menu hambúrguer
//  3. ANIMAÇÕES        — Faz elementos aparecerem ao rolar
//  4. FORMULÁRIO       — Captura e processa o envio do formulário
//
// CONCEITO IMPORTANTE: DOM (Document Object Model)
//   O navegador transforma seu HTML em uma árvore de objetos
//   chamada DOM. O JS manipula essa árvore para mudar a página
//   sem precisar recarregar. document.getElementById() e
//   document.querySelector() são os meios de "pegar" elementos.
// ============================================================


// ============================================================
// 1. NAVBAR DINÂMICA
// ============================================================
// Quando o usuário rola a página para baixo, o navbar ganha
// um fundo escuro para melhorar a leitura.
//
// window.addEventListener('scroll', fn) chama a função fn
// toda vez que o usuário rola a página.
//
// window.scrollY retorna quantos pixels foram rolados.
//
// setAttribute/removeAttribute adicionam/removem atributos HTML.
// No CSS, usamos #navbar[data-scrolled="true"] para estilizá-lo.
// ============================================================
app.use(express.static('public'));
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  if (window.scrollY > 80) {
    // Rolou mais de 80px: adiciona o atributo data-scrolled
    navbar.setAttribute('data-scrolled', 'true');
  } else {
    // Voltou ao topo: remove o atributo
    navbar.removeAttribute('data-scrolled');
  }
});


// ============================================================
// 2. MENU MOBILE (Hambúrguer)
// ============================================================
// Quando o usuário clica no botão ☰, o menu mobile abre/fecha.
// Usamos classList.toggle() que:
//   - Adiciona a classe se ela NÃO existe
//   - Remove a classe se ela JÁ existe
//   É como um interruptor (toggle = alternar)
// ============================================================

const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  // Alterna a classe 'active' no menu
  mobileMenu.classList.toggle('active');

  // Muda a aparência do botão hambúrguer quando aberto
  // classList.contains() verifica se a classe existe
  const isOpen = mobileMenu.classList.contains('active');
  hamburger.setAttribute('aria-expanded', isOpen); // Acessibilidade
});

// Fecha o menu quando um link do menu mobile é clicado
// querySelectorAll() retorna TODOS os elementos com aquela classe (uma lista)
// forEach() percorre cada elemento da lista
const mobileLinks = document.querySelectorAll('.mobile-link');

mobileLinks.forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('active');
  });
});

// Fecha o menu se o usuário clicar fora dele
document.addEventListener('click', (event) => {
  // event.target é o elemento que recebeu o clique
  // .closest() sobe na hierarquia do DOM procurando um ancestral
  const clickedInsideNav = event.target.closest('#navbar');

  if (!clickedInsideNav) {
    mobileMenu.classList.remove('active');
  }
});


// ============================================================
// 3. ANIMAÇÕES AO ROLAR (Intersection Observer)
// ============================================================
// Intersection Observer é uma API moderna do navegador que
// detecta quando um elemento ENTRA ou SAI da área visível.
//
// É muito mais eficiente que ficar verificando scroll.
//
// COMO FUNCIONA:
//   1. Criamos um "observer" (observador)
//   2. Dizemos o que ele deve fazer quando observar algo (callback)
//   3. Mandamos ele observar todos os elementos [data-animate]
//
// Quando o elemento fica visível, adicionamos a classe .visible
// O CSS então faz a animação de entrada (opacity + translateY)
// ============================================================

// Opções do Observer:
// threshold: 0.1 = aciona quando 10% do elemento está visível
// rootMargin: '-50px' = começa um pouco antes de chegar à borda
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

// Criamos o observador com uma função callback
// entries = lista de elementos que mudaram de visibilidade
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    // entry.isIntersecting = true se o elemento está na tela
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');

      // Paramos de observar depois que já animou
      // (não precisamos mais saber se está na tela)
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Selecionamos todos os elementos com o atributo data-animate
// e mandamos o observer "vigiar" cada um
const animatedElements = document.querySelectorAll('[data-animate]');

animatedElements.forEach((el, index) => {
  // Delay progressivo: cada elemento espera um pouco mais que o anterior
  // Cria um efeito de cascata (stagger animation)
  // Exemplo: 1º elemento → 0ms, 2º → 100ms, 3º → 200ms...
  el.style.transitionDelay = `${index * 80}ms`;

  observer.observe(el);
});


// ============================================================
// 4. FORMULÁRIO DE CONTATO
// ============================================================
// Capturamos o evento de envio (submit) do formulário.
// event.preventDefault() impede que a página recarregue
// (comportamento padrão de formulários HTML).
//
// NOTA: Este formulário não envia para um servidor real.
// Para fazer isso, você precisaria:
//   a) Criar uma rota POST no server.js
//   b) Usar fetch() aqui para enviar os dados
//   c) Ou usar um serviço externo (ex: Formspree, EmailJS)
//
// Por enquanto, ele apenas mostra uma mensagem de sucesso.
// ============================================================

const contactForm = document.getElementById('contactForm');
const formSuccess = document.getElementById('formSuccess');

if (contactForm) { // Verificação: só executa se o formulário existir
  contactForm.addEventListener('submit', (event) => {
    // Impede o comportamento padrão (recarregar a página)
    event.preventDefault();

    // Coletando os dados do formulário
    // .value pega o que o usuário digitou em cada campo
    const formData = {
      name:    document.getElementById('name').value,
      phone:   document.getElementById('phone').value,
      service: document.getElementById('service').value,
      date:    document.getElementById('date').value,
      message: document.getElementById('message').value,
    };

    // Exibe os dados no console do navegador (F12 → Console)
    // Útil para debug — veja os dados que foram preenchidos
    console.log('Dados do formulário:', formData);

    // ---------------------------------------------------------
    // SIMULAÇÃO DE ENVIO:
    // Desabilita o botão e mostra "carregando..."
    // ---------------------------------------------------------
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Enviando...';
    submitBtn.disabled = true;

    // setTimeout simula o tempo de espera de uma requisição ao servidor
    // Após 1.5 segundos, executa a função
    setTimeout(() => {
      // Esconde o formulário
      contactForm.style.opacity = '0';
      contactForm.style.transform = 'translateY(-10px)';
      contactForm.style.transition = '0.3s ease';

      // Mostra a mensagem de sucesso
      setTimeout(() => {
        contactForm.style.display = 'none';
        formSuccess.style.display = 'block';
        formSuccess.style.animation = 'fadeInUp 0.5s ease forwards';
      }, 300);
    }, 1500);

    // ---------------------------------------------------------
    // PARA ENVIAR PARA UM SERVIDOR REAL, substitua o setTimeout
    // acima pelo código abaixo (usando fetch API):
    //
    // fetch('/agendar', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(formData)
    // })
    // .then(response => response.json())
    // .then(data => {
    //   console.log('Sucesso:', data);
    //   formSuccess.style.display = 'block';
    // })
    // .catch(error => {
    //   console.error('Erro:', error);
    //   submitBtn.textContent = 'Erro ao enviar. Tente novamente.';
    //   submitBtn.disabled = false;
    // });
    // ---------------------------------------------------------
  });
}


// ============================================================
// 5. SCROLL SUAVE PARA LINKS DE ÂNCORA
// ============================================================
// Melhora o comportamento padrão de scroll suave para garantir
// que os links compensem a altura da navbar fixa.
// ============================================================

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (event) => {
    // Pega o valor do href (ex: "#services")
    const targetId = anchor.getAttribute('href');

    // Tenta encontrar o elemento com aquele ID
    const targetEl = document.querySelector(targetId);

    if (targetEl) {
      event.preventDefault();

      // Calcula onde o elemento está na página
      const navbarHeight = navbar.offsetHeight;
      const elementTop = targetEl.getBoundingClientRect().top + window.scrollY;

      // Rola até a posição, compensando a altura da navbar
      window.scrollTo({
        top: elementTop - navbarHeight - 20,
        behavior: 'smooth'
      });
    }
  });
});


// ============================================================
// 6. DATA MÍNIMA NO INPUT DE DATA
// ============================================================
// Impede que o usuário selecione datas no passado.
// new Date() retorna a data/hora atual.
// toISOString() converte para o formato "2024-01-15T..."
// .split('T')[0] pega só a parte da data "2024-01-15"
// ============================================================

const dateInput = document.getElementById('date');

if (dateInput) {
  const today = new Date().toISOString().split('T')[0];
  dateInput.setAttribute('min', today); // Define a data mínima
}


// ============================================================
// LOG DE INICIALIZAÇÃO
// ============================================================
// Apenas uma mensagem de confirmação no console do navegador.
// Pressione F12 e vá em "Console" para ver.
// ============================================================

console.log('%c✂ Barbearia Template carregado!', 'color: #f5f5f0; background: #111; padding: 8px 16px; font-size: 14px;');
