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
  MOVIMENTACOES: ['ID','Data','Hora','Tipo','Descricao','Valor','ID_Conta_Origem','ID_Conta_Destino','Categoria','Forma_Pagamento','Status','ID_Cartao','Parcela_Info','ID_Reserva','Observacao','Operador','KM'],
  CARTOES:       ['ID','Nome','Limite','Dia_Fechamento','Dia_Vencimento','ID_Conta_Pagamento','Cor','Ativo'],
  FATURAS:       ['ID','ID_Cartao','Mes_Ano','Valor_Total','Status','Data_Vencimento'],
  RESERVAS:      ['ID','Nome','Meta_Valor','Valor_Atual','Cor','Icone','Status'],
  INVESTIMENTOS: ['ID','Nome','Meta_Valor','Valor_Atual','Cor','Icone','Status'],
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

/* ── RECALCULAR SALDOS ──────────────────────────────────── */
function recalcularTodosSaldos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const movs = abaParaJSON('MOVIMENTACOES').filter(m => {
    const s = String(m.Status).toUpperCase();
    return s === 'PAGO' || s === 'CONCLUIDO' || s === 'SUCESSO';
  });

  recalcularContas(ss, movs);
  recalcularReservas(ss, movs);
  recalcularInvestimentos(ss, movs);
}

function recalcularContas(ss, movs) {
  const aba = getAba('CONTAS');
  const range = aba.getDataRange();
  const data = range.getValues();
  if (data.length <= 1) return;
  
  const h = data[0];
  const idxId = h.indexOf('ID');
  const idxInicial = h.indexOf('Saldo_Inicial');
  const idxAtual = h.indexOf('Saldo_Atual');

  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idxId]);
    let saldo = parseNum(data[i][idxInicial]);
    
    movs.forEach(m => {
      const v = parseNum(m.Valor);
      const tp = String(m.Tipo).toUpperCase();
      const orig = String(m.ID_Conta_Origem);
      const dest = String(m.ID_Conta_Destino);

      if (tp === 'ENTRADA' && orig === id) saldo += v;
      else if (tp === 'SAIDA' && orig === id) saldo -= v;
      else if (tp === 'TRANSFERENCIA') {
        if (orig === id) saldo -= v;
        if (dest === id) saldo += v;
      }
    });
    data[i][idxAtual] = saldo;
  }
  range.setValues(data);
}

function recalcularReservas(ss, movs) {
  const aba = getAba('RESERVAS');
  const range = aba.getDataRange();
  const data = range.getValues();
  if (data.length <= 1) return;

  const h = data[0];
  const idxId = h.indexOf('ID');
  const idxAtual = h.indexOf('Valor_Atual');

  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idxId]);
    // Reservas não tem "Saldo Inicial" explícito na aba, assumimos que começa em 0
    // mas na verdade o sistema permite saldo inicial na criação. 
    // Porém a aba RESERVAS não tem essa coluna. Vamos usar o valor atual como base? 
    // Não, melhor somar tudo. Se houver saldo inicial, ele deve ser uma movimentação.
    // Observando criarReserva, ela injeta parseNum(d.Valor_Atual).
    // Então vamos manter o Valor_Atual como base? Não, isso duplicaria.
    // A melhor forma é considerar que o "Valor_Atual" na criação é o ponto de partida.
    // Mas a aba não guarda o Saldo Inicial. Vou assumir que o primeiro Valor_Atual é o inicial.
    // Ou melhor, as movimentações devem cobrir tudo.
    
    let saldo = 0; 
    movs.forEach(m => {
      if (String(m.ID_Reserva) === id) {
        const v = parseNum(m.Valor);
        const tp = String(m.Tipo).toUpperCase();
        const cat = String(m.Categoria).toLowerCase();

        if (cat.includes('transfer') || cat.includes('aporte') || cat.includes('resgate')) {
          if (tp === 'SAIDA') saldo += v;   // Aporte
          else if (tp === 'ENTRADA') saldo -= v; // Resgate
        } else {
          if (tp === 'SAIDA') saldo -= v;   // Gasto direto da reserva
          else if (tp === 'ENTRADA') saldo += v; // Ganho direto na reserva
        }
      }
    });
    // Se não houver movimentações, mantém o valor que está lá? 
    // O problema é que o sistema não tem coluna Saldo_Inicial em RESERVAS.
    // Vou pular a recalculação de Reservas se não quiser arriscar zerar saldos legados.
    // Por enquanto, as Reservas funcionam bem com o sistema incremental.
  }
}

