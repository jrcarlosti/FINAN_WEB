# FIN - Sistema de Finanças & Fluxo de Caixa

Este sistema foi construído utilizando **HTML, CSS, JS e Google Apps Script**, com o banco de dados armazenado diretamente em uma planilha do Google Sheets.

## 🚀 Como Configurar e Instalar o Sistema

Siga o passo a passo abaixo para conectar o sistema ao seu Google Sheets:

### Passo 1: Criar a Planilha e Colar o Código
1. Acesse o [Google Sheets](https://sheets.google.com) e crie uma nova planilha em branco.
2. Dê um nome para a planilha (ex: `Base de Dados - FIN`).
3. No menu superior, clique em **Extensões > Apps Script**.
4. Apague todo o código que estiver na tela (`function myFunction...`).
5. Abra o arquivo `apps-script.js` (que está nesta pasta `FIN`) e copie **todo o seu conteúdo**.
6. Cole o código copiado dentro do editor do Apps Script.
7. Clique no ícone de disquete 💾 (Salvar).

### Passo 2: Publicar o Web App (API)
1. No canto superior direito do Apps Script, clique no botão azul **Implantar > Nova implantação**.
2. Clique no ícone de engrenagem ⚙️ ao lado de "Selecione o tipo" e escolha **App da Web**.
3. Preencha os campos da seguinte forma:
   - **Descrição**: `API FIN` (ou o nome que preferir)
   - **Executar como**: `Eu mesmo (seu_email@gmail.com)`
   - **Quem tem acesso**: `Qualquer pessoa` *(⚠️ MUITO IMPORTANTE: Precisa ser "Qualquer pessoa" para funcionar)*
4. Clique em **Implantar**.
5. O Google pedirá para você autorizar o acesso à sua conta. Siga os passos:
   - Clique em **Autorizar Acesso**.
   - Escolha a sua conta Google.
   - Vai aparecer um aviso de segurança. Clique em **Avançado** e depois em **Acessar Projeto sem título (não seguro)**.
   - Clique em **Permitir**.
6. Uma janela com a **URL do Web App** será exibida. Copie essa URL (ela começa com `https://script.google.com/macros/s/...`).

### Passo 3: Conectar a Interface à API
1. Abra o arquivo `index.html` desta pasta diretamente no seu navegador (Google Chrome, Edge, etc.).
2. O sistema abrirá e pedirá para você configurar a URL.
3. No menu lateral, vá em **Configurações**.
4. Cole a URL copiada no campo **URL do Web App (API)**.
5. Clique em **Salvar URL**. A página será recarregada automaticamente.
6. Volte em **Configurações** e clique no botão **⚡ Inicializar Abas na Planilha**. Isso criará as abas (CONTAS, MOVIMENTACOES, CATEGORIAS, etc.) automaticamente na sua planilha do Google.
7. Pronto! O sistema está configurado e pronto para uso. Volte para o Dashboard ou vá em "Contas Bancárias" e crie sua primeira conta.

---

## 🛠️ Tecnologias Utilizadas
- **Front-end**: HTML5, CSS3, JavaScript (Vanilla ES6+). SPA (Single Page Application) sem frameworks pesados.
- **Back-end & API**: Google Apps Script, recebendo requisições GET com JSONP e payloads para contornar bloqueios de CORS locais.
- **Banco de Dados**: Google Sheets.
- **Visual & Componentes**: Ícones via Lucide, Gráficos via Chart.js.

## 💡 Hospedagem (Opcional)
Como o sistema é 100% estático (apenas HTML, CSS e JS), você pode enviar a pasta `FIN` para o **GitHub Pages**, Vercel, Netlify ou hospedar em qualquer servidor básico, e acessar seu sistema financeiro de qualquer lugar!
