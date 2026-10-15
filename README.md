# AlvorynFIN — Sistema Financeiro

Aplicação web de finanças pessoais feita com React, TypeScript, Vite, Tailwind CSS v4, Supabase, Recharts, date-fns, Lucide e Sonner.

## Funcionalidades

- Cadastro e login com e-mail/senha e início de autenticação Google OAuth.
- Painel mensal com ganhos, gastos, saldo e taxa de economia.
- Gráfico de fluxo diário e distribuição de gastos por categoria.
- Cadastro, edição, busca, filtros e exclusão de lançamentos.
- Categorias de ganhos e gastos, com criação e exclusão.
- Exportação CSV em formato compatível com planilhas brasileiras.
- Tema escuro padrão e tema claro, com preferência salva no navegador.
- Layout responsivo para desktop e celular.
- RLS no Supabase para separar os dados de cada usuário.

## Requisitos

- Node.js LTS instalado.
- Um projeto Supabase.

## Rodar localmente

1. Clone o repositório e entre na pasta:

   ```bash
   git clone https://github.com/caioalcantaradev/sistema-financeiro.git
   cd sistema-financeiro
   ```

2. Instale as dependências e atualize o lockfile local:

   ```bash
   npm install
   ```

3. Crie um arquivo `.env.local` na raiz usando `.env.example` como referência:

   ```env
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua_chave_publica
   ```

   Use a URL do projeto e a **publishable key** do Supabase. Nunca coloque `service_role` ou uma chave `sb_secret_` no frontend.

4. Execute a aplicação:

   ```bash
   npm run dev
   ```

5. Para validar a versão de produção:

   ```bash
   npm run build
   npm run preview
   ```

## Banco de dados Supabase

O schema está em [`supabase/schema.sql`](supabase/schema.sql). Ele cria as tabelas `categories` e `transactions`, índices, políticas RLS de propriedade e um trigger que cria categorias padrão para novos usuários.

No projeto de desenvolvimento já conectado, o schema foi aplicado e as tabelas foram verificadas. Para configurar outro projeto, abra o SQL Editor do Supabase e execute o arquivo completo.

## Autenticação

- E-mail/senha depende das opções habilitadas em **Authentication → Sign In / Providers**.
- Para permitir cadastro sem confirmação por e-mail durante testes, ajuste **Confirm email** nas configurações de autenticação do Supabase. Em produção, avalie manter a confirmação ativada.
- Google OAuth exige habilitar o provider Google e informar as credenciais OAuth no Supabase. Configure também as URLs de callback/redirect autorizadas para o ambiente local e o domínio de produção.

## Segurança

- O frontend utiliza somente a chave pública publishable.
- As tabelas expostas usam RLS e políticas limitadas a `auth.uid() = user_id`.
- A relação entre lançamento e categoria impede associar uma categoria pertencente a outra conta.
- Não envie `.env.local` para o GitHub.

## Observação de escopo

Esta é a primeira implementação funcional do produto. Antes de uso financeiro em produção, valide o fluxo de confirmação de e-mail, OAuth Google, políticas de acesso, exportação e testes em dispositivos reais.


## Publicação na Vercel

1. Importe este repositório e selecione o framework **Vite**.
2. Configure **Build Command** como `npm run build` e **Output Directory** como `dist` (ou mantenha a detecção automática do Vite).
3. Em **Settings → Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` para o ambiente **Production**. Adicione-as também a Preview somente se esse ambiente estiver ligado a um projeto Supabase de teste.
4. Faça um novo deploy após qualquer alteração de variável de ambiente. Variáveis `VITE_*` são incorporadas ao bundle do navegador; use somente a chave pública publishable, nunca `service_role` ou `sb_secret_*`.
5. No Supabase, configure a URL de produção em **Authentication → URL Configuration** e permita essa origem em **Redirect URLs**. Para Google OAuth, configure também as credenciais e URLs de callback do provedor.
6. Antes de disponibilizar a aplicação, teste cadastro, confirmação de e-mail (se habilitada), login, OAuth, recuperação de senha, logout e isolamento dos dados com duas contas diferentes.

O arquivo `vercel.json` adiciona cabeçalhos HTTP de segurança. Esses cabeçalhos não substituem as políticas RLS do Supabase nem a validação do ambiente de produção.
