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

onAuthStateChanged(auth, async (user)=>{
  if(!user){ window.location.href='./index.html'; return; }
  userInfo.textContent = user.email;
  await carregarKPIs();
  await listarItens();
  await listarMovs();
});

// ----------------- ITENS -----------------
$('frmItem').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const codigo = $('iCodigo').value.trim().toUpperCase();
  const desc = $('iDesc').value.trim();
  const um = $('iUM').value;
  const custo = Number($('iCusto').value||0);
  const min = Number($('iMin').value||0);
  const obs = $('iObs').value.trim();
  const ref = F.doc(db,'itens',codigo);
  await F.setDoc(ref,{
    codigo, descricao:desc, um, custoMedio:custo, min, estoque: 0, obs,
    atualizadoEm:F.serverTimestamp()
  }, {merge:true});
  $('itemMsg').textContent = 'Item salvo.';
  await listarItens();
  e.target.reset();
});

$('btnReloadItens').addEventListener('click', listarItens);
$('buscaItem').addEventListener('input', listarItens);

async function listarItens(){
  const term = $('buscaItem').value?.trim().toLowerCase() || '';
  const q = F.query(F.collection(db,'itens'), F.orderBy('codigo'));
  const snap = await F.getDocs(q);
  const tbody = $('tblItens').querySelector('tbody');
  tbody.innerHTML = '';
  let count=0, saldo=0, valor=0;
  snap.forEach(doc=>{
    const it = doc.data();
    if(term && !(it.codigo.toLowerCase().includes(term) || (it.descricao||'').toLowerCase().includes(term))) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.codigo}</td>
                    <td>${it.descricao||''}</td>
                    <td>${it.um||''}</td>
                    <td>${(it.estoque||0).toFixed(3)}</td>
                    <td>${(it.min||0)}</td>
                    <td>R$ ${(it.custoMedio||0).toFixed(2)}</td>
                    <td><button data-cod="${it.codigo}" class="btn btn-outline btnDel">Del</button></td>`;
    tbody.appendChild(tr);
    count++; saldo += Number(it.estoque||0); valor += (it.estoque||0)*(it.custoMedio||0);
  });
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

  // registra movimento
  const movRef = await F.addDoc(F.collection(db,'movimentos'), {
    tipo, item, qtd, custo, cc, obs,
    criadoEm: F.serverTimestamp(),
    uid: (auth.currentUser||{}).uid
  });

  // aplica saldo e custo médio quando entrada
  const itRef = F.doc(db,'itens', item);
  const itSnap = await F.getDoc(itRef);
  let estoqueAtual = (itSnap.exists() ? (itSnap.data().estoque||0) : 0);
  let custoMedio = (itSnap.exists() ? (itSnap.data().custoMedio||0) : 0);

  let novoEstoque = estoqueAtual;
  let novoCusto = custoMedio;

  if(tipo==='ENTRADA'){
    // média ponderada
    const valorAtual = estoqueAtual * custoMedio;
    const valorEntrada = qtd * custo;
    novoEstoque = estoqueAtual + qtd;
    novoCusto = novoEstoque>0 ? (valorAtual+valorEntrada)/novoEstoque : custo;
  } else if(tipo==='SAIDA'){
    novoEstoque = estoqueAtual - qtd;
  } else {
    // TRANSFERÊNCIA não altera custo, mas altera estoque
    novoEstoque = estoqueAtual - qtd; // saída local; controle por localidade pode ser estendido
  }

  await F.setDoc(itRef, {
    codigo:item, estoque: novoEstoque, custoMedio: Number(novoCusto.toFixed(4)), atualizadoEm: F.serverTimestamp()
  }, {merge:true});

  $('movMsg').textContent = 'Movimentação registrada.';
  await listarMovs();
  await listarItens();
  e.target.reset();
});

async function listarMovs(limitN=20){
  const q = F.query(F.collection(db,'movimentos'), F.orderBy('criadoEm','desc'), F.limit(limitN));
  const snap = await F.getDocs(q);
  const tbody = $('tblMov').querySelector('tbody');
  tbody.innerHTML='';
  snap.forEach(doc=>{
    const m = doc.data();
    const dt = (m.criadoEm && m.criadoEm.toDate) ? m.criadoEm.toDate() : new Date();
    tbody.insertAdjacentHTML('beforeend', `<tr>
      <td>${dt.toLocaleString()}</td><td>${m.tipo}</td><td>${m.item}</td><td>${m.qtd}</td>
      <td>${m.custo ? 'R$ '+Number(m.custo).toFixed(2):'-'}</td><td>${m.cc||''}</td><td>${m.obs||''}</td>
    </tr>`);
  });
  $('kpiMov').textContent = snap.size;
}

// ----------------- BOM -----------------
$('frmBOM').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const prod = $('bomProduto').value.trim().toUpperCase();
  const item = $('bomItem').value.trim().toUpperCase();
  const qtd = Number($('bomQtd').value);
  const ref = F.doc(db, 'bom', prod, 'componentes', item);
  await F.setDoc(ref, { qtd }, {merge:true});
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
    tbody.insertAdjacentHTML('beforeend', `<tr><td>${prod}</td><td>${d.id}</td><td>${c.qtd}</td>
    <td><button class="btn btn-outline" data-rem="${d.id}" data-prod="${prod}">Remover</button></td></tr>`);
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
    tbody.insertAdjacentHTML('beforeend', `<tr><td>${d.id}</td><td>${c.qtd}</td></tr>`);
  });
});

// ----------------- PRODUÇÃO -----------------
$('frmOP').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const prod = $('opProduto').value.trim().toUpperCase();
  const qtd = Number($('opQtd').value||1);

  // Carrega BOM
  const q = F.query(F.collection(db,'bom',prod,'componentes'));
  const snap = await F.getDocs(q);
  if(snap.size===0){ $('opMsg').textContent='Sem BOM cadastrada para '+prod; return; }

  // Baixa componentes
  for(const d of snap.docs){
    const item = d.id;
    const porUn = Number((d.data()||{}).qtd||0);
    const total = porUn * qtd;
    await registrarMov('SAIDA', item, total, 0, 'PRODUCAO', 'Baixa OP '+prod);
  }
  // Entrada do produto final com custo médio somado dos componentes (simplificação: usa custo atual)
  let custoTotal=0;
  for(const d of snap.docs){
    const item = d.id;
    const porUn = Number((d.data()||{}).qtd||0);
    const total = porUn * qtd;
    const itSnap = await F.getDoc(F.doc(db,'itens',item));
    const cm = itSnap.exists()? (itSnap.data().custoMedio||0) : 0;
    custoTotal += cm * total;
  }
  const custoUnit = qtd>0 ? (custoTotal / qtd) : 0;
  await registrarMov('ENTRADA', prod, qtd, custoUnit, 'PRODUCAO', 'Entrada OP');

  $('opMsg').textContent = 'Produção registrada.';
  await listarItens();
  await listarMovs();
  e.target.reset();
});

async function registrarMov(tipo, item, qtd, custo, cc, obs){
  const movRef = await F.addDoc(F.collection(db,'movimentos'), {
    tipo, item, qtd, custo, cc, obs, criadoEm:F.serverTimestamp(), uid:(auth.currentUser||{}).uid
  });
  const itRef = F.doc(db,'itens', item);
  const itSnap = await F.getDoc(itRef);
  let estoqueAtual = (itSnap.exists() ? (itSnap.data().estoque||0) : 0);
  let custoMedio = (itSnap.exists() ? (itSnap.data().custoMedio||0) : 0);
  let novoEstoque = estoqueAtual;
  let novoCusto = custoMedio;

  if(tipo==='ENTRADA'){
    const valorAtual = estoqueAtual * custoMedio;
    const valorEntrada = qtd * custo;
    novoEstoque = estoqueAtual + qtd;
    novoCusto = novoEstoque>0 ? (valorAtual+valorEntrada)/novoEstoque : custo;
  } else {
    novoEstoque = estoqueAtual - qtd;
  }
  await F.setDoc(itRef, { codigo:item, estoque: novoEstoque, custoMedio: Number(novoCusto.toFixed(4)), atualizadoEm:F.serverTimestamp() }, {merge:true});
}

// ----------------- INVENTÁRIO -----------------
$('frmInv').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const item = $('invItem').value.trim().toUpperCase();
  const qtd = Number($('invQtd').value);
  const itRef = F.doc(db,'itens',item);
  const itSnap = await F.getDoc(itRef);
  const atual = itSnap.exists()? (itSnap.data().estoque||0) : 0;
  const diff = qtd - atual;
  if(diff===0){ $('invMsg').textContent='Nada a ajustar.'; return; }
  if(diff>0) await registrarMov('ENTRADA', item, diff, itSnap.exists()? (itSnap.data().custoMedio||0) : 0, 'AJUSTE', 'Inventário +');
  else await registrarMov('SAIDA', item, Math.abs(diff), 0, 'AJUSTE', 'Inventário -');
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
  itensSnap.forEach(d=>estoqueMap.set(d.id, (d.data().estoque||0)));

  snap.forEach(d=>{
    const m = d.data();
    if(m.tipo==='SAIDA'){
      consumoMap.set(m.item, (consumoMap.get(m.item)||0)+Number(m.qtd||0));
    }
  });

  const arr = [...consumoMap.entries()].map(([item,consumo])=>{
    const est = estoqueMap.get(item)||0;
    const proj = consumo>0 ? (est/consumo)*30 : Infinity;
    return {item, consumo, est, proj: isFinite(proj)? proj : '—'};
  }).sort((a,b)=>b.consumo-a.consumo).slice(0,10);

  const tbody = $('tblConsumo').querySelector('tbody');
  tbody.innerHTML='';
  arr.forEach(r=>{
    tbody.insertAdjacentHTML('beforeend', `<tr><td>${r.item}</td><td>UN</td><td>${r.consumo.toFixed(3)}</td><td>${r.est.toFixed(3)}</td><td>${typeof r.proj==='number'? r.proj.toFixed(1)+' dias':'—'}</td></tr>`);
  });
}
