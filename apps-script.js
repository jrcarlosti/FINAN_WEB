/**
 * ============================================================
 * FIN — SISTEMA DE FINANÇAS & FLUXO DE CAIXA
 * Google Apps Script — Backend da Planilha Google Sheets
 *
 * COMO CONFIGURAR:
 * 1. Abra sua planilha Google Sheets (ou crie uma nova em branco)
 * 2. Clique em Extensões > Apps Script
 * 3. Apague todo o código existente e cole ESTE arquivo inteiro
 * 4. Clique no ícone de disquete (Salvar)
 * 5. Clique em Implantar > Nova implantação
 *    - Tipo: "App da Web"
 *    - Executar como: "Eu mesmo"
 *    - Quem tem acesso: "Qualquer pessoa"
 * 6. Clique em "Implantar" e autorize o acesso
 * 7. Copie a URL gerada (começa com https://script.google.com/macros/s/...)
 * 8. Cole a URL nas Configurações do sistema FIN
 * ============================================================
 */

const HEADERS = {
  CONTAS:        ['ID','Nome','Tipo','Banco','Saldo_Inicial','Saldo_Atual','Cor','Ativo'],
  MOVIMENTACOES: ['ID','Data','Hora','Tipo','Descricao','Valor','ID_Conta_Origem','ID_Conta_Destino','Categoria','Forma_Pagamento','Status','ID_Cartao','Parcela_Info','ID_Reserva','Observacao','Operador'],
  CARTOES:       ['ID','Nome','Limite','Dia_Fechamento','Dia_Vencimento','ID_Conta_Pagamento','Cor','Ativo'],
  FATURAS:       ['ID','ID_Cartao','Mes_Ano','Valor_Total','Status','Data_Vencimento'],
  RESERVAS:      ['ID','Nome','Meta_Valor','Valor_Atual','Cor','Icone','Status'],
  CATEGORIAS:    ['ID','Nome','Tipo','Cor','Icone'],
  USUARIOS:      ['ID','Nome','Login','Senha','Cargo']
};

function gerarId(prefixo) {
  return prefixo + '_' + new Date().getTime() + '_' + Math.floor(Math.random() * 9999);
}

function agora(formato) {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', formato || 'yyyy-MM-dd HH:mm:ss');
}

function dataHoje() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
}

function horaHoje() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH:mm:ss');
}

function getAba(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
    const hds = HEADERS[nome] || [];
    if (hds.length) {
      aba.getRange(1, 1, 1, hds.length).setValues([hds])
         .setBackground('#1e293b').setFontColor('#f8fafc').setFontWeight('bold');
      aba.setFrozenRows(1);
    }
  }
  return aba;
}

function parseNum(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val && val !== 0) return 0;
  let s = String(val).trim();
  if (s.indexOf(',') >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function formatarDataVal(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'UTC', 'yyyy-MM-dd');
  }
  const s = String(val).trim();
  if (s.indexOf('/') >= 0) {
    const p = s.split(' ')[0].split('/');
    if (p.length === 3) {
      return p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
    }
  }
  return s.substring(0, 10);
}

function abaParaJSON(nomeAba) {
  const aba = getAba(nomeAba);
  const rows = aba.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const h = rows[0];
  return rows.slice(1).map(r => {
    const o = {};
    h.forEach((k, i) => {
      let val = (r[i] !== undefined && r[i] !== null) ? r[i] : '';
      if (val instanceof Date) {
        val = formatarDataVal(val);
      }
      o[k] = val;
    });
    return o;
  });
}

