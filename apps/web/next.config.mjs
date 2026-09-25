/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // pdfkit (usado pelo @react-pdf/renderer no relatório da pesquisa) carrega
    // as fontes padrao (.afm) com fs.readFileSync em runtime -- o rastreador
    // de arquivos da Vercel nao enxerga isso (so segue require/import
    // estaticos) e deixa esses arquivos de fora do pacote da funcao. Funciona
    // local e quebra em producao ("não foi possível gerar o relatório").
    // Forca a inclusao explicita. Dois caminhos porque e um monorepo com
    // workspaces: o npm pode hoistar pdfkit para o node_modules da RAIZ
    // (../../node_modules) em vez do local (./node_modules) -- um glob que
    // nao bate com nada so retorna vazio, sem erro, entao manter os dois e
    // seguro em qualquer topologia de instalacao.
    outputFileTracingIncludes: {
      '**': [
        './node_modules/pdfkit/js/data/**/*',
        '../../node_modules/pdfkit/js/data/**/*',
        './node_modules/@react-pdf/**/*',
        '../../node_modules/@react-pdf/**/*',
      ],
    },
  },
};

export default nextConfig;