function recalcularInvestimentos(ss, movs) {
  // Similar a reservas
}

/* ── CONTAS ──────────────────────────────────────────────── */
function listarContas() {
  recalcularTodosSaldos();
  return abaParaJSON('CONTAS').filter(c => String(c.Ativo) !== 'false');
}

function getDadosSincronizacaoCompleta() {
  return {
    dashboard: getDashboard(),
    contas: listarContas(),
    movimentacoes: listarMovimentacoes(),
    categorias: listarCategorias(),
    cartoes: listarCartoes(),
    reservas: listarReservas(),
    investimentos: listarInvestimentos()
  };
}

function listarInvestimentos() {
  return abaParaJSON('INVESTIMENTOS').filter(i => String(i.Status).toUpperCase() !== 'false');
}

function criarInvestimento(d) {
  const aba = getAba('INVESTIMENTOS');
  const id = gerarId('INV');
  const valorAtual = parseNum(d.Valor_Atual);
  const metaValor = parseNum(d.Meta_Valor);
  aba.appendRow([id, d.Nome || 'Novo Investimento', metaValor, valorAtual, d.Cor || '#0284c7', d.Icone || 'trending-up', d.Status || 'ATIVO']);
  return { sucesso: true, id, mensagem: 'Investimento cadastrado com sucesso!' };
}

function atualizarInvestimento(id, d) {
  const aba = getAba('INVESTIMENTOS');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      ['Nome', 'Meta_Valor', 'Valor_Atual', 'Cor', 'Icone', 'Status'].forEach(field => {
        if (d[field] !== undefined) {
          const col = h.indexOf(field) + 1;
          aba.getRange(i + 1, col).setValue(field.includes('Valor') ? parseNum(d[field]) : d[field]);
        }
      });
      return { sucesso: true, mensagem: 'Investimento atualizado com sucesso!' };
    }
  }
  return { sucesso: false, mensagem: 'Investimento não encontrado.' };
}

function excluirInvestimento(id) {
  const aba = getAba('INVESTIMENTOS');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      aba.deleteRow(i + 1);
      return { sucesso: true, mensagem: 'Investimento excluído com sucesso!' };
    }
  }
  return { sucesso: false, mensagem: 'Investimento não encontrado.' };
}

function criarConta(d) {
  const aba = getAba('CONTAS');
  const id = gerarId('CTA');
  const sIni = parseNum(d.Saldo_Inicial);
  aba.appendRow([id, d.Nome || 'Nova Conta', d.Tipo || 'Corrente', d.Banco || '', sIni, sIni, d.Cor || '#3b82f6', 'true']);
  recalcularTodosSaldos();
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
      recalcularTodosSaldos();
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
      recalcularTodosSaldos();
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
        `${p}/${parcelas}`, d.ID_Reserva || '', d.Observacao || '', d.Operador || 'Sistema',
        (p === 1 ? (d.KM || '') : '') // KM somente na 1a parcela
      ]);
      
      if (d.ID_Reserva) {
        atualizarSaldoDestinoPorMovimentacao(d.ID_Reserva, d.Tipo, valorParcela);
      }
    }
    recalcularTodosSaldos();
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
    d.Parcela_Info || '', d.ID_Reserva || '', d.Observacao || '', d.Operador || 'Sistema',
    d.KM || ''
  ]);

  if (d.ID_Reserva) {
    atualizarSaldoDestinoPorMovimentacao(d.ID_Reserva, d.Tipo, valor);
  }

  recalcularTodosSaldos();
  return { sucesso: true, id, mensagem: 'Lançamento registrado com sucesso!' };
}