/* ── RECALCULAR SALDO DE CONTAS ──────────────────────────── */
function recalcularSaldosContas() {
  const contasAba = getAba('CONTAS');
  const contasRows = contasAba.getDataRange().getValues();
  if (contasRows.length <= 1) return;
  
  const hContas = contasRows[0];
  const idxId = hContas.indexOf('ID');
  const idxInicial = hContas.indexOf('Saldo_Inicial');
  const idxAtual = hContas.indexOf('Saldo_Atual');

  const movs = abaParaJSON('MOVIMENTACOES').filter(m => String(m.Status).toUpperCase() === 'PAGO' || String(m.Status).toUpperCase() === 'CONCLUIDO');

  for (let i = 1; i < contasRows.length; i++) {
    const contaId = String(contasRows[i][idxId]);
    const saldoInicial = parseNum(contasRows[i][idxInicial]);
    
    let saldoCalculado = saldoInicial;
    movs.forEach(m => {
      const valor = parseNum(m.Valor);
      const tp = String(m.Tipo).toUpperCase();
      const orig = String(m.ID_Conta_Origem);
      const dest = String(m.ID_Conta_Destino);

      if (tp === 'ENTRADA' && orig === contaId) {
        saldoCalculado += valor;
      } else if (tp === 'SAIDA' && orig === contaId) {
        saldoCalculado -= valor;
      } else if (tp === 'TRANSFERENCIA') {
        if (orig === contaId) saldoCalculado -= valor;
        if (dest === contaId) saldoCalculado += valor;
      }
    });

    contasAba.getRange(i + 1, idxAtual + 1).setValue(saldoCalculado);
  }
}

/* ── CONTAS ──────────────────────────────────────────────── */
function listarContas() {
  recalcularSaldosContas();
  return abaParaJSON('CONTAS').filter(c => String(c.Ativo) !== 'false');
}

function criarConta(d) {
  const aba = getAba('CONTAS');
  const id = gerarId('CTA');
  const sIni = parseNum(d.Saldo_Inicial);
  aba.appendRow([id, d.Nome || 'Nova Conta', d.Tipo || 'Corrente', d.Banco || '', sIni, sIni, d.Cor || '#3b82f6', 'true']);
  recalcularSaldosContas();
  return { sucesso: true, id, mensagem: 'Conta cadastrada com sucesso!' };
}

function atualizarConta(id, d) {
  const aba = getAba('CONTAS');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      ['Nome', 'Tipo', 'Banco', 'Saldo_Inicial', 'Cor', 'Ativo'].forEach(c => {
        if (d[c] !== undefined) {
          const col = h.indexOf(c) + 1;
          const val = (c === 'Saldo_Inicial') ? parseNum(d[c]) : d[c];
          aba.getRange(i + 1, col).setValue(val);
        }
      });
      recalcularSaldosContas();
      return { sucesso: true, mensagem: 'Conta atualizada!' };
    }
  }
  return { sucesso: false, mensagem: 'Conta não encontrada.' };
}

function excluirConta(id) {
  const aba = getAba('CONTAS');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      aba.deleteRow(i + 1);
      recalcularSaldosContas();
      return { sucesso: true, mensagem: 'Conta excluída!' };
    }
  }
  return { sucesso: false, mensagem: 'Conta não encontrada.' };
}

/* ── MOVIMENTAÇÕES ────────────────────────────────────────── */
function listarMovimentacoes(f) {
  let m = abaParaJSON('MOVIMENTACOES');
  if (f && f.tipo) m = m.filter(x => String(x.Tipo).toUpperCase() === String(f.tipo).toUpperCase());
  if (f && f.conta) m = m.filter(x => String(x.ID_Conta_Origem) === String(f.conta) || String(x.ID_Conta_Destino) === String(f.conta));
  if (f && f.status) m = m.filter(x => String(x.Status).toUpperCase() === String(f.status).toUpperCase());
  if (f && f.categoria) m = m.filter(x => String(x.Categoria).toLowerCase() === String(f.categoria).toLowerCase());

  const dInicio = f && (f.dataInicio || f.data);
  const dFim = f && (f.dataFim || f.data_fim);
  if (dInicio || dFim) {
    const isoIni = dInicio ? formatarDataVal(dInicio) : '';
    const isoFim = dFim ? formatarDataVal(dFim) : '';
    m = m.filter(x => {
      const dt = formatarDataVal(x.Data);
      if (!dt) return true;
      if (isoIni && dt < isoIni) return false;
      if (isoFim && dt > isoFim) return false;
      return true;
    });
  }
  return m.reverse();
}

