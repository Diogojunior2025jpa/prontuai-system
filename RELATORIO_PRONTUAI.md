# Relatório de andamento do ProntuAI

**Atualizado em:** 06/10/2026

## Resumo

- Frontend publicado na Vercel; backend/API publicado no Render.
- A API pública respondeu HTTP 200 na última verificação.
- A recuperação de senha por Gmail via Google Apps Script foi configurada e
  testada com sucesso: o e-mail chegou à caixa de entrada.
- A branch `main` local está sincronizada com `origin/main`, no commit
  `2c74ba3` (`feat: simplifica recuperação com Apps Script`).
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

### Controles de laudos médicos — publicado no GitHub; deploy pendente de confirmação

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
- Alterações enviadas para `origin/main`; confirmar nos painéis da Vercel e do
  Render se os deploys automáticos foram concluídos.

## Sistemas e serviços usados

- **Vercel:** frontend React/Vite e proxy `/api`.
- **Render:** backend FastAPI/Uvicorn.
- **MongoDB Atlas:** banco configurado para o backend; conexão/bootstrap em
  produção ainda precisa de verificação dedicada.
- **Google Apps Script + Gmail:** envio do e-mail de recuperação, testado.
- **Groq e Gemini:** provedores de IA usados pela aplicação; chaves configuradas
  no cofre do painel Super Admin devem ser verificadas.

## Pendências para continuar amanhã

1. **Cofre de chaves de IA:** confirmar no Render que
   `APP_SECRET_ENCRYPTION_KEY` está definido e estável; verificar no Super
   Admin se o cofre está disponível e se as integrações Groq/Gemini estão
   ativas. Se alguma credencial foi exposta anteriormente, revogá-la e criar
   outra. Nunca registrar chaves neste relatório.
2. **MongoDB Atlas e bootstrap:** confirmar que o backend de produção conecta ao
   Atlas e validar o fluxo de criação/recuperação de acesso do administrador.
   A existência e conexão foram pendências de relatórios anteriores e não foram
   revalidadas nesta sessão.
3. **Assinaturas e cobrança:** a seleção de plano após o período de teste fica
   como `pending_payment`; não há provedor Pix/cartão conectado. Confirmar se
   isso faz parte do escopo da próxima publicação.
4. **Recuperação de senha:** o envio foi confirmado. Em caso de futura falha,
   verificar primeiro as execuções do Apps Script e os logs do Render. Manter
   a URL do Web App e o segredo fora do código, commits, capturas e conversas.

## Estado do repositório ao fechar

- A implementação de laudos foi publicada em `origin/main` depois do commit
  `2c74ba3`; confirmar a conclusão dos deploys automáticos.
- Foram alterados `backend/routers/clinic.py` e
  `frontend/src/pages/MedicalReports.jsx`; foi criado
  `backend/tests/test_medical_records.py`.
- `relatorio_execucao.txt` possui alteração local anterior e foi preservado,
  sem inclusão nos commits desta sequência.
- Este relatório foi atualizado no workspace; confirmar e incluir em commit
  quando o histórico de acompanhamento for publicado.
- A configuração local `commit.gpgsign=false` evita falha por chave GPG ausente
  neste repositório; não altera commits anteriores.