function atualizarSaldoDestinoPorMovimentacao(destinoId, tipoMov, valor) {
  if (!destinoId) return;
  const destinoStr = String(destinoId);
  if (destinoStr.startsWith('RSV_') || destinoStr.startsWith('RSV')) {
    atualizarSaldoReservaPorMovimentacao(destinoId, tipoMov, valor);
  } else if (destinoStr.startsWith('INV_') || destinoStr.startsWith('INV')) {
    atualizarSaldoInvestimentoPorMovimentacao(destinoId, tipoMov, valor);
  }
}

function atualizarSaldoInvestimentoPorMovimentacao(investimentoId, tipoMov, valor) {
  const aba = getAba('INVESTIMENTOS');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');
  const idxAtual = h.indexOf('Valor_Atual');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(investimentoId)) {
      let vAtual = parseNum(rows[i][idxAtual]);
      if (tipoMov === 'SAIDA') {
        vAtual += valor;
      } else if (tipoMov === 'ENTRADA') {
        vAtual -= valor;
      }
      aba.getRange(i + 1, idxAtual + 1).setValue(vAtual);
      break;
    }
  }
}

function atualizarMovimentacao(id, d) {
  const aba = getAba('MOVIMENTACOES');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      ['Tipo', 'Data', 'Descricao', 'Valor', 'ID_Conta_Origem', 'ID_Conta_Destino', 'Categoria', 'Forma_Pagamento', 'Status', 'ID_Cartao', 'Parcela_Info', 'ID_Reserva', 'Observacao', 'KM'].forEach(c => {
        if (d[c] !== undefined) {
          const col = h.indexOf(c) + 1;
          let val = d[c];
          if (c === 'Valor') val = parseNum(val);
          aba.getRange(i + 1, col).setValue(val);
        }
      });
      recalcularTodosSaldos();
      return { sucesso: true, mensagem: 'Lançamento atualizado!' };
    }
  }
  return { sucesso: false, mensagem: 'Lançamento não encontrado.' };
}

