# PJE MCP Server v4.0

Servidor MCP (Model Context Protocol) para integração com o PJE do TJBA via MNI (Modelo Nacional de Interoperabilidade) e BNP (Banco Nacional de Precedentes) do CNJ.

## Novidades da v4.0

- **Múltiplos endpoints TJBA**: Suporte a 1º Grau (Cível e Criminal) e 2º Grau
- **Parâmetro `incluirDocumentos="*"`**: Solicita conteúdo binário dos documentos (base64)
- **Endpoint ConsultaPJe**: Endpoint dedicado para consultas
- **Auto-detecção de grau**: Baseado no número do processo
- **MNI 2.2.2 e 2.2.3**: Suporte às duas versões

## Endpoints TJBA Configurados

### 1º Grau - Não Criminal (Cível)
| Tipo | URL |
|------|-----|
| Portal | https://pje.tjba.jus.br/pje |
| Intercomunicação | https://pje.tjba.jus.br/pje/intercomunicacao?wsdl |
| Consultas | https://pje.tjba.jus.br/pje/ConsultaPJe?wsdl |
| Versão MNI | 2.2.2 |

### 1º Grau - Criminal
| Tipo | URL |
|------|-----|
| Intercomunicação | https://pje.tjba.jus.br/pje/intercomunicacao/v223?wsdl |
| Versão MNI | 2.2.3 |

### 2º Grau
| Tipo | URL |
|------|-----|
| Intercomunicação | https://pje2g-mni.tjba.jus.br/pje/intercomunicacao?wsdl |
| Consultas | https://pje2g-mni.tjba.jus.br/pje/ConsultaPJe?wsdl |
| Versão MNI | 2.2.2 |

## Instalação

### 1. Clone ou copie os arquivos para seu diretório

```bash
mkdir -p ~/MCP-PJE/pje-mcp-server
cd ~/MCP-PJE/pje-mcp-server
# Copie os arquivos src/index.ts, package.json, tsconfig.json
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Compile o projeto

```bash
npm run build
```

### 4. Configure o Claude Desktop

Edite o arquivo de configuração do Claude Desktop:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pje": {
      "command": "node",
      "args": [
        "/Users/SEU_USUARIO/MCP-PJE/pje-mcp-server/dist/index.js"
      ],
      "env": {
        "PJE_USERNAME": "SEU_CPF",
        "PJE_PASSWORD": "SUA_SENHA",
        "PJE_ENDPOINT": "1G_CIVEL"
      }
    }
  }
}
```

### 5. Reinicie o Claude Desktop

## Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `PJE_USERNAME` | CPF do usuário (apenas números) | Sim |
| `PJE_PASSWORD` | Senha do PJE | Sim |
| `PJE_ENDPOINT` | Endpoint padrão: `1G_CIVEL`, `1G_CRIMINAL` ou `2G` | Não (padrão: 1G_CIVEL) |
| `BNP_API_URL` | URL da API do BNP | Não |

## Ferramentas Disponíveis

### Consulta de Processos

| Ferramenta | Descrição |
|------------|-----------|
| `pje_consultar_processo` | Consulta processo por número (usa `incluirDocumentos="*"`) |
| `pje_consultar_processo_profunda` | Consulta completa com todos os documentos |
| `pje_consultar_processo_por_cpf_cnpj` | Busca processos por documento |
| `pje_consultar_processo_por_nome` | Busca processos por nome da parte |
| `pje_consultar_conteudo_documento` | Obtém conteúdo de documento específico |

### Comunicações

| Ferramenta | Descrição |
|------------|-----------|
| `pje_consultar_avisos` | Lista intimações pendentes |
| `pje_consultar_teor_comunicacao` | Obtém teor de uma intimação |

### Utilitários

| Ferramenta | Descrição |
|------------|-----------|
| `pje_status` | Status do servidor e endpoints |
| `pje_testar_conexao` | Testa conexão com o MNI |
| `pje_listar_metodos` | Lista métodos disponíveis |

### Precedentes

| Ferramenta | Descrição |
|------------|-----------|
| `pje_consultar_precedentes_bnp` | Consulta o Banco Nacional de Precedentes |

## Uso do Parâmetro incluirDocumentos

O servidor usa automaticamente `incluirDocumentos="*"` (asterisco) para solicitar o conteúdo binário dos documentos em base64.

Conforme documentação do MNI:
- `true` ou omitido: Retorna apenas metadados
- `"*"` (asterisco): Retorna metadados + conteúdo binário

**Nota**: A disponibilidade do conteúdo depende da configuração do tribunal.

## Exemplos de Uso

### Consultar processo

```
Consulte o processo 8026591-25.2025.8.05.0274
```

### Buscar precedentes sobre um tema

```
Busque precedentes sobre planos de saúde e cobertura de tratamentos
```

### Verificar intimações pendentes

```
Quais são as intimações pendentes?
```

## Requisitos

- **Node.js**: >= 18.0.0
- **IP na Whitelist**: Seu IP deve estar cadastrado no firewall do TJBA
- **Credenciais**: CPF e senha válidos no PJE

## Suporte Técnico

Para questões sobre o MNI do TJBA:
- **E-mail**: csjud@tjba.jus.br
- **Documentação**: http://servicosonline.tjba.jus.br/servicosonline/acordos-de-cooperacao-e-congeneres/

## Changelog

### v4.0.0 (2025-01-07)
- Adicionado suporte a múltiplos endpoints (1G Cível, 1G Criminal, 2G)
- Implementado parâmetro `incluirDocumentos="*"` para conteúdo binário
- Adicionado endpoint ConsultaPJe para consultas
- Auto-detecção de grau baseado no número do processo
- Suporte a MNI 2.2.2 e 2.2.3

### v3.0.0
- Integração com BNP (Banco Nacional de Precedentes)
- Melhorias no parsing de documentos

### v2.0.0
- Versão inicial com suporte básico ao MNI
