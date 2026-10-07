# Relatório de andamento do ProntuAI

**Atualizado em:** 07/10/2026

## Resumo

- Frontend publicado na Vercel; backend/API publicado no Render.
- A API pública respondeu HTTP 200 na última verificação.
- A recuperação de senha por Gmail via Google Apps Script foi configurada e
  testada com sucesso: o e-mail chegou à caixa de entrada.
- Último commit publicado antes deste trabalho: `9ea3170`
  (`docs: atualiza relatorio de andamento`).
- Não há credenciais, tokens ou valores de segredos registrados neste arquivo.

## Trabalho concluído e publicado

### Página inicial e planos — `4c7f854`

- Redesenhada a página inicial com fundo escuro, roxo neon, animações e chamada
  visual para os planos.
- Melhoradas as descrições dos planos, sem alterar preços, limites ou recursos.
- As descrições também aparecem na tela de planos da clínica.
- Build de produção e lint do frontend passaram. O build reportou aviso de bundle
  JavaScript acima de 500 kB, sem bloquear a compilação.
- Consulta pública a páginas da Feegow e iClinic serviu como referência de
  apresentação; nenhum texto foi copiado.

### Edição no Super Admin — `0928a15`

- A tabela de clínicas exibe o nome e o e-mail do administrador principal.
- Incluído formulário para editar nome e especialidade da clínica, plano,
  status da clínica/assinatura e nome/e-mail do administrador principal.
- O backend valida e-mail duplicado e plano inexistente; senhas não são
  exibidas nem editadas nesse formulário.
- Build e lint do frontend passaram; os testes do backend passaram.
- Deploy de produção confirmado.

### Recuperação de senha — `2c74ba3`

- Substituída a tentativa de SMTP, bloqueada no Render com
  `OSError: [Errno 101] Network is unreachable`, por envio via Gmail usando
  Google Apps Script e HTTPS.
- Adicionado o script [`backend/apps_script/password_reset.gs`](./backend/apps_script/password_reset.gs).
- O endpoint usa um segredo compartilhado armazenado nas propriedades do Apps
  Script e nas variáveis privadas do Render. O segredo não é salvo no Git.
- Atualizada a documentação em [`README.md`](./README.md).
- O usuário implantou o Apps Script como Web App e configurou no Render:
  `GOOGLE_SCRIPT_URL`, `GOOGLE_SCRIPT_SECRET` e `FRONTEND_URL`.
- Deploy do commit concluído. Teste real confirmado pelo usuário: mensagem
  “Redefinição de senha do ProntuAI” chegou à caixa de entrada.
- Suíte completa do backend: **25 testes passaram**. Lint focado da integração
  também passou.
- Para conta Gmail pessoal, considerar o limite de cota do Apps Script indicado
  pelo Google (100 destinatários/dia no momento da verificação; sujeito a
  mudanças).

### Controles de laudos médicos — publicado e implantado

- Adicionados controles de editar e excluir na lista de laudos para
  profissionais e administradores da clínica que tenham a permissão
  `records.edit`.
- A edição também passou a aceitar o administrador da clínica e registra quem
  alterou o laudo e quando.
- A exclusão é um arquivamento reversível no banco: o registro não é apagado
  permanentemente e deixa de aparecer na listagem normal. Ainda não há uma
  tela para restaurar laudos arquivados.
- As operações mantêm o isolamento entre clínicas; usuários sem permissão não
  podem editar ou arquivar laudos.
- Validação local: suíte completa do backend (**30 testes passaram**), lint e
  build do frontend passaram. O build continua mostrando o aviso já conhecido
  de bundle JavaScript acima de 500 kB.
- Commit `3741ed3` enviado para `origin/main`; a captura enviada pelo usuário
  confirmou o deploy automático concluído.

### Marca e guia financeiro — implementação local, publicação pendente

- Integrado um símbolo de marca ProntuAI em ciano/índigo no painel da clínica,
  tela de entrada, página inicial e Super Admin.
- Criada a rota **Guia financeiro**, visível a quem possui `finance.view`, com
  indicadores mensais, gráfico comparativo dos últimos seis meses e
  observações automáticas de tendência e agenda.
- A API agrega consultas dentro do tenant autenticado e aceita os estados
  `done`, `scheduled` e `cancelled`. O guia identifica valores de consultas
  concluídas como estimativas pelo preço cadastrado e valores agendados como
  potencial, nunca como pagamento recebido.
- O sistema ainda não registra conciliação de pagamentos, despesas ou
  inadimplência. Esses números não são fabricados/exibidos como se existissem.
- A tela financeira é carregada sob demanda para não aumentar o bundle inicial.
- Suíte completa do backend após as alterações atuais: **40 testes passaram**.
  Build frontend passou;
  o guia ficou em chunk próprio (~377 kB). O bundle principal (~653 kB) ainda
  mostra o aviso preexistente de tamanho. Lint passou com um aviso preexistente
  de Fast Refresh em `AppShell.jsx`.
