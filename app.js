const API_URL_KEY = 'fin_api_url';
let SCRIPT_URL = localStorage.getItem(API_URL_KEY) || '';

const app = {
  data: {
    dashboard: null,
    contas: [],
    movimentacoes: [],
    categorias: [],
    investimentos: []
  },
  chartCategorias: null,
  chartEvolucao: null,
  chartContas: null,
  chartCartoesCredito: null,
  chartContasView: null,
  chartFluxoResumo: null,
  chartReservasView: null,
  chartInvestimentosView: null,
  ordemDataAsc: true,
  ocultarValoresGraficos: false,
  compactCharts: true,

  init() {
    Chart.register(ChartDataLabels);
    lucide.createIcons();
    this.bindEvents();
    this.applyChartCompactMode();
    
    // Auth Check
    if (sessionStorage.getItem('fin_logged_in') === 'true') {
      if (!SCRIPT_URL) {
        this.navegar('configuracoes');
        this.esconderSplash();
        this.mostrarToast('Por favor, configure a URL da API para começar.', 'warning');
        return;
      }
      this.carregarDadosIniciais();
    } else {
      this.exibirLogin();
    }
  },

  exibirLogin() {
    document.getElementById('splash-screen').style.display = 'none';
    document.getElementById('app-layout').style.display = 'none';
    const ls = document.getElementById('login-screen');
    ls.style.display = 'flex';
    
    if (!SCRIPT_URL) {
      document.getElementById('login-api-group').style.display = 'block';
    }
  },

  fazerLogin() {
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.innerText = 'Validando...';
    
    const apiUrlInput = document.getElementById('login-api-url').value.trim();
    if (!SCRIPT_URL && apiUrlInput) {
      if (!apiUrlInput.startsWith('https://script.google.com')) {
        this.mostrarToast('URL da API inválida.', 'error');
        btn.disabled = false; btn.innerText = 'Entrar';
        return;
      }
      SCRIPT_URL = apiUrlInput;
      localStorage.setItem(API_URL_KEY, SCRIPT_URL);
    } else if (!SCRIPT_URL) {
      this.mostrarToast('Informe a URL da API.', 'warning');
      btn.disabled = false; btn.innerText = 'Entrar';
      return;
    }

    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();

    this.request('listar_usuarios').then(res => {
      const usuarios = res.dados || [];
      const match = usuarios.find(u => u.Login === user && String(u.Senha) === pass);
      
      if (match) {
        sessionStorage.setItem('fin_logged_in', 'true');
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('splash-screen').style.display = 'flex';
        document.getElementById('user-name-display').innerText = match.Nome || match.Login;
        this.carregarDadosIniciais();
      } else {
        this.mostrarToast('Usuário ou senha incorretos.', 'error');
        btn.disabled = false; btn.innerText = 'Entrar';
      }
    }).catch(err => {
      this.mostrarToast('Erro ao contatar API: ' + err, 'error');
      btn.disabled = false; btn.innerText = 'Entrar';
    });
  },

  bindEvents() {
    // Menu navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const route = item.getAttribute('data-route');
        this.navegar(route);
        // Mobile menu fechar
        document.querySelector('.sidebar').classList.remove('open');
      });
    });

    // Mobile menu toggle
    document.querySelector('.mobile-menu-btn').addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('open');
    });

    // Theme toggle
    document.getElementById('btn-toggle-theme').addEventListener('click', () => {
      document.body.classList.toggle('theme-light');
      document.body.classList.toggle('theme-dark');
      // Gráficos (Chart.js) capturam as cores no momento em que são desenhados;
      // sem re-render aqui, legendas/rótulos ficam com a cor do tema anterior.
      this.renderDashboard();
    });

    // Ocultar valores toggle (CSS blur instantâneo)
    document.getElementById('btn-toggle-valores').addEventListener('click', (e) => {
      this.ocultarValoresGraficos = !this.ocultarValoresGraficos;
      document.body.classList.toggle('valores-ocultos', this.ocultarValoresGraficos);
      const ic = e.currentTarget.querySelector('i');
      ic.setAttribute('data-lucide', this.ocultarValoresGraficos ? 'eye-off' : 'eye');
      lucide.createIcons();
      // Atualizar datalabels dos gráficos
      if (this.chartCategorias) this.chartCategorias.update();
      if (this.chartEvolucao) this.chartEvolucao.update();
      if (this.chartContas) this.chartContas.update();
      if (this.chartFluxoResumo) this.chartFluxoResumo.update();
      if (this.chartCartoesCredito) this.chartCartoesCredito.update();
      // Atualizar totais exibidos nos cards de gráfico
      const totalContasEl = document.getElementById('fluxo-contas-total');
      if (totalContasEl && totalContasEl.dataset.valor !== undefined) {
        totalContasEl.innerText = this.ocultarValoresGraficos ? '••••' : this.formatarMoeda(Number(totalContasEl.dataset.valor));
      }
      const totalCartoesEl = document.getElementById('fluxo-cartoes-total');
      if (totalCartoesEl && totalCartoesEl.dataset.valor !== undefined) {
        totalCartoesEl.innerText = this.ocultarValoresGraficos ? '••••' : this.formatarMoeda(Number(totalCartoesEl.dataset.valor));
      }
    });

    // Filtrar categorias quando o Tipo for alterado nos modais de lançamento/edição
    const lancTipo = document.getElementById('lanc-tipo');
    if (lancTipo) lancTipo.addEventListener('change', (e) => { this.atualizarCategoriasParaSelect('lanc-categoria', e.target.value); });

    const editTipo = document.getElementById('edit-tipo');
    if (editTipo) editTipo.addEventListener('change', (e) => { this.atualizarCategoriasParaSelect('edit-categoria', e.target.value); });

    // Re-render cartoes when filtro de mês muda
    const filtroFatura = document.getElementById('filtro-fatura-mes');
    if (filtroFatura) filtroFatura.addEventListener('change', () => this.renderCartoes());
  },

  navegar(route) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const view = document.getElementById(`view-${route}`);
    if (view) view.classList.add('active');
    
    const nav = document.querySelector(`.nav-item[data-route="${route}"]`);
    if (nav) nav.classList.add('active');
    
    const titles = {
      'dashboard': 'Dashboard',
      'contas': 'Contas Bancárias',
      'fluxo': 'Fluxo de Caixa',
      'cartoes': 'Cartões & Faturas',
      'reservas': 'Caixas Reservas',
      'investimentos': 'Ações / Investimentos',
      'categorias': 'Categorias',
      'configuracoes': 'Configurações'
    };
    document.getElementById('page-title').innerText = titles[route] || 'FIN';

    if (route === 'configuracoes') {
      document.getElementById('input-api-url').value = SCRIPT_URL;
      const emailSalvo = localStorage.getItem('fin_email_alerta') || '';
      const emailInput = document.getElementById('input-email-alerta');
      if (emailInput) emailInput.value = emailSalvo;
    }
  },

  irParaPendentes() {
    this.navegar('fluxo');
    const fStatus = document.getElementById('filtro-status');
    if (fStatus) fStatus.value = 'PENDENTE';
    this.renderFluxo();
  },

  esconderSplash() {
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('app-layout').style.display = 'flex';
  },

  mostrarToast(msg, tipo = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    
    let icon = 'info';
    if(tipo === 'success') icon = 'check-circle';
    if(tipo === 'error') icon = 'alert-circle';
    if(tipo === 'warning') icon = 'alert-triangle';

    toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  abrirModal(id) {
    document.getElementById(id).classList.add('active');
    
    // Set default date to today for specific modals
    const today = new Date().toISOString().substring(0, 10);
    if (id === 'modal-lancamento') {
      const field = document.getElementById('lanc-data');
      if (field) field.value = today;
      // Atualiza as categorias de acordo com o Tipo selecionado ao abrir o modal
      const tipoVal = document.getElementById('lanc-tipo')?.value || 'SAIDA';
      this.atualizarCategoriasParaSelect('lanc-categoria', tipoVal);
    } else if (id === 'modal-transferencia') {
      const fieldOrigem = document.getElementById('transf-data-origem');
      const fieldDest = document.getElementById('transf-data-destino');
      if (fieldOrigem) fieldOrigem.value = today;
      if (fieldDest) fieldDest.value = today;
    } else if (id === 'modal-limite-cartao') {
      const fieldData = document.getElementById('limite-data');
      if (fieldData) fieldData.value = today;
    }
  },

  toggleOrdemData() {
    this.ordemDataAsc = !this.ordemDataAsc;
    const icon = document.getElementById('icone-ordem-data');
    if (icon) icon.innerText = this.ordemDataAsc ? '↑' : '↓';
    this.renderFluxo();
  },

  fecharModal(id) {
    document.getElementById(id).classList.remove('active');
  },

  formatarMoeda(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  formatarData(dataISO) {
    if(!dataISO) return '';
    const partes = dataISO.split('-');
    if(partes.length !== 3) return dataISO;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  },

  salvarConfig() {
    const url = document.getElementById('input-api-url').value.trim();
    if (url.startsWith('https://script.google.com')) {
      localStorage.setItem(API_URL_KEY, url);
      SCRIPT_URL = url;
      this.mostrarToast('Configuração salva com sucesso!', 'success');
      setTimeout(() => location.reload(), 1000);
    } else {
      this.mostrarToast('URL inválida. Deve começar com https://script.google.com', 'error');
    }
  },

  // ── COMUNICAÇÃO JSONP (GET) ──
  request(acao, parametros = {}) {
    return new Promise((resolve, reject) => {
      if (!SCRIPT_URL) return reject('URL não configurada');
      
      const callbackName = 'jsonp_cb_' + Math.round(100000 * Math.random());
      
      let url = `${SCRIPT_URL}?acao=${encodeURIComponent(acao)}&callback=${callbackName}`;
      
      for (const key in parametros) {
        if (parametros.hasOwnProperty(key)) {
          url += `&${key}=${encodeURIComponent(parametros[key])}`;
        }
      }

      window[callbackName] = (data) => {
        delete window[callbackName];
        document.body.removeChild(script);
        if (data.sucesso) resolve(data);
        else reject(data.mensagem || data.erro || 'Erro desconhecido');
      };

      const script = document.createElement('script');
      script.src = url;
      script.onerror = () => {
        delete window[callbackName];
        document.body.removeChild(script);
        reject('Erro de conexão com o servidor Google.');
      };
      document.body.appendChild(script);
    });
  },

  requestEscrita(payload) {
    const payloadStr = JSON.stringify(payload);
    return this.request('escrever', { payload: payloadStr });
  },

  // ── INICIALIZAÇÃO ──
  inicializarPlanilha() {
    if (!SCRIPT_URL) return this.mostrarToast('Configure a URL primeiro.', 'warning');
    if (!confirm('Isso criará as abas na planilha se elas não existirem. Continuar?')) return;
    
    this.mostrarToast('Inicializando planilha...', 'info');
    this.request('inicializar').then(res => {
      this.mostrarToast(res.mensagem, 'success');
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  carregarDadosIniciais() {
    const syncStatus = document.getElementById('sync-status');
    if (syncStatus) syncStatus.style.display = 'flex';

    const carregarAgrupado = () => this.request('sincronizar_tudo').then(res => {
      const dados = res.dados || {};
      this.data.dashboard = dados.dashboard || null;
      this.data.contas = dados.contas || [];
      this.data.movimentacoes = dados.movimentacoes || [];
      this.data.categorias = dados.categorias || [];
      this.data.cartoes = dados.cartoes || [];
      this.data.reservas = dados.reservas || [];
      this.data.investimentos = dados.investimentos || [];
    });

    const carregarSeparado = () => Promise.all([
      this.request('dashboard'),
      this.request('listar_contas'),
      this.request('listar_movimentacoes'),
      this.request('listar_categorias'),
      this.request('listar_cartoes'),
      this.request('listar_reservas'),
      this.request('listar_investimentos')
    ]).then(([resDash, resContas, resMov, resCat, resCar, resRes, resInv]) => {
      this.data.dashboard = resDash.dados;
      this.data.contas = resContas.dados;
      this.data.movimentacoes = resMov.dados;
      this.data.categorias = resCat.dados;
      this.data.cartoes = resCar.dados;
      this.data.reservas = resRes.dados;
      this.data.investimentos = resInv.dados || [];
    });

    carregarAgrupado()
      .catch(() => carregarSeparado())
      .then(() => {
        this.preencherSelects();
        this.renderDashboard();
        this.renderContas();
        this.renderFluxo();
        this.renderCategorias();
        this.renderReservas();
        this.renderInvestimentos();
        this.renderCartoes();
        this.esconderSplash();
      })
      .catch(err => {
        this.mostrarToast(err, 'error');
      })
      .finally(() => {
        if (syncStatus) syncStatus.style.display = 'none';
        if (document.getElementById('app-layout').style.display === 'none') {
          this.esconderSplash();
        }
      });
  },

  // ── RENDERIZAÇÕES ──
  renderDashboard() {
    const d = this.data.dashboard;
    if(!d) return;

    const dashDataIni = document.getElementById('dash-data-inicio')?.value || '';
    const dashDataFim = document.getElementById('dash-data-fim')?.value || '';

    let movs = [...this.data.movimentacoes];
    if(dashDataIni) movs = movs.filter(m => String(m.Data).substring(0, 10) >= dashDataIni);
    if(dashDataFim) movs = movs.filter(m => String(m.Data).substring(0, 10) <= dashDataFim);

    let totalReceitasMes = 0;
    let totalDespesasMes = 0;
    let pendentesCount = 0;
    const pendentes = [];
    const despesasPorCategoria = {};

    const isTransferencia = mov => {
      const categoria = String(mov.Categoria || '').trim().toLowerCase();
      const descricao = String(mov.Descricao || '').trim().toLowerCase();
      return categoria.includes('transfer') || categoria === 'transferência' || categoria === 'transferencia' || descricao.includes('transfer') || descricao.includes('aporte') || descricao.includes('resgate') || (mov.ID_Conta_Origem && mov.ID_Conta_Destino);
    };

    movs.forEach(m => {
      if (!isTransferencia(m)) {
        if(m.Tipo === 'ENTRADA') totalReceitasMes += Number(m.Valor);
        else if(m.Tipo === 'SAIDA') {
           totalDespesasMes += Number(m.Valor);
           if (!despesasPorCategoria[m.Categoria]) despesasPorCategoria[m.Categoria] = 0;
           despesasPorCategoria[m.Categoria] += Number(m.Valor);
        }
      }
      if (String(m.Status).toUpperCase() === 'PENDENTE') {
        pendentesCount++;
        pendentes.push(m);
      }
    });

    document.getElementById('kpi-saldo-geral').innerHTML = `<span class="valor-monetario">${this.formatarMoeda(d.saldoGeralContas)}</span>`;
    document.getElementById('kpi-receitas').innerHTML = `<span class="valor-monetario">${this.formatarMoeda(totalReceitasMes)}</span>`;
    document.getElementById('kpi-despesas').innerHTML = `<span class="valor-monetario">${this.formatarMoeda(totalDespesasMes)}</span>`;
    document.getElementById('kpi-pendentes').innerText = pendentesCount;

    const kpiSaldoMes = document.getElementById('kpi-saldo-mes');
    if (kpiSaldoMes) {
      kpiSaldoMes.innerHTML = `<span class="valor-monetario">${this.formatarMoeda(totalReceitasMes - totalDespesasMes)}</span>`;
      // Optional: change color based on positive/negative
      kpiSaldoMes.style.color = (totalReceitasMes - totalDespesasMes) >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    const ttPendentes = document.getElementById('tooltip-pendentes');
    if (ttPendentes) {
      if (pendentesCount > 0) {
        ttPendentes.innerHTML = pendentes.map(p => `
          <div class="tooltip-item">
            <span>${p.Descricao}</span>
            <strong>${this.formatarMoeda(p.Valor)}</strong>
          </div>
        `).join('');
      } else {
        ttPendentes.innerHTML = '<div class="tooltip-item">Nenhuma pendência no período</div>';
      }
    }

    // Renderizar gráfico categorias
    const ctx = document.getElementById('chart-categorias');
    if(ctx) {
      if(this.chartCategorias) this.chartCategorias.destroy();

      // Paleta categórica validada (ordem fixa, hues distintos para daltonismo),
      // com um passo dedicado para cada tema — nunca a mesma cor "clara" sobre
      // fundo claro nem "escura" sobre fundo escuro.
      const isDark = document.body.classList.contains('theme-dark');
      const CORES_CATEGORIA = isDark
        ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767', '#94a3b8']
        : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#e34948', '#64748b'];

      // Mesmos valores de body.theme-light/body.theme-dark em style.css — lidos
      // diretamente (em vez de getComputedStyle) para o gráfico nunca ficar
      // dependente de timing de resolução de variável CSS.
      const corSuperficie = isDark ? '#1e293b' : '#ffffff';
      const corTextoPrimario = isDark ? '#f8fafc' : '#0f172a';
      const corTextoSecundario = isDark ? '#94a3b8' : '#64748b';

      // Categorias pequenas demais poluem a rosca e a legenda: mantemos as
      // maiores e agrupamos o resto em "Outras", como uma pizza profissional.
      const MAX_FATIAS = 7;
      const entradas = Object.entries(despesasPorCategoria).sort((a, b) => b[1] - a[1]);
      let labels, values;
      if (entradas.length > MAX_FATIAS) {
        const principais = entradas.slice(0, MAX_FATIAS);
        const outrasSoma = entradas.slice(MAX_FATIAS).reduce((s, [, v]) => s + v, 0);
        labels = [...principais.map(e => e[0]), 'Outras'];
        values = [...principais.map(e => e[1]), outrasSoma];
      } else {
        labels = entradas.map(e => e[0]);
        values = entradas.map(e => e[1]);
      }

      if(labels.length === 0) {
        labels.push('Sem despesas');
        values.push(1);
      }

      const totalDespesas = values.reduce((a, b) => a + b, 0);
      const cores = labels.map((_, i) => CORES_CATEGORIA[i % CORES_CATEGORIA.length]);

      this.chartCategorias = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: cores,
            borderWidth: 2,
            borderColor: corSuperficie,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: corTextoPrimario,
                font: { size: 13, weight: '600' },
                padding: 18,
                boxWidth: 12,
                boxHeight: 12,
                usePointStyle: true,
                pointStyle: 'circle',
                generateLabels: function(chart) {
                  const data = chart.data;
                  return data.labels.map((label, i) => {
                    const val = data.datasets[0].data[i];
                    const pct = totalDespesas > 0 ? ((val / totalDespesas) * 100).toFixed(1) : 0;
                    return {
                      text: `${label}  ${pct}%`,
                      fillStyle: data.datasets[0].backgroundColor[i],
                      strokeStyle: data.datasets[0].backgroundColor[i],
                      fontColor: corTextoPrimario,
                      hidden: false,
                      index: i
                    };
                  });
                }
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const val = context.parsed;
                  const pct = totalDespesas > 0 ? ((val / totalDespesas) * 100).toFixed(1) : 0;
                  const valorFmt = app.ocultarValoresGraficos ? '••••' : app.formatarMoeda(val);
                  return ` ${valorFmt} (${pct}%)`;
                }
              }
            },
            datalabels: {
              formatter: function(value, ctx) {
                const pct = totalDespesas > 0 ? (value / totalDespesas) * 100 : 0;
                // Rótulo direto só nas fatias relevantes; fatias pequenas ficam
                // só na legenda/tooltip para não poluir o gráfico.
                if (pct < 5) return '';
                return app.ocultarValoresGraficos ? '••••' : pct.toFixed(1) + '%';
              },
              color: '#ffffff',
              font: { weight: 'bold', size: 12 },
              textStrokeColor: 'rgba(0,0,0,0.55)',
              textStrokeWidth: 3,
              display: function(context) { return context.dataset.data[context.dataIndex] > 0; }
            }
          }
        },
        plugins: [{
          id: 'totalCentral',
          afterDraw(chart) {
            if (chart.config.type !== 'doughnut') return;
            const { ctx, chartArea: { left, right, top, bottom } } = chart;
            const cx = (left + right) / 2;
            const cy = (top + bottom) / 2;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = corTextoSecundario;
            ctx.font = '600 11px Inter, sans-serif';
            ctx.fillText('TOTAL', cx, cy - 12);
            ctx.fillStyle = corTextoPrimario;
            ctx.font = '700 16px Inter, sans-serif';
            const totalFmt = app.ocultarValoresGraficos ? '••••' : app.formatarMoeda(totalDespesas);
            ctx.fillText(totalFmt, cx, cy + 10);
            ctx.restore();
          }
        }]
      });
    }

    // Renderizar gráfico evolução
    const ctxEvolucao = document.getElementById('chart-evolucao');
    if (ctxEvolucao) {
      if (this.chartEvolucao) this.chartEvolucao.destroy();

      const mesesMap = {};
      movs.forEach(m => {
        if (!m.Data || isTransferencia(m)) return;
        const mStr = String(m.Data).substring(0, 7);
        if (!mesesMap[mStr]) mesesMap[mStr] = { Receitas: 0, Despesas: 0 };

        if (m.Tipo === 'ENTRADA') mesesMap[mStr].Receitas += Number(m.Valor);
        else if (m.Tipo === 'SAIDA') mesesMap[mStr].Despesas += Number(m.Valor);
      });
      
      const sortedKeys = Object.keys(mesesMap).sort();

      const labelsEvo = sortedKeys.map(k => {
        const p = k.split('-');
        return `${p[1]}/${p[0].substring(2)}`;
      });
      const dataRec = sortedKeys.map(k => mesesMap[k].Receitas);
      const dataDes = sortedKeys.map(k => mesesMap[k].Despesas);
      const dataSaldo = sortedKeys.map(k => mesesMap[k].Receitas - mesesMap[k].Despesas);
      const totalSaldoEvolucao = dataSaldo.reduce((acc, v) => acc + v, 0);

      const saldoHeaderEl = document.getElementById('evolucao-saldo-total');
      if (saldoHeaderEl) {
        saldoHeaderEl.innerText = this.ocultarValoresGraficos ? '••••' : this.formatarMoeda(totalSaldoEvolucao);
      }

      this.chartEvolucao = new Chart(ctxEvolucao, {
        type: 'bar',
        data: {
          labels: labelsEvo,
          datasets: [
            { label: 'Receitas', data: dataRec, backgroundColor: '#10b981', borderRadius: 4 },
            { label: 'Despesas', data: dataDes, backgroundColor: '#ef4444', borderRadius: 4 },
            { label: 'Saldo', data: dataSaldo, backgroundColor: '#3b82f6', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 60, bottom: 4 } },
          plugins: { 
            legend: {
              position: 'bottom',
              labels: {
                color: '#e2e8f0',
                font: { size: 13, weight: '600' },
                padding: 20,
                boxWidth: 14,
                boxHeight: 14,
                usePointStyle: true
              }
            },
            datalabels: {
              anchor: 'end',
              align: 'top',
              offset: 2,
              clip: false,
              formatter: function(value) { return app.ocultarValoresGraficos ? '••••' : app.formatarMoeda(value); },
              color: '#e2e8f0',
              font: { weight: 'bold', size: 10 },
              textStrokeColor: 'rgba(0,0,0,0.8)',
              textStrokeWidth: 3
            }
          },
          scales: {
            x: { ticks: { color: '#94a3b8', font: { size: 12 } }, grid: { color: 'rgba(148,163,184,0.15)' } },
            y: { ticks: { color: '#94a3b8', font: { size: 12 } }, grid: { color: 'rgba(148,163,184,0.15)' } }
          }
        }
      });
    }
  },

  renderContas() {
    const container = document.getElementById('lista-contas');
    container.innerHTML = '';
    
    const totalSaldo = this.data.contas.reduce((acc, c) => acc + Number(c.Saldo_Atual), 0);

    // Card de Total
    container.innerHTML += `
      <div class="card" style="border-top: 4px solid var(--primary-color); background: rgba(59, 130, 246, 0.05);">
        <div class="card-header">
          <div>
            <span class="card-title">Total</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <i data-lucide="plus-circle" style="color: var(--primary-color);"></i>
          </div>
        </div>
        <div class="card-balance" style="color: ${totalSaldo < 0 ? 'var(--danger)' : 'var(--text-primary)'}">
          <span class="valor-monetario">${this.formatarMoeda(totalSaldo)}</span>
        </div>
        <div class="card-footer">
          <span>Soma de todas as contas</span>
        </div>
      </div>
    `;

    this.data.contas.forEach(c => {
      const saldo = Number(c.Saldo_Atual);
      container.innerHTML += `
        <div class="card" style="border-top: 4px solid ${c.Cor || '#3b82f6'}">
          <div class="card-header">
            <div>
              <span class="card-title">${c.Nome}</span>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="icon-btn" onclick="app.editarConta('${c.ID}')" title="Editar Conta"><i data-lucide="pencil"></i></button>
              <button class="icon-btn" onclick="app.excluirConta('${c.ID}')" title="Excluir Conta"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="card-balance" style="color: ${saldo < 0 ? 'var(--danger)' : 'var(--text-primary)'}">
            <span class="valor-monetario">${this.formatarMoeda(saldo)}</span>
          </div>
          <div class="card-footer">
            <span>Banco: ${c.Banco || '-'}</span>
          </div>
        </div>
      `;
    });
    lucide.createIcons();

    // Gráfico: Fluxo de Caixa por Conta (inclui Total)
    const ctxContasView = document.getElementById('chart-contas-view');
    if (ctxContasView) {
      if (this.chartContasView) this.chartContasView.destroy();

      const contasSorted = [...this.data.contas].sort((a, b) => Number(b.Saldo_Atual) - Number(a.Saldo_Atual));
      const totalGeral = contasSorted.reduce((acc, c) => acc + Number(c.Saldo_Atual), 0);

      const labels = ['Total', ...contasSorted.map(c => c.Nome)];
      const data = [totalGeral, ...contasSorted.map(c => Number(c.Saldo_Atual))];
      const bgColors = ['#3b82f6', ...contasSorted.map(c => c.Cor || (Number(c.Saldo_Atual) < 0 ? '#ef4444' : '#3b82f6'))];

      this.chartContasView = new Chart(ctxContasView, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Saldo', data, backgroundColor: bgColors, borderRadius: 6 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 40 } },
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end', align: 'top',
              formatter: function(value) { return app.ocultarValoresGraficos ? '••••' : app.formatarMoeda(value); },
              clip: false, font: { size: 13, weight: 'bold' },
              color: '#e2e8f0', textStrokeColor: 'rgba(0,0,0,0.7)', textStrokeWidth: 3
            }
          },
          scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } } }
        }
      });
    }
  },

  renderFluxo() {
    const container = document.getElementById('tabela-fluxo');
    container.innerHTML = '';
    
    const fTipo = document.getElementById('filtro-tipo')?.value || 'todos';
    const fConta = document.getElementById('filtro-conta')?.value || 'todas';
    const fStatus = document.getElementById('filtro-status')?.value || 'todos';
    const fCat = document.getElementById('filtro-categoria')?.value || 'todas';
    const fCartao = document.getElementById('filtro-cartao')?.value || 'todos';
    const fDesc = document.getElementById('filtro-descricao')?.value.toLowerCase() || '';
    const fDataIni = document.getElementById('filtro-data-inicio')?.value || '';
    const fDataFim = document.getElementById('filtro-data-fim')?.value || '';
    
    let movs = [...this.data.movimentacoes];
    
    if(fTipo !== 'todos') movs = movs.filter(m => m.Tipo === fTipo);
    if(fConta !== 'todas') movs = movs.filter(m => m.ID_Conta_Origem === fConta || m.ID_Conta_Destino === fConta || m.ID_Reserva === fConta);
    if(fStatus !== 'todos') {
      movs = movs.filter(m => {
        const status = String(m.Status || '').toUpperCase();
        const dataISO = this.formatarDataParaComparacao(m.Data);
        const isVencido = status === 'VENCIDO' || (status === 'PENDENTE' && dataISO < new Date().toISOString().substring(0, 10));
        if (fStatus === 'VENCIDO') return isVencido;
        return status === fStatus;
      });
    }
    if(fCat !== 'todas') movs = movs.filter(m => m.Categoria === fCat);
    if(fCartao !== 'todos') movs = movs.filter(m => String(m.ID_Cartao) === fCartao);
    if(fDesc) movs = movs.filter(m => String(m.Descricao).toLowerCase().includes(fDesc));
    if(fDataIni) movs = movs.filter(m => this.formatarDataParaComparacao(m.Data) >= fDataIni);
    if(fDataFim) movs = movs.filter(m => this.formatarDataParaComparacao(m.Data) <= fDataFim);

    // Sort by Date
    movs.sort((a, b) => {
      const da = new Date(this.formatarDataParaComparacao(a.Data)).getTime();
      const db = new Date(this.formatarDataParaComparacao(b.Data)).getTime();
      return this.ordemDataAsc ? da - db : db - da;
    });

    if(movs.length === 0) {
      container.innerHTML = `<tr><td colspan="9" style="text-align:center">Nenhum lançamento encontrado.</td></tr>`;
      return;
    }

    // Mostrar coluna KM apenas se algum lançamento tiver KM
    const temKM = movs.some(m => m.KM && String(m.KM).trim() !== '');
    const thKM = document.getElementById('th-km');
    if (thKM) thKM.style.display = temKM ? '' : 'none';
    const colspan = temKM ? 10 : 9;

    movs.forEach(m => {
      const conta = this.data.contas.find(c => c.ID === m.ID_Conta_Origem) || this.data.reservas.find(r => r.ID === m.ID_Reserva) || { Nome: '-' };
      const cartao = this.data.cartoes.find(c => c.ID === m.ID_Cartao) || { Nome: '-' };
      const categoria = this.data.categorias.find(c => c.Nome === m.Categoria) || { Tipo: '', Cor: '#64748b', Icone: 'tag' };
      const valColor = m.Tipo === 'SAIDA' ? 'var(--danger)' : 'var(--success)';
      const sinal = m.Tipo === 'SAIDA' ? '-' : '+';
      const status = String(m.Status || '').trim().toUpperCase();
      const isVencido = status === 'VENCIDO' || (status === 'PENDENTE' && new Date(m.Data).getTime() < new Date().setHours(0,0,0,0));
      const rowBg = status === 'PAGO'
        ? 'background: rgba(16, 185, 129, 0.08);'
        : isVencido
          ? 'background: rgba(249, 115, 22, 0.12);'
          : status === 'PENDENTE'
            ? 'background: rgba(239, 68, 68, 0.08);'
            : '';
      const badgeClass = isVencido ? 'vencido' : status === 'PENDENTE' ? 'pendente' : status === 'PAGO' ? 'success' : 'info';
      const statusLabel = isVencido && status === 'PENDENTE' ? 'VENCIDO' : status || '-';

      container.innerHTML += `
        <tr style="${rowBg}">
          <td>${this.formatarData(m.Data)}</td>
          <td><strong>${m.Descricao}</strong></td>
          <td><span class="category-tag" style="background:${categoria.Cor};"><i data-lucide="${categoria.Icone || 'tag'}" style="width:14px; height:14px;"></i></span>${m.Categoria}</td>
          ${temKM ? `<td>${m.KM ? `<span style="font-size:0.8rem;background:var(--bg-app);padding:2px 6px;border-radius:4px;">🗘️ ${Number(m.KM).toLocaleString('pt-BR')} km</span>` : '-'}</td>` : ''}
          <td>${cartao.Nome !== '-' ? '<i data-lucide="credit-card" style="width:14px; margin-right:5px; vertical-align:bottom;"></i>'+cartao.Nome : '-'}</td>
          <td>${m.Parcela_Info || '-'}</td>
          <td>${conta.Nome}</td>
          <td style="color: ${valColor}; font-weight: 600;">${sinal} ${this.formatarMoeda(m.Valor)}</td>
          <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
          <td>
            <button class="icon-btn" onclick="app.editarLancamento('${m.ID}')" title="Editar"><i data-lucide="pencil"></i></button>
            <button class="icon-btn" onclick="app.excluirMovimentacao('${m.ID}')" title="Excluir"><i data-lucide="trash-2"></i></button>
          </td>
        </tr>
      `;
    });
    lucide.createIcons();
    
    // Graficos do Fluxo
    this.renderGraficosFluxo(movs);
  },

  renderGraficosFluxo(movs) {
    // 0. Gráfico Cartões de Crédito
    const ctxCartoes = document.getElementById('chart-cartoes-credito');
    const totalEl = document.getElementById('fluxo-cartoes-total');
    const movsPorCartao = movs.filter(m => m.ID_Cartao && m.Tipo === 'SAIDA');
    const totalsByCartao = movsPorCartao.reduce((acc, m) => {
      const id = String(m.ID_Cartao);
      acc[id] = (acc[id] || 0) + Number(m.Valor);
      return acc;
    }, {});

    const cartoesOrdenados = this.data.cartoes
      .map(c => ({ ...c, total: totalsByCartao[String(c.ID)] || 0 }))
      .filter(c => c.total !== 0)
      .sort((a, b) => Number(b.total) - Number(a.total));

    const totalCartoes = cartoesOrdenados.reduce((acc, c) => acc + c.total, 0);
    if (totalEl) {
      totalEl.dataset.valor = totalCartoes;
      totalEl.innerText = this.ocultarValoresGraficos ? '••••' : this.formatarMoeda(totalCartoes);
    }

    if (ctxCartoes) {
      if (this.chartCartoesCredito) this.chartCartoesCredito.destroy();

      const labels = cartoesOrdenados.map(c => c.Nome);
      const data = cartoesOrdenados.map(c => c.total);
      const bgColors = cartoesOrdenados.map(c => c.Cor || '#3b82f6');

      this.chartCartoesCredito = new Chart(ctxCartoes, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Cartões de Crédito',
            data,
            backgroundColor: bgColors,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 40, right: 20 } },
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'top',
              formatter: function(value) { return app.ocultarValoresGraficos ? '••••' : app.formatarMoeda(value); },
              clip: false,
              font: { size: 12, weight: 'bold' },
              color: '#e2e8f0',
              textStrokeColor: 'rgba(0,0,0,0.7)',
              textStrokeWidth: 3
            }
          },
          scales: {
            x: { ticks: { color: '#94a3b8', font: { size: 12 } }, grid: { color: 'rgba(148,163,184,0.15)' } },
            y: { ticks: { color: '#94a3b8', font: { size: 12 } }, grid: { color: 'rgba(148,163,184,0.15)' } }
          }
        }
      });
    }

    // 1. Gráfico Contas Bancárias (Saldo)
    const ctxContas = document.getElementById('chart-contas-saldo');
    const totalContasEl = document.getElementById('fluxo-contas-total');
    if (ctxContas) {
      if (this.chartContas) this.chartContas.destroy();
      
      const contasSorted = [...this.data.contas].sort((a, b) => Number(b.Saldo_Atual) - Number(a.Saldo_Atual));
      const totalContas = contasSorted.reduce((acc, c) => acc + Number(c.Saldo_Atual), 0);

      if (totalContasEl) {
        totalContasEl.dataset.valor = totalContas;
        totalContasEl.innerText = this.ocultarValoresGraficos ? '••••' : this.formatarMoeda(totalContas);
      }

      const labels = contasSorted.map(c => c.Nome);
      const data = contasSorted.map(c => Number(c.Saldo_Atual));
      const bgColors = contasSorted.map(c => c.Cor || (c.Saldo_Atual < 0 ? '#ef4444' : '#3b82f6'));
      
      this.chartContas = new Chart(ctxContas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Saldo da Conta',
            data: data,
            backgroundColor: bgColors,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 40 } },
          plugins: { 
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'top',
              formatter: function(value) { return app.ocultarValoresGraficos ? '••••' : app.formatarMoeda(value); },
              clip: false,
              font: { size: 12 },
              color: '#e2e8f0',
              font: { weight: 'bold', size: 11 },
              textStrokeColor: 'rgba(0,0,0,0.7)',
              textStrokeWidth: 3
            }
          },
          scales: {
            x: { ticks: { color: '#94a3b8', font: { size: 12 } }, grid: { color: 'rgba(148,163,184,0.15)' } },
            y: { ticks: { color: '#94a3b8', font: { size: 12 } }, grid: { color: 'rgba(148,163,184,0.15)' } }
          }
        }
      });
    }

    // 2. Gráfico Entradas, Saídas e Saldo
    const ctxResumo = document.getElementById('chart-fluxo-resumo');
    if (ctxResumo) {
      if (this.chartFluxoResumo) this.chartFluxoResumo.destroy();
      
      let totalEntradas = 0;
      let totalSaidas = 0;
      
      const isTransferencia = mov => {
        const categoria = String(mov.Categoria || '').trim().toLowerCase();
        const descricao = String(mov.Descricao || '').trim().toLowerCase();
        return categoria.includes('transfer') || categoria === 'transfer�ncia' || categoria === 'transferencia' || descricao.includes('transfer') || descricao.includes('aporte') || descricao.includes('resgate') || (mov.ID_Conta_Origem && mov.ID_Conta_Destino);
      };


      movs.forEach(m => {
        if (isTransferencia(m)) return;
        if (m.Tipo === 'ENTRADA') totalEntradas += Number(m.Valor);
        else if (m.Tipo === 'SAIDA') totalSaidas += Number(m.Valor);
      });
      
      const saldo = totalEntradas - totalSaidas;
      
      this.chartFluxoResumo = new Chart(ctxResumo, {
        type: 'bar',
        data: {
          labels: ['Entradas', 'Saídas', 'Saldo'],
          datasets: [{
            label: 'Valores',
            data: [totalEntradas, totalSaidas, saldo],
            backgroundColor: ['#10b981', '#ef4444', saldo >= 0 ? '#3b82f6' : '#ef4444'],
            borderRadius: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 30 } },
          plugins: { 
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'top',
              formatter: function(value) { return app.ocultarValoresGraficos ? '••••' : app.formatarMoeda(value); },
              color: '#e2e8f0',
              font: { weight: 'bold', size: 11 },
              textStrokeColor: 'rgba(0,0,0,0.7)',
              textStrokeWidth: 3
            }
          },
          scales: {
            x: { ticks: { color: '#94a3b8', font: { size: 13, weight: '600' } }, grid: { color: 'rgba(148,163,184,0.15)' } },
            y: { ticks: { color: '#94a3b8', font: { size: 12 } }, grid: { color: 'rgba(148,163,184,0.15)' } }
          }
        }
      });
    }
  },

  renderCategorias() {
    const container = document.getElementById('lista-categorias');
    if (!container) return;
    container.innerHTML = '';
    this.data.categorias.forEach(c => {
      container.innerHTML += `
        <div class="card" style="border-left: 4px solid ${c.Cor}">
          <div class="card-header" style="margin-bottom:0;">
            <div style="display:flex; align-items:center; gap:10px;">
              <i data-lucide="${c.Icone}" style="color:${c.Cor}"></i>
              <span class="card-title">${c.Nome}</span>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <span class="badge ${c.Tipo === 'RECEITA' ? 'success' : 'danger'}">${c.Tipo}</span>
              <button class="icon-btn" onclick="app.editarCategoria('${c.ID}')" title="Editar"><i data-lucide="pencil"></i></button>
              <button class="icon-btn" onclick="app.excluirCategoria('${c.ID}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
        </div>
      `;
    });
    lucide.createIcons();
  },

  renderReservas() {
    const container = document.getElementById('lista-reservas');
    if (!container) return;
    container.innerHTML = '';
    this.data.reservas.forEach(r => {
      const valorAtual = Number(r.Valor_Atual);
      const metaValor = Number(r.Meta_Valor);
      const p = metaValor ? (valorAtual / metaValor) * 100 : 0;
      const barWidth = Math.max(0, Math.min(p, 100));
      const barColor = valorAtual < 0 ? 'var(--danger)' : r.Cor;
      container.innerHTML += `
        <div class="card" style="border-top: 4px solid ${r.Cor}">
          <div class="card-header">
            <span class="card-title"><i data-lucide="${r.Icone}" style="width:18px;height:18px;margin-right:5px;vertical-align:bottom;"></i>${r.Nome}</span>
            <div style="display:flex; gap:5px;">
              <button class="icon-btn" onclick="app.abrirAporte('${r.ID}')" title="Aporte/Resgate"><i data-lucide="arrow-right-left"></i></button>
              <button class="icon-btn" onclick="app.editarReserva('${r.ID}')" title="Editar Reserva" style="color: var(--primary-color);"><i data-lucide="pencil"></i></button>
              <button class="icon-btn" onclick="app.excluirReserva('${r.ID}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="card-balance"><span class="valor-monetario">${this.formatarMoeda(valorAtual)}</span></div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">Meta: <span class="valor-monetario">${this.formatarMoeda(metaValor)}</span></div>
          <div style="width:100%; height:8px; background:var(--bg-app); border-radius:4px; overflow:hidden;">
            <div style="width:${barWidth}%; height:100%; background:${barColor}; transition:width 0.3s;"></div>
          </div>
          <div style="text-align:right; font-size:0.75rem; margin-top:5px;">${p.toFixed(1)}% alcançado</div>
        </div>
      `;
    });
    lucide.createIcons();

    // Gráfico: Reservas — inclui total e ordena do maior para o menor (esquerda -> direita)
    const ctxRes = document.getElementById('chart-reservas-view');
    if (ctxRes) {
      if (this.chartReservasView) this.chartReservasView.destroy();

      const reservasSorted = [...this.data.reservas].sort((a, b) => Number(b.Valor_Atual) - Number(a.Valor_Atual));
      const totalReservas = reservasSorted.reduce((acc, r) => acc + Number(r.Valor_Atual), 0);

      const labels = ['Total', ...reservasSorted.map(r => r.Nome)];
      const data = [totalReservas, ...reservasSorted.map(r => Number(r.Valor_Atual))];
      const bgColors = ['#3b82f6', ...reservasSorted.map(r => r.Cor || '#10b981')];

      this.chartReservasView = new Chart(ctxRes, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Valor', data, backgroundColor: bgColors, borderRadius: 6 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 40 } },
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end', align: 'top',
              formatter: function(value) { return app.ocultarValoresGraficos ? '••••' : app.formatarMoeda(value); },
              clip: false, font: { size: 13, weight: 'bold' }, color: '#e2e8f0', textStrokeColor: 'rgba(0,0,0,0.7)', textStrokeWidth: 3
            }
          },
          scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } } }
        }
      });
    }
  },

  renderInvestimentos() {
    const container = document.getElementById('lista-investimentos');
    if (!container) return;
    container.innerHTML = '';

    if (!this.data.investimentos || this.data.investimentos.length === 0) {
      if (this.chartInvestimentosView) {
        this.chartInvestimentosView.destroy();
        this.chartInvestimentosView = null;
      }
      const ctx = document.getElementById('chart-investimentos-view');
      if (ctx) {
        this.chartInvestimentosView = new Chart(ctx, {
          type: 'bar',
          data: { labels: ['Sem dados'], datasets: [{ label: 'Investimentos', data: [0], backgroundColor: ['#64748b'], borderRadius: 6 }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, datalabels: { display: false } },
            scales: { x: { display: false }, y: { display: false } }
          }
        });
      }

      container.innerHTML = `
        <div class="card" style="border-top: 4px solid var(--primary-color);">
          <div class="card-header">
            <span class="card-title">Nenhum investimento cadastrado</span>
          </div>
          <div class="card-balance" style="font-size: 0.95rem; color: var(--text-secondary);">
            Cadastre seus investimentos para ver aqui.
          </div>
        </div>
      `;
      return;
    }

    const labels = this.data.investimentos.map(i => i.Nome || 'Investimento');
    const valores = this.data.investimentos.map(i => Number(i.Valor_Atual || 0));
    const totalInvestimentos = valores.reduce((acc, value) => acc + value, 0);
    const cores = this.data.investimentos.map(i => i.Cor || '#3b82f6');

    if (this.chartInvestimentosView) this.chartInvestimentosView.destroy();
    const ctx = document.getElementById('chart-investimentos-view');
    if (ctx) {
      this.chartInvestimentosView = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Total', ...labels],
          datasets: [{ label: 'Valor', data: [totalInvestimentos, ...valores], backgroundColor: ['#2563eb', ...cores], borderRadius: 6 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 40 } },
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'top',
              formatter: function(value) { return app.ocultarValoresGraficos ? '••••' : app.formatarMoeda(value); },
              clip: false,
              font: { size: 13, weight: 'bold' },
              color: '#e2e8f0',
              textStrokeColor: 'rgba(0,0,0,0.7)',
              textStrokeWidth: 3
            }
          },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } },
            y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } }
          }
        }
      });
    }

    this.data.investimentos.forEach(i => {
      const valorAtual = Number(i.Valor_Atual || 0);
      const metaValor = Number(i.Meta_Valor || 0);
      const p = metaValor ? (valorAtual / metaValor) * 100 : 0;
      const barWidth = Math.max(0, Math.min(p, 100));
      const barColor = valorAtual < 0 ? 'var(--danger)' : i.Cor;
      container.innerHTML += `
        <div class="card" style="border-top: 4px solid ${i.Cor}">
          <div class="card-header">
            <div style="display:flex; align-items:center; gap:10px;">
              <i data-lucide="${i.Icone || 'trending-up'}" style="width:18px;height:18px;margin-right:5px;vertical-align:bottom;"></i>
              <span class="card-title">${i.Nome}</span>
            </div>
            <div style="display:flex; gap:5px;">
              <button class="icon-btn" onclick="app.abrirAporte('${i.ID}')" title="Aporte/Resgate"><i data-lucide="arrow-right-left"></i></button>
              <button class="icon-btn" onclick="app.editarInvestimento('${i.ID}')" title="Editar Investimento"><i data-lucide="pencil"></i></button>
              <button class="icon-btn" onclick="app.excluirInvestimento('${i.ID}')" title="Excluir Investimento"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="card-balance"><span class="valor-monetario">${this.formatarMoeda(valorAtual)}</span></div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">Meta: <span class="valor-monetario">${this.formatarMoeda(metaValor)}</span></div>
          <div style="width:100%; height:8px; background:var(--bg-app); border-radius:4px; overflow:hidden;">
            <div style="width:${barWidth}%; height:100%; background:${barColor}; transition:width 0.3s;"></div>
          </div>
          <div style="text-align:right; font-size:0.75rem; margin-top:5px;">${p.toFixed(1)}% alcançado</div>
        </div>
      `;
    });
    lucide.createIcons();
  },

  obterMovsFaturaCartao(cartaoId, mes) {
    return this.data.movimentacoes
      .filter(m => String(m.ID_Cartao) === String(cartaoId))
      .filter(m => String(m.Data).substring(0, 7) === String(mes))
      .sort((a, b) => new Date(a.Data).getTime() - new Date(b.Data).getTime());
  },

  isMovimentacaoFaturaPagamento(mov) {
    const desc = String(mov.Descricao || '').toLowerCase();
    return desc.includes('pagamento de fatura') || 
           desc.includes('pagamento da fatura') ||
           desc.includes('antecipa') || 
           desc.includes('antecipacao');
  },

  calcularTotalFaturaCartao(cartaoId, mes) {
    const movs = this.obterMovsFaturaCartao(cartaoId, mes);
    const compras = movs.filter(m => m.Tipo === 'SAIDA' && !this.isMovimentacaoFaturaPagamento(m) && String(m.Status).toUpperCase() !== 'PAGO');
    const pagamentos = movs.filter(m => this.isMovimentacaoFaturaPagamento(m));
    const totalCompras = compras.reduce((acc, m) => acc + Number(m.Valor || 0), 0);
    const totalPagamentos = pagamentos.reduce((acc, m) => acc + Number(m.Valor || 0), 0);
    return Math.max(0, totalCompras - totalPagamentos);
  },

  popularMesesFatura(selectEl, valorPadrao = '') {
    if (!selectEl) return;

    const now = new Date();
    const options = [];
    
    // Começa 6 meses atrás e vai até 12 meses no futuro para cobrir faturas passadas e futuras
    for (let i = -6; i <= 12; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const val = `${y}-${m}`;
      const label = `${m}/${y}`;
      options.push(`<option value="${val}">${label}</option>`);
    }

    selectEl.innerHTML = options.join('');
    
    if (valorPadrao) {
      selectEl.value = valorPadrao;
    } else {
      selectEl.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  },

  renderCartoes() {
    const container = document.getElementById('lista-cartoes');
    if (!container) return;
    container.innerHTML = '';
    const selectedMonth = document.getElementById('filtro-fatura-mes')?.value || new Date().toISOString().substring(0, 7);

    this.data.cartoes.forEach(c => {
      container.innerHTML += `
        <div class="card" style="border-top: 4px solid ${c.Cor}">
          <div class="card-header">
            <span class="card-title">${c.Nome}</span>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <button class="btn btn-small" onclick="app.abrirModalPagamentoCartao('${c.ID}', 'pagar')" title="Pagar Fatura" style="padding:6px 10px; font-size:0.75rem;">
                PAGAR
              </button>
              <button class="btn btn-small" onclick="app.abrirModalPagamentoCartao('${c.ID}', 'antecipar')" title="Antecipar Fatura" style="padding:6px 10px; font-size:0.75rem;">
                Antecipar
              </button>
              <button class="icon-btn" onclick="app.abrirAjusteLimite('${c.ID}')" title="Ajustar Limite do Cartão" style="color: var(--primary-color);">
                <i data-lucide="sliders-horizontal"></i>
              </button>
              <button class="icon-btn" onclick="app.editarCartao('${c.ID}')" title="Editar Cartão"><i data-lucide="pencil"></i></button>
              <button class="icon-btn" onclick="app.excluirCartao('${c.ID}')" title="Excluir Cartão"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div style="font-size:0.9rem; margin-bottom:5px;">Limite: <strong><span class="valor-monetario">${this.formatarMoeda(c.Limite)}</span></strong></div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">Fecha dia ${c.Dia_Fechamento} | Vence dia ${c.Dia_Vencimento}</div>
          <div style="margin-top:8px; font-size:0.95rem;">
            <span style="color:var(--text-secondary); margin-right:8px;">Fatura (${selectedMonth.replace('-', '/')})</span>
            <strong style="cursor:pointer;" onclick="app.abrirFaturaCartao('${c.ID}')"><span class="valor-monetario" id="cartao-fatura-${c.ID}">...</span></strong>
          </div>
        </div>
      `;
    });
    lucide.createIcons();

    // Preencher os valores de fatura por cartão (assíncrono mas rápido)
    this.data.cartoes.forEach(c => {
      const total = this.calcularTotalFaturaCartao(c.ID, selectedMonth);
      const el = document.getElementById(`cartao-fatura-${c.ID}`);
      if (el) el.innerText = this.formatarMoeda(total);
    });
  },

  preencherSelects() {
    const contasEReservas = [
      ...this.data.contas.map(c => ({ ID: c.ID, Nome: c.Nome, Grupo: 'Conta' })),
      ...this.data.reservas.map(r => ({ ID: r.ID, Nome: `(Reserva) ${r.Nome}`, Grupo: 'Reserva' }))
    ];

    const htmlContas = contasEReservas.map(c => `<option value="${c.ID}">${c.Nome}</option>`).join('');
    
    const sConta = document.getElementById('lanc-conta');
    if (sConta) sConta.innerHTML = htmlContas;
    
    const sCat = document.getElementById('lanc-categoria');
    const allCatHtml = this.data.categorias.map(c => `<option value="${c.Nome}">${c.Nome}</option>`).join('');
    if (sCat) sCat.innerHTML = allCatHtml;

    const htmlCartoes = '<option value="">Nenhum</option>' + this.data.cartoes.map(c => `<option value="${c.ID}">${c.Nome}</option>`).join('');
    const sCartao1 = document.getElementById('lanc-cartao');
    if (sCartao1) sCartao1.innerHTML = htmlCartoes;
    const sCartao2 = document.getElementById('edit-cartao');
    if (sCartao2) sCartao2.innerHTML = htmlCartoes;

    const fCartao = document.getElementById('filtro-cartao');
    if (fCartao) fCartao.innerHTML = '<option value="todos">Todos os Cartões</option>' + this.data.cartoes.map(c => `<option value="${c.ID}">${c.Nome}</option>`).join('');

    // Novos selects para transferencia, edicao e aporte
    const arr = [
      'transf-conta-origem', 'transf-conta-destino', 'edit-conta', 'aporte-conta', 'cartao-conta', 'edit-cartao-conta', 'limite-conta', 'pagamento-cartao-conta'
    ];
    arr.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = htmlContas;
    });

    const arrCat = ['transf-categoria', 'edit-categoria'];
    arrCat.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = sCat.innerHTML;
    });

    // Garantir que os selects de categoria do formulário de lançamento e edição
    // mostrem apenas categorias do tipo correspondente (Entrada -> RECEITA, Saída -> DESPESA)
    const lancTipoVal = document.getElementById('lanc-tipo')?.value || 'SAIDA';
    const editTipoVal = document.getElementById('edit-tipo')?.value || 'SAIDA';
    this.atualizarCategoriasParaSelect('lanc-categoria', lancTipoVal);
    this.atualizarCategoriasParaSelect('edit-categoria', editTipoVal);

    // Filtros
    const fConta = document.getElementById('filtro-conta');
    if (fConta) fConta.innerHTML = '<option value="todas">Todas as Contas</option>' + htmlContas;
    
    const fCat = document.getElementById('filtro-categoria');
    if (fCat) fCat.innerHTML = '<option value="todas">Todas Categorias</option>' + sCat.innerHTML;

    // Popula filtro de mês das faturas (próximos 12 meses)
    const selMes = document.getElementById('filtro-fatura-mes');
    if (selMes) {
      this.popularMesesFatura(selMes);
    }

    const selMesPagamento = document.getElementById('pagamento-cartao-data');
    if (selMesPagamento) {
      this.popularMesesFatura(selMesPagamento);
    }

    // Datas padrao do filtro (Primeiro e ultimo dia do mes)
    const d = new Date();
    const dia1 = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().substring(0,10);
    const diaU = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().substring(0,10);

    const fDataIni = document.getElementById('filtro-data-inicio');
    const fDataFim = document.getElementById('filtro-data-fim');
    if (fDataIni && !fDataIni.value) {
      fDataIni.value = dia1;
      fDataFim.value = diaU;
    }
    
    const dashDataIni = document.getElementById('dash-data-inicio');
    const dashDataFim = document.getElementById('dash-data-fim');
    if (dashDataIni && !dashDataIni.value) {
      dashDataIni.value = dia1;
      dashDataFim.value = diaU;
    }
  },

  atualizarCategoriasParaSelect(selectId, tipoLanc) {
    const mapTipo = tipoLanc === 'ENTRADA' ? 'RECEITA' : 'DESPESA';
    const el = document.getElementById(selectId);
    if (!el) return;
    const opts = this.data.categorias
      .filter(c => String(c.Tipo).toUpperCase() === mapTipo)
      .map(c => `<option value="${c.Nome}">${c.Nome}</option>`)
      .join('');
    el.innerHTML = opts || '<option value="">Nenhuma categoria disponível</option>';
  },

  // ── AÇÕES ──
  salvarConta() {
    const btn = document.querySelector('#form-conta button[type="submit"]');
    btn.disabled = true; btn.innerText = 'Salvando...';

    const payload = {
      acao: 'criar_conta',
      dados: {
        Nome: document.getElementById('conta-nome').value,
        Saldo_Inicial: document.getElementById('conta-saldo-inicial').value
      }
    };

    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.fecharModal('modal-conta');
      document.getElementById('form-conta').reset();
      this.carregarDadosIniciais(); // Recarrega tudo
    }).catch(err => {
      this.mostrarToast(err, 'error');
    }).finally(() => {
      btn.disabled = false; btn.innerText = 'Salvar Conta';
    });
  },

  editarConta(id) {
    const conta = this.data.contas.find(c => c.ID === id);
    if (!conta) return;
    document.getElementById('edit-conta-id').value = conta.ID;
    document.getElementById('edit-conta-nome').value = conta.Nome;
    document.getElementById('edit-conta-saldo-inicial').value = conta.Saldo_Inicial || conta.Saldo_Atual || 0;
    // Preencher cor
    const cor = conta.Cor || '#3b82f6';
    const corInput = document.getElementById('edit-conta-cor');
    const corPreview = document.getElementById('edit-conta-cor-preview');
    const corHex = document.getElementById('edit-conta-cor-hex');
    if (corInput) corInput.value = cor;
    if (corPreview) corPreview.style.background = cor;
    if (corHex) corHex.innerText = cor;
    this.abrirModal('modal-conta-editar');
  },

  salvarEdicaoConta() {
    const btn = document.querySelector('#form-conta-editar button[type="submit"]');
    btn.disabled = true; btn.innerText = 'Salvando...';
    const id = document.getElementById('edit-conta-id').value;
    const payload = {
      acao: 'atualizar_conta',
      id,
      dados: {
        Nome: document.getElementById('edit-conta-nome').value,
        Saldo_Inicial: document.getElementById('edit-conta-saldo-inicial').value,
        Cor: document.getElementById('edit-conta-cor').value
      }
    };

    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.fecharModal('modal-conta-editar');
      this.carregarDadosIniciais();
    }).catch(err => {
      this.mostrarToast(err, 'error');
    }).finally(() => {
      btn.disabled = false; btn.innerText = 'Salvar Alterações';
    });
  },

  excluirConta(id) {
    if (!confirm('Excluir esta conta permanentemente?')) return;
    this.requestEscrita({ acao: 'excluir_conta', id }).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  salvarLancamento() {
    const btn = document.querySelector('#form-lancamento button[type="submit"]');
    btn.disabled = true; btn.innerText = 'Salvando...';

    // Se tiver calculadora no input, força o cálculo final
    this.calcularExpressao(document.getElementById('lanc-valor'));

    const descricao = document.getElementById('lanc-descricao').value.trim();
    const catSelect = document.getElementById('lanc-categoria');
    const categoriaNome = catSelect.options[catSelect.selectedIndex]?.text || '';
    
    // KM como campo separado — NAO mistura com a descricao
    const kmValor = (categoriaNome.toUpperCase() === 'CARRO')
      ? (document.getElementById('lanc-km')?.value.trim() || '')
      : '';

    const payload = {
      acao: 'registrar_movimentacao',
      dados: {
        Tipo: document.getElementById('lanc-tipo').value,
        Data: document.getElementById('lanc-data').value,
        Descricao: descricao,
        Valor: document.getElementById('lanc-valor').value,
        ID_Conta_Origem: document.getElementById('lanc-conta').value,
        Categoria: document.getElementById('lanc-categoria').value,
        Status: document.getElementById('lanc-status').value,
        ID_Cartao: document.getElementById('lanc-cartao').value,
        Parcelas: document.getElementById('lanc-parcelas').value,
        KM: kmValor
      }
    };

    // Ajustar se a "Conta" selecionada for na verdade uma Reserva
    const contaSel = document.getElementById('lanc-conta').value;
    if (contaSel.startsWith('RSV-')) {
      payload.dados.ID_Reserva = contaSel;
      payload.dados.ID_Conta_Origem = '';
    }

    // UX Otimizado: Fecha modal imediatamente, reseta formulário e simula sucesso instantâneo
    this.fecharModal('modal-lancamento');
    document.getElementById('form-lancamento').reset();
    document.getElementById('grupo-km').style.display = 'none';
    this.mostrarToast('Sincronizando com a nuvem...', 'info');
    
    // Libera o botão silenciosamente
    btn.disabled = false; btn.innerText = 'Salvar Lançamento';

    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem || 'Salvo com sucesso!', 'success');
      this.carregarDadosIniciais(); // Recarrega silenciosamente em background
    }).catch(err => {
      this.mostrarToast('Erro ao salvar: ' + err, 'error');
    });
  },

  editarLancamento(id) {
    const mov = this.data.movimentacoes.find(m => m.ID === id);
    if (!mov) return;
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-tipo').value = mov.Tipo;
    document.getElementById('edit-data').value = mov.Data ? mov.Data.substring(0, 10) : '';
    document.getElementById('edit-descricao').value = mov.Descricao;
    document.getElementById('edit-valor').value = mov.Valor;
    document.getElementById('edit-conta').value = mov.ID_Conta_Origem || mov.ID_Reserva || '';
    // Repopula o select de categoria conforme o Tipo antes de selecionar o valor
    this.atualizarCategoriasParaSelect('edit-categoria', mov.Tipo);
    document.getElementById('edit-categoria').value = mov.Categoria;
    document.getElementById('edit-status').value = String(mov.Status).toUpperCase();
    document.getElementById('edit-cartao').value = mov.ID_Cartao || '';
    document.getElementById('edit-parcelas').value = mov.Parcela_Info || '1';
    this.abrirModal('modal-lancamento-editar');
  },

  salvarEdicaoLancamento() {
    const btn = document.querySelector('#form-lancamento-editar button[type="submit"]');
    btn.disabled = true; btn.innerText = 'Salvando...';

    const id = document.getElementById('edit-id').value;
    const payload = {
      acao: 'atualizar_movimentacao',
      id: id,
      dados: {
        Tipo: document.getElementById('edit-tipo').value,
        Data: document.getElementById('edit-data').value,
        Descricao: document.getElementById('edit-descricao').value,
        Valor: document.getElementById('edit-valor').value,
        ID_Conta_Origem: document.getElementById('edit-conta').value,
        Categoria: document.getElementById('edit-categoria').value,
        Status: document.getElementById('edit-status').value,
        ID_Cartao: document.getElementById('edit-cartao').value
      }
    };

    const contaSel = document.getElementById('edit-conta').value;
    if (contaSel.startsWith('RSV-')) {
      payload.dados.ID_Reserva = contaSel;
      payload.dados.ID_Conta_Origem = '';
    } else {
      payload.dados.ID_Reserva = '';
    }

    // UX Otimizado: Fecha modal imediatamente e simula sucesso instantâneo
    this.fecharModal('modal-lancamento-editar');
    this.mostrarToast('Sincronizando edição com a nuvem...', 'info');
    
    btn.disabled = false; btn.innerText = 'Salvar Alterações';

    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.carregarDadosIniciais();
    }).catch(err => {
      this.mostrarToast('Erro ao salvar: ' + err, 'error');
    });
  },

  salvarTransferencia() {
    const btn = document.querySelector('#form-transferencia button[type="submit"]');
    if (!btn) return;
    btn.disabled = true; btn.innerText = 'Processando...';

    const desc = document.getElementById('transf-descricao').value;
    const valor = document.getElementById('transf-valor').value;
    const cat = document.getElementById('transf-categoria').value;

    const origem = document.getElementById('transf-conta-origem').value;
    const destino = document.getElementById('transf-conta-destino').value;

    // Reservas/Investimentos não são linhas da aba CONTAS: o saldo delas só é
    // atualizado quando a movimentação traz ID_Reserva preenchido, usando o
    // mesmo Tipo relativo à conta que o fluxo de Aporte usa (SAIDA = dinheiro
    // saindo da conta para dentro da reserva/investimento = credita o alvo;
    // ENTRADA = dinheiro voltando para a conta = debita o alvo).
    const ehReservaOuInvestimento = (id) => {
      const s = String(id || '');
      return s.startsWith('RSV_') || s.startsWith('RSV') || s.startsWith('INV_') || s.startsWith('INV');
    };

    const dadosSaida = {
      Tipo: 'SAIDA',
      Data: document.getElementById('transf-data-origem').value,
      Descricao: desc,
      Valor: valor,
      ID_Conta_Origem: origem,
      ID_Conta_Destino: destino,
      Categoria: 'Transferência',
      Status: document.getElementById('transf-status-origem').value
    };
    if (ehReservaOuInvestimento(origem)) {
      dadosSaida.Tipo = 'ENTRADA';
      dadosSaida.ID_Reserva = origem;
    }
    const payloadSaida = { acao: 'registrar_movimentacao', dados: dadosSaida };

    const dadosEntrada = {
      Tipo: 'ENTRADA',
      Data: document.getElementById('transf-data-destino').value,
      Descricao: desc,
      Valor: valor,
      ID_Conta_Origem: destino,
      ID_Conta_Destino: origem,
      Categoria: 'Transferência',
      Status: document.getElementById('transf-status-destino').value
    };
    if (ehReservaOuInvestimento(destino)) {
      dadosEntrada.Tipo = 'SAIDA';
      dadosEntrada.ID_Reserva = destino;
    }
    const payloadEntrada = { acao: 'registrar_movimentacao', dados: dadosEntrada };

    // Primeiro salva a saída, depois a entrada
    this.requestEscrita(payloadSaida)
      .then(() => {
        return this.requestEscrita(payloadEntrada);
      })
      .then(() => {
        this.mostrarToast('Transferência realizada com sucesso!', 'success');
        this.fecharModal('modal-transferencia');
        document.getElementById('form-transferencia').reset();
        this.carregarDadosIniciais();
      })
      .catch(err => {
        this.mostrarToast(err, 'error');
      })
      .finally(() => {
        btn.disabled = false; btn.innerText = 'Realizar Transferência';
      });
  },

  excluirMovimentacao(id) {
    if(!confirm('Tem certeza que deseja excluir este lançamento?')) return;
    this.requestEscrita({ acao: 'excluir_movimentacao', id }).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  editarCartao(id) {
    const cartao = this.data.cartoes.find(c => c.ID === id);
    if (!cartao) return;
    document.getElementById('edit-cartao-id').value = cartao.ID;
    document.getElementById('edit-cartao-nome').value = cartao.Nome;
    document.getElementById('edit-cartao-limite').value = cartao.Limite;
    document.getElementById('edit-cartao-cor').value = cartao.Cor || '#8b5cf6';
    document.getElementById('edit-cartao-fechamento').value = cartao.Dia_Fechamento;
    document.getElementById('edit-cartao-vencimento').value = cartao.Dia_Vencimento;
    document.getElementById('edit-cartao-conta').value = cartao.ID_Conta_Pagamento || '';
    this.abrirModal('modal-cartao-editar');
  },

  salvarEdicaoCartao() {
    const btn = document.querySelector('#form-cartao-editar button[type="submit"]');
    btn.disabled = true; btn.innerText = 'Salvando...';
    const id = document.getElementById('edit-cartao-id').value;
    const payload = {
      acao: 'atualizar_cartao',
      id,
      dados: {
        Nome: document.getElementById('edit-cartao-nome').value,
        Limite: document.getElementById('edit-cartao-limite').value,
        Cor: document.getElementById('edit-cartao-cor').value,
        Dia_Fechamento: document.getElementById('edit-cartao-fechamento').value,
        Dia_Vencimento: document.getElementById('edit-cartao-vencimento').value,
        ID_Conta_Pagamento: document.getElementById('edit-cartao-conta').value
      }
    };

    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.fecharModal('modal-cartao-editar');
      this.carregarDadosIniciais();
    }).catch(err => {
      this.mostrarToast(err, 'error');
    }).finally(() => {
      btn.disabled = false; btn.innerText = 'Salvar Alterações';
    });
  },

  // --- CATEGORIAS ---
  salvarCategoria() {
    const id = document.getElementById('cat-id').value;
    const payload = {
      acao: id ? 'atualizar_categoria' : 'criar_categoria',
      id: id || undefined,
      dados: {
        Nome: document.getElementById('cat-nome').value,
        Tipo: document.getElementById('cat-tipo').value,
        Cor: document.getElementById('cat-cor').value,
        Icone: document.getElementById('cat-icone').value
      }
    };
    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.fecharModal('modal-categoria');
      document.getElementById('form-categoria').reset();
      document.getElementById('cat-id').value = '';
      document.getElementById('titulo-modal-categoria').innerText = 'Nova Categoria';
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  editarCategoria(id) {
    const cat = this.data.categorias.find(c => c.ID === id);
    if (!cat) return;
    document.getElementById('cat-id').value = cat.ID;
    document.getElementById('cat-nome').value = cat.Nome;
    document.getElementById('cat-tipo').value = cat.Tipo;
    document.getElementById('cat-cor').value = cat.Cor;
    document.getElementById('cat-icone').value = cat.Icone;
    document.getElementById('titulo-modal-categoria').innerText = 'Editar Categoria';
    this.abrirModal('modal-categoria');
  },

  excluirCategoria(id) {
    if (!confirm('Excluir esta categoria? (Não excluirá os lançamentos já feitos)')) return;
    this.requestEscrita({ acao: 'excluir_categoria', id }).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  salvarReserva() {
    const id = document.getElementById('reserva-id').value;
    const isEdicao = !!id;
    const payload = {
      acao: isEdicao ? 'atualizar_reserva' : 'criar_reserva',
      id: isEdicao ? id : undefined,
      dados: {
        Nome:       document.getElementById('reserva-nome').value,
        Meta_Valor: document.getElementById('reserva-meta').value,
        Cor:        document.getElementById('reserva-cor').value,
        Icone:      document.getElementById('reserva-icone').value
      }
    };
    // Saldo inicial apenas na criação
    if (!isEdicao) {
      payload.dados.Valor_Atual = document.getElementById('reserva-saldo').value;
    }
    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.fecharModal('modal-reserva');
      document.getElementById('form-reserva').reset();
      document.getElementById('reserva-id').value = '';
      document.getElementById('titulo-modal-reserva').innerText = 'Nova Reserva (Meta)';
      document.getElementById('btn-salvar-reserva').innerText = 'Criar Reserva';
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  salvarInvestimento() {
    const btn = document.querySelector('#form-investimento button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Salvando...';
    }

    const investId = document.getElementById('investimento-id')?.value || '';
    const isEdicao = investId.trim() !== '';
    const payload = {
      acao: isEdicao ? 'atualizar_investimento' : 'criar_investimento',
      dados: {
        Nome: document.getElementById('investimento-nome').value,
        Valor_Atual: document.getElementById('investimento-valor-atual').value,
        Meta_Valor: document.getElementById('investimento-meta').value,
        Cor: document.getElementById('investimento-cor').value,
        Icone: document.getElementById('investimento-icone').value,
        Status: 'ATIVO'
      }
    };
    if (isEdicao) payload.id = investId;

    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem || 'Investimento salvo com sucesso!', 'success');
      this.fecharModal('modal-investimento');
      document.getElementById('form-investimento').reset();
      document.getElementById('investimento-id').value = '';
      const submitBtn = document.querySelector('#form-investimento button[type="submit"]');
      if (submitBtn) submitBtn.innerText = 'Salvar Investimento';
      document.getElementById('investimento-nome').blur();
      this.carregarDadosIniciais();
    }).catch(err => {
      this.mostrarToast(err, 'error');
    }).finally(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Salvar Investimento';
      }
    });
  },

  editarInvestimento(id) {
    const inv = this.data.investimentos.find(x => x.ID === id);
    if (!inv) return;
    document.getElementById('investimento-id').value = inv.ID;
    document.getElementById('investimento-nome').value = inv.Nome || '';
    document.getElementById('investimento-valor-atual').value = inv.Valor_Atual || 0;
    document.getElementById('investimento-meta').value = inv.Meta_Valor || 0;
    document.getElementById('investimento-cor').value = inv.Cor || '#0284c7';
    document.getElementById('investimento-icone').value = inv.Icone || 'trending-up';
    document.querySelector('#form-investimento button[type="submit"]').innerText = 'Atualizar Investimento';
    this.abrirModal('modal-investimento');
  },

  excluirInvestimento(id) {
    if (!confirm('Excluir este investimento permanentemente?')) return;
    this.requestEscrita({ acao: 'excluir_investimento', id }).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  editarReserva(id) {
    const r = this.data.reservas.find(x => x.ID === id);
    if (!r) return;
    document.getElementById('reserva-id').value = r.ID;
    document.getElementById('reserva-nome').value = r.Nome;
    document.getElementById('reserva-meta').value = r.Meta_Valor || 0;
    document.getElementById('reserva-saldo').value = r.Valor_Atual || 0;
    document.getElementById('reserva-cor').value = r.Cor || '#10b981';
    document.getElementById('reserva-icone').value = r.Icone || 'piggy-bank';
    document.getElementById('titulo-modal-reserva').innerText = `Editar Reserva: ${r.Nome}`;
    document.getElementById('btn-salvar-reserva').innerText = 'Salvar Alterações';
    this.abrirModal('modal-reserva');
  },

  excluirReserva(id) {
    if (!confirm('Tem certeza que deseja excluir esta reserva permanentemente?')) return;
    this.requestEscrita({ acao: 'excluir_reserva', id }).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  abrirAporte(id) {
    const alvoTipo = id && (String(id).startsWith('INV_') || String(id).startsWith('INV')) ? 'Investimento' : 'Reserva';
    const titulo = `Aporte / Resgate — ${alvoTipo}`;
    document.getElementById('titulo-modal-aporte').innerText = titulo;
    document.getElementById('aporte-alvo-id').value = id;
    document.getElementById('aporte-data').value = new Date().toISOString().substring(0, 10);
    // Resetar tipo para primeiro valor e garantir que campo conta esteja visível
    const tipoEl = document.getElementById('aporte-tipo');
    if (tipoEl) tipoEl.value = 'SAIDA';
    this.onAporteTipoChange();
    this.abrirModal('modal-aporte');
  },

  onAporteTipoChange() {
    const tipo = document.getElementById('aporte-tipo')?.value;
    const contaGroup = document.getElementById('aporte-conta-group');
    const contaSelect = document.getElementById('aporte-conta');
    if (!contaGroup || !contaSelect) return;
    if (tipo === 'RENDIMENTO') {
      contaGroup.style.display = 'none';
      contaSelect.removeAttribute('required');
    } else {
      contaGroup.style.display = '';
      contaSelect.setAttribute('required', 'required');
    }
  },

  salvarAporte() {
    // Capturar todos os valores ANTES de fechar/resetar o modal
    const alvoId = document.getElementById('aporte-alvo-id').value;
    const tipo = document.getElementById('aporte-tipo').value;
    const data = document.getElementById('aporte-data').value;
    const valor = document.getElementById('aporte-valor').value;
    const contaId = document.getElementById('aporte-conta').value;

    const alvoTipo = alvoId && (String(alvoId).startsWith('INV_') || String(alvoId).startsWith('INV')) ? 'Investimento' : 'Reserva';
    const isRendimento = tipo === 'RENDIMENTO';

    let descricao;
    if (tipo === 'SAIDA') descricao = `Aporte em ${alvoTipo}`;
    else if (tipo === 'ENTRADA') descricao = `Resgate de ${alvoTipo}`;
    else descricao = `Rendimento em ${alvoTipo}`;

    // Fechar modal e resetar formulário imediatamente para eliminar o delay visual
    this.fecharModal('modal-aporte');
    document.getElementById('form-aporte').reset();
    this.onAporteTipoChange();

    const dados = {
      Tipo: isRendimento ? 'SAIDA' : tipo,
      Data: data,
      Descricao: descricao,
      Valor: valor,
      Categoria: isRendimento ? 'Rendimento' : 'Transferência',
      Status: 'PAGO',
      ID_Reserva: alvoId,
      Apenas_Reserva: isRendimento ? 'SIM' : 'NAO'
    };

    if (!isRendimento) {
      dados.ID_Conta_Origem = contaId;
    }

    const payload = { acao: 'registrar_movimentacao', dados };

    this.mostrarToast('Salvando...', 'info');
    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  // --- CARTÕES ---
  salvarCartao() {
    const payload = {
      acao: 'criar_cartao',
      dados: {
        Nome: document.getElementById('cartao-nome').value,
        Limite: document.getElementById('cartao-limite').value,
        Cor: document.getElementById('cartao-cor').value,
        Dia_Fechamento: document.getElementById('cartao-fechamento').value,
        Dia_Vencimento: document.getElementById('cartao-vencimento').value,
        ID_Conta_Pagamento: document.getElementById('cartao-conta').value
      }
    };
    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.fecharModal('modal-cartao');
      document.getElementById('form-cartao').reset();
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  excluirCartao(id) {
    if (!confirm('Excluir este cartão permanentemente?')) return;
    this.requestEscrita({ acao: 'excluir_cartao', id }).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  // ── AJUSTE DE LIMITE DO CARTÃO ──
  abrirAjusteLimite(id) {
    const cartao = this.data.cartoes.find(c => c.ID === id);
    if (!cartao) return;
    document.getElementById('limite-cartao-id').value = id;
    document.getElementById('limite-data').value = new Date().toISOString().substring(0, 10);
    document.getElementById('limite-atual-display').value = this.formatarMoeda(cartao.Limite);
    document.getElementById('titulo-modal-limite').innerText = `Ajustar Limite — ${cartao.Nome}`;
    document.getElementById('limite-valor').value = '';
    this.abrirModal('modal-limite-cartao');
  },

  abrirModalPagamentoCartao(cardId, modo) {
    const cartao = this.data.cartoes.find(c => String(c.ID) === String(cardId));
    if (!cartao) return;

    const selMonth = document.getElementById('filtro-fatura-mes')?.value || new Date().toISOString().substring(0, 7);
    const totalFatura = this.calcularTotalFaturaCartao(cardId, selMonth);

    document.getElementById('pagamento-cartao-id').value = cardId;
    document.getElementById('pagamento-cartao-modo').value = modo;
    document.getElementById('pagamento-cartao-titulo').innerText = modo === 'pagar'
      ? `Pagar fatura — ${cartao.Nome}`
      : `Antecipar fatura — ${cartao.Nome}`;
    document.getElementById('pagamento-cartao-valor').value = modo === 'pagar' ? totalFatura.toFixed(2) : '';
    const selectMes = document.getElementById('pagamento-cartao-data');
    if (selectMes) this.popularMesesFatura(selectMes, selMonth);
    document.getElementById('pagamento-cartao-total').value = this.formatarMoeda(totalFatura);
    this.abrirModal('modal-pagamento-cartao');
  },

  formatarDataParaComparacao(dataVal) {
    if (!dataVal) return '';
    let d = String(dataVal).trim();
    // Se for formato ISO completo (YYYY-MM-DDTHH:mm:ss...)
    if (d.includes('T')) d = d.split('T')[0];
    // Se for YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
      return d.substring(0, 10);
    }
    // Se for DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}/.test(d)) {
      const p = d.split('/');
      return `${p[2]}-${p[1]}-${p[0]}`;
    }
    return d;
  },


  async salvarPagamentoCartao() {
    const btn = document.querySelector('#form-pagamento-cartao button[type="submit"]');
    if (!btn) return;
    btn.disabled = true; btn.innerText = 'Processando...';

    const cartaoId = document.getElementById('pagamento-cartao-id').value;
    const modo = document.getElementById('pagamento-cartao-modo').value;
    const valor = parseFloat(document.getElementById('pagamento-cartao-valor').value);
    const mesFatura = document.getElementById('pagamento-cartao-data').value; // Formato YYYY-MM
    const contaSelecionada = document.getElementById('pagamento-cartao-conta').value;
    const cartao = this.data.cartoes.find(c => String(c.ID) === String(cartaoId));

    if (!cartao) {
      this.mostrarToast('Cartão não encontrado.', 'error');
      btn.disabled = false; btn.innerText = 'Confirmar';
      return;
    }

    // Validação obrigatória do mês
    if (!mesFatura || !/^\d{4}-\d{2}$/.test(mesFatura)) {
      this.mostrarToast('Selecione o mês da fatura antes de pagar.', 'warning');
      btn.disabled = false; btn.innerText = 'Confirmar';
      return;
    }

    try {
      if (modo === 'pagar') {
        const movsDoMes = this.data.movimentacoes.filter(m => {
          const idCartaoMatch = String(m.ID_Cartao) === String(cartaoId);
          const dataISO = this.formatarDataParaComparacao(m.Data);
          const mesMov = dataISO.substring(0, 7); // Pega YYYY-MM
          const mesMatch = mesMov === mesFatura;
          const naoEhPagamento = !this.isMovimentacaoFaturaPagamento(m);
          const pendente = String(m.Status).toUpperCase() !== 'PAGO';
          return idCartaoMatch && mesMatch && naoEhPagamento && pendente;
        });

        if (movsDoMes.length === 0) {
          this.mostrarToast('Nenhum item pendente encontrado para o mês selecionado.', 'warning');
          btn.disabled = false; btn.innerText = 'Confirmar';
          return;
        }

        const dadosUpdate = { Status: 'PAGO' };
        if (String(contaSelecionada).startsWith('RSV_') || String(contaSelecionada).startsWith('RSV')) {
          dadosUpdate.ID_Reserva = contaSelecionada;
          dadosUpdate.ID_Conta_Origem = '';
        } else {
          dadosUpdate.ID_Conta_Origem = contaSelecionada;
          dadosUpdate.ID_Reserva = '';
        }

        await this.requestEscrita({
          acao: 'atualizar_movimentacao_lote',
          ids: movsDoMes.map(m => m.ID),
          mes: mesFatura,   // Filtro de mês: impede que parcelas futuras com mesmo ID base sejam afetadas
          dados: dadosUpdate
        });
      } else {
        // modo === 'antecipar'
        const hoje = new Date().toISOString().substring(0, 10);
        // Garante que o lançamento seja registrado no mês selecionado no modal (mesFatura é YYYY-MM)
        const dataLancamento = (mesFatura === hoje.substring(0, 7)) ? hoje : `${mesFatura}-01`;

        const descricao = `Antecipação de fatura — ${cartao.Nome}`;
        const payload = {
          acao: 'registrar_movimentacao',
          dados: {
            Tipo: 'SAIDA',
            Data: dataLancamento,
            Descricao: descricao,
            Valor: valor,
            Categoria: 'Cartão de Crédito',
            Status: 'PAGO',
            ID_Cartao: cartaoId
          }
        };

        if (String(contaSelecionada).startsWith('RSV_') || String(contaSelecionada).startsWith('RSV')) {
          payload.dados.ID_Reserva = contaSelecionada;
        } else {
          payload.dados.ID_Conta_Origem = contaSelecionada;
        }

        await this.requestEscrita(payload);
      }

      this.mostrarToast(modo === 'pagar' ? 'Fatura paga com sucesso!' : 'Antecipação registrada com sucesso!', 'success');
      this.fecharModal('modal-pagamento-cartao');
      document.getElementById('form-pagamento-cartao').reset();
      this.carregarDadosIniciais();
    } catch (err) {
      this.mostrarToast(err, 'error');
    } finally {
      btn.disabled = false; btn.innerText = 'Confirmar';
    }
  },

  abrirFaturaCartao(cardId) {
    const selMonth = document.getElementById('filtro-fatura-mes')?.value || new Date().toISOString().substring(0, 7);
    const cartao = this.data.cartoes.find(c => String(c.ID) === String(cardId));
    if (!cartao) return;
    const movs = this.obterMovsFaturaCartao(cardId, selMonth);

    const titulo = `${cartao.Nome} — Fatura ${selMonth.replace('-', '/')}`;
    document.getElementById('modal-fatura-titulo').innerText = titulo;

    const conteudo = document.getElementById('modal-fatura-conteudo');
    if (!conteudo) return;
    if (movs.length === 0) {
      conteudo.innerHTML = '<div style="padding:8px; color:var(--text-secondary)">Nenhuma transação encontrada para este mês.</div>';
    } else {
      const rows = movs.map(m => {
        const isPagamento = this.isMovimentacaoFaturaPagamento(m);
        const valor = Number(m.Valor || 0);
        const valorExibido = isPagamento ? -valor : valor;
        return `
          <tr>
            <td style="padding:8px 12px">${this.formatarData(m.Data)}</td>
            <td style="padding:8px 12px">${m.Descricao}</td>
            <td style="padding:8px 12px; text-align:right; ${isPagamento ? 'color:var(--success); font-weight:600;' : ''}">${isPagamento ? '-' : ''}${this.formatarMoeda(Math.abs(valorExibido))}</td>
          </tr>
        `;
      }).join('');
      const total = this.calcularTotalFaturaCartao(cardId, selMonth);
      conteudo.innerHTML = `
        <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:600">${cartao.Nome}</div>
          <div style="font-size:1rem; font-weight:700">Total: ${this.formatarMoeda(total)}</div>
        </div>
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr><th style="text-align:left; padding:8px 12px; color:var(--text-secondary)">Data</th><th style="text-align:left; padding:8px 12px; color:var(--text-secondary)">Descrição</th><th style="text-align:right; padding:8px 12px; color:var(--text-secondary)">Valor</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }

    this.abrirModal('modal-fatura');
  },

  salvarAjusteLimite() {
    const btn = document.querySelector('#form-limite-cartao button[type="submit"]');
    btn.disabled = true; btn.innerText = 'Salvando...';

    const cartaoId  = document.getElementById('limite-cartao-id').value;
    const tipo      = document.getElementById('limite-tipo').value;       // AUMENTAR | REDUZIR
    const valor     = parseFloat(document.getElementById('limite-valor').value);
    const data      = document.getElementById('limite-data').value;
    const contaId   = document.getElementById('limite-conta').value;

    if (!valor || valor <= 0) {
      this.mostrarToast('Informe um valor válido.', 'warning');
      btn.disabled = false; btn.innerText = 'Confirmar Ajuste';
      return;
    }

    const cartao = this.data.cartoes.find(c => c.ID === cartaoId);
    if (!cartao) return;

    const novoLimite = tipo === 'AUMENTAR'
      ? Number(cartao.Limite) + valor
      : Math.max(0, Number(cartao.Limite) - valor);

    // 1) Atualiza o limite do cartão
    const payloadCartao = {
      acao: 'atualizar_cartao',
      id: cartaoId,
      dados: { Limite: novoLimite }
    };

    // 2) Registra movimentação na conta bancária
    const tipoMov = tipo === 'AUMENTAR' ? 'SAIDA' : 'ENTRADA';
    const descMov = tipo === 'AUMENTAR'
      ? `Aumento de Limite — ${cartao.Nome}`
      : `Redução de Limite — ${cartao.Nome}`;

    const payloadMov = {
      acao: 'registrar_movimentacao',
      dados: {
        Tipo: tipoMov,
        Data: data,
        Descricao: descMov,
        Valor: valor,
        ID_Conta_Origem: contaId,
        Categoria: 'Cartão de Crédito',
        Status: 'PAGO'
      }
    };

    this.requestEscrita(payloadCartao)
      .then(() => this.requestEscrita(payloadMov))
      .then(() => {
        this.mostrarToast(`Limite ${tipo === 'AUMENTAR' ? 'aumentado' : 'reduzido'} com sucesso! Novo limite: ${this.formatarMoeda(novoLimite)}`, 'success');
        this.fecharModal('modal-limite-cartao');
        document.getElementById('form-limite-cartao').reset();
        this.carregarDadosIniciais();
      })
      .catch(err => this.mostrarToast(err, 'error'))
      .finally(() => {
        btn.disabled = false; btn.innerText = 'Confirmar Ajuste';
      });
  },

  // ── FLUXO — MARCAR EM LOTE ──
  obterMovsFiltrados() {
    const fTipo    = document.getElementById('filtro-tipo')?.value || 'todos';
    const fConta   = document.getElementById('filtro-conta')?.value || 'todas';
    const fStatus  = document.getElementById('filtro-status')?.value || 'todos';
    const fCat     = document.getElementById('filtro-categoria')?.value || 'todas';
    const fCartao  = document.getElementById('filtro-cartao')?.value || 'todos';
    const fDesc    = document.getElementById('filtro-descricao')?.value.toLowerCase() || '';
    let fDataIni   = document.getElementById('filtro-data-inicio')?.value || '';
    let fDataFim   = document.getElementById('filtro-data-fim')?.value || '';

    // Segurança: se nenhum filtro de data estiver definido, limita ao mês corrente
    // para evitar marcar TODOS os lançamentos históricos acidentalmente.
    if (!fDataIni && !fDataFim) {
      const hoje = new Date();
      fDataIni = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().substring(0, 10);
      fDataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().substring(0, 10);
    }

    let movs = [...this.data.movimentacoes];
    if (fTipo !== 'todos') movs = movs.filter(m => m.Tipo === fTipo);
    if (fConta !== 'todas') movs = movs.filter(m => m.ID_Conta_Origem === fConta || m.ID_Conta_Destino === fConta || m.ID_Reserva === fConta);
    if (fStatus !== 'todos') movs = movs.filter(m => String(m.Status).toUpperCase() === fStatus);
    if (fCat !== 'todas') movs = movs.filter(m => m.Categoria === fCat);
    if (fCartao !== 'todos') movs = movs.filter(m => String(m.ID_Cartao) === fCartao);
    if (fDesc) movs = movs.filter(m => String(m.Descricao).toLowerCase().includes(fDesc));
    if (fDataIni) movs = movs.filter(m => this.formatarDataParaComparacao(m.Data) >= fDataIni);
    if (fDataFim) movs = movs.filter(m => this.formatarDataParaComparacao(m.Data) <= fDataFim);
    return movs;
  },

  async marcarFiltradosComoPago() {
    const movs = this.obterMovsFiltrados();
    if (movs.length === 0) { this.mostrarToast('Nenhuma transação no filtro atual.', 'warning'); return; }
    if (!confirm(`Marcar ${movs.length} transação(ões) como PAGO?`)) return;

    const btn = document.getElementById('btn-pagar-filtro');
    if (btn) { btn.disabled = true; btn.innerText = 'Processando...'; }

    this.mostrarToast(`Atualizando ${movs.length} lançamentos...`, 'info');
    try {
      await this.requestEscrita({ 
        acao: 'atualizar_movimentacao_lote', 
        ids: movs.map(m => m.ID), 
        dados: { Status: 'PAGO' } 
      });
      this.mostrarToast(`${movs.length} transação(ões) marcadas como PAGO!`, 'success');
      this.carregarDadosIniciais();
    } catch (err) {
      this.mostrarToast('Erro ao atualizar: ' + err, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle"></i> PAGO'; lucide.createIcons(); }
    }
  },

  async marcarFiltradosComoPendente() {
    const movs = this.obterMovsFiltrados();
    if (movs.length === 0) { this.mostrarToast('Nenhuma transação no filtro atual.', 'warning'); return; }
    if (!confirm(`Desmarcar ${movs.length} transação(ões) para PENDENTE?`)) return;

    const btn = document.getElementById('btn-desmarcar-filtro');
    if (btn) { btn.disabled = true; btn.innerText = 'Processando...'; }

    this.mostrarToast(`Atualizando ${movs.length} lançamentos...`, 'info');
    try {
      await this.requestEscrita({ 
        acao: 'atualizar_movimentacao_lote', 
        ids: movs.map(m => m.ID), 
        dados: { Status: 'PENDENTE' } 
      });
      this.mostrarToast(`${movs.length} transação(ões) marcadas como PENDENTE!`, 'success');
      this.carregarDadosIniciais();
    } catch (err) {
      this.mostrarToast('Erro ao atualizar: ' + err, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="circle-slash"></i> DESMARCAR'; lucide.createIcons(); }
    }
  },

  // ── ALERTA DE E-MAIL ──
  salvarEmailAlerta() {
    const email = document.getElementById('input-email-alerta')?.value.trim();
    if (!email || !email.includes('@')) {
      this.mostrarToast('Informe um e-mail válido.', 'warning');
      return;
    }
    localStorage.setItem('fin_email_alerta', email);
    this.mostrarToast('Ativando alerta... isso pode levar alguns segundos.', 'info');

    this.requestEscrita({ acao: 'configurar_alerta_email', email })
      .then(res => {
        this.mostrarToast(res.mensagem || 'Alerta de e-mail ativado com sucesso!', 'success');
      })
      .catch(err => {
        const errorMsg = String(err);
        if (errorMsg.includes('ScriptApp.getProjectTriggers') || errorMsg.includes('getProjectTriggers')) {
          this.mostrarToast('Autorização pendente! Execute a função "autorizar" no Apps Script para permitir envios.', 'error');
        } else {
          this.mostrarToast('Erro ao configurar alerta: ' + errorMsg, 'error');
        }
      });
  },

  testarEmailAlerta() {
    const email = document.getElementById('input-email-alerta')?.value.trim();
    if (!email || !email.includes('@')) {
      this.mostrarToast('Informe um e-mail válido antes de testar.', 'warning');
      return;
    }
    this.mostrarToast('Enviando e-mail de teste... aguarde.', 'info');

    this.requestEscrita({ acao: 'testar_alerta_email', email })
      .then(res => {
        this.mostrarToast(res.mensagem || 'E-mail de teste enviado com sucesso!', 'success');
      })
      .catch(err => {
        const errorMsg = String(err);
        if (errorMsg.includes('ScriptApp.getProjectTriggers') || errorMsg.includes('getProjectTriggers')) {
          this.mostrarToast('Autorização pendente! Execute a função "autorizar" no Apps Script para permitir envios.', 'error');
        } else {
          this.mostrarToast('Erro ao enviar e-mail de teste: ' + errorMsg, 'error');
        }
      });
  },

  removerEmailAlerta() {
    if (!confirm('Desativar o alerta de e-mail diário?')) return;
    localStorage.removeItem('fin_email_alerta');
    const emailInput = document.getElementById('input-email-alerta');
    if (emailInput) emailInput.value = '';

    this.requestEscrita({ acao: 'remover_alerta_email' })
      .then(res => {
        this.mostrarToast(res.mensagem || 'Alerta de e-mail desativado!', 'success');
      })
      .catch(err => this.mostrarToast('Erro ao remover alerta: ' + err, 'error'));
  },

  verificarStatusEmail() {
    this.mostrarToast('Verificando status do alerta...', 'info');
    this.requestEscrita({ acao: 'verificar_status_email' })
      .then(res => {
        const autorizado = res.autorizado ? '✅ Autorizado' : '⚠️ NÃO autorizado';
        const trigger = res.triggerAtivo ? '✅ Trigger ativo' : '❌ Trigger inativo';
        const email = res.emailConfigurado ? `📧 ${res.emailConfigurado}` : '❌ Nenhum e-mail configurado';
        this.mostrarToast(`${email} | ${trigger} | ${autorizado}`, res.autorizado && res.triggerAtivo ? 'success' : 'warning');
      })
      .catch(err => {
        this.mostrarToast('Erro ao verificar status: ' + err, 'error');
      });
  },

  applyChartCompactMode() {
    document.body.classList.toggle('chart-compact', this.compactCharts);
    const btn = document.getElementById('btn-toggle-chart-size');
    if (btn) {
      btn.classList.toggle('btn-small', this.compactCharts);
      btn.innerHTML = `<i data-lucide="${this.compactCharts ? 'maximize-2' : 'minimize-2'}"></i> ${this.compactCharts ? 'Normalizar Gráficos' : 'Compactar Gráficos'}`;
      lucide.createIcons();
    }
  },

  toggleChartSize() {
    this.compactCharts = !this.compactCharts;
    this.applyChartCompactMode();
  },

  // ── FUNÇÕES AUXILIARES DE UX ──
  calcularExpressao(inputEl) {
    if (!inputEl || !inputEl.value) return;
    try {
      // Troca vírgula por ponto para cálculo e permite apenas matemática básica
      let val = inputEl.value.replace(',', '.');
      if (/^[0-9+\-*/.() ]+$/.test(val)) {
        let resultado = Function(`'use strict'; return (${val})`)();
        inputEl.value = Number(resultado).toFixed(2);
      }
    } catch (e) {
      // Expressão inválida, ignora
    }
  },

  verificarCategoriaCarro(selectEl, grupoKmId) {
    if (!selectEl) return;
    const nomeCat = selectEl.options[selectEl.selectedIndex]?.text || '';
    const divKm = document.getElementById(grupoKmId);
    if (divKm) {
      if (nomeCat.toUpperCase() === 'CARRO') {
        divKm.style.display = 'flex';
      } else {
        divKm.style.display = 'none';
        const inputKm = document.getElementById('lanc-km');
        if (inputKm) inputKm.value = '';
      }
    }
  }

};

window.onload = () => app.init();