function registrarMovimentacao(d) {
  const parcelas = parseInt(d.Parcelas || 1);
  const aba = getAba('MOVIMENTACOES');

  if (parcelas > 1) {
    const valorTotal = parseNum(d.Valor);
    const valorParcela = valorTotal / parcelas;
    const dataInicialStr = d.Data || dataHoje();
    const partes = dataInicialStr.split('-');
    const dataInicial = new Date(partes[0], partes[1] - 1, partes[2]);

    for (let p = 1; p <= parcelas; p++) {
      const dt = new Date(dataInicial);
      dt.setMonth(dt.getMonth() + (p - 1));
      
      const mStr = String(dt.getMonth() + 1).padStart(2, '0');
      const dStr = String(dt.getDate()).padStart(2, '0');
      const yStr = dt.getFullYear();
      const dtFormatted = `${yStr}-${mStr}-${dStr}`;
      
      const id = gerarId('MOV');
      const hr = horaHoje();
      const status = d.Status || 'PAGO';
      const desc = `${d.Descricao || ''} ${p}-${parcelas}`;
      
      aba.appendRow([
        id, dtFormatted, hr, d.Tipo || 'SAIDA', desc, valorParcela,
        d.ID_Conta_Origem || '', d.ID_Conta_Destino || '', d.Categoria || 'Geral',
        d.Forma_Pagamento || 'PIX', status, d.ID_Cartao || '',
        `${p}/${parcelas}`, d.ID_Reserva || '', d.Observacao || '', d.Operador || 'Sistema'
      ]);
      
      if (d.ID_Reserva) {
        atualizarSaldoReservaPorMovimentacao(d.ID_Reserva, d.Tipo, valorParcela);
      }
    }
    recalcularSaldosContas();
    return { sucesso: true, mensagem: `Lançamento registrado em ${parcelas} parcelas!` };
  }

  // Lancamento unico
  const id = gerarId('MOV');
  const dt = d.Data || dataHoje();
  const hr = horaHoje();
  const valor = parseNum(d.Valor);
  const status = d.Status || 'PAGO';

  aba.appendRow([
    id, dt, hr, d.Tipo || 'SAIDA', d.Descricao || '', valor,
    d.ID_Conta_Origem || '', d.ID_Conta_Destino || '', d.Categoria || 'Geral',
    d.Forma_Pagamento || 'PIX', status, d.ID_Cartao || '',
    d.Parcela_Info || '', d.ID_Reserva || '', d.Observacao || '', d.Operador || 'Sistema'
  ]);

  if (d.ID_Reserva) {
    atualizarSaldoReservaPorMovimentacao(d.ID_Reserva, d.Tipo, valor);
  }

  recalcularSaldosContas();
  return { sucesso: true, id, mensagem: 'Lançamento registrado com sucesso!' };
}

function atualizarMovimentacao(id, d) {
  const aba = getAba('MOVIMENTACOES');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      ['Tipo', 'Data', 'Descricao', 'Valor', 'ID_Conta_Origem', 'ID_Conta_Destino', 'Categoria', 'Forma_Pagamento', 'Status', 'ID_Cartao', 'Parcela_Info', 'ID_Reserva', 'Observacao'].forEach(c => {
        if (d[c] !== undefined) {
          const col = h.indexOf(c) + 1;
          let val = d[c];
          if (c === 'Valor') val = parseNum(val);
          aba.getRange(i + 1, col).setValue(val);
        }
      });
      recalcularSaldosContas();
      return { sucesso: true, mensagem: 'Lançamento atualizado!' };
    }
  }
  return { sucesso: false, mensagem: 'Lançamento não encontrado.' };
}

function atualizarStatusMovimentacao(id, novoStatus) {
  const aba = getAba('MOVIMENTACOES');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');
  const idxStatus = h.indexOf('Status');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      aba.getRange(i + 1, idxStatus + 1).setValue(novoStatus);
      recalcularSaldosContas();
      return { sucesso: true, mensagem: 'Status atualizado!' };
    }
  }
  return { sucesso: false, mensagem: 'Lançamento não encontrado.' };
}

function excluirMovimentacao(id) {
  const aba = getAba('MOVIMENTACOES');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      aba.deleteRow(i + 1);
      recalcularSaldosContas();
      return { sucesso: true, mensagem: 'Lançamento excluído!' };
    }
  }
  return { sucesso: false, mensagem: 'Lançamento não encontrado.' };
}

/* ── CARTÕES DE CRÉDITO & FATURAS ────────────────────────── */
function listarCartoes() {
  return abaParaJSON('CARTOES').filter(c => String(c.Ativo) !== 'false');
}

function criarCartao(d) {
  const aba = getAba('CARTOES');
  const id = gerarId('CRT');
  aba.appendRow([
    id, d.Nome || 'Cartão', parseNum(d.Limite), d.Dia_Fechamento || 1,
    d.Dia_Vencimento || 10, d.ID_Conta_Pagamento || '', d.Cor || '#8b5cf6', 'true'
  ]);
  return { sucesso: true, id, mensagem: 'Cartão cadastrado!' };
}

