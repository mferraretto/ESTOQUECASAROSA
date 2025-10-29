// app.js
import { app, auth, db, storage, F, S } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const pages = [...document.querySelectorAll('nav a')];
const sections = [...document.querySelectorAll('main > section')];
pages.forEach(a=>a.addEventListener('click',(e)=>{
  e.preventDefault();
  pages.forEach(x=>x.classList.remove('active'));
  a.classList.add('active');
  const id = a.dataset.page;
  sections.forEach(s=>s.classList.toggle('hidden', s.id!==id));
}));

const $ = (id)=>document.getElementById(id);
const userInfo = $('userInfo');
$('btnSair').addEventListener('click', ()=> signOut(auth));

const state = {
  depositos: [],
  enderecos: [],
  enderecosMap: new Map(),
  conversoes: new Map(),
  ops: [],
  opsMap: new Map()
};

const CAPACIDADE_MAQUINAS = {
  'CNC-01': {manha: 480, tarde: 480, noite: 240},
  'LIXA-01': {manha: 420, tarde: 420, noite: 240},
  'PINT-01': {manha: 360, tarde: 360, noite: 240},
  'MONT-01': {manha: 480, tarde: 480, noite: 300}
};

const selectsDeposito = ['fDeposito','mDeposito','mDepositoDestino','fMovDeposito','invDeposito'];
const selectsEndereco = ['fEndereco','mEndereco','mEnderecoDestino','fMovEndereco','invEndereco'];

function criarOption(value, label){
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function preencherDepositos(selectId, {includeTodos=false, labelTodos='Todos os depósitos'}={}){
  const el = $(selectId);
  if(!el) return;
  el.innerHTML='';
  if(includeTodos) el.appendChild(criarOption('', labelTodos));
  if(!includeTodos) el.appendChild(criarOption('', 'Selecione...'));
  state.depositos.forEach(dep=>{
    const desc = dep.descricao || dep.nome || dep.codigo || dep.id;
    const label = dep.codigo ? `${dep.codigo} — ${desc}` : desc;
    el.appendChild(criarOption(dep.id, label));
  });
}

function preencherEnderecos(selectId, depositoId, {includeTodos=false, labelTodos='Todos os endereços', autoSelectFirst=false}={}){
  const el = $(selectId);
  if(!el) return;
  el.innerHTML='';
  if(includeTodos) el.appendChild(criarOption('', labelTodos));
  if(!includeTodos) el.appendChild(criarOption('', 'Selecione...'));
  const lista = depositoId ? state.enderecos.filter(e=>e.depositoId===depositoId) : state.enderecos;
  lista.forEach(end=>{
    const desc = end.descricao ? `${end.codigo} — ${end.descricao}` : end.codigo;
    el.appendChild(criarOption(end.id, desc));
  });
  if(autoSelectFirst){
    const idx = includeTodos ? 1 : 1;
    if(el.options.length>idx) el.value = el.options[idx].value;
  }
}

function nomeDeposito(id){
  if(!id) return '';
  const dep = state.depositos.find(d=>d.id===id);
  if(!dep) return id;
  return dep.codigo ? `${dep.codigo} — ${(dep.descricao||dep.nome||'')}`.trim() : (dep.descricao||dep.nome||dep.id);
}

function nomeEndereco(id){
  if(!id) return '';
  const end = state.enderecosMap.get(id);
  if(!end) return id;
  return end.descricao ? `${end.codigo} — ${end.descricao}` : end.codigo;
}

onAuthStateChanged(auth, async (user)=>{
  if(!user){ window.location.href='./index.html'; return; }
  userInfo.textContent = user.email;
  await carregarLocais();
  await carregarConversoes();
  prepararCombos();
  await carregarKPIs();
  await listarItens();
  await listarMovs();
  await listarReservas();
  await carregarOrdensProducao();
});

// ----------------- ITENS -----------------
$('frmItem').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const codigo = $('iCodigo').value.trim().toUpperCase();
  const desc = $('iDesc').value.trim();
  const umBase = $('iUM').value;
  const custo = Number($('iCusto').value||0);
  const min = Number($('iMin').value||0);
  const obs = $('iObs').value.trim();
  const ref = F.doc(db,'itens',codigo);
  await F.setDoc(ref,{
    codigo, descricao:desc, umBase, custoMedio:custo, min, estoqueTotal: 0, obs,
    atualizadoEm:F.serverTimestamp()
  }, {merge:true});
  $('itemMsg').textContent = 'Item salvo.';
  await garantirConversaoPadrao(codigo, umBase);
  await carregarConversoes();
  atualizarConversaoSelect();
  await listarItens();
  e.target.reset();
});

$('btnReloadItens').addEventListener('click', listarItens);
$('buscaItem').addEventListener('input', listarItens);
if($('fDeposito')){
  $('fDeposito').addEventListener('change', ()=>{
    preencherEnderecos('fEndereco', $('fDeposito').value, {includeTodos:true});
    listarItens();
  });
}
if($('fEndereco')) $('fEndereco').addEventListener('change', listarItens);
if($('fMovDeposito')){
  $('fMovDeposito').addEventListener('change', ()=>{
    preencherEnderecos('fMovEndereco', $('fMovDeposito').value, {includeTodos:true});
    listarMovs();
  });
}
if($('fMovEndereco')) $('fMovEndereco').addEventListener('change', listarMovs);
if($('mDeposito')){
  $('mDeposito').addEventListener('change', ()=>preencherEnderecos('mEndereco', $('mDeposito').value, {autoSelectFirst:true}));
}
if($('mDepositoDestino')){
  $('mDepositoDestino').addEventListener('change', ()=>preencherEnderecos('mEnderecoDestino', $('mDepositoDestino').value));
}
if($('mTipo')){
  $('mTipo').addEventListener('change', atualizarUITransferencia);
}
if($('mFIFO')){
  $('mFIFO').addEventListener('change', ()=>{
    $('mLote').disabled = $('mFIFO').checked;
  });
}
if($('mReserva')){
  $('mReserva').addEventListener('change', ()=>{
    $('mPedidoRef').disabled = !$('mReserva').checked;
  });
}
if($('invDeposito')){
  $('invDeposito').addEventListener('change', ()=>preencherEnderecos('invEndereco', $('invDeposito').value, {autoSelectFirst:true}));
}
if($('btnConverterUM')){
  $('btnConverterUM').addEventListener('click', (e)=>{
    e.preventDefault();
    converterUnidade();
  });
}
if($('convItem')){
  $('convItem').addEventListener('change', ()=>{
    const item = $('convItem').value;
    if(!item){
      $('convTabela').innerHTML='';
      $('convResultado').textContent='';
      return;
    }
    const dados = state.conversoes.get(item);
    if(dados && dados.fatores && dados.fatores.length){
      const linhas = dados.fatores.map(f=>`<tr><td>${f.um}</td><td>${Number(f.fator).toFixed(4)} ${dados.umBase}</td></tr>`).join('');
      $('convTabela').innerHTML = `<table><thead><tr><th>UM alternativa</th><th>Equivalência</th></tr></thead><tbody>${linhas}</tbody></table>`;
      $('convResultado').textContent = `Unidade base: ${dados.umBase}`;
    } else {
      $('convTabela').innerHTML = '<div class="help">Cadastre fatores em conversoesUM.</div>';
      $('convResultado').textContent = dados ? `Unidade base: ${dados.umBase||'—'}` : '';
    }
  });
}

