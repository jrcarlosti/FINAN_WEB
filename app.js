const API_URL_KEY = 'fin_api_url';
let SCRIPT_URL = localStorage.getItem(API_URL_KEY) || '';

const app = {
  data: {
    dashboard: null,
    contas: [],
    movimentacoes: [],
    categorias: [],
  },
  chartCategorias: null,
  chartEvolucao: null,
  chartContas: null,
  chartFluxoResumo: null,
  ordemDataAsc: true,

  init() {
    Chart.register(ChartDataLabels);
    lucide.createIcons();
    this.bindEvents();
    
    // Check config
    if (!SCRIPT_URL) {
      this.navegar('configuracoes');
      this.esconderSplash();
      this.mostrarToast('Por favor, configure a URL da API para começar.', 'warning');
      return;
    }
    
    // Load initial data
    this.carregarDadosIniciais();
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
    });
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
      'categorias': 'Categorias',
      'configuracoes': 'Configurações'
    };
    document.getElementById('page-title').innerText = titles[route] || 'FIN';

    if (route === 'configuracoes') {
      document.getElementById('input-api-url').value = SCRIPT_URL;
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
    } else if (id === 'modal-transferencia') {
      const fieldOrigem = document.getElementById('transf-data-origem');
      const fieldDest = document.getElementById('transf-data-destino');
      if (fieldOrigem) fieldOrigem.value = today;
      if (fieldDest) fieldDest.value = today;
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

    Promise.all([
      this.request('dashboard'),
      this.request('listar_contas'),
      this.request('listar_movimentacoes'),
      this.request('listar_categorias'),
      this.request('listar_cartoes'),
      this.request('listar_reservas')
    ]).then(([resDash, resContas, resMov, resCat, resCar, resRes]) => {
      this.data.dashboard = resDash.dados;
      this.data.contas = resContas.dados;
      this.data.movimentacoes = resMov.dados;
      this.data.categorias = resCat.dados;
      this.data.cartoes = resCar.dados;
      this.data.reservas = resRes.dados;
      
      this.preencherSelects();
      this.renderDashboard();
      this.renderContas();
      this.renderFluxo();
      this.renderCategorias();
      this.renderReservas();
      this.renderCartoes();
      
      this.esconderSplash();
    }).catch(err => {
      this.mostrarToast(err, 'error');
    }).finally(() => {
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

    movs.forEach(m => {
      if(m.Tipo === 'ENTRADA') totalReceitasMes += Number(m.Valor);
      else if(m.Tipo === 'SAIDA') {
         totalDespesasMes += Number(m.Valor);
         if (!despesasPorCategoria[m.Categoria]) despesasPorCategoria[m.Categoria] = 0;
         despesasPorCategoria[m.Categoria] += Number(m.Valor);
      }
      if (String(m.Status).toUpperCase() === 'PENDENTE') {
        pendentesCount++;
        pendentes.push(m);
      }
    });

    document.getElementById('kpi-saldo-geral').innerText = this.formatarMoeda(d.saldoGeralContas);
    document.getElementById('kpi-receitas').innerText = this.formatarMoeda(totalReceitasMes);
    document.getElementById('kpi-despesas').innerText = this.formatarMoeda(totalDespesasMes);
    document.getElementById('kpi-pendentes').innerText = pendentesCount;

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
      
      const labels = Object.keys(despesasPorCategoria);
      const values = Object.values(despesasPorCategoria);
      
      if(labels.length === 0) {
        labels.push('Sem despesas');
        values.push(1);
      }

      this.chartCategorias = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#64748b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { 
            legend: { position: 'right', labels: { color: 'var(--text-primary)' } },
            datalabels: {
              formatter: function(value) { return app.formatarMoeda(value); },
              color: '#fff',
              font: { weight: 'bold' },
              display: function(context) { return context.dataset.data[context.dataIndex] > 0; }
            }
          }
        }
      });
    }

    // Renderizar gráfico evolução
    const ctxEvolucao = document.getElementById('chart-evolucao');
    if (ctxEvolucao) {
      if (this.chartEvolucao) this.chartEvolucao.destroy();

      const mesesMap = {};
      movs.forEach(m => {
        if (!m.Data) return;
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

      this.chartEvolucao = new Chart(ctxEvolucao, {
        type: 'bar',
        data: {
          labels: labelsEvo,
          datasets: [
            { label: 'Receitas', data: dataRec, backgroundColor: '#10b981' },
            { label: 'Despesas', data: dataDes, backgroundColor: '#ef4444' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 30 } },
          plugins: { 
            legend: { labels: { color: 'var(--text-primary)' } },
            datalabels: {
              anchor: 'end',
              align: 'top',
              formatter: function(value) { return app.formatarMoeda(value); },
              color: 'var(--text-primary)',
              font: { size: 10 }
            }
          },
          scales: {
            x: { ticks: { color: 'var(--text-secondary)' }, grid: { color: 'var(--border-color)' } },
            y: { ticks: { color: 'var(--text-secondary)' }, grid: { color: 'var(--border-color)' } }
          }
        }
      });
    }
  },

  renderContas() {
    const container = document.getElementById('lista-contas');
    container.innerHTML = '';
    
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
            ${this.formatarMoeda(saldo)}
          </div>
          <div class="card-footer">
            <span>Banco: ${c.Banco || '-'}</span>
          </div>
        </div>
      `;
    });
    lucide.createIcons();
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
    if(fStatus !== 'todos') movs = movs.filter(m => String(m.Status).toUpperCase() === fStatus);
    if(fCat !== 'todas') movs = movs.filter(m => m.Categoria === fCat);
    if(fCartao !== 'todos') movs = movs.filter(m => String(m.ID_Cartao) === fCartao);
    if(fDesc) movs = movs.filter(m => String(m.Descricao).toLowerCase().includes(fDesc));
    if(fDataIni) movs = movs.filter(m => String(m.Data).substring(0, 10) >= fDataIni);
    if(fDataFim) movs = movs.filter(m => String(m.Data).substring(0, 10) <= fDataFim);

    // Sort by Date
    movs.sort((a, b) => {
      const da = new Date(a.Data).getTime();
      const db = new Date(b.Data).getTime();
      return this.ordemDataAsc ? da - db : db - da;
    });

    if(movs.length === 0) {
      container.innerHTML = `<tr><td colspan="9" style="text-align:center">Nenhum lançamento encontrado.</td></tr>`;
      return;
    }

    movs.forEach(m => {
      const conta = this.data.contas.find(c => c.ID === m.ID_Conta_Origem) || this.data.reservas.find(r => r.ID === m.ID_Reserva) || { Nome: '-' };
      const cartao = this.data.cartoes.find(c => c.ID === m.ID_Cartao) || { Nome: '-' };
      const valColor = m.Tipo === 'SAIDA' ? 'var(--danger)' : 'var(--success)';
      const sinal = m.Tipo === 'SAIDA' ? '-' : '+';
      
      let badgeStatus = m.Status === 'PENDENTE' ? 'warning' : 'success';

      container.innerHTML += `
        <tr>
          <td>${this.formatarData(m.Data)}</td>
          <td><strong>${m.Descricao}</strong></td>
          <td>${m.Categoria}</td>
          <td>${cartao.Nome !== '-' ? '<i data-lucide="credit-card" style="width:14px; margin-right:5px; vertical-align:bottom;"></i>'+cartao.Nome : '-'}</td>
          <td>${m.Parcela_Info || '-'}</td>
          <td>${conta.Nome}</td>
          <td style="color: ${valColor}; font-weight: 600;">${sinal} ${this.formatarMoeda(m.Valor)}</td>
          <td><span class="badge ${badgeStatus}">${m.Status}</span></td>
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
    // 1. Gráfico Contas Bancárias (Saldo)
    const ctxContas = document.getElementById('chart-contas-saldo');
    if (ctxContas) {
      if (this.chartContas) this.chartContas.destroy();
      
      const contasSorted = [...this.data.contas].sort((a, b) => Number(b.Saldo_Atual) - Number(a.Saldo_Atual));
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
              formatter: function(value) { return app.formatarMoeda(value); },
              color: 'var(--text-primary)',
              font: { size: 11, weight: '500' }
            }
          },
          scales: {
            x: { ticks: { color: 'var(--text-secondary)' } },
            y: { ticks: { color: 'var(--text-secondary)' } }
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
      
      movs.forEach(m => {
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
              formatter: function(value) { return app.formatarMoeda(value); },
              color: 'var(--text-primary)',
              font: { size: 11, weight: '500' }
            }
          },
          scales: {
            x: { ticks: { color: 'var(--text-secondary)' } },
            y: { ticks: { color: 'var(--text-secondary)' } }
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
              <button class="icon-btn" onclick="app.excluirReserva('${r.ID}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="card-balance">${this.formatarMoeda(valorAtual)}</div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">Meta: ${this.formatarMoeda(metaValor)}</div>
          <div style="width:100%; height:8px; background:var(--bg-app); border-radius:4px; overflow:hidden;">
            <div style="width:${barWidth}%; height:100%; background:${barColor}; transition:width 0.3s;"></div>
          </div>
          <div style="text-align:right; font-size:0.75rem; margin-top:5px;">${p.toFixed(1)}% alcançado</div>
        </div>
      `;
    });
    lucide.createIcons();
  },

  renderCartoes() {
    const container = document.getElementById('lista-cartoes');
    if (!container) return;
    container.innerHTML = '';
    this.data.cartoes.forEach(c => {
      container.innerHTML += `
        <div class="card" style="border-top: 4px solid ${c.Cor}">
          <div class="card-header">
            <span class="card-title">${c.Nome}</span>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="icon-btn" onclick="app.editarCartao('${c.ID}')" title="Editar Cartão"><i data-lucide="pencil"></i></button>
              <button class="icon-btn" onclick="app.excluirCartao('${c.ID}')" title="Excluir Cartão"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div style="font-size:0.9rem; margin-bottom:5px;">Limite: <strong>${this.formatarMoeda(c.Limite)}</strong></div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">Fecha dia ${c.Dia_Fechamento} | Vence dia ${c.Dia_Vencimento}</div>
        </div>
      `;
    });
    lucide.createIcons();
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
    if (sCat) sCat.innerHTML = this.data.categorias.map(c => `<option value="${c.Nome}">${c.Nome}</option>`).join('');

    const htmlCartoes = '<option value="">Nenhum</option>' + this.data.cartoes.map(c => `<option value="${c.ID}">${c.Nome}</option>`).join('');
    const sCartao1 = document.getElementById('lanc-cartao');
    if (sCartao1) sCartao1.innerHTML = htmlCartoes;
    const sCartao2 = document.getElementById('edit-cartao');
    if (sCartao2) sCartao2.innerHTML = htmlCartoes;

    const fCartao = document.getElementById('filtro-cartao');
    if (fCartao) fCartao.innerHTML = '<option value="todos">Todos os Cartões</option>' + this.data.cartoes.map(c => `<option value="${c.ID}">${c.Nome}</option>`).join('');

    // Novos selects para transferencia, edicao e aporte
    const arr = [
      'transf-conta-origem', 'transf-conta-destino', 'edit-conta', 'aporte-conta', 'cartao-conta', 'edit-cartao-conta'
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

    // Filtros
    const fConta = document.getElementById('filtro-conta');
    if (fConta) fConta.innerHTML = '<option value="todas">Todas as Contas</option>' + htmlContas;
    
    const fCat = document.getElementById('filtro-categoria');
    if (fCat) fCat.innerHTML = '<option value="todas">Todas Categorias</option>' + sCat.innerHTML;

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
        Saldo_Inicial: document.getElementById('edit-conta-saldo-inicial').value
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

    const payload = {
      acao: 'registrar_movimentacao',
      dados: {
        Tipo: document.getElementById('lanc-tipo').value,
        Data: document.getElementById('lanc-data').value,
        Descricao: document.getElementById('lanc-descricao').value,
        Valor: document.getElementById('lanc-valor').value,
        ID_Conta_Origem: document.getElementById('lanc-conta').value,
        Categoria: document.getElementById('lanc-categoria').value,
        Status: document.getElementById('lanc-status').value,
        ID_Cartao: document.getElementById('lanc-cartao').value,
        Parcelas: document.getElementById('lanc-parcelas').value
      }
    };

    // Ajustar se a "Conta" selecionada for na verdade uma Reserva
    const contaSel = document.getElementById('lanc-conta').value;
    if (contaSel.startsWith('RSV-')) {
      payload.dados.ID_Reserva = contaSel;
      payload.dados.ID_Conta_Origem = '';
    }

    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.fecharModal('modal-lancamento');
      document.getElementById('form-lancamento').reset();
      this.carregarDadosIniciais();
    }).catch(err => {
      this.mostrarToast(err, 'error');
    }).finally(() => {
      btn.disabled = false; btn.innerText = 'Salvar Lançamento';
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

    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.fecharModal('modal-lancamento-editar');
      this.carregarDadosIniciais();
    }).catch(err => {
      this.mostrarToast(err, 'error');
    }).finally(() => {
      btn.disabled = false; btn.innerText = 'Salvar Alterações';
    });
  },

  salvarTransferencia() {
    const btn = document.querySelector('#form-transferencia button[type="submit"]');
    if (!btn) return;
    btn.disabled = true; btn.innerText = 'Processando...';

    const desc = document.getElementById('transf-descricao').value;
    const valor = document.getElementById('transf-valor').value;
    const cat = document.getElementById('transf-categoria').value;

    const payloadSaida = {
      acao: 'registrar_movimentacao',
      dados: {
        Tipo: 'SAIDA',
        Data: document.getElementById('transf-data-origem').value,
        Descricao: desc,
        Valor: valor,
        ID_Conta_Origem: document.getElementById('transf-conta-origem').value,
        Categoria: cat,
        Status: document.getElementById('transf-status-origem').value
      }
    };

    const payloadEntrada = {
      acao: 'registrar_movimentacao',
      dados: {
        Tipo: 'ENTRADA',
        Data: document.getElementById('transf-data-destino').value,
        Descricao: desc,
        Valor: valor,
        ID_Conta_Origem: document.getElementById('transf-conta-destino').value,
        Categoria: cat,
        Status: document.getElementById('transf-status-destino').value
      }
    };

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

  // --- RESERVAS ---
  salvarReserva() {
    const payload = {
      acao: 'criar_reserva',
      dados: {
        Nome: document.getElementById('reserva-nome').value,
        Meta_Valor: document.getElementById('reserva-meta').value,
        Valor_Atual: document.getElementById('reserva-saldo').value,
        Cor: document.getElementById('reserva-cor').value,
        Icone: document.getElementById('reserva-icone').value
      }
    };
    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.fecharModal('modal-reserva');
      document.getElementById('form-reserva').reset();
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  excluirReserva(id) {
    if (!confirm('Tem certeza que deseja excluir esta reserva permanentemente?')) return;
    this.requestEscrita({ acao: 'excluir_reserva', id }).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.carregarDadosIniciais();
    }).catch(err => this.mostrarToast(err, 'error'));
  },

  abrirAporte(id) {
    document.getElementById('aporte-reserva-id').value = id;
    document.getElementById('aporte-data').value = new Date().toISOString().substring(0, 10);
    this.abrirModal('modal-aporte');
  },

  salvarAporte() {
    const reservaId = document.getElementById('aporte-reserva-id').value;
    const tipo = document.getElementById('aporte-tipo').value;
    const payload = {
      acao: 'registrar_movimentacao',
      dados: {
        Tipo: tipo,
        Data: document.getElementById('aporte-data').value,
        Descricao: tipo === 'SAIDA' ? 'Aporte em Reserva' : 'Resgate de Reserva',
        Valor: document.getElementById('aporte-valor').value,
        ID_Conta_Origem: document.getElementById('aporte-conta').value,
        Categoria: 'Transferência',
        Status: 'PAGO',
        ID_Reserva: reservaId
      }
    };
    this.requestEscrita(payload).then(res => {
      this.mostrarToast(res.mensagem, 'success');
      this.fecharModal('modal-aporte');
      document.getElementById('form-aporte').reset();
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
  }

};

window.onload = () => app.init();