function atualizarCartao(id, d) {
  const aba = getAba('CARTOES');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      ['Nome', 'Limite', 'Dia_Fechamento', 'Dia_Vencimento', 'ID_Conta_Pagamento', 'Cor'].forEach(c => {
        if (d[c] !== undefined) {
          const col = h.indexOf(c) + 1;
          let val = d[c];
          if (c === 'Limite') val = parseNum(val);
          aba.getRange(i + 1, col).setValue(val);
        }
      });
      return { sucesso: true, mensagem: 'Cartão atualizado!' };
    }
  }
  return { sucesso: false, mensagem: 'Cartão não encontrado.' };
}

function excluirCartao(id) {
  const aba = getAba('CARTOES');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      aba.deleteRow(i + 1);
      return { sucesso: true, mensagem: 'Cartão excluído!' };
    }
  }
  return { sucesso: false, mensagem: 'Cartão não encontrado.' };
}

function registrarCompraCartao(d) {
  const parcelas = Math.max(1, parseInt(d.Parcelas || 1));
  const valorTotal = parseNum(d.Valor);
  const valorParcela = valorTotal / parcelas;
  const dataInicial = new Date(d.Data || dataHoje());

  for (let p = 1; p <= parcelas; p++) {
    const dt = new Date(dataInicial);
    dt.setMonth(dt.getMonth() + (p - 1));
    const dtStr = Utilities.formatDate(dt, 'America/Sao_Paulo', 'yyyy-MM-dd');
    
    registrarMovimentacao({
      Tipo: 'SAIDA',
      Descricao: `${d.Descricao || 'Compra Cartão'} (${p}/${parcelas})`,
      Valor: valorParcela,
      ID_Conta_Origem: d.ID_Conta_Pagamento || '',
      Categoria: d.Categoria || 'Cartão de Crédito',
      Forma_Pagamento: 'CARTAO_CREDITO',
      Status: 'PENDENTE',
      ID_Cartao: d.ID_Cartao,
      Parcela_Info: `${p}/${parcelas}`,
      Data: dtStr,
      Observacao: d.Observacao || ''
    });
  }
  return { sucesso: true, mensagem: `Compra parcelada em ${parcelas}x registrada!` };
}

/* ── CAIXAS RESERVAS (METAS) ─────────────────────────────── */
function listarReservas() {
  return abaParaJSON('RESERVAS');
}

function criarReserva(d) {
  const aba = getAba('RESERVAS');
  const id = gerarId('RSV');
  aba.appendRow([
    id, d.Nome || 'Nova Reserva', parseNum(d.Meta_Valor), parseNum(d.Valor_Atual),
    d.Cor || '#10b981', d.Icone || 'piggy-bank', 'EM_PROGRESSO'
  ]);
  return { sucesso: true, id, mensagem: 'Caixa reserva criada com sucesso!' };
}

function excluirReserva(id) {
  const aba = getAba('RESERVAS');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      aba.deleteRow(i + 1);
      return { sucesso: true, mensagem: 'Reserva excluída!' };
    }
  }
  return { sucesso: false, mensagem: 'Reserva não encontrada.' };
}

function atualizarSaldoReservaPorMovimentacao(reservaId, tipoMov, valor) {
  const aba = getAba('RESERVAS');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');
  const idxAtual = h.indexOf('Valor_Atual');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(reservaId)) {
      let vAtual = parseNum(rows[i][idxAtual]);
      if (tipoMov === 'SAIDA') {
        vAtual += valor; // Aporte (depósito na reserva é saída da conta)
      } else if (tipoMov === 'ENTRADA') {
        vAtual = vAtual - valor; // Resgate (entrada na conta)
      }
      aba.getRange(i + 1, idxAtual + 1).setValue(vAtual);
      break;
    }
  }
}