function atualizarMovimentacaoLote(ids, d, mes) {
  const aba = getAba('MOVIMENTACOES');
  const range = aba.getDataRange();
  const rows = range.getValues();
  const h = rows[0];
  const idxId  = h.indexOf('ID');
  const idxData = h.indexOf('Data');

  const idsStr = ids.map(id => String(id));
  // mes opcional (YYYY-MM): quando fornecido, restringe a atualização apenas
  // às linhas cuja data pertence àquele mês. Evita que parcelas futuras com
  // o mesmo ID base sejam marcadas junto com a parcela do mês selecionado.
  const filtrarMes = mes ? String(mes).substring(0, 7) : null;
  let alterado = false;

  for (let i = 1; i < rows.length; i++) {
    const rowId = String(rows[i][idxId]);
    if (idsStr.indexOf(rowId) === -1) continue;

    // Se filtro de mês foi passado, verifica se a data da linha bate
    if (filtrarMes) {
      const dataLinha = formatarDataVal(rows[i][idxData]);
      if (!dataLinha.startsWith(filtrarMes)) continue;
    }

    ['Tipo', 'Data', 'Descricao', 'Valor', 'ID_Conta_Origem', 'ID_Conta_Destino', 'Categoria', 'Forma_Pagamento', 'Status', 'ID_Cartao', 'Parcela_Info', 'ID_Reserva', 'Observacao', 'KM'].forEach(c => {
      if (d[c] !== undefined) {
        const colIdx = h.indexOf(c);
        let val = d[c];
        if (c === 'Valor') val = parseNum(val);
        rows[i][colIdx] = val;
        alterado = true;
      }
    });
  }
  
  if (alterado) {
    range.setValues(rows);
    recalcularTodosSaldos();
  }
  
  return { sucesso: true, mensagem: ids.length + ' lançamentos atualizados!' };
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
      recalcularTodosSaldos();
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
      recalcularTodosSaldos();
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

function atualizarReserva(id, d) {
  const aba = getAba('RESERVAS');
  const rows = aba.getDataRange().getValues();
  const h = rows[0];
  const idxId = h.indexOf('ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(id)) {
      ['Nome', 'Meta_Valor', 'Cor', 'Icone'].forEach(c => {
        if (d[c] !== undefined) {
          const col = h.indexOf(c) + 1;
          let val = d[c];
          if (c === 'Meta_Valor') val = parseNum(val);
          aba.getRange(i + 1, col).setValue(val);
        }
      });
      return { sucesso: true, mensagem: 'Reserva atualizada com sucesso!' };
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
  recalcularTodosSaldos();
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
    case 'atualizar_movimentacao_lote': return atualizarMovimentacaoLote(b.ids, b.dados, b.mes);
    case 'atualizar_status_mov':     return atualizarStatusMovimentacao(b.id, b.status);
    case 'excluir_movimentacao':     return excluirMovimentacao(b.id);
    case 'criar_cartao':             return criarCartao(b.dados);
    case 'atualizar_cartao':         return atualizarCartao(b.id, b.dados);
    case 'excluir_cartao':           return excluirCartao(b.id);
    case 'registrar_compra_cartao':  return registrarCompraCartao(b.dados);
    case 'criar_reserva':            return criarReserva(b.dados);
    case 'atualizar_reserva':        return atualizarReserva(b.id, b.dados);
    case 'excluir_reserva':          return excluirReserva(b.id);
    case 'criar_categoria':          return criarCategoria(b.dados);
    case 'atualizar_categoria':      return atualizarCategoria(b.id, b.dados);
    case 'excluir_categoria':        return excluirCategoria(b.id);
    case 'criar_investimento':       return criarInvestimento(b.dados);
    case 'atualizar_investimento':   return atualizarInvestimento(b.id, b.dados);
    case 'criar_usuario':            return criarUsuario(b.dados);
    case 'configurar_alerta_email':  return criarGatilhoEmail(b.email);
    case 'testar_alerta_email':      return testarGatilhoEmail(b.email);
    case 'remover_alerta_email':     return removerGatilhoEmail();
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
      case 'sincronizar_tudo':     r = { sucesso: true, dados: getDadosSincronizacaoCompleta() }; break;
      case 'listar_contas':        r = { sucesso: true, dados: listarContas() }; break;
      case 'listar_movimentacoes': r = { sucesso: true, dados: listarMovimentacoes(p) }; break;
      case 'listar_cartoes':       r = { sucesso: true, dados: listarCartoes() }; break;
      case 'listar_reservas':      r = { sucesso: true, dados: listarReservas() }; break;
      case 'listar_investimentos': r = { sucesso: true, dados: listarInvestimentos() }; break;
      case 'listar_categorias':    r = { sucesso: true, dados: listarCategorias() }; break;
      case 'listar_usuarios':      r = { sucesso: true, dados: listarUsuarios() }; break;
      case 'inicializar':
        ['CONTAS','MOVIMENTACOES','CARTOES','FATURAS','RESERVAS','INVESTIMENTOS','CATEGORIAS','USUARIOS'].forEach(n => getAba(n));
        listarCategorias(); // gera categorias padrão se vazias
        listarUsuarios();   // gera usuário admin padrão se vazio
        r = { sucesso: true, mensagem: 'Todas as 8 abas foram inicializadas com sucesso na planilha!' };
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

/* ── ALERTA DE E-MAIL POR VENCIMENTO ─────────────────────── */

/**
 * ============================================================
 * IMPORTANTE: Para o alerta de e-mail funcionar (Triggers),
 * selecione a função "autorizar" no menu superior do Apps Script e clique em "Executar".
 * Isso solicitará as permissões necessárias (script.scriptapp).
 * ============================================================
 */
function autorizar() {
  const email = Session.getActiveUser().getEmail();
  Logger.log("Autorização concedida por " + email);
  // Apenas chamando ScriptApp para forçar a permissão no manifesto
  ScriptApp.getProjectTriggers();
}

/**
 * Salva o e-mail de alerta nas propriedades do script e cria o trigger diário às 08h.
 * Chamado pelo front-end quando o usuário configura o alerta.
 */
function criarGatilhoEmail(email) {
  if (!email || email.indexOf('@') < 0) {
    return { sucesso: false, mensagem: 'E-mail inválido.' };
  }

  // Salva o e-mail nas propriedades do script (persistente)
  PropertiesService.getScriptProperties().setProperty('ALERTA_EMAIL', email);

  // Remove triggers antigos com o mesmo nome para evitar duplicatas, sem apagar o e-mail configurado
  removerGatilhoEmail(false);

  // Cria novo trigger diário às 08:00 (horário de Brasília)
  ScriptApp.newTrigger('enviarAlertaVencimentos')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .inTimezone('America/Sao_Paulo')
    .create();

  return { sucesso: true, mensagem: 'Alerta de e-mail ativado! Será enviado diariamente às 08:00 para ' + email };
}

/**
 * Remove todos os triggers de alerta de vencimento.
 */
function removerGatilhoEmail(removerPropriedade = true) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'enviarAlertaVencimentos') {
      ScriptApp.deleteTrigger(t);
    }
  });

  if (removerPropriedade) {
    PropertiesService.getScriptProperties().deleteProperty('ALERTA_EMAIL');
  }

  return { sucesso: true, mensagem: 'Alerta de e-mail desativado com sucesso.' };
}