- Essas alterações ainda estão somente no workspace; não foram publicadas nem
  implantadas.

### Integração Asaas — implementação local, requer configuração e teste

- Após a escolha do usuário, iniciada a integração de assinaturas mensais com
  checkout do Asaas. O cliente pode escolher a forma de pagamento na fatura
  hospedada pelo Asaas.
- A API usa sandbox por padrão e produção somente quando `ASAAS_ENV=production`.
  A chave `ASAAS_API_KEY` é lida apenas do ambiente; nunca gravada no código.
- O webhook autenticado em `/api/webhooks/asaas` processa confirmações,
  recebimentos, atrasos e estornos/chargebacks. Acesso fica pendente até a
  confirmação de pagamento; atraso tem **5 dias de tolerância**, conforme
  escolha do usuário.
- Suíte do backend: **40 testes passaram**, incluindo criação de assinatura
  mockada, verificação do token de webhook e período de tolerância. O fluxo
  ainda não foi testado com uma conta Sandbox real.
  São necessárias as variáveis `ASAAS_API_KEY`, `ASAAS_ENV` e
  `ASAAS_WEBHOOK_TOKEN` no Render e a configuração do webhook no painel Asaas.

## Sistemas e serviços usados

- **Vercel:** frontend React/Vite e proxy `/api`.
- **Render:** backend FastAPI/Uvicorn.
- **MongoDB Atlas:** banco configurado para o backend; conexão/bootstrap em
  produção ainda precisa de verificação dedicada.
- **Google Apps Script + Gmail:** envio do e-mail de recuperação, testado.
- **Groq e Gemini:** provedores de IA usados pela aplicação; chaves configuradas
  no cofre do painel Super Admin devem ser verificadas.

## Pendências para continuar amanhã

1. **Configurar e validar Asaas Sandbox:** criar uma conta de testes, configurar
   `ASAAS_API_KEY`, `ASAAS_ENV=sandbox` e `ASAAS_WEBHOOK_TOKEN` em ambiente
   privado no Render e registrar o webhook
   `https://<API-Render>/api/webhooks/asaas`. Testar assinatura, pagamento,
   confirmação por webhook e os 5 dias de tolerância; depois escolher o momento
   de trocar para `ASAAS_ENV=production` e a chave real. Nunca envie as chaves
   pela conversa.
2. **Publicar e testar o guia financeiro e a marca:** conferir a rota
   `/app/financeiro` com uma conta que tenha `finance.view`.
3. **Financeiro completo da clínica:** decidir e implementar cadastro de
   recebimentos, despesas e inadimplência para permitir fluxo de caixa real.
   Até lá, o novo guia mostra apenas valores estimados das consultas.
4. **Cofre de chaves de IA:** confirmar no Render que
   `APP_SECRET_ENCRYPTION_KEY` está definido e estável; verificar no Super
   Admin se o cofre está disponível e se as integrações Groq/Gemini estão
   ativas. Se alguma credencial foi exposta anteriormente, revogá-la e criar
   outra. Nunca registrar chaves neste relatório.
5. **MongoDB Atlas e bootstrap:** confirmar que o backend de produção conecta ao
   Atlas e validar o fluxo de criação/recuperação de acesso do administrador.
   A existência e conexão foram pendências de relatórios anteriores e não foram
   revalidadas nesta sessão.
6. **Recuperação de senha:** o envio foi confirmado. Em caso de futura falha,
   verificar primeiro as execuções do Apps Script e os logs do Render. Manter
   a URL do Web App e o segredo fora do código, commits, capturas e conversas.

## Estado do repositório ao fechar

- A branch publicada termina no commit `9ea3170`. As alterações do guia, marca
  e integração Asaas estão pendentes de commit/publicação e teste em Sandbox.
- Alterações locais atuais: endpoint financeiro em
  `backend/routers/clinic.py`, cliente Asaas em `backend/lib/asaas.py`,
  webhook em `backend/routers/webhooks.py`, novo include em `backend/server.py`,
  guarda de acesso em `backend/lib/auth.py`, teste `backend/tests/test_finance_guide.py`,
  componente de marca `frontend/src/components/BrandMark.jsx`, tela
  `frontend/src/pages/FinancialGuide.jsx` e integração em `App.jsx`,
  `AppShell.jsx`, `Home.jsx`, `Login.jsx`, `SuperAdmin.jsx` e
  `SubscriptionPlans.jsx`.
- `relatorio_execucao.txt` possui alteração local anterior e foi preservado,
  sem inclusão nos commits desta sequência.
- Este relatório acompanha o estado publicado do repositório.
- A configuração local `commit.gpgsign=false` evita falha por chave GPG ausente
  neste repositório; não altera commits anteriores.
