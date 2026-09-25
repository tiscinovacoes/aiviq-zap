/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // pdfkit (usado pelo @react-pdf/renderer no relatório da pesquisa) carrega
    // as fontes padrao via subpath import dinamico do Node
    // (require('#standard-fonts/Helvetica'), mapeado no "imports" do
    // package.json do pdfkit para js/standard-fonts/*.cjs) -- o bundler nao
    // consegue rastrear isso estaticamente (nem sequer eh um fs.readFileSync
    // com caminho de string, eh resolucao de subpath import em runtime), e o
    // rastreador de arquivos da Vercel deixa esses .cjs/.mjs de fora do
    // pacote da funcao. Funciona local e quebra isolado em producao com
    // "Cannot find module '.../pdfkit/js/standard-fonts/Helvetica.cjs'".
    // Inclui o pacote pdfkit INTEIRO (nao só uma subpasta) para nao ficar
    // caçando arquivo por arquivo a cada versao nova dele. Dois caminhos
    // porque e um monorepo com workspaces: o npm hoista pdfkit para o
    // node_modules da RAIZ (../../node_modules), nao para o local
    // (./node_modules) -- um glob que nao bate com nada so retorna vazio,
    // sem erro, entao manter os dois e seguro em qualquer topologia.
    outputFileTracingIncludes: {
      '**': [
        './node_modules/pdfkit/**/*',
        '../../node_modules/pdfkit/**/*',
        './node_modules/@react-pdf/**/*',
        '../../node_modules/@react-pdf/**/*',
      ],
    },
  },
};

export default nextConfig;