/* ── CATEGORIAS ─────────────────────────────────────────── */
function listarCategorias() {
  const aba = getAba('CATEGORIAS');
  const rows = aba.getDataRange().getValues();
  if (rows.length <= 1) {
    const padroes = [
      [gerarId('CAT'), 'Salário', 'RECEITA', '#10b981', 'briefcase'],
      [gerarId('CAT'), 'Vendas', 'RECEITA', '#059669', 'shopping-cart'],
      [gerarId('CAT'), 'Investimentos', 'RECEITA', '#0284c7', 'trending-up'],
      [gerarId('CAT'), 'Alimentação', 'DESPESA', '#f59e0b', 'utensils'],
      [gerarId('CAT'), 'Moradia', 'DESPESA', '#ef4444', 'home'],
      [gerarId('CAT'), 'Transporte', 'DESPESA', '#6366f1', 'car'],
      [gerarId('CAT'), 'Cartão de Crédito', 'DESPESA', '#8b5cf6', 'credit-card'],
      [gerarId('CAT'), 'Outros', 'DESPESA', '#64748b', 'more-horizontal']
    ];
    padroes.forEach(p => aba.appendRow(p));
  }
  return abaParaJSON('CATEGORIAS');
}

function criarCategoria(d) {
  const aba = getAba('CATEGORIAS');
  const id = gerarId('CAT');
  aba.appendRow([id, d.Nome || 'Nova Categoria', d.Tipo || 'DESPESA', d.Cor || '#6366f1', d.Icone || 'tag']);
  return { sucesso: true, id, mensagem: 'Categoria salva!' };
}

function atualizarCategoria(id, d) {
  const aba = getAba('CATEGORIAS');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      ['Nome', 'Tipo', 'Cor', 'Icone'].forEach(c => {
        if (d[c] !== undefined) {
          const col = h.indexOf(c) + 1;
          aba.getRange(i + 1, col).setValue(d[c]);
        }
      });
      return { sucesso: true, mensagem: 'Categoria atualizada!' };
    }
  }
  return { sucesso: false, mensagem: 'Categoria não encontrada.' };
}

function excluirCategoria(id) {
  const aba = getAba('CATEGORIAS');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      aba.deleteRow(i + 1);
      return { sucesso: true, mensagem: 'Categoria excluída!' };
    }
  }
  return { sucesso: false, mensagem: 'Categoria não encontrada.' };
}

/* ── USUÁRIOS ─────────────────────────────────────────────── */
function listarUsuarios() {
  const aba = getAba('USUARIOS');
  const rows = aba.getDataRange().getValues();
  if (rows.length <= 1) {
    aba.appendRow(['USR_1', 'Administrador', 'admin', 'admin123', 'Administrador']);
    return [{ ID: 'USR_1', Nome: 'Administrador', Login: 'admin', Senha: 'admin123', Cargo: 'Administrador' }];
  }
  return abaParaJSON('USUARIOS');
}

function criarUsuario(d) {
  const aba = getAba('USUARIOS');
  const usrs = listarUsuarios();
  if (usrs.some(u => String(u.Login).toLowerCase() === String(d.Login).toLowerCase())) {
    return { sucesso: false, mensagem: 'Login "' + d.Login + '" já cadastrado.' };
  }
  const id = gerarId('USR');
  aba.appendRow([id, d.Nome || '', d.Login || '', d.Senha || '', d.Cargo || 'Operador']);
  return { sucesso: true, id, mensagem: 'Usuário cadastrado!' };
}

/* ── DASHBOARD ───────────────────────────────────────────── */
function getDashboard() {
  recalcularSaldosContas();
  const contas = listarContas();
  const movs = abaParaJSON('MOVIMENTACOES');
  const reservas = listarReservas();
  const cartoes = listarCartoes();

  const mesAtualStr = dataHoje().substring(0, 7); // yyyy-MM

  const movsMes = movs.filter(m => formatarDataVal(m.Data).startsWith(mesAtualStr) && String(m.Status).toUpperCase() === 'PAGO');

  const totalReceitasMes = movsMes.filter(m => String(m.Tipo).toUpperCase() === 'ENTRADA')
                                  .reduce((s, m) => s + parseNum(m.Valor), 0);

  const totalDespesasMes = movsMes.filter(m => String(m.Tipo).toUpperCase() === 'SAIDA')
                                  .reduce((s, m) => s + parseNum(m.Valor), 0);

  const saldoGeralContas = contas.reduce((s, c) => s + parseNum(c.Saldo_Atual), 0);
  const totalReservas = reservas.reduce((s, r) => s + parseNum(r.Valor_Atual), 0);

  const pendentesMes = movs.filter(m => String(m.Status).toUpperCase() === 'PENDENTE' && formatarDataVal(m.Data).startsWith(mesAtualStr));

  // Agrupamento por Categoria para gráfico
  const despesasPorCategoria = {};
  movsMes.filter(m => String(m.Tipo).toUpperCase() === 'SAIDA').forEach(m => {
    const cat = m.Categoria || 'Outros';
    despesasPorCategoria[cat] = (despesasPorCategoria[cat] || 0) + parseNum(m.Valor);
  });

  return {
    saldoGeralContas,
    totalReceitasMes,
    totalDespesasMes,
    resultadoLiquidoMes: totalReceitasMes - totalDespesasMes,
    totalReservas,
    qtdContas: contas.length,
    qtdCartoes: cartoes.length,
    despesasPorCategoria,
    pendentesCount: pendentesMes.length,
    ultimosLancamentos: movs.slice(-15).reverse()
  };
}