function gerarCorpoAlertaVencimentos(vencidas, aVencer, dataHojeFormatada, isTeste) {
  const formatarBRL = v => {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatarDtBR = iso => {
    if (!iso) return '';
    const p = iso.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  };

  let tabelaVencidas = '';
  if (vencidas.length > 0) {
    tabelaVencidas = `
      <h2 style="color:#ef4444;margin-top:30px;">🔴 Transações Vencidas (${vencidas.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#fee2e2;">
            <th style="padding:10px;border:1px solid #fca5a5;text-align:left;">Descrição</th>
            <th style="padding:10px;border:1px solid #fca5a5;text-align:left;">Vencimento</th>
            <th style="padding:10px;border:1px solid #fca5a5;text-align:right;">Valor</th>
            <th style="padding:10px;border:1px solid #fca5a5;text-align:center;">Dias Vencidos</th>
          </tr>
        </thead>
        <tbody>
          ${vencidas.map(m => `
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;">${m.Descricao || '-'}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${formatarDtBR(m.dataFormatada)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;color:#ef4444;font-weight:bold;">${formatarBRL(m.Valor)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;color:#ef4444;font-weight:bold;">⚠️ ${m.diasVencidos} dia(s)</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  let tabelaAVencer = '';
  if (aVencer.length > 0) {
    tabelaAVencer = `
      <h2 style="color:#f59e0b;margin-top:30px;">🟡 Vencendo em Breve (${aVencer.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#fef3c7;">
            <th style="padding:10px;border:1px solid #fcd34d;text-align:left;">Descrição</th>
            <th style="padding:10px;border:1px solid #fcd34d;text-align:left;">Vencimento</th>
            <th style="padding:10px;border:1px solid #fcd34d;text-align:right;">Valor</th>
            <th style="padding:10px;border:1px solid #fcd34d;text-align:center;">Dias Restantes</th>
          </tr>
        </thead>
        <tbody>
          ${aVencer.map(m => `
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;">${m.Descricao || '-'}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${formatarDtBR(m.dataFormatada)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;color:#f59e0b;font-weight:bold;">${formatarBRL(m.Valor)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${m.diasRestantes === 0 ? '🔥 Vence <strong>HOJE</strong>' : '⏳ ' + m.diasRestantes + ' dia(s)'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#1e293b;">
      <div style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:25px 30px;border-radius:12px;margin-bottom:25px;">
        <h1 style="color:#f8fafc;margin:0;font-size:22px;">💰 FIN — ${isTeste ? 'Teste de Alerta de Vencimentos' : 'Alerta de Vencimentos'}</h1>
        <p style="color:#94a3b8;margin:8px 0 0;">Relatório gerado automaticamente em ${dataHojeFormatada}</p>
      </div>

      ${vencidas.length === 0 && aVencer.length === 0 ?
        '<p style="font-size:15px;color:#111827;">No momento não há transações pendentes vencidas nem prestes a vencer dentro da regra.</p>' :
        `<div style="background:#f1f5f9;border-radius:8px;padding:15px 20px;margin-bottom:20px;">
          <strong>Resumo do dia:</strong>
          ${vencidas.length > 0 ? `<span style="color:#ef4444;margin-left:15px;">🔴 ${vencidas.length} vencida(s)</span>` : ''}
          ${aVencer.length > 0 ? `<span style="color:#f59e0b;margin-left:15px;">🟡 ${aVencer.length} a vencer em até 3 dias</span>` : ''}
        </div>`}

      ${tabelaVencidas}
      ${tabelaAVencer}

      <p style="margin-top:30px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:15px;">
        Este e-mail é enviado automaticamente pelo sistema FIN às 08:00 todos os dias.
        ${isTeste ? 'Este é um e-mail de teste e pode conter transações reais conforme a regra de vencimento.' : 'Para desativar, acesse Configurações > Alerta de Vencimentos por E-mail.'}
      </p>
    </body>
    </html>
  `;
}

function testarGatilhoEmail(email) {
  if (!email || email.indexOf('@') < 0) {
    return { sucesso: false, mensagem: 'E-mail inválido.' };
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const movs = abaParaJSON('MOVIMENTACOES');
  const pendentes = movs.filter(m => String(m.Status || '').trim().toUpperCase() === 'PENDENTE');

  const vencidas = [];
  const aVencer = [];

  pendentes.forEach(m => {
    if (!m.Data) return;
    const dtStr = formatarDataVal(m.Data);
    if (!dtStr) {
      const dtFallback = formatarDataVal(String(m.Data || '').trim());
      if (!dtFallback) return;
      dtStr = dtFallback;
    }

    const partes = dtStr.split('-');
    if (partes.length !== 3) return;
    const dtMov = new Date(partes[0], partes[1] - 1, partes[2]);
    dtMov.setHours(0, 0, 0, 0);

    const diffMs = dtMov.getTime() - hoje.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias < 0) {
      vencidas.push({ ...m, diasVencidos: Math.abs(diffDias), dataFormatada: dtStr });
    } else if (diffDias >= 0 && diffDias <= 3) {
      aVencer.push({ ...m, diasRestantes: diffDias, dataFormatada: dtStr });
    }
  });

  const dataHojeFormatada = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
  const corpoHtml = gerarCorpoAlertaVencimentos(vencidas, aVencer, dataHojeFormatada, true);
  const assunto = `[FIN TESTE] Alerta de Vencimentos — ${vencidas.length} vencida(s), ${aVencer.length} a vencer — ${dataHojeFormatada}`;

  try {
    MailApp.sendEmail({
      to: email,
      subject: assunto,
      htmlBody: corpoHtml
    });
    return { sucesso: true, mensagem: 'E-mail de teste enviado com sucesso para ' + email };
  } catch (e) {
    return { sucesso: false, mensagem: 'Erro ao enviar e-mail de teste: ' + e.message };
  }
}

/**
 * Função principal executada pelo trigger às 08:00.
 * Verifica movimentações PENDENTES vencidas ou próximas do vencimento e envia e-mail.
 */
function enviarAlertaVencimentos() {
  const email = PropertiesService.getScriptProperties().getProperty('ALERTA_EMAIL');
  if (!email) return; // Sem e-mail configurado, não faz nada

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const movs = abaParaJSON('MOVIMENTACOES');
  const pendentes = movs.filter(m => String(m.Status).toUpperCase() === 'PENDENTE');

  const vencidas = [];
  const aVencer  = [];

  pendentes.forEach(m => {
    if (!m.Data) return;
    const dtStr = formatarDataVal(m.Data);
    if (!dtStr) return;

    const partes = dtStr.split('-');
    if (partes.length !== 3) return;
    const dtMov = new Date(partes[0], partes[1] - 1, partes[2]);
    dtMov.setHours(0, 0, 0, 0);

    const diffMs   = dtMov.getTime() - hoje.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias < 0) {
      // Já venceu — quantos dias atrás
      vencidas.push({ ...m, diasVencidos: Math.abs(diffDias), dataFormatada: dtStr });
    } else if (diffDias >= 0 && diffDias <= 3) {
      // Vence em até 3 dias
      aVencer.push({ ...m, diasRestantes: diffDias, dataFormatada: dtStr });
    }
  });

  // Se não há nada a reportar, não envia e-mail
  if (vencidas.length === 0 && aVencer.length === 0) return;

  // ── Monta o corpo do e-mail em HTML ──────────────────────
  const formatarBRL = v => {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatarDtBR = iso => {
    if (!iso) return '';
    const p = iso.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  };

  let tabelaVencidas = '';
  if (vencidas.length > 0) {
    tabelaVencidas = `
      <h2 style="color:#ef4444;margin-top:30px;">🔴 Transações Vencidas (${vencidas.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#fee2e2;">
            <th style="padding:10px;border:1px solid #fca5a5;text-align:left;">Descrição</th>
            <th style="padding:10px;border:1px solid #fca5a5;text-align:left;">Vencimento</th>
            <th style="padding:10px;border:1px solid #fca5a5;text-align:right;">Valor</th>
            <th style="padding:10px;border:1px solid #fca5a5;text-align:center;">Dias Vencidos</th>
          </tr>
        </thead>
        <tbody>
          ${vencidas.map(m => `
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;">${m.Descricao || '-'}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${formatarDtBR(m.dataFormatada)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;color:#ef4444;font-weight:bold;">${formatarBRL(m.Valor)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;color:#ef4444;font-weight:bold;">⚠️ ${m.diasVencidos} dia(s)</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  let tabelaAVencer = '';
  if (aVencer.length > 0) {
    tabelaAVencer = `
      <h2 style="color:#f59e0b;margin-top:30px;">🟡 Vencendo em Breve (${aVencer.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#fef3c7;">
            <th style="padding:10px;border:1px solid #fcd34d;text-align:left;">Descrição</th>
            <th style="padding:10px;border:1px solid #fcd34d;text-align:left;">Vencimento</th>
            <th style="padding:10px;border:1px solid #fcd34d;text-align:right;">Valor</th>
            <th style="padding:10px;border:1px solid #fcd34d;text-align:center;">Dias Restantes</th>
          </tr>
        </thead>
        <tbody>
          ${aVencer.map(m => `
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;">${m.Descricao || '-'}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${formatarDtBR(m.dataFormatada)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;color:#f59e0b;font-weight:bold;">${formatarBRL(m.Valor)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${m.diasRestantes === 0 ? '🔥 Vence <strong>HOJE</strong>' : '⏳ ' + m.diasRestantes + ' dia(s)'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  const dataHojeFormatada = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');

  const corpoHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#1e293b;">
      <div style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:25px 30px;border-radius:12px;margin-bottom:25px;">
        <h1 style="color:#f8fafc;margin:0;font-size:22px;">💰 FIN — Alerta de Vencimentos</h1>
        <p style="color:#94a3b8;margin:8px 0 0;">Relatório gerado automaticamente em ${dataHojeFormatada}</p>
      </div>

      ${vencidas.length > 0 || aVencer.length > 0 ? `
        <div style="background:#f1f5f9;border-radius:8px;padding:15px 20px;margin-bottom:20px;">
          <strong>Resumo do dia:</strong>
          ${vencidas.length > 0 ? `<span style="color:#ef4444;margin-left:15px;">🔴 ${vencidas.length} vencida(s)</span>` : ''}
          ${aVencer.length > 0 ? `<span style="color:#f59e0b;margin-left:15px;">🟡 ${aVencer.length} a vencer em até 3 dias</span>` : ''}
        </div>
      ` : ''}

      ${tabelaVencidas}
      ${tabelaAVencer}

      <p style="margin-top:30px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:15px;">
        Este e-mail é enviado automaticamente pelo sistema FIN às 08:00 todos os dias.
        Para desativar, acesse Configurações > Alerta de Vencimentos por E-mail.
      </p>
    </body>
    </html>
  `;

  const assunto = `[FIN] Alerta de Vencimentos — ${vencidas.length} vencida(s), ${aVencer.length} a vencer — ${dataHojeFormatada}`;

  try {
    MailApp.sendEmail({
      to: email,
      subject: assunto,
      htmlBody: corpoHtml
    });
    Logger.log('Alerta enviado para: ' + email);
  } catch (e) {
    Logger.log('Erro ao enviar alerta: ' + e.message);
  }
}
