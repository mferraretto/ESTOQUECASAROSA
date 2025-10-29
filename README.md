# Casa Rosa — Sistema de Gestão de Estoque & Matéria‑Prima

Frontend 100% em HTML/CSS/JS + Firebase (Auth + Firestore).

## Funcionalidades
- Login/Cadastro (Firebase Auth).
- Cadastro de Itens/Insumos (código, descrição, UM, custo, estoque mínimo).
- Movimentações: ENTRADA, SAÍDA e AJUSTE/TRANSFER (com custo médio automático).
- BOM (ficha técnica): vínculo de componentes por produto.
- Produção: baixa automática da BOM e entrada do produto final com custo médio.
- Inventário: ajuste de saldos via contagem.
- Dashboard com KPIs e consumo 30d.
- Relatórios simples por item e período.

## Estrutura Firestore
```
itens/{codigo} -> { codigo, descricao, um, custoMedio, min, estoque, atualizadoEm }
movimentos/{autoId} -> { tipo, item, qtd, custo, cc, obs, criadoEm, uid }
bom/{produto}/componentes/{item} -> { qtd }
usuarios/{uid} -> { nome, email, perfil }
```

## Como rodar
1. Hospede os arquivos (Firebase Hosting ou outro servidor estático).
2. Em `firebase-config.js`, mantenha sua configuração.
3. Abra `index.html`, crie usuário e acesse `app.html` automaticamente.

## Regras (sugestão)
Veja `firestore.rules` para um ponto de partida seguro.
