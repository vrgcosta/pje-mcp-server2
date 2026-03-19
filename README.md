# PJE MCP Server v4.1

Servidor MCP (Model Context Protocol) para integração com o PJE do TJBA via MNI (Modelo Nacional de Interoperabilidade) e BNP (Banco Nacional de Precedentes) do CNJ.

Inclui um **Dev Console Web** para testar todas as operações do MNI diretamente no navegador.

## Novidades da v4.1

- **Download de documentos via MTOM/XOP**: Baixa o conteúdo binário dos documentos (PDF, HTML) diretamente do MNI
- **Dev Console Web**: Frontend para testar todas as operações em `http://localhost:3000`
- **Client modularizado**: `PJEMNIClient` extraído para `src/client.ts`, reutilizável entre MCP e Dev Server
- **Correção `incluirDocumentos`**: Usa `boolean` (conforme WSDL) ao invés de `"*"`
- **Documentos vinculados**: Extrai documentos vinculados (anexos de petições, etc.)

## Arquitetura

```
src/
  client.ts        # PJEMNIClient - cliente SOAP/MNI + download MTOM
  index.ts         # Servidor MCP (stdio) para Claude Desktop
  dev-server.ts    # Servidor HTTP dev com REST API + frontend
public/
  index.html       # Dev Console Web (dark theme)
```

## Quick Start

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure as credenciais

Crie um arquivo `.env` na raiz:

```env
PJE_USERNAME=SEU_CPF
PJE_PASSWORD=SUA_SENHA
PJE_BASE_URL=https://pje2g-mni.tjba.jus.br
PJE_DEBUG=true
BNP_API_URL=https://bnp-sempj.cloud.pje.jus.br
```

### 3. Dev Console (teste no navegador)

```bash
npm run dev:web
```

Acesse `http://localhost:3000` - configure credenciais, consulte processos, baixe documentos.

### 4. MCP Server (Claude Desktop)

```bash
npm run build
```

Edite o `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pje": {
      "command": "node",
      "args": ["CAMINHO/dist/index.js"],
      "env": {
        "PJE_USERNAME": "SEU_CPF",
        "PJE_PASSWORD": "SUA_SENHA",
        "PJE_BASE_URL": "https://pje2g-mni.tjba.jus.br"
      }
    }
  }
}
```

Reinicie o Claude Desktop.

## Endpoints TJBA

| Grau | URL Intercomunicação | MNI |
|------|---------------------|-----|
| 1G Cível | `https://pje.tjba.jus.br/pje/intercomunicacao?wsdl` | 2.2.2 |
| 1G Criminal | `https://pje.tjba.jus.br/pje/intercomunicacao/v223?wsdl` | 2.2.3 |
| 2G | `https://pje2g-mni.tjba.jus.br/pje/intercomunicacao?wsdl` | 2.2.2 |

## Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `PJE_USERNAME` | CPF do usuário (apenas números) | Sim |
| `PJE_PASSWORD` | Senha do PJE | Sim |
| `PJE_BASE_URL` | URL base do PJE (padrão: `https://pje.tjba.jus.br`) | Não |
| `PJE_DEBUG` | Salva respostas SOAP em `./debug/` | Não |
| `BNP_API_URL` | URL da API do BNP | Não |
| `DEV_PORT` | Porta do Dev Console (padrão: 3000) | Não |

## Ferramentas MCP

### Consulta de Processos

| Ferramenta | Descrição |
|------------|-----------|
| `pje_consultar_processo` | Consulta processo por número com lista de documentos |
| `pje_consultar_processo_profunda` | Consulta completa com todos os documentos e metadados |
| `pje_consultar_processo_por_cpf_cnpj` | Busca processos por CPF/CNPJ |
| `pje_consultar_processo_por_nome` | Busca processos por nome da parte |
| `pje_consultar_conteudo_documento` | Baixa conteúdo de documento específico via MTOM |

### Comunicações

| Ferramenta | Descrição |
|------------|-----------|
| `pje_consultar_avisos` | Lista intimações pendentes |
| `pje_consultar_teor_comunicacao` | Obtém teor de uma intimação |

### Utilitários

| Ferramenta | Descrição |
|------------|-----------|
| `pje_status` | Status do servidor e endpoints |
| `pje_testar_conexao` | Testa conexão SOAP com o MNI |
| `pje_listar_metodos` | Lista métodos SOAP disponíveis |

### Precedentes

| Ferramenta | Descrição |
|------------|-----------|
| `pje_consultar_precedentes_bnp` | Consulta o Banco Nacional de Precedentes do CNJ |

## Dev Console - API REST

O Dev Console (`npm run dev:web`) expõe os seguintes endpoints:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/status` | Status e configuração |
| POST | `/api/credenciais` | Atualiza CPF/senha/endpoint |
| POST | `/api/testar-conexao` | Testa conexão SOAP |
| GET | `/api/listar-metodos` | Métodos SOAP disponíveis |
| POST | `/api/consultar-processo` | Consulta por número |
| POST | `/api/consultar-processo-profunda` | Consulta com documentos |
| POST | `/api/consultar-por-documento` | Busca por CPF/CNPJ |
| POST | `/api/consultar-por-nome` | Busca por nome |
| POST | `/api/baixar-documento` | Download binário via MTOM |
| POST | `/api/consultar-avisos` | Intimações pendentes |
| POST | `/api/consultar-teor-comunicacao` | Teor de comunicação |
| POST | `/api/consultar-precedentes` | Precedentes BNP |

## Como funciona o download de documentos

O MNI retorna documentos via **MTOM/XOP** (multipart SOAP response):

1. `consultarProcesso` com `incluirDocumentos: true` lista os documentos (ID, nome, mimetype, hash)
2. `consultarProcesso` com `documento: ['ID']` retorna o binário como attachment MTOM
3. O client faz HTTP raw para parsear o multipart e extrair o attachment binário
4. O hash MD5 retornado serve para validar a integridade do download

## Requisitos

- **Node.js** >= 18.0.0
- **Rede**: Acesso aos endpoints do TJBA (rede interna ou IP na whitelist)
- **Credenciais**: CPF e senha válidos no PJE

## Changelog

### v4.1.0 (2026-03-19)
- Download de documentos via MTOM/XOP
- Dev Console Web com frontend dark theme
- Client extraído para módulo reutilizável
- Correção do parâmetro `incluirDocumentos` (boolean, não string)
- Suporte a dotenv para credenciais via `.env`

### v4.0.0 (2025-01-07)
- Suporte a múltiplos endpoints (1G Cível, 1G Criminal, 2G)
- Endpoint ConsultaPJe para consultas
- Suporte a MNI 2.2.2 e 2.2.3

### v3.0.0
- Integração com BNP (Banco Nacional de Precedentes)

### v2.0.0
- Versão inicial com suporte básico ao MNI
