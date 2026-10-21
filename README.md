# FargusFy

O "Spotify" dos personagens da campanha Fargus. Cada personagem do [FargusGram](https://enricodigioia.github.io/FargusGram/) tem playlists, músicas curtidas e um "ouvindo agora" que aparece para o resto do grupo. As músicas são as do Spotify de verdade, buscadas e tocadas pelas ferramentas oficiais do Spotify.

Usa a mesma conta, os mesmos personagens e o mesmo tema do FargusGram. Como os dois ficam em `enricodigioia.github.io`, quem entrou num já está logado no outro, e trocar de personagem num troca no outro.

## Funcionalidades

- **Playlists dos personagens:** criar, editar, apagar, deixar pública ou privada, reordenar e remover músicas, copiar músicas para outra playlist
- **Músicas curtidas** de cada personagem
- **Seguir playlists** de outros personagens
- **"Ouvindo agora":** aparece no início e no perfil musical do personagem; pode ser automático (poucos segundos depois que a música começa) ou escolhido à mão, e aparece também no perfil do FargusGram
- **Busca no catálogo do Spotify** (músicas, álbuns, artistas) e nos personagens e playlists de Fargus
- **Páginas de álbum, artista e perfil do personagem**
- **Fila** com "tocar em seguida", "adicionar à fila", aleatório e repetir; a fila continua de onde parou ao reabrir o app
- **Layout de Spotify:** barra lateral e player embaixo no computador; navegação e mini player embaixo no celular
- **PWA:** instala na tela inicial do celular, como o FargusGram

## Como o áudio toca

O app tem dois "motores" e escolhe sozinho:

| Motor | Para quem | Como soa |
| --- | --- | --- |
| Player embutido do Spotify (iFrame API) | Todo mundo, sem login no Spotify | Quem está logado no Spotify naquele navegador costuma ouvir a música inteira; quem não está ouve uma prévia de 30 s |
| Player completo (Web Playback SDK) | Contas **Premium** cadastradas no app do Spotify (até 5) | Música inteira dentro do FargusFy, com os controles do próprio app |

O player completo é ligado em **Configurações → Conectar Spotify Premium**. Se der algum problema (conta não Premium, conta fora da lista), o app volta sozinho para o player embutido.

## Regras do Spotify que valem para este app

Desde fevereiro de 2026, apps em "modo de desenvolvimento" no Spotify têm estas regras ([guia oficial](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)):

- **O dono do app precisa ter Spotify Premium.** Se a assinatura acabar, o app (inclusive a busca) para de funcionar até renovar.
- **No máximo 5 usuários** podem fazer login no app. Isso só afeta o player completo; o player embutido e a busca funcionam para todo o grupo.
- A busca devolve **no máximo 10 resultados por página** (o app pede mais com "Mais músicas").
- "Músicas populares do artista" não existe mais nesse modo; a página do artista mostra a discografia.

## Stack

| Parte | Tecnologia |
| --- | --- |
| Interface | React 19, React Router 7 (HashRouter), Vite 8, CSS próprio com as variáveis de tema do FargusGram |
| Banco | O mesmo Supabase do FargusGram, com tabelas novas `fy_*` e Row Level Security |
| Busca no Spotify | Edge Function `spotify` no Supabase (guarda a chave secreta, usa o fluxo "client credentials") |
| Player | Spotify iFrame API e Spotify Web Playback SDK (login PKCE, sem chave secreta no navegador) |
| Hospedagem | GitHub Pages, publicado pelo GitHub Actions a cada push na `main` |

## Estrutura

```
├── src/
│   ├── pages/              telas (início, busca, biblioteca, playlist, álbum, artista, perfil, fila…)
│   ├── components/         layout, player, listas de músicas, cartões, janelas
│   ├── lib/
│   │   ├── player.js       fila e os dois motores de áudio
│   │   ├── catalog.js      busca, álbum e artista (pela função "spotify")
│   │   ├── spotifyAuth.js  login PKCE do player completo
│   │   ├── api.js          playlists, curtidas e "ouvindo agora" no Supabase
│   │   └── theme.js        temas (o mesmo arquivo do FargusGram)
│   ├── state/              sessão, biblioteca do personagem e avisos
│   └── config.js           Supabase, Client ID do Spotify e endereço do FargusGram
├── public/                 ícones, manifesto e service worker
└── supabase/
    ├── fargusfy.sql        tabelas, regras e funções (rodar uma vez)
    └── functions/spotify/  Edge Function da busca
```

## Instalação (uma vez só)

### 1. Banco de dados

No Supabase do FargusGram, abra **SQL Editor → New query**, cole o arquivo `supabase/fargusfy.sql` inteiro e clique em **Run**. Ele só cria tabelas novas (todas começam com `fy_`) e pode ser rodado de novo sem problema.

### 2. App no Spotify

1. Entre em [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) com a sua conta Premium e clique em **Create app**.
2. Preencha:
   - **App name:** FargusFy
   - **App description:** O Spotify dos personagens de uma campanha de RPG
   - **Redirect URIs** (adicione os dois, exatamente assim):
     - `https://enricodigioia.github.io/FargusFy/`
     - `http://127.0.0.1:5173/`
   - **Which API/SDKs are you planning to use?** marque **Web API** e **Web Playback SDK**
3. Aceite os termos e salve. Na página do app, em **Settings**, copie o **Client ID** e clique em **View client secret** para ver o **Client secret**.
4. Em **User Management**, cadastre o nome e o e-mail da conta Spotify de cada pessoa que vai usar o player completo (contas Premium, até 5).

### 3. Função de busca no Supabase

1. No Supabase, abra **Edge Functions → Secrets** e crie dois segredos:
   - `SPOTIFY_CLIENT_ID` com o Client ID
   - `SPOTIFY_CLIENT_SECRET` com o Client secret
2. Abra **Edge Functions → Deploy a new function → Via Editor**, dê o nome `spotify`, cole o arquivo `supabase/functions/spotify/index.ts` inteiro e clique em **Deploy**.
3. Em **Details** da função, desligue **Verify JWT** (a função confere o login sozinha, como a `push` do FargusGram).

### 4. Configuração do app

Em `src/config.js`, cole o Client ID em `SPOTIFY_CLIENT_ID`. Ele é público (o segredo fica só no Supabase). A URL e a chave do Supabase já são as do FargusGram.

### 5. Publicar no GitHub Pages

1. Crie no GitHub um repositório público chamado **FargusFy** (o nome importa: ele vira o endereço `enricodigioia.github.io/FargusFy/`).
2. Envie esta pasta:
   ```bash
   git remote add origin https://github.com/EnricoDiGioia/FargusFy.git
   git push -u origin main
   ```
3. No repositório, abra **Settings → Pages** e, em **Source**, escolha **GitHub Actions**. A cada push na `main`, o site é publicado sozinho.

## Rodando localmente

Requisitos: [Node.js](https://nodejs.org) 22 ou mais novo.

```bash
npm install
npm run dev
```

O app abre em `http://127.0.0.1:5173` (use esse endereço, e não `localhost`: é o único endereço local que o Spotify aceita no login). Localmente o login do FargusGram não é compartilhado, então entre com o mesmo e-mail e senha.

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Gera o site em `dist/` |
| `npm run preview` | Serve o `dist/` para conferir a versão de produção |

## Plano grátis do Supabase

O FargusFy foi feito para caber folgado no plano grátis que o FargusGram já usa:

- **Não guarda áudio nem imagens.** O som vem do Spotify e as capas vêm do CDN do Spotify. O banco guarda só o id da música, título, artista e o link da capa (uns 300 bytes por música).
- **Limites no banco:** 100 playlists por personagem, 500 músicas por playlist e 2.000 curtidas por personagem. Mesmo cheios, ocupam poucos MB dos 500 MB do plano.
- **Busca econômica:** o app só busca quando a pessoa para de digitar, guarda as respostas por 30 minutos no aparelho, e a função também guarda em memória. Cada busca é uma chamada da função, e o plano dá 500 mil por mês.
- **"Ouvindo agora":** uma linha por personagem, sobrescrita a cada música.
- Em **Configurações → Espaço no banco**, o app mostra quanto o FargusFy ocupa e o tamanho do banco inteiro.

## Como funciona por dentro

- **O player é separado das telas** (`lib/player.js`): as telas só mandam comandos (tocar esta lista, próxima, pausar) e leem o estado. Quem toca é um dos dois motores. A fila é sempre do app; o motor só recebe a música da vez e avisa quando pausou, avançou ou terminou.
- **Contexto da fila:** tocar "a partir de" uma playlist ou álbum guarda de onde a fila veio, e a barra do player mostra o link de volta.
- **Segurança no banco:** as regras de Row Level Security fazem cada jogador mexer só nas playlists dos próprios personagens. Contagem, duração e mosaico de capas da playlist são calculados por gatilhos no banco, e o app não consegue escrever neles.
- **Ordem das músicas:** cada música tem uma posição fracionária, então mover uma música altera uma linha só.
