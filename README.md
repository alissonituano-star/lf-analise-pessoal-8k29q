# Gerador e analisador Lotofacil

Sistema local para baixar resultados historicos da Lotofacil no Lotorama e analisar combinacoes.

## Como usar

1. Abra o sistema. Ele atualiza a base automaticamente antes de iniciar:

```powershell
npm run dev
```

2. Acesse no navegador do computador:

```text
http://127.0.0.1:8000
```

## Usar no celular

1. Deixe o computador e o celular na mesma rede Wi-Fi.
2. Inicie o modo celular:

```powershell
npm run mobile
```

3. O terminal vai mostrar um endereco parecido com este:

```text
http://192.168.1.6:8001
```

4. Abra esse endereco no navegador do celular.

Se o celular nao abrir, o Windows pode estar bloqueando a porta `8000` no firewall. Nesse caso, permita o acesso do Node.js na rede privada.

Para atualizar sem abrir o sistema:

```powershell
npm run update
```

Para atualizar, salvar no Git e enviar para o GitHub:

```powershell
npm run sync
```

Se preferir Python e ele estiver instalado, o script equivalente fica em `scripts/update_results.py`.

## Rodar online pelo GitHub Pages

Este projeto tambem esta preparado para GitHub Pages.

Depois de subir para um repositorio no GitHub:

1. Abra `Settings`.
2. Entre em `Pages`.
3. Em `Build and deployment`, selecione `GitHub Actions`.
4. O workflow `Publicar sistema` vai publicar o site.

O workflow tenta atualizar a base todos os dias as 23:00 UTC, mas o Lotorama pode bloquear servidores do GitHub com erro `HTTP 403`.

O metodo mais confiavel para atualizar automaticamente no GitHub e deixar o Windows rodar este arquivo uma vez por dia:

```text
scripts\sync-github.bat
```

Ele executa `npm run sync`, que baixa os resultados pelo seu computador, cria commit se a base mudou e envia para o GitHub.

## O que o sistema analisa

- Frequencia historica dos numeros 01 a 25.
- Atraso atual de cada numero.
- Frequencia recente, configuravel por janela de concursos.
- Pares de numeros que mais aparecem juntos.
- Distribuicao por linhas, colunas, pares/impares, baixos/altos e soma.
- Geracao de jogos ranqueados por uma heuristica estatistica.
- Backtest simples, comparando jogos sugeridos contra sorteios passados.

## Aviso importante

Lotofacil e um jogo aleatorio. Analise historica pode ajudar a organizar escolhas e reduzir apostas muito desequilibradas, mas nao aumenta a probabilidade matematica de uma combinacao especifica ser sorteada nem garante premio.