/* ── ROTEADOR ─────────────────────────────────────────────── */
function rotearEscrita(b) {
  switch (b.acao) {
    case 'criar_conta':              return criarConta(b.dados);
    case 'atualizar_conta':          return atualizarConta(b.id, b.dados);
    case 'excluir_conta':            return excluirConta(b.id);
    case 'registrar_movimentacao':   return registrarMovimentacao(b.dados);
    case 'atualizar_movimentacao':   return atualizarMovimentacao(b.id, b.dados);
    case 'atualizar_status_mov':     return atualizarStatusMovimentacao(b.id, b.status);
    case 'excluir_movimentacao':     return excluirMovimentacao(b.id);
    case 'criar_cartao':             return criarCartao(b.dados);
    case 'atualizar_cartao':         return atualizarCartao(b.id, b.dados);
    case 'excluir_cartao':           return excluirCartao(b.id);
    case 'registrar_compra_cartao':  return registrarCompraCartao(b.dados);
    case 'criar_reserva':            return criarReserva(b.dados);
    case 'excluir_reserva':          return excluirReserva(b.id);
    case 'criar_categoria':          return criarCategoria(b.dados);
    case 'atualizar_categoria':      return atualizarCategoria(b.id, b.dados);
    case 'excluir_categoria':        return excluirCategoria(b.id);
    case 'criar_usuario':            return criarUsuario(b.dados);
    default: return { sucesso: false, mensagem: 'Ação de escrita não reconhecida: ' + b.acao };
  }
}

function doGet(e) {
  try {
    const p = e.parameter || {};
    let r;

    // Operação de escrita via GET (payload JSON para contornar CORS de file://)
    if (p.acao === 'escrever') {
      if (!p.payload) return out({ sucesso: false, mensagem: 'Payload ausente' }, p.callback);
      const body = JSON.parse(p.payload);
      r = rotearEscrita(body);
      return out(r, p.callback);
    }

    switch (p.acao) {
      case 'dashboard':            r = { sucesso: true, dados: getDashboard() }; break;
      case 'listar_contas':        r = { sucesso: true, dados: listarContas() }; break;
      case 'listar_movimentacoes': r = { sucesso: true, dados: listarMovimentacoes(p) }; break;
      case 'listar_cartoes':       r = { sucesso: true, dados: listarCartoes() }; break;
      case 'listar_reservas':      r = { sucesso: true, dados: listarReservas() }; break;
      case 'listar_categorias':    r = { sucesso: true, dados: listarCategorias() }; break;
      case 'listar_usuarios':      r = { sucesso: true, dados: listarUsuarios() }; break;
      case 'inicializar':
        ['CONTAS','MOVIMENTACOES','CARTOES','FATURAS','RESERVAS','CATEGORIAS','USUARIOS'].forEach(n => getAba(n));
        listarCategorias(); // gera categorias padrão se vazias
        listarUsuarios();   // gera usuário admin padrão se vazio
        r = { sucesso: true, mensagem: 'Todas as 7 abas foram inicializadas com sucesso na planilha!' };
        break;
      default: r = { sucesso: false, mensagem: 'Ação não reconhecida: ' + p.acao };
    }
    return out(r, p.callback);
  } catch (err) {
    return out({ sucesso: false, erro: err.message }, e.parameter ? e.parameter.callback : null);
  }
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    return out(rotearEscrita(b));
  } catch (err) {
    return out({ sucesso: false, erro: err.message });
  }
}

function out(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