async function listarItens(){
  const term = $('buscaItem').value?.trim().toLowerCase() || '';
  const filtroDep = $('fDeposito')?.value || '';
  const filtroEnd = $('fEndereco')?.value || '';
  const q = F.query(F.collection(db,'itens'), F.orderBy('codigo'));
  const snap = await F.getDocs(q);
  const tbody = $('tblItens').querySelector('tbody');
  tbody.innerHTML = '';
  let count=0, saldo=0, valor=0;
  for(const doc of snap.docs){
    const it = doc.data();
    if(it.__deleted) continue;
    if(term && !(it.codigo.toLowerCase().includes(term) || (it.descricao||'').toLowerCase().includes(term))) continue;
    const {total} = await obterSaldoItem(doc.id, filtroDep, filtroEnd);
    const estoqueTotal = Number(total||0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.codigo}</td>
                    <td>${it.descricao||''}</td>
                    <td>${it.umBase||''}</td>
                    <td>${estoqueTotal.toFixed(3)}</td>
                    <td>${(it.min||0)}</td>
                    <td>R$ ${(it.custoMedio||0).toFixed(2)}</td>
                    <td><button data-cod="${it.codigo}" class="btn btn-outline btnDel">Del</button></td>`;
    tbody.appendChild(tr);
    count++; saldo += estoqueTotal; valor += estoqueTotal*(it.custoMedio||0);
  }
  $('kpiItens').textContent = count;
  $('kpiSaldo').textContent = saldo.toFixed(3);
  $('kpiValor').textContent = 'R$ ' + valor.toFixed(2);
  tbody.querySelectorAll('.btnDel').forEach(b=>b.addEventListener('click',()=>delItem(b.dataset.cod)));
}

async function delItem(cod){
  if(!confirm('Remover item '+cod+'?')) return;
  await F.setDoc(F.doc(db,'itens',cod), { __deleted:true }, {merge:true});
  // Em produção, trocar por FLAG e filtro; a exclusão física requer apagar referência segura.
  await listarItens();
}

// ----------------- MOVIMENTAÇÕES -----------------
$('frmMov').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const tipo = $('mTipo').value;
  const item = $('mItem').value.trim().toUpperCase();
  const qtd = Number($('mQtd').value);
  const custo = Number($('mCusto').value||0);
  const cc = $('mCC').value.trim().toUpperCase();
  const obs = $('mObs').value.trim();
  const depositoId = $('mDeposito')?.value || '';
  const enderecoId = $('mEndereco')?.value || '';
  const depositoDestinoId = $('mDepositoDestino')?.value || '';
  const enderecoDestinoId = $('mEnderecoDestino')?.value || '';
  const loteId = $('mFIFO').checked ? '' : $('mLote').value.trim().toUpperCase();
  const validadeStr = $('mValidade').value;
  const validade = validadeStr ? new Date(`${validadeStr}T00:00:00`) : null;
  const usarFIFO = $('mFIFO').checked;
  const causa = $('mCausa').value;
  const reservar = $('mReserva').checked;
  const pedidoRef = $('mPedidoRef').value.trim();

  try{
    if(reservar){
      if(!pedidoRef) throw new Error('Informe o pedido/referência para a reserva.');
      if(!enderecoId) throw new Error('Selecione o endereço para reservar o item.');
      await registrarReserva({item, qtd, enderecoId, depositoId, pedidoRef, obs});
      $('movMsg').textContent = 'Reserva registrada.';
    } else {
      await registrarMovimento({
        tipo, item, qtd, custo, cc, obs,
        depositoId, enderecoId,
        depositoDestinoId, enderecoDestinoId,
        loteId, validade, usarFIFO, causa
      });
      $('movMsg').textContent = 'Movimentação registrada.';
    }
    await listarMovs();
    await listarItens();
    await listarReservas();
    e.target.reset();
    atualizarUITransferencia();
    $('mPedidoRef').disabled = true;
    if($('mLote')) $('mLote').disabled = $('mFIFO').checked;
  }catch(err){
    console.error(err);
    $('movMsg').textContent = 'Erro: '+err.message;
  }
});

async function listarMovs(limitN=20){
  const q = F.query(F.collection(db,'movimentos'), F.orderBy('criadoEm','desc'), F.limit(limitN));
  const snap = await F.getDocs(q);
  const tbody = $('tblMov').querySelector('tbody');
  tbody.innerHTML='';
  const filtroDep = $('fMovDeposito')?.value || '';
  const filtroEnd = $('fMovEndereco')?.value || '';
  let count=0;
  snap.forEach(doc=>{
    const m = doc.data();
    if(filtroDep && m.depositoId !== filtroDep && m.depositoDestinoId !== filtroDep) return;
    if(filtroEnd){
      const matchOrigem = m.enderecoId === filtroEnd;
      const matchDestino = m.enderecoDestinoId === filtroEnd;
      if(!matchOrigem && !matchDestino) return;
    }
    const dt = (m.criadoEm && m.criadoEm.toDate) ? m.criadoEm.toDate() : new Date();
    const depositoLabel = m.tipo==='TRANSFER' && m.depositoDestinoId ? `${nomeDeposito(m.depositoId)} → ${nomeDeposito(m.depositoDestinoId)}` : nomeDeposito(m.depositoId);
    const enderecoLabel = m.tipo==='TRANSFER' && m.enderecoDestinoId ? `${nomeEndereco(m.enderecoId)} → ${nomeEndereco(m.enderecoDestinoId)}` : nomeEndereco(m.enderecoId);
    const causa = m.causa || '';
    const obsPartes = [];
    if(m.obs) obsPartes.push(m.obs);
    if(m.custo) obsPartes.push(`Custo: R$ ${Number(m.custo).toFixed(2)}`);
    if(m.cc) obsPartes.push(`CC: ${m.cc}`);
    if(m.usarFIFO) obsPartes.push('FIFO');
    if(m.status) obsPartes.push(m.status.toUpperCase());
    const obs = obsPartes.join(' • ');
    const loteInfo = m.lotesUtilizados ? m.lotesUtilizados.map(l=>`${l.loteId}:${l.qtd}`).join(', ') : (m.loteId||'');
    tbody.insertAdjacentHTML('beforeend', `<tr>
      <td>${dt.toLocaleString()}</td><td>${m.tipo}</td><td>${m.item}</td><td>${Number(m.qtd||0).toFixed(3)}</td>
      <td>${depositoLabel}</td><td>${enderecoLabel}</td><td>${loteInfo}</td><td>${causa}</td><td>${obs}</td>
    </tr>`);
    count++;
  });
  $('kpiMov').textContent = count;
}

// ----------------- BOM -----------------
$('frmBOM').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const prod = $('bomProduto').value.trim().toUpperCase();
  const item = $('bomItem').value.trim().toUpperCase();
  const qtd = Number($('bomQtd').value);
  const perdaPadraoPct = Number($('bomPerda').value||0);
  const ref = F.doc(db, 'bom', prod, 'componentes', item);
  await F.setDoc(ref, { qtd, perdaPadraoPct }, {merge:true});
  $('bomMsg').textContent = 'Componente adicionado.';
  await listarBOMTabela(prod);
  e.target.reset();
});

async function listarBOMTabela(prod){
  const tbody = $('tblBOM').querySelector('tbody');
  tbody.innerHTML='';
  const q = F.query(F.collection(db,'bom',prod,'componentes'));
  const snap = await F.getDocs(q);
  snap.forEach(d=>{
    const c = d.data();
    if(c.__deleted) return;
    const perdaPct = Number(c.perdaPadraoPct||0).toFixed(2);
    const linha = `
      <tr>
        <td>${prod}</td>
        <td>${d.id}</td>
        <td>${c.qtd}</td>
        <td>${perdaPct}</td>
        <td><button class="btn btn-outline" data-rem="${d.id}" data-prod="${prod}">Remover</button></td>
      </tr>`;
    tbody.insertAdjacentHTML('beforeend', linha);
  });
  tbody.querySelectorAll('[data-rem]').forEach(btn=>btn.addEventListener('click',()=>remBOM(btn.dataset.prod, btn.dataset.rem)));
}

async function remBOM(prod, item){
  await F.setDoc(F.doc(db,'bom',prod,'componentes',item), {__deleted:true}, {merge:true});
  await listarBOMTabela(prod);
}

$('btnLoadBOM').addEventListener('click', async ()=>{
  const prod = $('bomLookup').value.trim().toUpperCase();
  const tbody = $('tblBOMView').querySelector('tbody');
  tbody.innerHTML='';
  const q = F.query(F.collection(db,'bom',prod,'componentes'));
  const snap = await F.getDocs(q);
  snap.forEach(d=>{
    const c = d.data();
    if(c.__deleted) return;
    const perdaPct = Number(c.perdaPadraoPct||0).toFixed(2);
    tbody.insertAdjacentHTML('beforeend', `<tr><td>${d.id}</td><td>${c.qtd}</td><td>${perdaPct}</td></tr>`);
  });
});

$('frmSubproduto').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const prod = $('subProduto').value.trim().toUpperCase();
  const item = $('subItem').value.trim().toUpperCase();
  const qtdPorUnid = Number($('subQtd').value||0);
  if(!prod || !item){ $('subMsg').textContent = 'Informe produto e item.'; return; }
  await F.addDoc(F.collection(db,'subprodutos',prod,'itens'), {
    item, qtdPorUnid
  });
  $('subMsg').textContent = 'Subproduto cadastrado.';
  await listarSubprodutosTabela(prod);
  e.target.reset();
});

$('btnLoadSubprodutos').addEventListener('click', async ()=>{
  const prod = $('subProdutoLookup').value.trim().toUpperCase();
  await listarSubprodutosTabela(prod);
});

async function listarSubprodutosTabela(prod){
  const tbody = $('tblSubprodutos').querySelector('tbody');
  tbody.innerHTML='';
  $('subMsg').textContent = '';
  if(!prod){
    $('subMsg').textContent = 'Informe o código do produto para listar.';
    return;
  }
  const q = F.query(F.collection(db,'subprodutos',prod,'itens'));
  const snap = await F.getDocs(q);
  if(snap.size===0){
    tbody.innerHTML = '<tr><td colspan="4">Nenhum subproduto cadastrado.</td></tr>';
    return;
  }
  let inseriu = false;
  snap.forEach(doc=>{
    const data = doc.data();
    if(data.__deleted) return;
    const linha = `<tr><td>${prod}</td><td>${data.item}</td><td>${Number(data.qtdPorUnid||0).toFixed(3)}</td>`+
      `<td><button class="btn btn-outline" data-sub="${doc.id}" data-prod="${prod}">Remover</button></td></tr>`;
    tbody.insertAdjacentHTML('beforeend', linha);
    inseriu = true;
  });
  if(!inseriu){
    tbody.innerHTML = '<tr><td colspan="4">Nenhum subproduto cadastrado.</td></tr>';
    return;
  }
  tbody.querySelectorAll('[data-sub]').forEach(btn=>btn.addEventListener('click',()=>removerSubproduto(btn.dataset.prod, btn.dataset.sub)));
}

async function removerSubproduto(prod, id){
  await F.setDoc(F.doc(db,'subprodutos',prod,'itens',id), {__deleted:true}, {merge:true});
  await listarSubprodutosTabela(prod);
}

// ----------------- PRODUÇÃO -----------------
$('frmNovaOP').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const produto = $('opProduto').value.trim().toUpperCase();
  const qtdPlanejada = Number($('opQtdPlanejada').value||0);
  $('opMsg').textContent = '';
  try{
    if(!produto){ throw new Error('Informe o produto.'); }
    if(!(qtdPlanejada>0)){ throw new Error('Quantidade inválida.'); }
    const bom = await obterBOM(produto);
    if(bom.length===0){ throw new Error('Sem BOM cadastrada para '+produto); }
    const ref = await F.addDoc(F.collection(db,'op'), {
      produto,
      qtdPlanejada,
      qtdProduzida: 0,
      status: 'planejada',
      inicio: F.serverTimestamp(),
      fim: null
    });
    await recalcularCustosOP(ref.id);
    $('opMsg').textContent = 'Ordem criada.';
    await carregarOrdensProducao();
    e.target.reset();
  }catch(err){
    console.error(err);
    $('opMsg').textContent = 'Erro: '+err.message;
  }
});

$('frmParcialOP').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const opId = $('opParcialOP').value;
  const qtd = Number($('opQtdParcial').value||0);
  $('opParcialMsg').textContent = '';
  try{
    if(!opId){ throw new Error('Selecione a ordem.'); }
    if(!(qtd>0)){ throw new Error('Quantidade inválida.'); }
    await produzirParcial(opId, qtd);
    $('opParcialMsg').textContent = 'Produção parcial registrada.';
    e.target.reset();
    if($('opParcialOP')) $('opParcialOP').value = opId;
    await carregarOrdensProducao();
  }catch(err){
    console.error(err);
    $('opParcialMsg').textContent = 'Erro: '+err.message;
  }
});

$('frmEtapaOP').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const opId = $('opEtapaOP').value;
  const nome = $('opEtapaNome').value||'outros';
  const maquina = $('opEtapaMaquina').value;
  const operador = $('opEtapaOperador').value.trim();
  const inicioStr = $('opEtapaInicio').value;
  const fimStr = $('opEtapaFim').value;
  const perda = Number($('opEtapaPerda').value||0);
  const observacao = $('opEtapaObs').value.trim();
  $('opEtapaMsg').textContent = '';
  try{
    if(!opId) throw new Error('Selecione a ordem.');
    if(!inicioStr || !fimStr) throw new Error('Informe início e fim.');
    const inicio = new Date(inicioStr);
    const fim = new Date(fimStr);
    if(!(fim>inicio)) throw new Error('Fim deve ser após o início.');
    const duracaoMin = (fim-inicio)/60000;
    await validarCapacidadeMaquina(maquina, inicio, fim, duracaoMin);
    await F.addDoc(F.collection(db,'op',opId,'etapas'), {
      nome: (nome||'').toUpperCase(),
      maquina,
      operador,
      inicio,
      fim,
      perda,
      observacao
    });
    $('opEtapaMsg').textContent = 'Etapa registrada.';
    await recalcularCustosOP(opId);
    await listarEtapas(opId);
    await carregarOrdensProducao();
    e.target.reset();
    if($('opEtapaOP')) $('opEtapaOP').value = opId;
    if($('opEtapasFiltro')) $('opEtapasFiltro').value = opId;
  }catch(err){
    console.error(err);
    $('opEtapaMsg').textContent = 'Erro: '+err.message;
  }
});

if($('opEtapasFiltro')){
  $('opEtapasFiltro').addEventListener('change', ()=>{
    const opId = $('opEtapasFiltro').value;
    if(opId) listarEtapas(opId);
  });
}

async function carregarOrdensProducao(){
  let snap;
  try{
    const q = F.query(F.collection(db,'op'), F.orderBy('inicio','desc'));
    snap = await F.getDocs(q);
  }catch(err){
    console.warn('Falha ao ordenar OP por início, usando ordenação padrão.', err);
    snap = await F.getDocs(F.query(F.collection(db,'op')));
  }
  state.ops = [];
  state.opsMap = new Map();
  snap.forEach(doc=>{
    const data = doc.data();
    const registro = {id: doc.id, ...data};
    state.ops.push(registro);
    state.opsMap.set(doc.id, registro);
  });
  state.ops.sort((a,b)=>{
    const ai = a.inicio && a.inicio.toDate ? a.inicio.toDate().getTime() : new Date(a.inicio||0).getTime();
    const bi = b.inicio && b.inicio.toDate ? b.inicio.toDate().getTime() : new Date(b.inicio||0).getTime();
    return (bi||0) - (ai||0);
  });
  atualizarOpSelects();
  renderOrdensProducao();
  const filtro = $('opEtapasFiltro');
  if(filtro){
    if(!filtro.value && state.ops.length){
      filtro.value = state.ops[0].id;
    }
    if(filtro.value){
      await listarEtapas(filtro.value);
    } else {
      const tbody = $('tblEtapasOP')?.querySelector('tbody');
      if(tbody) tbody.innerHTML='';
    }
  }
}

function atualizarOpSelects(){
  const selects = [$('opParcialOP'), $('opEtapaOP'), $('opEtapasFiltro')];
  selects.forEach(sel=>{
    if(!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Selecione...</option>';
    state.ops.forEach(op=>{
      const label = `${op.id.slice(-6)} — ${op.produto}`;
      const opt = document.createElement('option');
      opt.value = op.id;
      opt.textContent = label;
      sel.appendChild(opt);
    });
    if(current && state.opsMap.has(current)) sel.value = current;
  });
}

function renderOrdensProducao(){
  const tbody = $('tblOP')?.querySelector('tbody');
  if(!tbody) return;
  tbody.innerHTML='';
  if(state.ops.length===0){
    tbody.innerHTML = '<tr><td colspan="10">Nenhuma ordem cadastrada.</td></tr>';
    return;
  }
  state.ops.forEach(op=>{
    const inicio = op.inicio && op.inicio.toDate ? op.inicio.toDate() : (op.inicio ? new Date(op.inicio) : null);
    const fim = op.fim && op.fim.toDate ? op.fim.toDate() : (op.fim ? new Date(op.fim) : null);
    const linha = `<tr>
      <td>${op.id}</td>
      <td>${op.produto||''}</td>
      <td>${Number(op.qtdPlanejada||0).toFixed(3)}</td>
      <td>${Number(op.qtdProduzida||0).toFixed(3)}</td>
      <td>${(op.status||'').toUpperCase()}</td>
      <td>${inicio?inicio.toLocaleString():''}</td>
      <td>${fim?fim.toLocaleString():''}</td>
      <td>${Number(op.perdaRealTotal||0).toFixed(3)}</td>
      <td>R$ ${Number(op.custoPrevisto||0).toFixed(2)}</td>
      <td>R$ ${Number(op.custoReal||0).toFixed(2)}</td>
    </tr>`;
    tbody.insertAdjacentHTML('beforeend', linha);
  });
}

async function listarEtapas(opId){
  const tbody = $('tblEtapasOP')?.querySelector('tbody');
  if(!tbody) return;
  tbody.innerHTML='';
  if(!opId){ return; }
  const q = F.query(F.collection(db,'op',opId,'etapas'), F.orderBy('inicio','desc'));
  const snap = await F.getDocs(q);
  if(snap.size===0){
    tbody.innerHTML = '<tr><td colspan="7">Nenhuma etapa registrada.</td></tr>';
    return;
  }
  snap.forEach(doc=>{
    const etapa = doc.data();
    const inicio = etapa.inicio && etapa.inicio.toDate ? etapa.inicio.toDate() : (etapa.inicio? new Date(etapa.inicio):null);
    const fim = etapa.fim && etapa.fim.toDate ? etapa.fim.toDate() : (etapa.fim? new Date(etapa.fim):null);
    const linha = `<tr><td>${inicio?inicio.toLocaleString():''}</td><td>${fim?fim.toLocaleString():''}</td><td>${(etapa.nome||'').toUpperCase()}</td><td>${etapa.operador||''}</td><td>${etapa.maquina||''}</td><td>${Number(etapa.perda||0).toFixed(3)}</td><td>${etapa.observacao||''}</td></tr>`;
    tbody.insertAdjacentHTML('beforeend', linha);
  });
}

async function produzirParcial(opId, qtd){
  const opRef = F.doc(db,'op',opId);
  const opSnap = await F.getDoc(opRef);
  if(!opSnap.exists()) throw new Error('OP não encontrada.');
  const op = opSnap.data();
  const qtdPlanejada = Number(op.qtdPlanejada||0);
  const qtdProduzida = Number(op.qtdProduzida||0);
  const restante = qtdPlanejada - qtdProduzida;
  if(qtd>restante+1e-6) throw new Error('Quantidade excede o planejado.');
  const bom = await obterBOM(op.produto);
  if(bom.length===0) throw new Error('BOM não encontrada para '+op.produto);
  const endereco = obterEnderecoPadrao();
  for(const comp of bom){
    const fatorPerda = 1 + (Number(comp.perdaPadraoPct||0)/100);
    const consumo = qtd * Number(comp.qtd||0) * fatorPerda;
    if(consumo>0){
      await registrarMovimento({
        tipo:'SAIDA',
        item: comp.item,
        qtd: consumo,
        custo: null,
        cc:'PRODUCAO',
        obs:`Consumo OP ${opId}`,
        depositoId: endereco.depositoId,
        enderecoId: endereco.id,
        usarFIFO:true,
        causa:'PRODUCAO'
      });
    }
  }
  const custoUnitario = Number(op.custoUnitarioReal || op.custoUnitarioPrevisto || 0);
  await registrarMovimento({
    tipo:'ENTRADA',
    item: op.produto,
    qtd,
    custo: custoUnitario,
    cc:'PRODUCAO',
    obs:`Produção OP ${opId}`,
    depositoId: endereco.depositoId,
    enderecoId: endereco.id,
    causa:'PRODUCAO'
  });
  const subprodutos = await obterSubprodutos(op.produto);
  for(const sub of subprodutos){
    const quantidade = qtd * Number(sub.qtdPorUnid||0);
    if(quantidade<=0) continue;
    await registrarMovimento({
      tipo:'ENTRADA',
      item: sub.item,
      qtd: quantidade,
      custo: 0,
      cc:'PRODUCAO',
      obs:`Subproduto OP ${opId}`,
      depositoId: endereco.depositoId,
      enderecoId: endereco.id,
      causa:'SUBPRODUTO'
    });
  }
  const atualizacoes = {
    qtdProduzida: F.increment(qtd),
    status: 'em_andamento'
  };
  if(qtdProduzida + qtd >= qtdPlanejada - 1e-6){
    atualizacoes.status = 'concluida';
    atualizacoes.fim = F.serverTimestamp();
  }
  await F.setDoc(opRef, atualizacoes, {merge:true});
  await recalcularCustosOP(opId);
  await listarItens();
  await listarMovs();
}

async function obterBOM(produto){
  const q = F.query(F.collection(db,'bom',produto,'componentes'));
  const snap = await F.getDocs(q);
  const lista = [];
  snap.forEach(doc=>{
    const data = doc.data();
    if(data.__deleted) return;
    lista.push({item: doc.id, qtd: Number(data.qtd||0), perdaPadraoPct: Number(data.perdaPadraoPct||0)});
  });
  return lista;
}

async function obterSubprodutos(produto){
  const q = F.query(F.collection(db,'subprodutos',produto,'itens'));
  const snap = await F.getDocs(q);
  const lista = [];
  snap.forEach(doc=>{
    const data = doc.data();
    if(data.__deleted) return;
    lista.push({id: doc.id, item: data.item, qtdPorUnid: Number(data.qtdPorUnid||0)});
  });
  return lista;
}

function obterTurnoInfo(data){
  const dt = new Date(data);
  const hora = dt.getHours();
  let turno = 'noite';
  if(hora>=6 && hora<14) turno = 'manha';
  else if(hora>=14 && hora<22) turno = 'tarde';
  const inicio = new Date(dt);
  if(turno==='manha') inicio.setHours(6,0,0,0);
  else if(turno==='tarde') inicio.setHours(14,0,0,0);
  else inicio.setHours(22,0,0,0);
  const fim = new Date(inicio.getTime() + 8*60*60*1000);
  return {turno, inicio, fim};
}

async function validarCapacidadeMaquina(maquina, inicio, fim, duracaoMin){
  const turnos = CAPACIDADE_MAQUINAS[maquina];
  if(!turnos) return;
  const info = obterTurnoInfo(inicio);
  const capacidade = turnos[info.turno];
  if(!capacidade) return;
  const q = F.query(
    F.collectionGroup(db,'etapas'),
    F.where('maquina','==',maquina),
    F.where('inicio','>=',info.inicio),
    F.where('inicio','<',info.fim)
  );
  const snap = await F.getDocs(q);
  let total = 0;
  snap.forEach(doc=>{
    const etapa = doc.data();
    const ini = etapa.inicio && etapa.inicio.toDate ? etapa.inicio.toDate() : (etapa.inicio? new Date(etapa.inicio):null);
    const fm = etapa.fim && etapa.fim.toDate ? etapa.fim.toDate() : (etapa.fim? new Date(etapa.fim):null);
    if(!ini || !fm) return;
    total += Math.max((fm-ini)/60000, 0);
  });
  if(total + duracaoMin > capacidade + 1e-6){
    const disponivel = Math.max(capacidade - total, 0);
    throw new Error(`Capacidade excedida para ${maquina} (${info.turno}). Disponível ${disponivel.toFixed(1)} min.`);
  }
}

async function recalcularCustosOP(opId){
  const opRef = F.doc(db,'op',opId);
  const opSnap = await F.getDoc(opRef);
  if(!opSnap.exists()) return;
  const op = opSnap.data();
  const bom = await obterBOM(op.produto);
  let custoPrevisto = 0;
  let perdaPadraoTotal = 0;
  for(const comp of bom){
    const base = Number(comp.qtd||0) * Number(op.qtdPlanejada||0);
    const perdaPadrao = base * (Number(comp.perdaPadraoPct||0)/100);
    perdaPadraoTotal += perdaPadrao;
    const totalComp = base + perdaPadrao;
    const itSnap = await F.getDoc(F.doc(db,'itens',comp.item));
    const custoMedio = itSnap.exists()? Number(itSnap.data().custoMedio||0) : 0;
    custoPrevisto += totalComp * custoMedio;
  }
  const etapasSnap = await F.getDocs(F.collection(db,'op',opId,'etapas'));
  let perdaRealTotal = 0;
  etapasSnap.forEach(doc=>{
    const etapa = doc.data();
    perdaRealTotal += Number(etapa.perda||0);
  });
  const qtdPlanejada = Number(op.qtdPlanejada||0);
  const qtdBoa = Math.max(qtdPlanejada - perdaRealTotal, 0.0001);
  const custoReal = qtdBoa>0 ? custoPrevisto * (qtdPlanejada / qtdBoa) : custoPrevisto;
  const custoUnitPrev = qtdPlanejada>0 ? custoPrevisto / qtdPlanejada : 0;
  const custoUnitReal = custoReal / qtdBoa;
  await F.setDoc(opRef, {
    perdaPadraoTotal: Number(perdaPadraoTotal.toFixed(3)),
    perdaRealTotal: Number(perdaRealTotal.toFixed(3)),
    custoPrevisto: Number(custoPrevisto.toFixed(2)),
    custoReal: Number(custoReal.toFixed(2)),
    custoUnitarioPrevisto: Number(custoUnitPrev.toFixed(2)),
    custoUnitarioReal: Number(custoUnitReal.toFixed(2)),
    atualizadoEm: F.serverTimestamp()
  }, {merge:true});
}
// ----------------- INVENTÁRIO -----------------
$('frmInv').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const item = $('invItem').value.trim().toUpperCase();
  const qtd = Number($('invQtd').value);
  const enderecoId = $('invEndereco')?.value || '';
  if(!enderecoId){ $('invMsg').textContent='Selecione o endereço do inventário.'; return; }
  const depositoId = $('invDeposito')?.value || state.enderecosMap.get(enderecoId)?.depositoId || '';
  const itRef = F.doc(db,'itens',item);
  const itSnap = await F.getDoc(itRef);
  const atual = itSnap.exists()? (itSnap.data().estoqueTotal||0) : 0;
  const diff = qtd - atual;
  if(diff===0){ $('invMsg').textContent='Nada a ajustar.'; return; }
  if(diff>0){
    await registrarMovimento({
      tipo:'ENTRADA', item, qtd:diff, custo: itSnap.exists()? (itSnap.data().custoMedio||0) : 0,
      cc:'AJUSTE', obs:'Inventário +', depositoId, enderecoId, causa:'AJUSTE'
    });
  } else {
    await registrarMovimento({
      tipo:'SAIDA', item, qtd:Math.abs(diff), custo: itSnap.exists()? (itSnap.data().custoMedio||0) : 0,
      cc:'AJUSTE', obs:'Inventário -', depositoId, enderecoId, usarFIFO:true, causa:'AJUSTE'
    });
  }
  $('invMsg').textContent='Ajuste aplicado.';
  await listarItens();
  await listarMovs();
  e.target.reset();
});

// ----------------- DASHBOARD KPIs -----------------
async function carregarKPIs(){
  // KPIs básicos vindos de listarItens()
  // Tabela de consumo: soma saídas dos últimos 30 dias por item
  const dias = 30;
  const desde = new Date(Date.now() - dias*24*60*60*1000);
  const q = F.query(F.collection(db,'movimentos'), F.where('criadoEm','>=',desde), F.orderBy('criadoEm','desc'));
  const snap = await F.getDocs(q);
  const consumoMap = new Map();
  const estoqueMap = new Map();

  // Pré-carrega estoque
  const itensSnap = await F.getDocs(F.query(F.collection(db,'itens')));
  itensSnap.forEach(d=>{
    const data = d.data();
    estoqueMap.set(d.id, {estoque:Number(data.estoqueTotal||0), umBase:data.umBase||'UN'});
  });

  snap.forEach(d=>{
    const m = d.data();
    if(m.tipo==='SAIDA'){
      consumoMap.set(m.item, (consumoMap.get(m.item)||0)+Number(m.qtd||0));
    }
  });

  const arr = [...consumoMap.entries()].map(([item,consumo])=>{
    const info = estoqueMap.get(item)||{estoque:0, umBase:'UN'};
    const est = info.estoque||0;
    const proj = consumo>0 ? (est/consumo)*30 : Infinity;
    return {item, consumo, est, proj: isFinite(proj)? proj : '—', umBase:info.umBase};
  }).sort((a,b)=>b.consumo-a.consumo).slice(0,10);

  const tbody = $('tblConsumo').querySelector('tbody');
  tbody.innerHTML='';
  arr.forEach(r=>{
    tbody.insertAdjacentHTML('beforeend', `<tr><td>${r.item}</td><td>${r.umBase||'UN'}</td><td>${r.consumo.toFixed(3)}</td><td>${r.est.toFixed(3)}</td><td>${typeof r.proj==='number'? r.proj.toFixed(1)+' dias':'—'}</td></tr>`);
  });
}

// ----------------- HELPERS E INTEGRAÇÕES AVANÇADAS -----------------
async function carregarLocais(){
  const [depsSnap, endSnap] = await Promise.all([
    F.getDocs(F.query(F.collection(db,'depositos'))),
    F.getDocs(F.query(F.collection(db,'enderecos')))
  ]);
  state.depositos = depsSnap.docs.map(d=>({id:d.id, ...d.data()}));
  state.enderecos = endSnap.docs.map(d=>({id:d.id, ...d.data()}));
  state.enderecosMap = new Map(state.enderecos.map(e=>[e.id, e]));
}

async function carregarConversoes(){
  const snap = await F.getDocs(F.collection(db,'conversoesUM'));
  state.conversoes = new Map();
  snap.forEach(doc=>state.conversoes.set(doc.id, doc.data()));
}

function prepararCombos(){
  if($('fDeposito')){
    preencherDepositos('fDeposito', {includeTodos:true});
    preencherEnderecos('fEndereco', $('fDeposito').value, {includeTodos:true});
  }
  if($('fMovDeposito')){
    preencherDepositos('fMovDeposito', {includeTodos:true});
    preencherEnderecos('fMovEndereco', $('fMovDeposito').value, {includeTodos:true});
  }
  if($('mDeposito')){
    preencherDepositos('mDeposito');
    const dep = $('mDeposito').value || state.depositos[0]?.id || '';
    if(dep) $('mDeposito').value = dep;
    preencherEnderecos('mEndereco', $('mDeposito').value || dep, {autoSelectFirst:true});
  }
  if($('mDepositoDestino')){
    preencherDepositos('mDepositoDestino');
    preencherEnderecos('mEnderecoDestino', $('mDepositoDestino').value || '');
  }
  if($('invDeposito')){
    preencherDepositos('invDeposito');
    const dep = $('invDeposito').value || state.depositos[0]?.id || '';
    if(dep) $('invDeposito').value = dep;
    preencherEnderecos('invEndereco', $('invDeposito').value || dep, {autoSelectFirst:true});
  }
  atualizarConversaoSelect();
  atualizarUITransferencia();
  if($('mPedidoRef')) $('mPedidoRef').disabled = true;
  if($('mLote')) $('mLote').disabled = $('mFIFO')?.checked || false;
}

function atualizarUITransferencia(){
  const tipo = $('mTipo')?.value;
  const destino = $('destinoTransfer');
  if(!destino) return;
  const isTransf = tipo==='TRANSFER';
  destino.classList.toggle('hidden', !isTransf);
  if(isTransf){
    if(state.depositos.length && $('mDepositoDestino') && !$('mDepositoDestino').value){
      $('mDepositoDestino').value = state.depositos[0].id;
      preencherEnderecos('mEnderecoDestino', $('mDepositoDestino').value);
    }
  }
}

function obterEnderecoPadrao(){
  if(state.enderecos.length===0) throw new Error('Cadastre depósitos e endereços para movimentar itens.');
  const endereco = state.enderecos[0];
  return {id:endereco.id, depositoId:endereco.depositoId};
}

async function registrarMovimento({tipo, item, qtd, custo, cc, obs, depositoId, enderecoId, depositoDestinoId, enderecoDestinoId, loteId, validade, usarFIFO, causa}){
  if(!item) throw new Error('Informe o item.');
  if(!(Number(qtd)>0)) throw new Error('Quantidade deve ser maior que zero.');
  tipo = tipo||'ENTRADA';
  if(tipo==='TRANSFER'){
    if(!enderecoId || !enderecoDestinoId) throw new Error('Informe origem e destino da transferência.');
    const origemInfo = state.enderecosMap.get(enderecoId);
    const destinoInfo = state.enderecosMap.get(enderecoDestinoId);
    if(!origemInfo || !destinoInfo) throw new Error('Endereço de origem/destino inválido.');
    const obsBase = obs||'';
    await registrarMovimento({
      tipo:'SAIDA', item, qtd, custo, cc, obs:`${obsBase} (origem)`.trim(),
      depositoId: depositoId || origemInfo.depositoId,
      enderecoId,
      loteId, validade, usarFIFO: usarFIFO!==false, causa: causa||'TRANSFERENCIA'
    });
    await registrarMovimento({
      tipo:'ENTRADA', item, qtd, custo:null, cc, obs:`${obsBase} (destino)`.trim(),
      depositoId: depositoDestinoId || destinoInfo.depositoId,
      enderecoId: enderecoDestinoId,
      loteId:'', validade, usarFIFO:false, causa: causa||'TRANSFERENCIA'
    });
    return;
  }
  if(!enderecoId) throw new Error('Selecione o endereço.');
  const enderecoInfo = state.enderecosMap.get(enderecoId);
  if(!enderecoInfo) throw new Error('Endereço não encontrado.');
  const depId = depositoId || enderecoInfo.depositoId || '';

  const itRef = F.doc(db,'itens', item);
  const itSnap = await F.getDoc(itRef);
  const itemData = itSnap.exists()? itSnap.data():{};
  const estoqueAtual = Number(itemData.estoqueTotal||0);
  const custoMedioAtual = Number(itemData.custoMedio||0);
  let novoCustoMedio = custoMedioAtual;
  let loteRegistrado = (loteId||'').toUpperCase();
  let lotesUtilizados = null;
  const usarFifoFinal = !!usarFIFO && tipo==='SAIDA';

  if(tipo==='ENTRADA'){
    const valorAtual = estoqueAtual * custoMedioAtual;
    const numeroCusto = Number(custo);
    const custoEntrada = (custo===null || custo===undefined || Number.isNaN(numeroCusto)) ? custoMedioAtual : numeroCusto;
    const valorEntrada = qtd * custoEntrada;
    const novoEstoque = estoqueAtual + qtd;
    novoCustoMedio = novoEstoque>0 ? (valorAtual + valorEntrada)/novoEstoque : custoEntrada;
    await ajustarSaldoEndereco(item, enderecoId, qtd);
    if(loteRegistrado){
      await atualizarLote(item, loteRegistrado, enderecoId, qtd, validade);
    } else if(validade){
      loteRegistrado = gerarLoteAutomatico(validade);
      await atualizarLote(item, loteRegistrado, enderecoId, qtd, validade);
    }
  } else if(tipo==='SAIDA'){
    const saida = await processarSaida({item, qtd, enderecoId, loteId:loteRegistrado, usarFIFO: usarFifoFinal});
    lotesUtilizados = saida.lotes.length ? saida.lotes : null;
  } else {
    throw new Error('Tipo de movimento não suportado.');
  }

  const dadosMov = {
    tipo, item,
    qtd: Number(qtd),
    custo: (custo===null || custo===undefined || Number.isNaN(Number(custo))) ? Number(custoMedioAtual||0) : Number(custo),
    cc, obs,
    criadoEm: F.serverTimestamp(),
    uid: (auth.currentUser||{}).uid,
    depositoId: depId,
    enderecoId,
    causa: causa||'',
    usarFIFO: usarFifoFinal
  };
  if(loteRegistrado) dadosMov.loteId = loteRegistrado;
  if(validade) dadosMov.validade = validade;
  if(lotesUtilizados) dadosMov.lotesUtilizados = lotesUtilizados;

  await F.addDoc(F.collection(db,'movimentos'), dadosMov);

  await atualizarSaldoItemTotal(item, tipo==='ENTRADA'? {novoCustoMedio} : undefined);
}

async function registrarReserva({item, qtd, enderecoId, depositoId, pedidoRef, obs}){
  if(!(Number(qtd)>0)) throw new Error('Quantidade inválida para reserva.');
  const enderecoInfo = state.enderecosMap.get(enderecoId);
  if(!enderecoInfo) throw new Error('Endereço da reserva não encontrado.');
  const depId = depositoId || enderecoInfo.depositoId || '';
  await F.addDoc(F.collection(db,'reservas'), {
    item, qtd, enderecoId, depositoId: depId, pedidoRef, obs,
    status:'reservado', criadoEm:F.serverTimestamp(), uid:(auth.currentUser||{}).uid
  });
}

async function ajustarSaldoEndereco(item, enderecoId, delta){
  const ref = F.doc(db,'itens', item, 'saldos', enderecoId);
  await F.setDoc(ref, {qtd: F.increment(delta), enderecoId}, {merge:true});
}

async function atualizarSaldoItemTotal(item, extra){
  const snap = await F.getDocs(F.collection(db,'itens', item, 'saldos'));
  let total = 0;
  snap.forEach(doc=>{ total += Number((doc.data().qtd)||0); });
  const data = {estoqueTotal: Number(total.toFixed(4)), atualizadoEm:F.serverTimestamp()};
  if(extra && typeof extra.novoCustoMedio === 'number') data.custoMedio = Number(extra.novoCustoMedio.toFixed(4));
  await F.setDoc(F.doc(db,'itens', item), data, {merge:true});
  return total;
}

async function atualizarLote(item, loteId, enderecoId, delta, validade){
  if(!loteId) return;
  const ref = F.doc(db,'lotes', item, 'lotes', loteId);
  const payload = {saldo: F.increment(delta), enderecoId, atualizadoEm:F.serverTimestamp()};
  if(validade) payload.validade = validade;
  await F.setDoc(ref, payload, {merge:true});
}

function gerarLoteAutomatico(validade){
  if(!(validade instanceof Date)) return `AUTO-${Date.now()}`;
  const ano = validade.getFullYear();
  const mes = String(validade.getMonth()+1).padStart(2,'0');
  const dia = String(validade.getDate()).padStart(2,'0');
  return `VAL-${ano}${mes}${dia}`;
}

async function processarSaida({item, qtd, enderecoId, loteId, usarFIFO}){
  let restante = Number(qtd);
  const lotesConsumidos = [];
  const saldoRef = await F.getDoc(F.doc(db,'itens', item, 'saldos', enderecoId));
  const saldoAtual = saldoRef.exists()? Number(saldoRef.data().qtd||0) : 0;
  if(saldoAtual < qtd) throw new Error('Saldo insuficiente no endereço selecionado.');
  if(usarFIFO){
    const lotesSnap = await F.getDocs(F.collection(db,'lotes', item, 'lotes'));
    const ordenados = lotesSnap.docs.sort((a,b)=>{
      const va = a.data().validade?.toDate ? a.data().validade.toDate().getTime() : 0;
      const vb = b.data().validade?.toDate ? b.data().validade.toDate().getTime() : 0;
      return va - vb;
    });
    for(const doc of ordenados){
      const dados = doc.data();
      if(dados.enderecoId && dados.enderecoId !== enderecoId) continue;
      const saldo = Number(dados.saldo||0);
      if(saldo<=0) continue;
      const consumir = Math.min(restante, saldo);
      if(consumir>0){
        await atualizarLote(item, doc.id, enderecoId, -consumir);
        lotesConsumidos.push({loteId: doc.id, qtd: Number(consumir.toFixed(4))});
        restante -= consumir;
        if(restante<=0) break;
      }
    }
    if(restante>0) throw new Error('Saldo insuficiente nos lotes para FIFO.');
  } else if(loteId){
    const ref = F.doc(db,'lotes', item, 'lotes', loteId);
    const snap = await F.getDoc(ref);
    if(!snap.exists()) throw new Error('Lote informado não encontrado.');
    const dados = snap.data();
    if(dados.enderecoId && dados.enderecoId!==enderecoId) throw new Error('Lote pertence a outro endereço.');
    const saldo = Number(dados.saldo||0);
    if(saldo < restante) throw new Error('Saldo insuficiente no lote.');
    await atualizarLote(item, loteId, enderecoId, -restante);
    lotesConsumidos.push({loteId, qtd:Number(restante.toFixed(4))});
    restante = 0;
  }
  await ajustarSaldoEndereco(item, enderecoId, -qtd);
  return {lotes: lotesConsumidos};
}

async function obterSaldoItem(codigo, filtroDep, filtroEnd){
  const snap = await F.getDocs(F.collection(db,'itens', codigo, 'saldos'));
  let total=0;
  const detalhes=[];
  snap.forEach(doc=>{
    const qtd = Number((doc.data().qtd)||0);
    const endId = doc.id;
    const info = state.enderecosMap.get(endId);
    if(!info) return;
    if(filtroDep && info.depositoId !== filtroDep) return;
    if(filtroEnd && endId !== filtroEnd) return;
    total += qtd;
    detalhes.push({enderecoId:endId, qtd});
  });
  return {total, detalhes};
}

async function garantirConversaoPadrao(item, umBase){
  if(!item) return;
  const ref = F.doc(db,'conversoesUM', item);
  const snap = await F.getDoc(ref);
  if(!snap.exists()){
    await F.setDoc(ref,{umBase, fatores:[]});
  } else if(umBase && snap.data().umBase!==umBase){
    await F.setDoc(ref,{umBase},{merge:true});
  }
}

function atualizarConversaoSelect(){
  const sel = $('convItem');
  if(!sel) return;
  sel.innerHTML='';
  sel.appendChild(criarOption('', 'Selecione o item...'));
  const itensOrdenados = [...state.conversoes.entries()].sort(([a],[b])=>a.localeCompare(b));
  itensOrdenados.forEach(([cod, dados])=>{
    const label = dados.umBase ? `${cod} (${dados.umBase})` : cod;
    sel.appendChild(criarOption(cod, label));
  });
  $('convTabela').innerHTML = '';
  $('convResultado').textContent = '';
}

function converterUnidade(){
  const item = $('convItem')?.value;
  const texto = $('convEntrada')?.value?.trim();
  if(!item || !texto){
    $('convResultado').textContent = 'Informe o item e a quantidade/unidade.';
    return;
  }
  const dados = state.conversoes.get(item);
  if(!dados){
    $('convResultado').textContent = 'Nenhuma conversão cadastrada para o item.';
    return;
  }
  const match = texto.match(/([\d.,]+)\s*([\w-]+)/i);
  if(!match){
    $('convResultado').textContent = 'Formato inválido. Exemplo: 3 chapas';
    return;
  }
  const qtd = Number(match[1].replace(',','.'));
  const um = match[2].toUpperCase();
  if(!(qtd>0)){
    $('convResultado').textContent = 'Quantidade inválida.';
    return;
  }
  const base = (dados.umBase||'').toUpperCase();
  let resultado = '';
  if(um===base){
    resultado = `${qtd} ${dados.umBase} já está na unidade base.`;
  } else {
    const fator = (dados.fatores||[]).find(f=>f.um && f.um.toUpperCase()===um);
    if(!fator){
      resultado = `Sem fator cadastrado para ${um}.`;
    } else {
      const baseQtd = qtd * Number(fator.fator||0);
      resultado = `${qtd} ${fator.um} equivalem a ${baseQtd.toFixed(4)} ${dados.umBase}.`;
    }
  }
  $('convResultado').textContent = resultado;
  if(dados.fatores && dados.fatores.length){
    const linhas = dados.fatores.map(f=>`<tr><td>${f.um}</td><td>${Number(f.fator).toFixed(4)} ${dados.umBase}</td></tr>`).join('');
    $('convTabela').innerHTML = `<table><thead><tr><th>UM alternativa</th><th>Equivalência</th></tr></thead><tbody>${linhas}</tbody></table>`;
  } else {
    $('convTabela').innerHTML = '<div class="help">Cadastre fatores em conversoesUM.</div>';
  }
}

async function listarReservas(){
  const tabela = $('tblReservas');
  if(!tabela) return;
  const snap = await F.getDocs(F.query(F.collection(db,'reservas'), F.orderBy('criadoEm','desc'), F.limit(50)));
  const tbody = tabela.querySelector('tbody');
  tbody.innerHTML='';
  snap.forEach(doc=>{
    const r = doc.data();
    const dt = (r.criadoEm && r.criadoEm.toDate)? r.criadoEm.toDate().toLocaleString():'';
    const dep = nomeDeposito(r.depositoId || state.enderecosMap.get(r.enderecoId||'')?.depositoId);
    const endereco = nomeEndereco(r.enderecoId);
    tbody.insertAdjacentHTML('beforeend', `<tr><td>${dt}</td><td>${r.item}</td><td>${Number(r.qtd||0).toFixed(3)}</td><td>${dep||''}<br>${endereco||''}</td><td>${r.pedidoRef||''}</td><td>${(r.status||'reservado').toUpperCase()}</td></tr>`);
  });
  if(snap.size===0){
    tbody.innerHTML = '<tr><td colspan="6" class="help">Sem reservas registradas.</td></tr>';
  }
}
